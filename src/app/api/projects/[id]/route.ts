import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().optional(),
  description: z.string().nullable().optional()
});

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req, "project:view");
  if (!auth.authorized) return auth.response;
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: { settings: true }
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(project);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req, "project:update");
  if (!auth.authorized) return auth.response;
  const body = await req.json();
  const parsed = updateSchema.parse(body);
  const project = await prisma.project.update({ where: { id: params.id }, data: parsed });
  return NextResponse.json(project);
}
