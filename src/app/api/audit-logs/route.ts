import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";

export const GET = withApiHandler(async (req: NextRequest) => {
    const auth = await requireAuth(req, "project:view");
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(req.url);
    const entity = searchParams.get("entity");
    const userId = searchParams.get("userId");

    const logs = await prisma.auditLog.findMany({
        where: {
            ...(entity ? { entity } : {}),
            ...(userId ? { userId } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 100, // Limit to last 100 logs for now
    });

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

    return NextResponse.json(enrichedLogs);
});
