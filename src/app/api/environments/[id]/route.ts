import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { z } from "zod";

const updateSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    url: z.string().url().optional().or(z.literal("")),
});

export const GET = withApiHandler(
    async (req: NextRequest, { params }: { params: { id: string } }) => {
        const auth = await requireAuth(req, "project:view");
        if (!auth.authorized) return auth.response;

        const environment = await prisma.environment.findUnique({
            where: { id: params.id },
        });

        if (!environment) {
            return NextResponse.json({ error: "Environment not found" }, { status: 404 });
        }

        return NextResponse.json(environment);
    }
);

export const PATCH = withApiHandler(
    async (req: NextRequest, { params }: { params: { id: string } }) => {
        const auth = await requireAuth(req, "project:edit");
        if (!auth.authorized) return auth.response;

        const body = await req.json();
        const parsed = updateSchema.parse(body);

        const environment = await prisma.environment.update({
            where: { id: params.id },
            data: {
                ...parsed,
                url: parsed.url || null,
            },
        });

        return NextResponse.json(environment);
    }
);

export const DELETE = withApiHandler(
    async (req: NextRequest, { params }: { params: { id: string } }) => {
        const auth = await requireAuth(req, "project:edit");
        if (!auth.authorized) return auth.response;

        await prisma.environment.delete({
            where: { id: params.id },
        });

        return NextResponse.json({ ok: true });
    }
);
