import { NextRequest, NextResponse } from "next/server";
import {
  requireAuth,
  withApiHandler,
  assertProjectAccessForResource,
} from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import crypto from "crypto";
import path from "path";
import { writeFile, mkdir } from "fs/promises";
import { validateUpload } from "@/lib/upload";

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");

export const POST = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "execution:run");
  if (!auth.authorized) return auth.response;

  const contentType = req.headers.get("content-type") ?? "";

  // ---- Handle multipart file upload ----
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const rawFile = form.get("file");
    const validated = validateUpload(rawFile, "attachment");
    if (validated instanceof NextResponse) return validated;
    const file = validated;

    const testCaseId = form.get("testCaseId") as string | null;
    const executionId = form.get("executionId") as string | null;
    const testResultId = form.get("testResultId") as string | null;

    // Require that the caller attach the upload to some scoped resource so
    // we can authorize against its project. Orphan attachments are not
    // permitted for non-admin users.
    if (!testCaseId && !executionId && !testResultId) {
      return NextResponse.json(
        { error: "Attachment must be linked to a testCaseId, executionId, or testResultId" },
        { status: 400 },
      );
    }

    // Derive project from the linked resource and enforce access.
    let projectId: string | null = null;
    if (testCaseId) {
      const tc = await prisma.testCase.findUnique({
        where: { id: testCaseId },
        select: { projectId: true },
      });
      projectId = tc?.projectId ?? null;
    } else if (executionId) {
      const exec = await prisma.testExecution.findUnique({
        where: { id: executionId },
        select: { projectId: true },
      });
      projectId = exec?.projectId ?? null;
    } else if (testResultId) {
      const result = await prisma.testResult.findUnique({
        where: { id: testResultId },
        select: { execution: { select: { projectId: true } } },
      });
      projectId = result?.execution?.projectId ?? null;
    }

    if (!projectId) {
      return NextResponse.json({ error: "Linked resource not found" }, { status: 404 });
    }

    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      { projectId },
    );
    if (denied) return denied;

    const ext = path.extname(file.name) || "";
    const storageKey = `${crypto.randomUUID()}${ext}`;

    await mkdir(UPLOAD_DIR, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(UPLOAD_DIR, storageKey), buffer);

    // Create with placeholder URL; update after we have the attachment id so
    // the public URL points at the authenticated serving route.
    const attachment = await prisma.attachment.create({
      data: {
        url: "",
        storageKey,
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        size: file.size,
        testCaseId: testCaseId || undefined,
        executionId: executionId || undefined,
        testResultId: testResultId || undefined,
      },
    });

    const publicUrl = `/api/attachments/${attachment.id}`;
    const updated = await prisma.attachment.update({
      where: { id: attachment.id },
      data: { url: publicUrl },
    });

    await logAudit(
      auth.session.user.id,
      "CREATE",
      "Attachment",
      updated.id,
      { fileName: updated.fileName, size: updated.size, projectId },
      projectId,
    );

    return NextResponse.json(updated, { status: 201 });
  }

  // ---- Handle JSON presigned-URL request (for future S3 integration) ----
  const uploadSchema = z.object({
    fileName: z.string().min(1),
    contentType: z.string().min(1),
  });

  const body = await req.json();
  const parsed = uploadSchema.parse(body);

  const key = `${crypto.randomUUID()}-${parsed.fileName}`;

  // When S3/R2 is configured, generate a real presigned URL here.
  // For now, return the local upload endpoint info. The public URL is not
  // known until a multipart upload completes and we have an attachment id.
  return NextResponse.json({
    uploadUrl: `/api/attachments`,
    key,
    headers: { "Content-Type": parsed.contentType },
    message: "Use multipart/form-data POST to /api/attachments to upload the file.",
  });
});
