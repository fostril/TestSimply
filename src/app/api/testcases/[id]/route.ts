import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, assertProjectAccessForResource, resolveByIdOrKey } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { Prisma, Priority, TestType } from "@prisma/client";

/**
 * Resolve a non-deleted test case by either its cuid `id` or its project-scoped `key`
 * (e.g. "ACME_TC_123" or "ACME-TC-123").
 */
async function resolveTestCase(idOrKey: string, projectKey: string | null = null) {
  return resolveByIdOrKey(
    async (id) => {
      const tc = await prisma.testCase.findUnique({ where: { id } });
      return tc && !tc.deletedAt ? tc : null;
    },
    async (projectId, key) => {
      const tc = await prisma.testCase.findUnique({
        where: { projectId_key: { projectId, key } },
      });
      return tc && !tc.deletedAt ? tc : null;
    },
    idOrKey,
    projectKey,
  );
}

const updateSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  preconditions: z.string().optional(),
  steps: z.array(z.any()).optional(),          // stored as Json in Prisma
  expected: z.string().optional(),
  priority: z.nativeEnum(Priority).optional(), // Prisma enum
  status: z.string().optional(),               // string field (no enum in client)
  tags: z.array(z.string()).optional(),        // scalar list
  component: z.string().optional(),
  folderId: z.string().nullable().optional(),
  type: z.nativeEnum(TestType).optional(),
  gherkin: z.string().nullable().optional(),
  genericDefinition: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),   // relation: connect/disconnect
  isAutomated: z.boolean().optional(),
  automationId: z.string().optional(),
  isFlaky: z.boolean().optional(),
});

export const GET = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "project:view");
    if (!auth.authorized) return auth.response;

    const testCase = await resolveTestCase(params.id);
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      testCase,
    );
    if (denied) return denied;

    const full = await prisma.testCase.findUnique({
      where: { id: testCase!.id },
      include: {
        folder: { select: { id: true, name: true, path: true } },
        requirements: { include: { requirement: true } },
        preconditions: true,
        bugs: true,
      },
    });
    return NextResponse.json(full);
  }
);

export const PATCH = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "testcase:update");
    if (!auth.authorized) return auth.response;

    const testCase = await resolveTestCase(params.id);
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      testCase,
    );
    if (denied) return denied;

    const body = await req.json();
    const parsed = updateSchema.parse(body);

    // If folder is being changed, make sure the target is in the same project.
    if (parsed.folderId) {
      const folder = await prisma.testFolder.findUnique({
        where: { id: parsed.folderId },
        select: { projectId: true },
      });
      if (!folder || folder.projectId !== testCase!.projectId) {
        return NextResponse.json({ error: "Invalid folderId" }, { status: 400 });
      }
    }

    // If owner is being changed, make sure the target user exists.
    if (parsed.ownerId) {
      const owner = await prisma.user.findUnique({
        where: { id: parsed.ownerId },
        select: { id: true },
      });
      if (!owner) {
        return NextResponse.json({ error: "Invalid ownerId" }, { status: 400 });
      }
    }

    const data: Prisma.TestCaseUpdateInput = {
      ...(parsed.name !== undefined && { name: parsed.name }),
      ...(parsed.description !== undefined && { description: parsed.description }),
      ...(parsed.preconditions !== undefined && { preconditionsText: parsed.preconditions }),
      ...(parsed.steps !== undefined && { steps: parsed.steps as unknown as Prisma.InputJsonValue }),
      ...(parsed.expected !== undefined && { expected: parsed.expected }),
      ...(parsed.priority !== undefined && { priority: { set: parsed.priority } }),
      ...(parsed.status !== undefined && { status: parsed.status }),
      ...(parsed.tags !== undefined && { tags: { set: parsed.tags } }),
      ...(parsed.component !== undefined && { component: parsed.component }),
      ...(parsed.type !== undefined && { type: { set: parsed.type } }),
      ...(parsed.gherkin !== undefined && { gherkin: parsed.gherkin }),
      ...(parsed.genericDefinition !== undefined && { genericDefinition: parsed.genericDefinition }),
      ...(
        parsed.folderId !== undefined
          ? (parsed.folderId === null
            ? { folder: { disconnect: true } }
            : { folder: { connect: { id: parsed.folderId } } })
          : {}
      ),
      ...(
        parsed.ownerId !== undefined
          ? (parsed.ownerId === null
            ? { owner: { disconnect: true } }
            : { owner: { connect: { id: parsed.ownerId } } })
          : {}
      ),
      ...(parsed.isAutomated !== undefined && { isAutomated: parsed.isAutomated }),
      ...(parsed.automationId !== undefined && { automationId: parsed.automationId }),
      ...(parsed.isFlaky !== undefined && { isFlaky: parsed.isFlaky }),
    };

    const updated = await prisma.testCase.update({
      where: { id: testCase!.id },
      data,
    });

    await logAudit(auth.session.user?.id, "UPDATE", "TestCase", updated.id, parsed, updated.projectId);

    return NextResponse.json(updated);
  }
);

export const DELETE = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "testcase:delete");
    if (!auth.authorized) return auth.response;

    const testCase = await resolveTestCase(params.id);
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      testCase,
    );
    if (denied) return denied;

    await prisma.testCase.update({
      where: { id: testCase!.id },
      data: { deletedAt: new Date() },
    });

    await logAudit(auth.session.user?.id, "DELETE", "TestCase", testCase!.id, {}, testCase!.projectId);

    return NextResponse.json({ ok: true });
  }
);
