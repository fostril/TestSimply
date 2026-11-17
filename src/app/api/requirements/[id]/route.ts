import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Priority, RequirementStatus } from "@prisma/client";
import {
  requireAuth,
  assertProjectAccessForResource,
  withApiHandler,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().nullable().optional(),
  priority: z.nativeEnum(Priority).optional(),
  status: z.nativeEnum(RequirementStatus).optional(),
  externalIssueKey: z.string().nullable().optional(),
  externalUrl: z.string().url().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

/**
 * Resolve a requirement by cuid id or by project-scoped key (e.g. "ACME-REQ-3").
 */
async function resolveRequirement(idOrKey: string) {
  const byId = await prisma.requirement.findUnique({ where: { id: idOrKey } });
  if (byId) return byId;

  const parts = idOrKey.split("-");
  for (let i = 1; i < parts.length; i++) {
    const projectKey = parts.slice(0, i).join("-");
    const reqKey = parts.slice(i).join("-");
    const project = await prisma.project.findUnique({
      where: { key: projectKey },
      select: { id: true },
    });
    if (!project) continue;
    const req = await prisma.requirement.findUnique({
      where: { projectId_key: { projectId: project.id, key: reqKey } },
    });
    if (req) return req;
  }
  return null;
}

export const GET = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "project:view");
    if (!auth.authorized) return auth.response;

    const requirement = await resolveRequirement(params.id);
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      requirement,
    );
    if (denied) return denied;

    const full = await prisma.requirement.findUnique({
      where: { id: requirement!.id },
      include: {
        links: {
          include: {
            testCase: {
              select: { id: true, key: true, name: true, status: true, type: true },
            },
          },
        },
      },
    });
    return NextResponse.json(full);
  },
);

export const PATCH = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "testcase:update");
    if (!auth.authorized) return auth.response;

    const requirement = await resolveRequirement(params.id);
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      requirement,
    );
    if (denied) return denied;

    const parsed = patchSchema.parse(await req.json());

    const updated = await prisma.requirement.update({
      where: { id: requirement!.id },
      data: {
        ...(parsed.title !== undefined && { title: parsed.title }),
        ...(parsed.description !== undefined && { description: parsed.description }),
        ...(parsed.priority !== undefined && { priority: parsed.priority }),
        ...(parsed.status !== undefined && { status: parsed.status }),
        ...(parsed.externalIssueKey !== undefined && { externalIssueKey: parsed.externalIssueKey }),
        ...(parsed.externalUrl !== undefined && { externalUrl: parsed.externalUrl }),
        ...(parsed.tags !== undefined && { tags: { set: parsed.tags } }),
      },
    });

    await logAudit(auth.session.user?.id, "UPDATE", "Requirement", updated.id, parsed, updated.projectId);
    return NextResponse.json(updated);
  },
);

export const DELETE = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "testcase:delete");
    if (!auth.authorized) return auth.response;

    const requirement = await resolveRequirement(params.id);
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      requirement,
    );
    if (denied) return denied;

    await prisma.requirement.delete({ where: { id: requirement!.id } });
    await logAudit(auth.session.user?.id, "DELETE", "Requirement", requirement!.id, {}, requirement!.projectId);
    return NextResponse.json({ ok: true });
  },
);
