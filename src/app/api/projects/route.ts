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
  const parsed = projectSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid project payload" }, { status: 400 });
  }

  const key = parsed.data.key.trim().toUpperCase();
  const name = parsed.data.name.trim();
  const description = parsed.data.description?.trim();

  if (key.length < 2 || name.length < 2) {
    return NextResponse.json(
      { error: "Project key and name must be at least 2 characters" },
      { status: 400 }
    );
  }

  try {
    const project = await prisma.project.create({
      data: {
        key,
        name,
        description: description ? description : null,
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
