import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  preconditions: z.string().optional(),
  steps: z.array(z.any()).optional(),
  expected: z.string().optional(),
  priority: z.string().optional(),
  status: z.string().optional(),
  tags: z.array(z.string()).optional(),
  component: z.string().optional(),
  ownerId: z.string().nullable().optional()
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req, "project:view");
  if (!auth.authorized) return auth.response;
  const testCase = await prisma.testCase.findUnique({
    where: { id: params.id },
    include: { requirements: true }
  });
  if (!testCase) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(testCase);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req, "testcase:update");
  if (!auth.authorized) return auth.response;
  const parsed = updateSchema.parse(await req.json());
  const testCase = await prisma.testCase.update({
    where: { id: params.id },
    data: parsed
  });
  return NextResponse.json(testCase);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req, "testcase:delete");
  if (!auth.authorized) return auth.response;
  await prisma.testCase.update({
    where: { id: params.id },
    data: { deletedAt: new Date() }
  });
  return NextResponse.json({ ok: true });
}
