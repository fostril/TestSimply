import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { readFile, stat, unlink } from "fs/promises";
import {
  requireAuth,
  withApiHandler,
  assertProjectAccessForResource,
} from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { isInlineImageMime, hasValidImageMagicBytes } from "@/lib/upload";

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

/**
 * Resolve the project this attachment belongs to by walking the optional
 * relations (testCase / testResult / execution). Returns null if we cannot
 * derive a project (e.g. orphan attachment).
 */
async function resolveAttachmentProjectId(attachment: {
  testCaseId: string | null;
  testResultId: string | null;
  executionId: string | null;
}): Promise<string | null> {
  if (attachment.testCaseId) {
    const tc = await prisma.testCase.findUnique({
      where: { id: attachment.testCaseId },
      select: { projectId: true },
    });
    if (tc) return tc.projectId;
  }
  if (attachment.executionId) {
    const exec = await prisma.testExecution.findUnique({
      where: { id: attachment.executionId },
      select: { projectId: true },
    });
    if (exec) return exec.projectId;
  }
  if (attachment.testResultId) {
    const result = await prisma.testResult.findUnique({
      where: { id: attachment.testResultId },
      select: { execution: { select: { projectId: true } } },
    });
    if (result?.execution) return result.execution.projectId;
  }
  return null;
}

export const GET = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "project:view");
    if (!auth.authorized) return auth.response;

    const attachment = await prisma.attachment.findUnique({
      where: { id: params.id },
    });

    if (!attachment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const projectId = await resolveAttachmentProjectId(attachment);

    // Enforce project-level access. If we can't determine a project, restrict
    // to admins only.
    if (!projectId) {
      if (auth.session.user.role !== "ADMIN") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    } else {
      const denied = await assertProjectAccessForResource(
        auth.session.user.id,
        auth.session.user.role,
        { projectId },
      );
      if (denied) return denied;
    }

    // Prefer the dedicated storageKey column; fall back to the legacy
    // `url` column for attachments created before the column was added.
    // We intentionally only use the basename to prevent any directory
    // traversal if the column is ever tampered with.
    const storedKey = path.basename(attachment.storageKey || attachment.url);
    if (!storedKey) {
      return NextResponse.json({ error: "File missing" }, { status: 410 });
    }
    const filePath = path.join(UPLOAD_DIR, storedKey);

    // Defence-in-depth: ensure resolved path stays inside UPLOAD_DIR.
    const resolved = path.resolve(filePath);
    const resolvedRoot = path.resolve(UPLOAD_DIR);
    if (!resolved.startsWith(resolvedRoot + path.sep) && resolved !== resolvedRoot) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    try {
      await stat(resolved);
    } catch {
      return NextResponse.json({ error: "File missing" }, { status: 410 });
    }

    const data = await readFile(resolved);

    const contentType = attachment.contentType || "application/octet-stream";
    const isSafeInline =
      isInlineImageMime(contentType) && hasValidImageMagicBytes(data, contentType);
    const disposition = isSafeInline ? "inline" : "attachment";

    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(attachment.size),
        "Content-Disposition": `${disposition}; filename="${encodeURIComponent(attachment.fileName)}"`,
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=300",
      },
    });
  },
);

export const DELETE = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "execution:run");
    if (!auth.authorized) return auth.response;

    const attachment = await prisma.attachment.findUnique({
      where: { id: params.id },
    });

    if (!attachment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const projectId = await resolveAttachmentProjectId(attachment);
    if (!projectId) {
      if (auth.session.user.role !== "ADMIN") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    } else {
      const denied = await assertProjectAccessForResource(
        auth.session.user.id,
        auth.session.user.role,
        { projectId },
      );
      if (denied) return denied;
    }

    await prisma.attachment.delete({ where: { id: params.id } });

    const storedKey = path.basename(attachment.storageKey || attachment.url);
    if (storedKey) {
      const filePath = path.join(UPLOAD_DIR, storedKey);
      const resolved = path.resolve(filePath);
      const resolvedRoot = path.resolve(UPLOAD_DIR);
      if (resolved.startsWith(resolvedRoot + path.sep) || resolved === resolvedRoot) {
        await unlink(resolved).catch(() => undefined);
      }
    }

    await logAudit(
      auth.session.user.id,
      "DELETE",
      "Attachment",
      attachment.id,
      { fileName: attachment.fileName },
      projectId ?? undefined,
    );

    return NextResponse.json({ success: true });
  },
);
