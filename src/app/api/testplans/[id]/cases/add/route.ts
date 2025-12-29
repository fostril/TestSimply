import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { z } from "zod";

const bodySchema = z.object({ caseIds: z.array(z.string()) });

export const POST = withApiHandler(
    async (req: NextRequest, { params }: { params: { id: string } }) => {
        const auth = await requireAuth(req, "testplan:manage");
        if (!auth.authorized) return auth.response;

        const parsed = bodySchema.parse(await req.json());

        if (parsed.caseIds.length === 0) {
            return NextResponse.json({ count: 0 });
        }

        const result = await prisma.testCasePlan.createMany({
            data: parsed.caseIds.map((caseId) => ({ planId: params.id, caseId })),
            skipDuplicates: true
        });

        return NextResponse.json(result);
    }
);
