import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, assertProjectAccessForResource, resolveByIdOrKey } from "@/lib/api";
import { z } from "zod";

const bodySchema = z.object({ caseIds: z.array(z.string()) });

async function resolvePlan(idOrKey: string) {
  return resolveByIdOrKey(
    (id) => prisma.testPlan.findUnique({ where: { id } }),
    (projectId, key) => prisma.testPlan.findUnique({ where: { projectId_key: { projectId, key } } }),
    idOrKey,
  );
}

export const POST = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "testplan:manage");
    if (!auth.authorized) return auth.response;

    const plan = await resolvePlan(params.id);
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      plan,
    );
    if (denied) return denied;

    const parsed = bodySchema.parse(await req.json());

    // Scope caseIds to non-deleted cases in the plan's project and preserve order
    const scoped = await prisma.testCase.findMany({
      where: { id: { in: parsed.caseIds }, projectId: plan!.projectId, deletedAt: null },
      select: { id: true },
    });
    const allowedSet = new Set(scoped.map((c) => c.id));
    const orderedIds = parsed.caseIds.filter((id) => allowedSet.has(id));

    await prisma.$transaction([
      prisma.testCasePlan.deleteMany({ where: { planId: plan!.id } }),
      prisma.testCasePlan.createMany({
        data: orderedIds.map((caseId, index) => ({ planId: plan!.id, caseId, order: index })),
        skipDuplicates: true,
      }),
    ]);
    return NextResponse.json({ ok: true });
  }
);

export const DELETE = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "testplan:manage");
    if (!auth.authorized) return auth.response;

    const plan = await resolvePlan(params.id);
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      plan,
    );
    if (denied) return denied;

    const parsed = bodySchema.parse(await req.json());
    await prisma.testCasePlan.deleteMany({
      where: {
        planId: plan!.id,
        caseId: { in: parsed.caseIds },
      },
    });
    return NextResponse.json({ ok: true });
  }
);
