import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, assertProjectAccessForResource } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  targetVersions: z.array(z.string()).optional(),
  environments: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});

async function resolvePlan(idOrKey: string) {
  const byId = await prisma.testPlan.findUnique({ where: { id: idOrKey } });
  if (byId) return byId;

  const parts = idOrKey.split("-");
  for (let i = 1; i < parts.length; i++) {
    const projectKey = parts.slice(0, i).join("-");
    const planKey = parts.slice(i).join("-");
    const project = await prisma.project.findUnique({
      where: { key: projectKey },
      select: { id: true },
    });
    if (!project) continue;
    const plan = await prisma.testPlan.findUnique({
      where: { projectId_key: { projectId: project.id, key: planKey } },
    });
    if (plan) return plan;
  }
  return null;
}

export const GET = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "project:view");
    if (!auth.authorized) return auth.response;

    const plan = await resolvePlan(params.id);
    const denied = await assertProjectAccessForResource(
      auth.session.user.id,
      auth.session.user.role,
      plan,
    );
    if (denied) return denied;

    const full = await prisma.testPlan.findUnique({
      where: { id: plan!.id },
      include: {
        cases: { include: { case: true }, orderBy: { order: "asc" } },
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

    const plan = await resolvePlan(params.id);
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
      data.environmentRelations = {
        set: environmentIds.map((id) => ({ id })),
      };
      delete data.environments;
    }

    const updated = await prisma.testPlan.update({
      where: { id: plan!.id },
      data,
      include: { environmentRelations: true },
    });

    await logAudit(auth.session.user?.id, "UPDATE", "TestPlan", updated.id, parsed);

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

    await logAudit(auth.session.user?.id, "DELETE", "TestPlan", plan!.id, {});

    return NextResponse.json({ ok: true });
  }
);
