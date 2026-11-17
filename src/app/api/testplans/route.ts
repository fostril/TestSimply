import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, requireProjectAccessOrForbid, getAccessibleProjectIds, parsePagination, paginatedJson } from "@/lib/api";
import { z } from "zod";

import { generateEntityKey } from "@/lib/keys";

const baseSchema = z.object({
  projectId: z.string(),
  key: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  targetVersions: z.array(z.string()).optional(),
  environments: z.array(z.string()).optional(),
  environmentIds: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional()
});

export const GET = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "project:view");
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  if (projectId) {
    const access = await requireProjectAccessOrForbid(auth.session.user.id, auth.session.user.role, projectId);
    if (access instanceof NextResponse) return access;
  }

  const pagination = parsePagination(searchParams);
  let where: { projectId?: string | { in: string[] } } | undefined = projectId ? { projectId } : undefined;
  if (!where) {
    const accessibleIds = await getAccessibleProjectIds(auth.session.user.id, auth.session.user.role);
    if (accessibleIds !== null) {
      where = { projectId: { in: accessibleIds } };
    }
  }

  const [plans, total] = await Promise.all([
    prisma.testPlan.findMany({
      where,
      include: {
        cases: {
          where: { case: { deletedAt: null } },
          include: { case: true },
          orderBy: { order: "asc" },
        },
        environmentRelations: true,
      },
      orderBy: { createdAt: "desc" },
      skip: pagination.skip,
      take: pagination.limit,
    }),
    prisma.testPlan.count({ where }),
  ]);

  return paginatedJson(plans, total, pagination);
});

export const POST = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "testplan:manage");
  if (!auth.authorized) return auth.response;
  const parsed = baseSchema.parse(await req.json());

  const access = await requireProjectAccessOrForbid(
    auth.session.user.id,
    auth.session.user.role,
    parsed.projectId,
  );
  if (access instanceof NextResponse) return access;

  const project = await prisma.project.findUnique({
    where: { id: parsed.projectId },
    select: { key: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const generatedKey = await generateEntityKey(prisma, parsed.projectId, project.key, "PLAN");

  const { environmentIds, key: _ignoredKey, ...planFields } = parsed;
  let validEnvIds: string[] = [];
  if (environmentIds && environmentIds.length > 0) {
    const envs = await prisma.environment.findMany({
      where: { id: { in: environmentIds }, projectId: parsed.projectId },
      select: { id: true },
    });
    validEnvIds = envs.map((e) => e.id);
  }

  const plan = await prisma.testPlan.create({
    data: {
      ...planFields,
      key: generatedKey,
      ...(validEnvIds.length > 0
        ? { environmentRelations: { connect: validEnvIds.map((id) => ({ id })) } }
        : {}),
    },
    include: { environmentRelations: true },
  });
  return NextResponse.json(plan, { status: 201 });
});
