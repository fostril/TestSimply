import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const projectSchema = z.object({
  key: z.string().min(2),
  name: z.string().min(2),
  description: z.string().optional(),
});

export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    include: { settings: true },
  });
  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = projectSchema.parse(body);

  const key = parsed.key.trim().toUpperCase();
  const name = parsed.name.trim();

  try {
    const project = await prisma.project.create({
      data: {
        key,
        name,
        description: parsed.description ?? null,
        settings: {
          create: {
            tags: [],
            components: [],
            environments: [],
          },
        },
      },
      include: { settings: true },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json(
        { error: "Project key or name already exists. Choose a different one." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
