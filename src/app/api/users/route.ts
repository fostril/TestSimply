import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { Role } from "@prisma/client";

// GET /api/users - List all users (admin only)
export const GET = withApiHandler(async (req: NextRequest) => {
    const auth = await requireAuth(req, "user:manage");
    if (!auth.authorized) return auth.response;

    const users = await prisma.user.findMany({
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            image: true,
            createdAt: true,
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
        orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(users);
});

// PATCH /api/users - Update user role (admin only)
export const PATCH = withApiHandler(async (req: NextRequest) => {
    const auth = await requireAuth(req, "user:manage");
    if (!auth.authorized) return auth.response;

    const body = await req.json();
    const { userId, role } = body;

    if (!userId || !role) {
        return NextResponse.json({ error: "userId and role are required" }, { status: 400 });
    }

    if (!Object.values(Role).includes(role)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Prevent admin from removing their own admin role
    if (userId === auth.session.user.id && role !== "ADMIN") {
        return NextResponse.json({ error: "Cannot remove your own admin role" }, { status: 400 });
    }

    const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { role },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
        },
    });

    return NextResponse.json(updatedUser);
});
