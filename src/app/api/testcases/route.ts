import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, requireProjectAccessOrForbid, parsePagination, paginatedJson } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { Priority, TestType } from "@prisma/client";
import { generateEntityKey } from "@/lib/keys";

const stepSchema = z.object({
  action: z.string().min(1),
  data: z.string().optional(),
  expected: z.string().optional(),
});

const createSchema = z.object({
  projectId: z.string().min(1),
  key: z.string().min(1).optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  preconditions: z.string().optional(),
  expected: z.string().optional(),
  priority: z.nativeEnum(Priority).optional(),
  status: z.string().optional(),
  component: z.string().optional(),
  folderId: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  type: z.nativeEnum(TestType).optional(),
  steps: z.array(stepSchema).default([]),
  gherkin: z.string().optional(),
  genericDefinition: z.string().optional(),
  isAutomated: z.boolean().optional(),
  automationId: z.string().optional(),
});

export const GET = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "project:view");
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const search = searchParams.get("search");
  const folderId = searchParams.get("folderId"); // "-" → no folder (unfiled)
  const folderPathPrefix = searchParams.get("folderPath"); // include subtree under a given path
  const typeFilter = searchParams.get("type");

  // Require and validate project access
  if (projectId) {
    const access = await requireProjectAccessOrForbid(auth.session.user.id, auth.session.user.role, projectId);
    if (access instanceof NextResponse) return access;
  }

  const pagination = parsePagination(searchParams);

  const whereClause: Record<string, unknown> = {
    deletedAt: null,
  };

  if (projectId) {
    whereClause.projectId = projectId;
  }

  if (search) {
    whereClause.OR = [
      { key: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
    ];
  }

  if (folderId === "-") {
    whereClause.folderId = null;
  } else if (folderId) {
    whereClause.folderId = folderId;
  }

  if (folderPathPrefix && projectId) {
    // Include all cases under any folder whose path starts with the prefix.
    // Also include the folder itself (equality) by adding OR.
    const matchingFolders = await prisma.testFolder.findMany({
      where: {
        projectId,
        OR: [{ path: folderPathPrefix }, { path: { startsWith: `${folderPathPrefix}/` } }],
      },
      select: { id: true },
    });
    whereClause.folderId = { in: matchingFolders.map((f) => f.id) };
  }

  if (typeFilter && ["MANUAL", "CUCUMBER", "GENERIC"].includes(typeFilter)) {
    whereClause.type = typeFilter;
  }

  const [testCases, total] = await Promise.all([
    prisma.testCase.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      include: {
        folder: { select: { id: true, name: true, path: true } },
      },
      skip: pagination.skip,
      take: pagination.limit,
    }),
    prisma.testCase.count({ where: whereClause }),
  ]);

  return paginatedJson(testCases, total, pagination);
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

  const generatedKey = await generateEntityKey(prisma, parsed.projectId, project.key, "TC");
  const trimmedName = parsed.name.trim();
  const steps = parsed.steps
    .map((step) => ({
      action: step.action.trim(),
      data: step.data?.trim(),
      expected: step.expected?.trim(),
    }))
    .filter((step) => step.action.length > 0)
    .map((step) => ({
      action: step.action,
      ...(step.data ? { data: step.data } : {}),
      ...(step.expected ? { expected: step.expected } : {}),
    }));

  if (!trimmedName) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Type-specific validation: only require a body matching the chosen test
  // type. A MANUAL test needs steps; CUCUMBER needs a Gherkin body; GENERIC
  // needs a non-empty definition.
  const testType = parsed.type ?? TestType.MANUAL;
  if (testType === TestType.MANUAL && steps.length === 0) {
    return NextResponse.json({ error: "At least one step is required" }, { status: 400 });
  }
  if (testType === TestType.CUCUMBER && !parsed.gherkin?.trim()) {
    return NextResponse.json(
      { error: "Gherkin body is required for Cucumber tests" },
      { status: 400 },
    );
  }
  if (testType === TestType.GENERIC && !parsed.genericDefinition?.trim()) {
    return NextResponse.json(
      { error: "Generic definition is required for Generic tests" },
      { status: 400 },
    );
  }

  // If the caller provides a folderId, it must belong to the same project.
  if (parsed.folderId) {
    const folder = await prisma.testFolder.findUnique({
      where: { id: parsed.folderId },
      select: { projectId: true },
    });
    if (!folder || folder.projectId !== parsed.projectId) {
      return NextResponse.json({ error: "Invalid folderId" }, { status: 400 });
    }
  }

  const testCase = await prisma.testCase.create({
    data: {
      projectId: parsed.projectId,
      key: generatedKey,
      name: trimmedName,
      description: parsed.description?.trim() || null,
      preconditionsText: parsed.preconditions?.trim() || null,
      expected: parsed.expected?.trim() || null,
      type: testType,
      ...(parsed.priority ? { priority: parsed.priority } : {}),
      ...(parsed.status ? { status: parsed.status } : {}),
      component: parsed.component?.trim() || null,
      folderId: parsed.folderId || null,
      tags: parsed.tags?.map((tag) => tag.trim()).filter(Boolean) ?? [],
      steps,
      gherkin: parsed.gherkin?.trim() || null,
      genericDefinition: parsed.genericDefinition?.trim() || null,
      isAutomated: parsed.isAutomated ?? false,
      automationId: parsed.automationId?.trim() || null,
    },
  });

  await logAudit(auth.session.user?.id, "CREATE", "TestCase", testCase.id, {
    key: testCase.key,
    name: testCase.name,
  }, parsed.projectId);

  return NextResponse.json(testCase, { status: 201 });
});
