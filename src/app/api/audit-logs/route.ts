import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, parsePagination, paginatedJson } from "@/lib/api";

export const GET = withApiHandler(async (req: NextRequest) => {
    const auth = await requireAuth(req, "settings:manage");
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(req.url);
    const entity = searchParams.get("entity");
    const userId = searchParams.get("userId");
    const projectId = searchParams.get("projectId");
    const pagination = parsePagination(searchParams);

    let projectFilter: { projectId?: string | { in: string[] } } = {};
    if (auth.session.user.role !== Role.ADMIN) {
        const leadProjects = await prisma.project.findMany({
            where: { leads: { some: { id: auth.session.user.id } } },
            select: { id: true },
        });
        const leadProjectIds = leadProjects.map((p) => p.id);

        if (projectId) {
            if (!leadProjectIds.includes(projectId)) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
            projectFilter = { projectId };
        } else {
            projectFilter = { projectId: { in: leadProjectIds } };
        }
    } else if (projectId) {
        projectFilter = { projectId };
    }

    const where = {
        ...(entity ? { entity } : {}),
        ...(userId ? { userId } : {}),
        ...projectFilter,
    };

    const [logs, total] = await Promise.all([
        prisma.auditLog.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip: pagination.skip,
            take: pagination.limit,
        }),
        prisma.auditLog.count({ where }),
    ]);

    // Fetch user details for the logs
    const userIds = Array.from(new Set(logs.map((log) => log.userId).filter(Boolean))) as string[];
    const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    const enrichedLogs = logs.map((log) => ({
        ...log,
        user: log.userId ? userMap.get(log.userId) : null,
    }));

    return paginatedJson(enrichedLogs, total, pagination);
});
