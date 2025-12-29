import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { z } from "zod";

const linkSchema = z.object({
    preconditionId: z.string().min(1),
});

export const POST = withApiHandler(
    async (req: NextRequest, { params }: { params: { id: string } }) => {
        const auth = await requireAuth(req, "testcase:edit");
        if (!auth.authorized) return auth.response;

        const body = await req.json();
        const parsed = linkSchema.parse(body);

        const testCase = await prisma.testCase.update({
            where: { id: params.id },
            data: {
                preconditions: {
                    connect: { id: parsed.preconditionId },
                },
            },
            include: { preconditions: true },
        });

        return NextResponse.json(testCase);
    }
);

export const DELETE = withApiHandler(
    async (req: NextRequest, { params }: { params: { id: string } }) => {
        const auth = await requireAuth(req, "testcase:edit");
        if (!auth.authorized) return auth.response;

        const body = await req.json();
        const parsed = linkSchema.parse(body);

        const testCase = await prisma.testCase.update({
            where: { id: params.id },
            data: {
                preconditions: {
                    disconnect: { id: parsed.preconditionId },
                },
            },
            include: { preconditions: true },
        });

        return NextResponse.json(testCase);
    }
);
