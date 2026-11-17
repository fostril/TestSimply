import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Priority, RequirementStatus } from "@prisma/client";
import {
  requireAuth,
  requireProjectAccessOrForbid,
  parsePagination,
  paginatedJson,
  withApiHandler,
} from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { generateEntityKey } from "@/lib/keys";
import { logAudit } from "@/lib/audit";

const createSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  priority: z.nativeEnum(Priority).optional(),
  status: z.nativeEnum(RequirementStatus).optional(),
  externalIssueKey: z.string().optional(),
  externalUrl: z.string().url().optional(),
  tags: z.array(z.string()).optional(),
});

export const GET = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "project:view");
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const search = searchParams.get("search")?.trim() || undefined;
  const status = searchParams.get("status") || undefined;

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const access = await requireProjectAccessOrForbid(
    auth.session.user.id,
    auth.session.user.role,
    projectId,
  );
  if (access instanceof NextResponse) return access;

  const pagination = parsePagination(searchParams);
  const where: Record<string, unknown> = { projectId };
  if (search) {
    where.OR = [
      { key: { contains: search, mode: "insensitive" } },
      { title: { contains: search, mode: "insensitive" } },
      { externalIssueKey: { contains: search, mode: "insensitive" } },
    ];
  }
  if (status && (status in RequirementStatus)) {
    where.status = status as RequirementStatus;
  }

  const [items, total] = await Promise.all([
    prisma.requirement.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: pagination.skip,
      take: pagination.limit,
      include: {
        _count: { select: { links: { where: { testCase: { deletedAt: null } } } } },
      },
    }),
    prisma.requirement.count({ where }),
  ]);

  return paginatedJson(items, total, pagination);
});

export const POST = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "testcase:create");
  if (!auth.authorized) return auth.response;

  const parsed = createSchema.parse(await req.json());

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

  const key = await generateEntityKey(prisma, parsed.projectId, project.key, "REQ");

  const source = parsed.externalIssueKey || parsed.externalUrl ? "JIRA" : "LOCAL";

  const requirement = await prisma.requirement.create({
    data: {
      projectId: parsed.projectId,
      key,
      title: parsed.title.trim(),
      description: parsed.description?.trim() || null,
      priority: parsed.priority ?? Priority.MEDIUM,
      status: parsed.status ?? RequirementStatus.OPEN,
      externalIssueKey: parsed.externalIssueKey?.trim() || null,
      externalUrl: parsed.externalUrl?.trim() || null,
      source,
      tags: parsed.tags?.map((t) => t.trim()).filter(Boolean) ?? [],
    },
  });

  await logAudit(auth.session.user?.id, "CREATE", "Requirement", requirement.id, {
    key: requirement.key,
    title: requirement.title,
  }, parsed.projectId);

  return NextResponse.json(requirement, { status: 201 });
});
