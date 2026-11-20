import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, requireProjectAccessOrForbid, parsePagination, paginatedJson } from "@/lib/api";
import { logAudit } from "@/lib/audit";
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

    const access = await requireProjectAccessOrForbid(auth.session.user.id, auth.session.user.role, projectId);
    if (access instanceof NextResponse) return access;

    const pagination = parsePagination(searchParams);
    const where = { projectId };

    const [preconditions, total] = await Promise.all([
        prisma.precondition.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: pagination.skip,
            take: pagination.limit,
            include: {
                _count: {
                    select: { cases: { where: { deletedAt: null } } },
                },
            },
        }),
        prisma.precondition.count({ where }),
    ]);

    return paginatedJson(preconditions, total, pagination);
});

export const POST = withApiHandler(async (req: NextRequest) => {
    const auth = await requireAuth(req, "testcase:create");
    if (!auth.authorized) return auth.response;

    const body = await req.json();
    const parsed = createSchema.parse(body);

    const access = await requireProjectAccessOrForbid(
        auth.session.user.id,
        auth.session.user.role,
        parsed.projectId,
    );
    if (access instanceof NextResponse) return access;

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

    await logAudit(auth.session.user?.id, "CREATE", "Precondition", precondition.id, {
        key: precondition.key,
        name: precondition.name,
    }, parsed.projectId);

    return NextResponse.json(precondition, { status: 201 });
});
