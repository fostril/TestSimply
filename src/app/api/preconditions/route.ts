import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { z } from "zod";

import { generateEntityKey } from "@/lib/keys";

const createSchema = z.object({
    projectId: z.string().min(1),
    key: z.string().optional(),
    name: z.string().min(1),
    description: z.string().optional(),
});

export const GET = withApiHandler(async (req: NextRequest) => {
    const auth = await requireAuth(req, "project:view");
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
        return NextResponse.json({ error: "Project ID is required" }, { status: 400 });
    }

    const preconditions = await prisma.precondition.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        include: {
            _count: {
                select: { cases: true },
            },
        },
    });

    return NextResponse.json(preconditions);
});

export const POST = withApiHandler(async (req: NextRequest) => {
    const auth = await requireAuth(req, "testcase:create"); // Reusing testcase permission
    if (!auth.authorized) return auth.response;

    const body = await req.json();
    const parsed = createSchema.parse(body);

    const project = await prisma.project.findUnique({
        where: { id: parsed.projectId },
        select: { key: true },
    });

    if (!project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const generatedKey = await generateEntityKey(prisma, parsed.projectId, project.key, "PRECON");

    const precondition = await prisma.precondition.create({
        data: {
            projectId: parsed.projectId,
            key: generatedKey,
            name: parsed.name,
            description: parsed.description,
        },
    });

    return NextResponse.json(precondition, { status: 201 });
});
