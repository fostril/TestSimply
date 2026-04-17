import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, assertProjectAccessForResource } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  url: z.string().url().optional().or(z.literal("")),
});

export const GET = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "project:view");
    if (!auth.authorized) return auth.response;

    const environment = await prisma.environment.findUnique({
      where: { id: params.id },
    });
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      environment,
    );
    if (denied) return denied;

    return NextResponse.json(environment);
  }
);

export const PATCH = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "project:update");
    if (!auth.authorized) return auth.response;

    const existing = await prisma.environment.findUnique({
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

    const updated = await prisma.environment.update({
      where: { id: params.id },
      data: {
        ...parsed,
        url: parsed.url || null,
      },
    });

    await logAudit(auth.session.user?.id, "UPDATE", "Environment", updated.id, parsed);
    return NextResponse.json(updated);
  }
);

export const DELETE = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "project:update");
    if (!auth.authorized) return auth.response;

    const existing = await prisma.environment.findUnique({
      where: { id: params.id },
    });
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      existing,
    );
    if (denied) return denied;

    await prisma.environment.delete({ where: { id: params.id } });
    await logAudit(auth.session.user?.id, "DELETE", "Environment", params.id, {});

    return NextResponse.json({ ok: true });
  }
);
