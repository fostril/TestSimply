import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, assertProjectAccessForResource } from "@/lib/api";
import { z } from "zod";

const reorderSchema = z.object({
    caseIds: z.array(z.string()).min(1, "Case IDs are required"),
});

export const POST = withApiHandler(
    async (req: NextRequest, { params }: { params: { id: string } }) => {
        const auth = await requireAuth(req, "testplan:manage");
        if (!auth.authorized) return auth.response;

        const parsed = reorderSchema.parse(await req.json());
        const { caseIds } = parsed;

        const plan = await prisma.testPlan.findUnique({
            where: { id: params.id },
            include: { cases: { select: { caseId: true } } }
        });

        const denied = await assertProjectAccessForResource(
            auth.session.user.id,
            auth.session.user.role,
            plan,
        );
        if (denied) return denied;

        if (!plan) {
            return NextResponse.json({ error: "Test plan not found" }, { status: 404 });
        }

        const existingCaseIds = new Set(plan.cases.map(c => c.caseId));

        // Verify all provided case IDs exist in the plan
        for (const caseId of caseIds) {
            if (!existingCaseIds.has(caseId)) {
                return NextResponse.json(
                    { error: `Case ${caseId} is not in this plan` },
                    { status: 400 }
                );
            }
        }

        // Update order for each case
        const updates = caseIds.map((caseId, index) =>
            prisma.testCasePlan.update({
                where: {
                    planId_caseId: {
                        planId: params.id,
                        caseId,
                    }
                },
                data: { order: index }
            })
        );

        await prisma.$transaction(updates);

        return NextResponse.json({ ok: true, order: caseIds });
    }
);
