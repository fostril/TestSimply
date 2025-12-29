import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().optional(),
  description: z.string().nullable().optional()
});

export const GET = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "project:view");
    if (!auth.authorized) return auth.response;
    const project = await prisma.project.findFirst({
      where: {
        OR: [
          { id: params.id },
          { key: params.id }
        ]
      },
      include: { settings: true }
    });
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Mask sensitive data if settings exist
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
    const body = await req.json();
    const parsed = updateSchema.parse(body);
    // First find the project to get the ID if a key was passed
    const existing = await prisma.project.findFirst({
      where: { OR: [{ id: params.id }, { key: params.id }] }
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const project = await prisma.project.update({ where: { id: existing.id }, data: parsed });
    return NextResponse.json(project);
  }
);

export const DELETE = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "project:delete");
    if (!auth.authorized) return auth.response;

    // Delete project and all related data (cascading delete should be handled by Prisma if configured, 
    // but explicit delete is safer for some relations if not set to Cascade)
    // Assuming Prisma schema has onDelete: Cascade for relations, otherwise we might need to delete children first.
    // Let's rely on Prisma's cascading delete for now or just delete the project.

    try {
      // First find to get ID
      const existing = await prisma.project.findFirst({
        where: { OR: [{ id: params.id }, { key: params.id }] }
      });

      if (existing) {
        await prisma.project.delete({
          where: { id: existing.id },
        });
      }
    } catch (error: any) {
      if (error.code === "P2025") {
        // Project already deleted, return success (idempotent)
        return NextResponse.json({ ok: true });
      }
      throw error;
    }

    return NextResponse.json({ ok: true });
  }
);
