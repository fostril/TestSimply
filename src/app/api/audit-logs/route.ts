import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, parsePagination, paginatedJson } from "@/lib/api";

export const GET = withApiHandler(async (req: NextRequest) => {
    const auth = await requireAuth(req, "settings:manage");
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(req.url);
    const entity = searchParams.get("entity");
    const userId = searchParams.get("userId");
    const pagination = parsePagination(searchParams);

    const where = {
        ...(entity ? { entity } : {}),
        ...(userId ? { userId } : {}),
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
