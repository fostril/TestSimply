import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, assertProjectAccessForResource } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { Priority } from "@prisma/client";

const updateSchema = z.object({
  summary: z.string().optional(),
  description: z.string().optional(),
  priority: z.nativeEnum(Priority).optional(),
  status: z.string().optional(),
  testSetId: z.string().nullable().optional(),
});

async function resolveBug(idOrKey: string, projectKey: string | null) {
  const byId = await prisma.bug.findUnique({ where: { id: idOrKey } });
  if (byId) return byId;

  if (projectKey) {
    const project = await prisma.project.findUnique({
      where: { key: projectKey },
      select: { id: true },
    });
    if (project) {
      const byKey = await prisma.bug.findUnique({
        where: { projectId_key: { projectId: project.id, key: idOrKey } },
      });
      if (byKey) return byKey;
    }
  }

  const parts = idOrKey.split("-");
  for (let i = 1; i < parts.length; i++) {
    const pKey = parts.slice(0, i).join("-");
    const bKey = parts.slice(i).join("-");
    const project = await prisma.project.findUnique({
      where: { key: pKey },
      select: { id: true },
    });
    if (!project) continue;
    const b = await prisma.bug.findUnique({
      where: { projectId_key: { projectId: project.id, key: bKey } },
    });
    if (b) return b;
  }
  return null;
}

export const GET = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "project:view");
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(req.url);
    const projectKey = searchParams.get("projectKey");

    const bug = await resolveBug(params.id, projectKey);
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      bug,
    );
    if (denied) return denied;

    const full = await prisma.bug.findUnique({
      where: { id: bug!.id },
      include: { testCase: true, testSet: true },
    });
    return NextResponse.json(full);
  }
);

export const PATCH = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "bug:manage");
    if (!auth.authorized) return auth.response;

    const bug = await resolveBug(params.id, null);
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      bug,
    );
    if (denied) return denied;

    const body = await req.json();
    const parsed = updateSchema.parse(body);

    const updated = await prisma.bug.update({
      where: { id: bug!.id },
      data: parsed,
    });

    await logAudit(auth.session.user?.id, "UPDATE", "Bug", updated.id, parsed);
    return NextResponse.json(updated);
  }
);

export const DELETE = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "bug:manage");
    if (!auth.authorized) return auth.response;

    const bug = await resolveBug(params.id, null);
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      bug,
    );
    if (denied) return denied;

    await prisma.bug.delete({ where: { id: bug!.id } });
    await logAudit(auth.session.user?.id, "DELETE", "Bug", bug!.id, {});

    return NextResponse.json({ ok: true });
  }
);
