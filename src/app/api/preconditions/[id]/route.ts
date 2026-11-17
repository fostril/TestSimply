import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, assertProjectAccessForResource } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

export const GET = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "project:view");
    if (!auth.authorized) return auth.response;

    const precondition = await prisma.precondition.findUnique({
      where: { id: params.id },
      include: {
        cases: { where: { deletedAt: null }, orderBy: { key: "asc" } },
      },
    });
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      precondition,
    );
    if (denied) return denied;

    return NextResponse.json(precondition);
  }
);

export const PATCH = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "testcase:update");
    if (!auth.authorized) return auth.response;

    const existing = await prisma.precondition.findUnique({
      where: { id: params.id },
    });
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      existing,
    );
    if (denied) return denied;

    const body = await req.json();
    const parsed = updateSchema.parse(body);

    const updated = await prisma.precondition.update({
      where: { id: params.id },
      data: parsed,
    });

    await logAudit(auth.session.user?.id, "UPDATE", "Precondition", updated.id, parsed, updated.projectId);
    return NextResponse.json(updated);
  }
);

export const DELETE = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "testcase:delete");
    if (!auth.authorized) return auth.response;

    const existing = await prisma.precondition.findUnique({
      where: { id: params.id },
    });
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      existing,
    );
    if (denied) return denied;

    await prisma.precondition.delete({ where: { id: params.id } });
    await logAudit(auth.session.user?.id, "DELETE", "Precondition", params.id, {}, existing!.projectId);

    return NextResponse.json({ ok: true });
  }
);
