import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, assertProjectAccessForResource, resolveByIdOrKey } from "@/lib/api";
import { z } from "zod";

const bodySchema = z.object({ caseIds: z.array(z.string()) });

export const POST = withApiHandler(
    async (req: NextRequest, { params }: { params: { id: string } }) => {
        const auth = await requireAuth(req, "testplan:manage");
        if (!auth.authorized) return auth.response;

        const plan = await resolveByIdOrKey(
            (id) => prisma.testPlan.findUnique({ where: { id } }),
            (projectId, key) => prisma.testPlan.findUnique({ where: { projectId_key: { projectId, key } } }),
            params.id,
        );
        const denied = await assertProjectAccessForResource(
            auth.session.user.id,
            auth.session.user.role,
            plan,
        );
        if (denied) return denied;

        const parsed = bodySchema.parse(await req.json());

        if (parsed.caseIds.length === 0) {
            return NextResponse.json({ count: 0 });
        }

        const scoped = await prisma.testCase.findMany({
            where: { id: { in: parsed.caseIds }, projectId: plan!.projectId, deletedAt: null },
            select: { id: true },
        });
        const scopedIds = scoped.map((c) => c.id);

        const result = await prisma.testCasePlan.createMany({
            data: scopedIds.map((caseId) => ({ planId: plan!.id, caseId })),
            skipDuplicates: true,
        });

        return NextResponse.json(result);
    }
);
