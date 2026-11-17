import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, requireProjectAccessOrForbid, parsePagination, paginatedJson } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { TestStatus } from "@prisma/client";

import { generateEntityKey } from "@/lib/keys";

const createSchema = z.object({
  projectId: z.string(),
  planId: z.string().optional(),
  key: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  environment: z.string().optional(),
  revision: z.string().optional(),
  buildUrl: z.string().optional(),
  commitSha: z.string().optional(),
  labels: z.array(z.string()).optional(),
  caseIds: z.array(z.string()).optional()
});

export const GET = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "project:view");
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  if (projectId) {
    const access = await requireProjectAccessOrForbid(auth.session.user.id, auth.session.user.role, projectId);
    if (access instanceof NextResponse) return access;
  }

  const pagination = parsePagination(searchParams);
  const where = projectId ? { projectId } : undefined;

  const [executions, total] = await Promise.all([
    prisma.testExecution.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.limit,
      include: {
        results: true,
        plan: { include: { cases: { include: { case: true } } } },
        environmentRelation: true,
      },
    }),
    prisma.testExecution.count({ where }),
  ]);

  return paginatedJson(executions, total, pagination);
});

export const POST = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "execution:manage");
  if (!auth.authorized) return auth.response;
  const parsed = createSchema.parse(await req.json());

  // Verify project access
  const access = await requireProjectAccessOrForbid(auth.session.user.id, auth.session.user.role, parsed.projectId);
  if (access instanceof NextResponse) return access;

  const project = await prisma.project.findUnique({
    where: { id: parsed.projectId },
    select: { key: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Verify plan and environment (if provided) belong to the target project
  if (parsed.planId) {
    const plan = await prisma.testPlan.findUnique({
      where: { id: parsed.planId },
      select: { projectId: true },
    });
    if (!plan || plan.projectId !== parsed.projectId) {
      return NextResponse.json({ error: "Invalid planId" }, { status: 400 });
    }
  }
  if (parsed.environment) {
    const env = await prisma.environment.findUnique({
      where: { id: parsed.environment },
      select: { projectId: true },
    });
    if (!env || env.projectId !== parsed.projectId) {
      return NextResponse.json({ error: "Invalid environment" }, { status: 400 });
    }
  }

  // Restrict caseIds to cases in the same project
  let scopedCaseIds: string[] = [];
  if (parsed.caseIds && parsed.caseIds.length > 0) {
    const cases = await prisma.testCase.findMany({
      where: { id: { in: parsed.caseIds }, projectId: parsed.projectId },
      select: { id: true },
    });
    scopedCaseIds = cases.map((c) => c.id);
  }

  const generatedKey = await generateEntityKey(prisma, parsed.projectId, project.key, "EXEC");

  const execution = await prisma.$transaction(async (tx) => {
    const exec = await tx.testExecution.create({
      data: {
        projectId: parsed.projectId,
        planId: parsed.planId || undefined,
        key: generatedKey,
        name: parsed.name,
        description: parsed.description || undefined,
        environmentId: parsed.environment || undefined,
        revision: parsed.revision || undefined,
        buildUrl: parsed.buildUrl || undefined,
        commitSha: parsed.commitSha || undefined,
        labels: parsed.labels ?? [],
        createdById: auth.session.user?.id,
      },
    });

    if (scopedCaseIds.length > 0) {
      await tx.testResult.createMany({
        data: scopedCaseIds.map((caseId) => ({
          executionId: exec.id,
          caseId,
          status: TestStatus.SKIPPED,
        })),
      });
    }

    return exec;
  });

  await logAudit(auth.session.user?.id, "CREATE", "TestExecution", execution.id, {
    key: execution.key,
    name: execution.name,
  }, parsed.projectId);

  return NextResponse.json(execution, { status: 201 });
});
