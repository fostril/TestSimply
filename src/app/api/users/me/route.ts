import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const updateProfileSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
});

export const GET = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req);
  if (!auth.authorized) return auth.response;

  const user = await prisma.user.findUnique({
    where: { id: auth.session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      emailVerified: true,
      image: true,
      createdAt: true,
      password: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerified,
    image: user.image,
    createdAt: user.createdAt,
    hasPassword: Boolean(user.password),
  });
});

export const PATCH = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req);
  if (!auth.authorized) return auth.response;

  const body = await req.json();
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const updated = await prisma.user.update({
    where: { id: auth.session.user.id },
    data: { name: parsed.data.name },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      emailVerified: true,
      image: true,
      createdAt: true,
    },
  });

  await logAudit(auth.session.user.id, "UPDATE_PROFILE", "User", updated.id, {
    name: updated.name,
  });

  return NextResponse.json(updated);
});
