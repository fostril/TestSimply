import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { z } from "zod";

const stepSchema = z.object({
  action: z.string(),
  expected: z.string().optional()
});

const createSchema = z.object({
  projectId: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().optional(),
  preconditions: z.string().optional(),
  steps: z.array(stepSchema).default([]),
  expected: z.string().optional(),
  priority: z.string().optional(),
  status: z.string().optional(),
  tags: z.array(z.string()).optional(),
  component: z.string().optional(),
  ownerId: z.string().optional()
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, "project:view");
  if (!auth.authorized) return auth.response;
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const search = searchParams.get("search");
  const where: any = {};
  if (projectId) where.projectId = projectId;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } }
    ];
  }
  const testCases = await prisma.testCase.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 100
  });
  return NextResponse.json(testCases);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, "testcase:create");
  if (!auth.authorized) return auth.response;
  const parsed = createSchema.parse(await req.json());
  const testCase = await prisma.testCase.create({
    data: {
      ...parsed,
      steps: parsed.steps,
      tags: parsed.tags ?? []
    }
  });
  return NextResponse.json(testCase, { status: 201 });
}
