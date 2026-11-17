import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, parsePagination, paginatedJson } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const projectSchema = z.object({
  key: z.string().min(2),
  name: z.string().min(2),
  description: z.string().optional(),
});

export const GET = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "project:view");
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(req.url);
  const pagination = parsePagination(searchParams);
  const userRole = auth.session.user.role;
  const userId = auth.session.user.id;

  const where =
    userRole === "ADMIN"
      ? undefined
      : {
          OR: [
            { members: { some: { id: userId } } },
            { leads: { some: { id: userId } } },
          ],
        };

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { settings: true },
      skip: pagination.skip,
      take: pagination.limit,
    }),
    prisma.project.count({ where }),
  ]);

  // Mask sensitive credentials so the list endpoint never leaks tokens.
  for (const project of projects) {
    if (project.settings) {
      project.settings.jiraApiToken = project.settings.jiraApiToken ? "********" : null;
      project.settings.ciToken = project.settings.ciToken ? "********" : null;
    }
  }

  return paginatedJson(projects, total, pagination);
});

export const POST = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "project:create");
  if (!auth.authorized) return auth.response;

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
        // Automatically grant access to the creator so they don't get locked
        // out of their own project after create.
        leads: auth.session.user?.id
          ? { connect: [{ id: auth.session.user.id }] }
          : undefined,
      },
      include: { settings: true },
    });

    await logAudit(auth.session.user?.id, "CREATE", "Project", project.id, {
      key: project.key,
      name: project.name,
    }, project.id);

    return NextResponse.json(project, { status: 201 });
  } catch (err: any) {
    if (err?.code === "P2002") {
      return NextResponse.json(
        { error: "Project key or name already exists. Choose a different one." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Failed to create project", details: err.message }, { status: 500 });
  }
});
