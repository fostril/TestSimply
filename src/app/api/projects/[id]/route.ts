import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, requireProjectAccess } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().optional(),
  description: z.string().nullable().optional(),
});

async function findProject(idOrKey: string) {
  return prisma.project.findFirst({
    where: { OR: [{ id: idOrKey }, { key: idOrKey }] },
    include: { settings: true },
  });
}

export const GET = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "project:view");
    if (!auth.authorized) return auth.response;

    const project = await findProject(params.id);
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const access = await requireProjectAccess(
      auth.session.user.id,
      auth.session.user.role,
      project.id,
    );
    if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (project.settings) {
      project.settings.jiraApiToken = project.settings.jiraApiToken ? "********" : null;
      project.settings.ciToken = project.settings.ciToken ? "********" : null;
    }

    return NextResponse.json(project);
  }
);

export const PATCH = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "project:update");
    if (!auth.authorized) return auth.response;

    const existing = await findProject(params.id);
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const access = await requireProjectAccess(
      auth.session.user.id,
      auth.session.user.role,
      existing.id,
    );
    if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();
    const parsed = updateSchema.parse(body);

    const project = await prisma.project.update({
      where: { id: existing.id },
      data: parsed,
    });

    await logAudit(auth.session.user?.id, "UPDATE", "Project", project.id, parsed);
    return NextResponse.json(project);
  }
);

export const DELETE = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "project:delete");
    if (!auth.authorized) return auth.response;

    try {
      const existing = await findProject(params.id);
      if (existing) {
        // Even for project:delete, only let admins or members delete projects
        // they actually belong to.
        const access = await requireProjectAccess(
          auth.session.user.id,
          auth.session.user.role,
          existing.id,
        );
        if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

        await prisma.project.delete({ where: { id: existing.id } });
        await logAudit(auth.session.user?.id, "DELETE", "Project", existing.id, {});
      }
    } catch (error: unknown) {
      if ((error as { code?: string })?.code === "P2025") {
        return NextResponse.json({ ok: true });
      }
      throw error;
    }

    return NextResponse.json({ ok: true });
  }
);
