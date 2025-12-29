import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { Priority } from "@prisma/client";
import { generateEntityKey } from "@/lib/keys";

const stepSchema = z.object({
  action: z.string().min(1),
  data: z.string().optional(),
  expected: z.string().optional(),
});

const createSchema = z.object({
  projectId: z.string().min(1),
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  preconditions: z.string().optional(),
  expected: z.string().optional(),
  priority: z.nativeEnum(Priority).optional(),
  status: z.string().optional(),
  component: z.string().optional(),
  tags: z.array(z.string()).optional(),
  steps: z.array(stepSchema).default([]),
  isAutomated: z.boolean().optional(),
  automationId: z.string().optional(),
});

export const GET = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "project:view");
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const search = searchParams.get("search");

  const whereClause: any = {
    deletedAt: null,
  };

  if (projectId) {
    whereClause.projectId = projectId;
  }

  if (search) {
    whereClause.OR = [
      { key: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
    ];
  }

  const testCases = await prisma.testCase.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    take: 50, // Limit results when searching or listing to avoid huge payloads
  });

  return NextResponse.json(testCases);
});

export const POST = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "testcase:create");
  if (!auth.authorized) return auth.response;

  const parsed = createSchema.parse(await req.json());

  const project = await prisma.project.findUnique({
    where: { id: parsed.projectId },
    select: { key: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const generatedKey = await generateEntityKey(prisma, parsed.projectId, project.key, "TC");
  const trimmedName = parsed.name.trim();
  const steps = parsed.steps
    .map((step) => ({
      action: step.action.trim(),
      data: step.data?.trim(),
      expected: step.expected?.trim(),
    }))
    .filter((step) => step.action.length > 0)
    .map((step) => ({
      action: step.action,
      ...(step.data ? { data: step.data } : {}),
      ...(step.expected ? { expected: step.expected } : {}),
    }));

  if (!trimmedName) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (steps.length === 0) {
    return NextResponse.json({ error: "At least one step is required" }, { status: 400 });
  }

  const testCase = await prisma.testCase.create({
    data: {
      projectId: parsed.projectId,
      key: generatedKey,
      name: trimmedName,
      description: parsed.description?.trim() || null,
      preconditionsText: parsed.preconditions?.trim() || null,
      expected: parsed.expected?.trim() || null,
      ...(parsed.priority ? { priority: parsed.priority } : {}),
      ...(parsed.status ? { status: parsed.status } : {}),
      component: parsed.component?.trim() || null,
      tags: parsed.tags?.map((tag) => tag.trim()).filter(Boolean) ?? [],
      steps,
      isAutomated: parsed.isAutomated ?? false,
      automationId: parsed.automationId?.trim() || null,
    },
  });

  await logAudit(auth.session.user?.id, "CREATE", "TestCase", testCase.id, {
    key: testCase.key,
    name: testCase.name,
  });

  return NextResponse.json(testCase, { status: 201 });
});
