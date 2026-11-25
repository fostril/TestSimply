import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, assertProjectAccessForResource, resolveByIdOrKey } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

async function resolveTestSet(idOrKey: string, projectKey: string | null) {
  return resolveByIdOrKey(
    (id) => prisma.testSet.findUnique({ where: { id } }),
    (projectId, key) => prisma.testSet.findUnique({ where: { projectId_key: { projectId, key } } }),
    idOrKey,
    projectKey,
  );
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
        bugs: {
          orderBy: { createdAt: "desc" },
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

    const projectKey = new URL(req.url).searchParams.get("projectKey");
    const testSet = await resolveTestSet(params.id, projectKey);
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

    await logAudit(auth.session.user?.id, "UPDATE", "TestSet", updated.id, parsed, updated.projectId);
    return NextResponse.json(updated);
  }
);

export const DELETE = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "testset:manage");
    if (!auth.authorized) return auth.response;

    const projectKey = new URL(req.url).searchParams.get("projectKey");
    const testSet = await resolveTestSet(params.id, projectKey);
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      testSet,
    );
    if (denied) return denied;

    await prisma.testSet.delete({ where: { id: testSet!.id } });
    await logAudit(auth.session.user?.id, "DELETE", "TestSet", testSet!.id, {}, testSet!.projectId);

    return NextResponse.json({ ok: true });
  }
);
