import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, assertProjectAccessForResource } from "@/lib/api";
import { z } from "zod";

const bodySchema = z.object({ caseIds: z.array(z.string()) });

export const POST = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "testplan:manage");
    if (!auth.authorized) return auth.response;

    const plan = await prisma.testPlan.findUnique({ where: { id: params.id } });
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      plan,
    );
    if (denied) return denied;

    const parsed = bodySchema.parse(await req.json());

    // Scope caseIds to the plan's project to prevent cross-project linking
    const scoped = await prisma.testCase.findMany({
      where: { id: { in: parsed.caseIds }, projectId: plan!.projectId },
      select: { id: true },
    });
    const scopedIds = scoped.map((c) => c.id);

    await prisma.$transaction([
      prisma.testCasePlan.deleteMany({ where: { planId: plan!.id } }),
      prisma.testCasePlan.createMany({
        data: scopedIds.map((caseId) => ({ planId: plan!.id, caseId })),
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

    const plan = await prisma.testPlan.findUnique({ where: { id: params.id } });
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
