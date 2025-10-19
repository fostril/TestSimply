import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { z } from "zod";

const createSchema = z.object({
  projectId: z.string(),
  planId: z.string().optional(),
  key: z.string(),
  name: z.string(),
  description: z.string().optional(),
  environment: z.string().optional(),
  revision: z.string().optional(),
  buildUrl: z.string().optional(),
  commitSha: z.string().optional(),
  labels: z.array(z.string()).optional()
});

export const GET = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "project:view");
  if (!auth.authorized) return auth.response;
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const executions = await prisma.testExecution.findMany({
    where: projectId ? { projectId } : undefined,
    orderBy: { createdAt: "desc" },
    include: { results: true, plan: { include: { cases: { include: { case: true } } } } }
  });
  return NextResponse.json(executions);
});

export const POST = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "execution:manage");
  if (!auth.authorized) return auth.response;
  const parsed = createSchema.parse(await req.json());
  const execution = await prisma.testExecution.create({
    data: {
      ...parsed,
      labels: parsed.labels ?? [],
      createdById: auth.session.user?.id
    }
  });
  return NextResponse.json(execution, { status: 201 });
});
