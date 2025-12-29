import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
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

export const GET = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "project:view");
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(req.url);
    const projectKey = searchParams.get("projectKey");

    let execution = await prisma.testExecution.findUnique({
      where: { id: params.id },
      include: {
        results: { include: { testCase: true } },
        plan: { include: { cases: { include: { case: true } } } }
      }
    });

    if (!execution && projectKey) {
      const project = await prisma.project.findUnique({ where: { key: projectKey } });
      if (project) {
        execution = await prisma.testExecution.findUnique({
          where: {
            projectId_key: {
              projectId: project.id,
              key: params.id
            }
          },
          include: {
            results: { include: { testCase: true } },
            plan: { include: { cases: { include: { case: true } } } }
          }
        });
      }
    }

    if (!execution) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(execution);
  }
);

export const PATCH = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "execution:manage");
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(req.url);
    const projectKey = searchParams.get("projectKey");

    const parsed = updateSchema.parse(await req.json());

    const data: any = { ...parsed };
    if (parsed.startedAt) data.startedAt = new Date(parsed.startedAt);
    if (parsed.finishedAt) data.finishedAt = new Date(parsed.finishedAt);

    // Auto-set finishedAt if status is COMPLETED
    if (parsed.status === ExecutionStatus.COMPLETED && !parsed.finishedAt) {
      data.finishedAt = new Date();
    }

    // Find execution by ID or Key
    let executionId = params.id;

    // First try to find by UUID
    let execution = await prisma.testExecution.findUnique({
      where: { id: params.id },
      select: { id: true }
    });

    // If not found by UUID and projectKey is provided, try to find by key
    if (!execution && projectKey) {
      const project = await prisma.project.findUnique({ where: { key: projectKey } });
      if (project) {
        execution = await prisma.testExecution.findUnique({
          where: {
            projectId_key: {
              projectId: project.id,
              key: params.id
            }
          },
          select: { id: true }
        });
      }
    }

    if (!execution) {
      return NextResponse.json({ error: "Execution not found" }, { status: 404 });
    }

    executionId = execution.id;

    const updatedExecution = await prisma.testExecution.update({
      where: { id: executionId },
      data
    });
    return NextResponse.json(updatedExecution);
  }
);

export const DELETE = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "execution:manage");
    if (!auth.authorized) return auth.response;
    await prisma.testExecution.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  }
);
