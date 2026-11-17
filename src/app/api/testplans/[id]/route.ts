import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, assertProjectAccessForResource, resolveByIdOrKey } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  targetVersions: z.array(z.string()).optional(),
  environments: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

async function resolvePlan(idOrKey: string, projectKey: string | null = null) {
  return resolveByIdOrKey(
    (id) => prisma.testPlan.findUnique({ where: { id } }),
    (projectId, key) => prisma.testPlan.findUnique({ where: { projectId_key: { projectId, key } } }),
    idOrKey,
    projectKey,
  );
}

export const GET = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "project:view");
    if (!auth.authorized) return auth.response;

    const plan = await resolvePlan(params.id, new URL(req.url).searchParams.get("projectKey"));
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      plan,
    );
    if (denied) return denied;

    const full = await prisma.testPlan.findUnique({
      where: { id: plan!.id },
      include: {
        cases: {
          where: { case: { deletedAt: null } },
          include: { case: true },
          orderBy: { order: "asc" },
        },
        environmentRelations: true,
      },
    });
    return NextResponse.json(full);
  }
);

export const PATCH = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "testplan:manage");
    if (!auth.authorized) return auth.response;

    const plan = await resolvePlan(params.id, new URL(req.url).searchParams.get("projectKey"));
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      plan,
    );
    if (denied) return denied;

    const parsed = updateSchema.parse(await req.json());

    const environmentIds = parsed.environments;
    const data: Record<string, unknown> = { ...parsed };

    if (environmentIds) {
      const validEnvs = environmentIds.length
        ? await prisma.environment.findMany({
            where: { id: { in: environmentIds }, projectId: plan!.projectId },
            select: { id: true },
          })
        : [];
      if (validEnvs.length !== new Set(environmentIds).size) {
        return NextResponse.json({ error: "Invalid environment id" }, { status: 400 });
      }
      data.environmentRelations = {
        set: validEnvs.map((e) => ({ id: e.id })),
      };
      delete data.environments;
    }

    const updated = await prisma.testPlan.update({
      where: { id: plan!.id },
      data,
      include: { environmentRelations: true },
    });

    await logAudit(auth.session.user?.id, "UPDATE", "TestPlan", updated.id, parsed, updated.projectId);

    return NextResponse.json(updated);
  }
);

export const DELETE = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "testplan:manage");
    if (!auth.authorized) return auth.response;

    const plan = await resolvePlan(params.id);
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      plan,
    );
    if (denied) return denied;

    await prisma.testPlan.delete({ where: { id: plan!.id } });

    await logAudit(auth.session.user?.id, "DELETE", "TestPlan", plan!.id, {}, plan!.projectId);

    return NextResponse.json({ ok: true });
  }
);
