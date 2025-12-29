import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
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
  const executions = await prisma.testExecution.findMany({
    where: projectId ? { projectId } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      results: true,
      plan: { include: { cases: { include: { case: true } } } },
      environmentRelation: true
    }
  });
  return NextResponse.json(executions);
});

export const POST = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "execution:manage");
  if (!auth.authorized) return auth.response;
  const parsed = createSchema.parse(await req.json());

  const project = await prisma.project.findUnique({
    where: { id: parsed.projectId },
    select: { key: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const generatedKey = await generateEntityKey(prisma, parsed.projectId, project.key, "EXEC");

  const execution = await prisma.testExecution.create({
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
    }
  });

  if (parsed.caseIds && parsed.caseIds.length > 0) {
    try {
      await prisma.testResult.createMany({
        data: parsed.caseIds.map((caseId) => ({
          executionId: execution.id,
          caseId,
          status: TestStatus.SKIPPED
        }))
      });
    } catch (error) {
      console.error("Failed to create results:", error);
      // We should probably delete the execution if results failed, or just warn.
      // For now, let's return the error to the client to debug.
      return NextResponse.json({ error: "Failed to create results", details: error instanceof Error ? error.message : String(error) }, { status: 500 });
    }
  }

  return NextResponse.json(execution, { status: 201 });
});
