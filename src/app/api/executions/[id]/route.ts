import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, assertProjectAccessForResource, resolveByIdOrKey } from "@/lib/api";
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
  finishedAt: z.string().nullable().optional(),
  labels: z.array(z.string()).optional(),
  status: z.nativeEnum(ExecutionStatus).optional(),
});

async function resolveExecution(idOrKey: string, projectKey: string | null) {
  return resolveByIdOrKey(
    (id) => prisma.testExecution.findUnique({ where: { id } }),
    (projectId, key) => prisma.testExecution.findUnique({ where: { projectId_key: { projectId, key } } }),
    idOrKey,
    projectKey,
  );
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
        results: {
          where: { testCase: { deletedAt: null } },
          include: { testCase: true, bugs: true, Attachment: true },
        },
        attachments: true,
        environmentRelation: true,
        plan: {
          include: {
            cases: {
              where: { case: { deletedAt: null } },
              include: { case: true },
              orderBy: { order: "asc" },
            },
          },
        },
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
    if (parsed.finishedAt !== undefined) {
      data.finishedAt = parsed.finishedAt ? new Date(parsed.finishedAt) : null;
      if (parsed.finishedAt && !parsed.status) {
        data.status = ExecutionStatus.COMPLETED;
      }
    }

    if (parsed.status === ExecutionStatus.COMPLETED && parsed.finishedAt === undefined) {
      data.finishedAt = new Date();
    } else if (
      parsed.status &&
      parsed.status !== ExecutionStatus.COMPLETED &&
      parsed.finishedAt === undefined
    ) {
      data.finishedAt = null;
    }

    if (parsed.environment !== undefined) {
      if (parsed.environment === "") {
        data.environment = null;
        data.environmentId = null;
      } else {
        const envRecord = await prisma.environment.findUnique({
          where: { id: parsed.environment },
          select: { id: true, name: true, projectId: true },
        });
        if (envRecord && envRecord.projectId === execution!.projectId) {
          data.environmentId = envRecord.id;
          data.environment = envRecord.name;
        }
      }
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

    const projectKey = new URL(req.url).searchParams.get("projectKey");
    const execution = await resolveExecution(params.id, projectKey);
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
