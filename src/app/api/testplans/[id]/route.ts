import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  targetVersions: z.array(z.string()).optional(),
  environments: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional()
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req, "project:view");
  if (!auth.authorized) return auth.response;
  const plan = await prisma.testPlan.findUnique({
    where: { id: params.id },
    include: { cases: { include: { case: true } } }
  });
  if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(plan);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req, "testplan:manage");
  if (!auth.authorized) return auth.response;
  const parsed = updateSchema.parse(await req.json());
  const plan = await prisma.testPlan.update({ where: { id: params.id }, data: parsed });
  return NextResponse.json(plan);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req, "testplan:manage");
  if (!auth.authorized) return auth.response;
  await prisma.testPlan.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
