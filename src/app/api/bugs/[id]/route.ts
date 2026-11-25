import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, assertProjectAccessForResource, resolveByIdOrKey } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { Priority } from "@prisma/client";

const updateSchema = z.object({
  summary: z.string().optional(),
  description: z.string().optional(),
  priority: z.nativeEnum(Priority).optional(),
  status: z.string().optional(),
  testCaseId: z.string().nullable().optional(),
  testSetId: z.string().nullable().optional(),
});

async function resolveBug(idOrKey: string, projectKey: string | null) {
  return resolveByIdOrKey(
    (id) => prisma.bug.findUnique({ where: { id } }),
    (projectId, key) => prisma.bug.findUnique({ where: { projectId_key: { projectId, key } } }),
    idOrKey,
    projectKey,
  );
}

export const GET = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "project:view");
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(req.url);
    const projectKey = searchParams.get("projectKey");

    const bug = await resolveBug(params.id, projectKey);
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      bug,
    );
    if (denied) return denied;

    const full = await prisma.bug.findUnique({
      where: { id: bug!.id },
      include: { testCase: true, testSet: true },
    });
    return NextResponse.json(full);
  }
);

export const PATCH = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "bug:manage");
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(req.url);
    const projectKey = searchParams.get("projectKey");

    const bug = await resolveBug(params.id, projectKey);
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      bug,
    );
    if (denied) return denied;

    const body = await req.json();
    const parsed = updateSchema.parse(body);

    const normalizedTestCaseId =
      parsed.testCaseId === "" ? null : parsed.testCaseId;
    const normalizedTestSetId =
      parsed.testSetId === "" ? null : parsed.testSetId;

    if (normalizedTestCaseId) {
      const tc = await prisma.testCase.findUnique({
        where: { id: normalizedTestCaseId },
        select: { projectId: true, deletedAt: true },
      });
      if (!tc || tc.deletedAt || tc.projectId !== bug!.projectId) {
        return NextResponse.json({ error: "Invalid testCaseId" }, { status: 400 });
      }
    }

    if (normalizedTestSetId) {
      const ts = await prisma.testSet.findUnique({
        where: { id: normalizedTestSetId },
        select: { projectId: true },
      });
      if (!ts || ts.projectId !== bug!.projectId) {
        return NextResponse.json({ error: "Invalid testSetId" }, { status: 400 });
      }
    }

    const updated = await prisma.bug.update({
      where: { id: bug!.id },
      data: {
        ...parsed,
        ...(parsed.testCaseId !== undefined ? { testCaseId: normalizedTestCaseId } : {}),
        ...(parsed.testSetId !== undefined ? { testSetId: normalizedTestSetId } : {}),
      },
    });

    await logAudit(auth.session.user?.id, "UPDATE", "Bug", updated.id, parsed, updated.projectId);
    return NextResponse.json(updated);
  }
);

export const DELETE = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "bug:manage");
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(req.url);
    const projectKey = searchParams.get("projectKey");

    const bug = await resolveBug(params.id, projectKey);
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      bug,
    );
    if (denied) return denied;

    await prisma.bug.delete({ where: { id: bug!.id } });
    await logAudit(auth.session.user?.id, "DELETE", "Bug", bug!.id, {}, bug!.projectId);

    return NextResponse.json({ ok: true });
  }
);
