import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

// GET /api/users/[id]/assigned-projects - Get projects assigned to a user
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
    const auth = await requireAuth(req);
    if (!auth.authorized) return auth.response;

    if (auth.session.user.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const user = await prisma.user.findUnique({
        where: { id: params.id },
        select: {
            id: true,
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

    return NextResponse.json(user.assignedProjects);
}

// PATCH /api/users/[id]/assigned-projects - Update projects assigned to a user
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
    const auth = await requireAuth(req);
    if (!auth.authorized) return auth.response;

    if (auth.session.user.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { projectIds } = body;

    if (!Array.isArray(projectIds)) {
        return NextResponse.json({ error: "projectIds must be an array" }, { status: 400 });
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
        where: { id: params.id },
    });

    if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Update the user's assigned projects
    const updatedUser = await prisma.user.update({
        where: { id: params.id },
        data: {
            assignedProjects: {
                set: projectIds.map((id: string) => ({ id })),
            },
        },
        select: {
            id: true,
            assignedProjects: {
                select: {
                    id: true,
                    key: true,
                    name: true,
                },
            },
        },
    });

    return NextResponse.json(updatedUser.assignedProjects);
}
