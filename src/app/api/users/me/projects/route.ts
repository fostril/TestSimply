import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";

// GET /api/users/me/projects - Get current user's projects (lead and assigned)
export const GET = withApiHandler(async (req: NextRequest) => {
    const auth = await requireAuth(req, "project:view");
    if (!auth.authorized) return auth.response;

    const user = await prisma.user.findUnique({
        where: { id: auth.session.user.id },
        select: {
            id: true,
            role: true,
            leadProjects: {
                select: {
                    id: true,
                    key: true,
                    name: true,
                },
            },
            assignedProjects: {
                select: {
                    id: true,
                    key: true,
                    name: true,
                },
            },
        },
    });

    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(user);
});
