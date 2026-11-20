import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { passwordSchema } from "@/lib/password";
import { Role } from "@prisma/client";

const createUserSchema = z.object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
    email: z.string().trim().email("Invalid email address"),
    password: passwordSchema,
    role: z.nativeEnum(Role).default(Role.TESTER),
});

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

    await logAudit(auth.session.user.id, "UPDATE_ROLE", "User", updatedUser.id, {
        role: updatedUser.role,
        email: updatedUser.email,
    });

    return NextResponse.json(updatedUser);
});

// POST /api/users - Create user (admin only)
export const POST = withApiHandler(async (req: NextRequest) => {
    const auth = await requireAuth(req, "user:manage");
    if (!auth.authorized) return auth.response;

    const body = await req.json();
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
        return NextResponse.json(
            { error: "Invalid payload", issues: parsed.error.issues },
            { status: 400 }
        );
    }

    const normalizedEmail = parsed.data.email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
        return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const createdUser = await prisma.user.create({
        data: {
            name: parsed.data.name,
            email: normalizedEmail,
            password: passwordHash,
            role: parsed.data.role,
            emailVerified: new Date(),
        },
        select: {
            id: true,
            name: true,
            email: true,
            role: true,
            image: true,
            createdAt: true,
            leadProjects: { select: { id: true, key: true, name: true } },
            assignedProjects: { select: { id: true, key: true, name: true } },
        },
    });

    await logAudit(auth.session.user.id, "ADMIN_CREATE_USER", "User", createdUser.id, {
        email: createdUser.email,
        role: createdUser.role,
    });

    return NextResponse.json(createdUser, { status: 201 });
});
