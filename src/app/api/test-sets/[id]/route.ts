import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, assertProjectAccessForResource } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

async function resolveTestSet(idOrKey: string, projectKey: string | null) {
  const byId = await prisma.testSet.findUnique({ where: { id: idOrKey } });
  if (byId) return byId;

  if (projectKey) {
    const project = await prisma.project.findUnique({
      where: { key: projectKey },
      select: { id: true },
    });
    if (project) {
      const byKey = await prisma.testSet.findUnique({
        where: { projectId_key: { projectId: project.id, key: idOrKey } },
      });
      if (byKey) return byKey;
    }
  }

  const parts = idOrKey.split("-");
  for (let i = 1; i < parts.length; i++) {
    const pKey = parts.slice(0, i).join("-");
    const sKey = parts.slice(i).join("-");
    const project = await prisma.project.findUnique({
      where: { key: pKey },
      select: { id: true },
    });
    if (!project) continue;
    const ts = await prisma.testSet.findUnique({
      where: { projectId_key: { projectId: project.id, key: sKey } },
    });
    if (ts) return ts;
  }
  return null;
}

export const GET = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "project:view");
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(req.url);
    const projectKey = searchParams.get("projectKey");

    const testSet = await resolveTestSet(params.id, projectKey);
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      testSet,
    );
    if (denied) return denied;

    const full = await prisma.testSet.findUnique({
      where: { id: testSet!.id },
      include: {
        cases: {
          where: { deletedAt: null },
          orderBy: { key: "asc" },
        },
      },
    });
    return NextResponse.json(full);
  }
);

export const PATCH = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "testset:manage");
    if (!auth.authorized) return auth.response;

    const testSet = await resolveTestSet(params.id, null);
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      testSet,
    );
    if (denied) return denied;

    const body = await req.json();
    const parsed = updateSchema.parse(body);

    const updated = await prisma.testSet.update({
      where: { id: testSet!.id },
      data: parsed,
    });

    await logAudit(auth.session.user?.id, "UPDATE", "TestSet", updated.id, parsed);
    return NextResponse.json(updated);
  }
);

export const DELETE = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "testset:manage");
    if (!auth.authorized) return auth.response;

    const testSet = await resolveTestSet(params.id, null);
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      testSet,
    );
    if (denied) return denied;

    await prisma.testSet.delete({ where: { id: testSet!.id } });
    await logAudit(auth.session.user?.id, "DELETE", "TestSet", testSet!.id, {});

    return NextResponse.json({ ok: true });
  }
);
