import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuth,
  assertProjectAccessForResource,
  withApiHandler,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";
import {
  buildPath,
  rewriteSubtreePathsWithPrefix,
  wouldIntroduceCycle,
} from "@/lib/folders";

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  parentId: z.string().nullable().optional(),
});

async function loadFolder(id: string) {
  return prisma.testFolder.findUnique({ where: { id } });
}

export const GET = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "project:view");
    if (!auth.authorized) return auth.response;

    const folder = await loadFolder(params.id);
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      folder,
    );
    if (denied) return denied;

    const children = await prisma.testFolder.findMany({
      where: { parentId: params.id },
      orderBy: [{ name: "asc" }],
      include: { _count: { select: { testCases: true, children: true } } },
    });

    const cases = await prisma.testCase.findMany({
      where: { folderId: params.id, deletedAt: null },
      orderBy: [{ key: "asc" }],
      select: { id: true, key: true, name: true, type: true, priority: true, status: true, tags: true },
    });

    return NextResponse.json({ folder, children, cases });
  },
);

export const PATCH = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "testcase:update");
    if (!auth.authorized) return auth.response;

    const folder = await loadFolder(params.id);
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      folder,
    );
    if (denied) return denied;

    const parsed = patchSchema.parse(await req.json());

    let newParentPath: string | null = null;
    let newParentId: string | null = folder!.parentId;

    if (parsed.parentId !== undefined) {
      if (parsed.parentId === null) {
        newParentId = null;
      } else {
        if (await wouldIntroduceCycle(prisma, folder!.id, parsed.parentId)) {
          return NextResponse.json(
            { error: "Cannot move folder into itself or its descendant" },
            { status: 400 },
          );
        }
        const parent = await prisma.testFolder.findUnique({
          where: { id: parsed.parentId },
          select: { path: true, projectId: true },
        });
        if (!parent || parent.projectId !== folder!.projectId) {
          return NextResponse.json({ error: "Invalid parentId" }, { status: 400 });
        }
        newParentPath = parent.path;
        newParentId = parsed.parentId;
      }
    } else if (folder!.parentId) {
      const parent = await prisma.testFolder.findUnique({
        where: { id: folder!.parentId },
        select: { path: true },
      });
      newParentPath = parent?.path ?? null;
    }

    const effectiveName = parsed.name ?? folder!.name;
    const newPath =
      parsed.parentId !== undefined || parsed.name !== undefined
        ? buildPath(newParentPath, effectiveName)
        : folder!.path;

    if (newPath !== folder!.path) {
      const clash = await prisma.testFolder.findUnique({
        where: {
          projectId_path: { projectId: folder!.projectId, path: newPath },
        },
      });
      if (clash && clash.id !== folder!.id) {
        return NextResponse.json(
          { error: "A folder with this name already exists here" },
          { status: 409 },
        );
      }
    }

    const updated = await prisma.testFolder.update({
      where: { id: folder!.id },
      data: {
        name: effectiveName.trim(),
        parentId: newParentId,
        path: newPath,
      },
    });

    if (newPath !== folder!.path) {
      await rewriteSubtreePathsWithPrefix(
        prisma,
        folder!.projectId,
        folder!.path,
        newPath,
      );
    }

    return NextResponse.json(updated);
  },
);

export const DELETE = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "testcase:update");
    if (!auth.authorized) return auth.response;

    const folder = await loadFolder(params.id);
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      folder,
    );
    if (denied) return denied;

    // Children are cascaded by the schema; test cases have folderId set
    // to NULL via onDelete: SetNull. So deleting a folder never deletes
    // test cases — they simply become unfiled.
    await prisma.testFolder.delete({ where: { id: folder!.id } });
    return NextResponse.json({ success: true });
  },
);
