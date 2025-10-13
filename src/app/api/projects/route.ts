import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { z } from "zod";

const projectSchema = z.object({
  key: z.string().min(2),
  name: z.string().min(2),
  description: z.string().optional()
});

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, "project:view");
  if (!auth.authorized) return auth.response;

  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: { settings: true }
  });
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, "project:create");
  if (!auth.authorized) return auth.response;
  const body = await req.json();
  const parsed = projectSchema.parse(body);
  const project = await prisma.project.create({
    data: {
      ...parsed,
      settings: {
        create: {
          tags: [],
          components: [],
          environments: []
        }
      }
    },
    include: { settings: true }
  });
  return NextResponse.json(project, { status: 201 });
}
