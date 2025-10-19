import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { z } from "zod";

const baseSchema = z.object({
  projectId: z.string(),
  key: z.string(),
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
  const plan = await prisma.testPlan.create({ data: parsed });
  return NextResponse.json(plan, { status: 201 });
});
