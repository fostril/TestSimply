import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, assertProjectAccessForResource } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

import { ExecutionStatus } from "@prisma/client";

const updateSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  environment: z.string().optional(),
  revision: z.string().optional(),
  buildUrl: z.string().optional(),
  commitSha: z.string().optional(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  labels: z.array(z.string()).optional(),
  status: z.nativeEnum(ExecutionStatus).optional(),
});

async function resolveExecution(idOrKey: string, projectKey: string | null) {
  const byId = await prisma.testExecution.findUnique({ where: { id: idOrKey } });
  if (byId) return byId;

  if (projectKey) {
    const project = await prisma.project.findUnique({
      where: { key: projectKey },
      select: { id: true },
    });
    if (project) {
      const byKey = await prisma.testExecution.findUnique({
        where: { projectId_key: { projectId: project.id, key: idOrKey } },
      });
      if (byKey) return byKey;
    }
  }

  // Last-resort: try to parse "<PROJECT_KEY>-<EXEC_KEY>"
  const parts = idOrKey.split("-");
  for (let i = 1; i < parts.length; i++) {
    const pKey = parts.slice(0, i).join("-");
    const eKey = parts.slice(i).join("-");
    const project = await prisma.project.findUnique({
      where: { key: pKey },
      select: { id: true },
    });
    if (!project) continue;
    const exec = await prisma.testExecution.findUnique({
      where: { projectId_key: { projectId: project.id, key: eKey } },
    });
    if (exec) return exec;
  }
  return null;
}

export const GET = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "project:view");
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(req.url);
    const projectKey = searchParams.get("projectKey");

    const execution = await resolveExecution(params.id, projectKey);
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      execution,
    );
    if (denied) return denied;

    const full = await prisma.testExecution.findUnique({
      where: { id: execution!.id },
      include: {
        results: { include: { testCase: true, bugs: true, Attachment: true } },
        attachments: true,
        plan: { include: { cases: { include: { case: true } } } },
      },
    });
    return NextResponse.json(full);
  }
);

export const PATCH = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "execution:manage");
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(req.url);
    const projectKey = searchParams.get("projectKey");

    const execution = await resolveExecution(params.id, projectKey);
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      execution,
    );
    if (denied) return denied;

    const parsed = updateSchema.parse(await req.json());

    const data: Record<string, unknown> = { ...parsed };
    if (parsed.startedAt) data.startedAt = new Date(parsed.startedAt);
    if (parsed.finishedAt) data.finishedAt = new Date(parsed.finishedAt);

    if (parsed.status === ExecutionStatus.COMPLETED && !parsed.finishedAt) {
      data.finishedAt = new Date();
    }

    const updated = await prisma.testExecution.update({
      where: { id: execution!.id },
      data,
    });

    await logAudit(auth.session.user?.id, "UPDATE", "TestExecution", updated.id, parsed, updated.projectId);

    return NextResponse.json(updated);
  }
);

export const DELETE = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "execution:manage");
    if (!auth.authorized) return auth.response;

    const execution = await resolveExecution(params.id, null);
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      execution,
    );
    if (denied) return denied;

    await prisma.testExecution.delete({ where: { id: execution!.id } });
    await logAudit(auth.session.user?.id, "DELETE", "TestExecution", execution!.id, {}, execution!.projectId);

    return NextResponse.json({ ok: true });
  }
);
