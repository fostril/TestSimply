import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { logAudit } from "@/lib/audit";

// DELETE /api/users/[id] - Delete a user account (admin only)
export const DELETE = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "user:manage");
    if (!auth.authorized) return auth.response;

    if (params.id === auth.session.user.id) {
      return NextResponse.json(
        { error: "Cannot delete your own account" },
        { status: 400 }
      );
    }

    const existing = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, email: true, role: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    await prisma.user.delete({
      where: { id: params.id },
    });

    await logAudit(auth.session.user.id, "ADMIN_DELETE_USER", "User", params.id, {
      email: existing.email,
      role: existing.role,
    });

    return NextResponse.json({ ok: true, id: params.id });
  }
);
