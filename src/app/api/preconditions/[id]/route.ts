import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { z } from "zod";

const updateSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
});

export const GET = withApiHandler(
    async (req: NextRequest, { params }: { params: { id: string } }) => {
        const auth = await requireAuth(req, "project:view");
        if (!auth.authorized) return auth.response;

        const precondition = await prisma.precondition.findUnique({
            where: { id: params.id },
            include: {
                cases: {
                    where: { deletedAt: null },
                    orderBy: { key: "asc" },
                },
            },
        });

        if (!precondition) {
            return NextResponse.json({ error: "Precondition not found" }, { status: 404 });
        }

        return NextResponse.json(precondition);
    }
);

export const PATCH = withApiHandler(
    async (req: NextRequest, { params }: { params: { id: string } }) => {
        const auth = await requireAuth(req, "testcase:edit");
        if (!auth.authorized) return auth.response;

        const body = await req.json();
        const parsed = updateSchema.parse(body);

        const precondition = await prisma.precondition.update({
            where: { id: params.id },
            data: parsed,
        });

        return NextResponse.json(precondition);
    }
);

export const DELETE = withApiHandler(
    async (req: NextRequest, { params }: { params: { id: string } }) => {
        const auth = await requireAuth(req, "testcase:delete");
        if (!auth.authorized) return auth.response;

        await prisma.precondition.delete({
            where: { id: params.id },
        });

        return NextResponse.json({ ok: true });
    }
);
