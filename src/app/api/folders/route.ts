import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  requireAuth,
  requireProjectAccessOrForbid,
  withApiHandler,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { buildPath } from "@/lib/folders";
import { logAudit } from "@/lib/audit";

const listSchema = z.object({
  projectId: z.string().min(1),
});

const createSchema = z.object({
  projectId: z.string().min(1),
  parentId: z.string().optional(),
  name: z.string().min(1).max(120),
});

export const GET = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "project:view");
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(req.url);
  const parsed = listSchema.parse({ projectId: searchParams.get("projectId") ?? "" });

  const access = await requireProjectAccessOrForbid(
    auth.session.user.id,
    auth.session.user.role,
    parsed.projectId,
  );
  if (access instanceof NextResponse) return access;

  const folders = await prisma.testFolder.findMany({
    where: { projectId: parsed.projectId },
    orderBy: [{ path: "asc" }],
    include: {
      _count: {
        select: {
          testCases: { where: { deletedAt: null } },
          children: true,
        },
      },
    },
  });

  return NextResponse.json(folders);
});

export const POST = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "testcase:create");
  if (!auth.authorized) return auth.response;
  const parsed = createSchema.parse(await req.json());

  const access = await requireProjectAccessOrForbid(
    auth.session.user.id,
    auth.session.user.role,
    parsed.projectId,
  );
  if (access instanceof NextResponse) return access;

  let parentPath: string | null = null;
  if (parsed.parentId) {
    const parent = await prisma.testFolder.findUnique({
      where: { id: parsed.parentId },
      select: { path: true, projectId: true },
    });
    if (!parent || parent.projectId !== parsed.projectId) {
      return NextResponse.json({ error: "Invalid parentId" }, { status: 400 });
    }
    parentPath = parent.path;
  }

  const path = buildPath(parentPath, parsed.name);
  const existing = await prisma.testFolder.findUnique({
    where: { projectId_path: { projectId: parsed.projectId, path } },
  });
  if (existing) {
    return NextResponse.json(
      { error: "A folder with this name already exists here" },
      { status: 409 },
    );
  }

  const folder = await prisma.testFolder.create({
    data: {
      projectId: parsed.projectId,
      parentId: parsed.parentId || null,
      name: parsed.name.trim(),
      path,
    },
  });

  await logAudit(auth.session.user?.id, "CREATE", "TestFolder", folder.id, {
    name: folder.name,
    path: folder.path,
  }, parsed.projectId);

  return NextResponse.json(folder, { status: 201 });
});
