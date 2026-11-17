import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, assertProjectAccessForResource, resolveByIdOrKey } from "@/lib/api";
import { z } from "zod";

const importSchema = z.object({
    testSetId: z.string().min(1),
});

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

        const body = await req.json();
        const parsed = importSchema.parse(body);

        const testSet = await prisma.testSet.findUnique({
            where: { id: parsed.testSetId },
            include: { cases: { where: { deletedAt: null } } },
        });

        if (!testSet || testSet.projectId !== plan!.projectId) {
            return NextResponse.json({ error: "Test Set not found" }, { status: 404 });
        }

        if (testSet.cases.length === 0) {
            return NextResponse.json({ count: 0, message: "Test Set is empty" });
        }

        const casesToAdd = testSet.cases
            .filter((c) => c.projectId === plan!.projectId)
            .map((c) => ({ planId: plan!.id, caseId: c.id }));

        const result = await prisma.testCasePlan.createMany({
            data: casesToAdd,
            skipDuplicates: true,
        });

        return NextResponse.json({ count: result.count });
    }
);
