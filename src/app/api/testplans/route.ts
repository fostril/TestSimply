import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { z } from "zod";

import { generateEntityKey } from "@/lib/keys";

const baseSchema = z.object({
  projectId: z.string(),
  key: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  targetVersions: z.array(z.string()).optional(),
  environments: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional()
});

export const GET = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "project:view");
  if (!auth.authorized) return auth.response;
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const plans = await prisma.testPlan.findMany({
    where: projectId ? { projectId } : undefined,
    include: { cases: { include: { case: true } } },
    orderBy: { createdAt: "desc" }
  });
  return NextResponse.json(plans);
});

export const POST = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "testplan:manage");
  if (!auth.authorized) return auth.response;
  const parsed = baseSchema.parse(await req.json());

  const project = await prisma.project.findUnique({
    where: { id: parsed.projectId },
    select: { key: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const generatedKey = await generateEntityKey(prisma, parsed.projectId, project.key, "PLAN");

  const plan = await prisma.testPlan.create({
    data: {
      ...parsed,
      key: generatedKey,
    }
  });
  return NextResponse.json(plan, { status: 201 });
});
