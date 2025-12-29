import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { z } from "zod";

const importSchema = z.object({
    testSetId: z.string().min(1),
});

export const POST = withApiHandler(
    async (req: NextRequest, { params }: { params: { id: string } }) => {
        const auth = await requireAuth(req, "testplan:edit");
        if (!auth.authorized) return auth.response;

        const body = await req.json();
        const parsed = importSchema.parse(body);

        // 1. Get cases from Test Set
        const testSet = await prisma.testSet.findUnique({
            where: { id: parsed.testSetId },
            include: { cases: true },
        });

        if (!testSet) {
            return NextResponse.json({ error: "Test Set not found" }, { status: 404 });
        }

        if (testSet.cases.length === 0) {
            return NextResponse.json({ message: "Test Set is empty" });
        }

        // 2. Add cases to Test Plan (ignoring duplicates)
        // We use createMany with skipDuplicates if possible, but TestCasePlan has a composite ID or unique constraint?
        // Schema: @@unique([planId, caseId])
        // createMany is supported for Postgres.

        const casesToAdd = testSet.cases.map((c) => ({
            planId: params.id,
            caseId: c.id,
        }));

        const result = await prisma.testCasePlan.createMany({
            data: casesToAdd,
            skipDuplicates: true,
        });

        return NextResponse.json({ count: result.count });
    }
);
