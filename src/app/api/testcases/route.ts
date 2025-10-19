import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { z } from "zod";
import { Priority } from "@prisma/client";

const stepSchema = z.object({
  action: z.string().min(1),
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
});

export const GET = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "project:view");
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  const testCases = await prisma.testCase.findMany({
    where: {
      ...(projectId ? { projectId } : {}),
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(testCases);
});

export const POST = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "testcase:create");
  if (!auth.authorized) return auth.response;

  const parsed = createSchema.parse(await req.json());

  const trimmedKey = parsed.key.trim();
  const trimmedName = parsed.name.trim();
  const steps = parsed.steps
    .map((step) => ({
      action: step.action.trim(),
      expected: step.expected?.trim(),
    }))
    .filter((step) => step.action.length > 0)
    .map((step) => ({
      action: step.action,
      ...(step.expected ? { expected: step.expected } : {}),
    }));

  if (!trimmedKey || !trimmedName) {
    return NextResponse.json({ error: "Key and name are required" }, { status: 400 });
  }
  if (steps.length === 0) {
    return NextResponse.json({ error: "At least one step is required" }, { status: 400 });
  }

  const testCase = await prisma.testCase.create({
    data: {
      projectId: parsed.projectId,
      key: trimmedKey,
      name: trimmedName,
      description: parsed.description?.trim() || null,
      preconditions: parsed.preconditions?.trim() || null,
      expected: parsed.expected?.trim() || null,
      ...(parsed.priority ? { priority: parsed.priority } : {}),
      ...(parsed.status ? { status: parsed.status } : {}),
      component: parsed.component?.trim() || null,
      tags: parsed.tags?.map((tag) => tag.trim()).filter(Boolean) ?? [],
      steps,
    },
  });

  return NextResponse.json(testCase, { status: 201 });
});
