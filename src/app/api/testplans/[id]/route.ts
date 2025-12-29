import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  targetVersions: z.array(z.string()).optional(),
  environments: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional()
});

export const GET = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "project:view");
    if (!auth.authorized) return auth.response;
    const plan = await prisma.testPlan.findUnique({
      where: { id: params.id },
      include: {
        cases: { include: { case: true }, orderBy: { order: "asc" } },
        environmentRelations: true
      }
    });
    if (!plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(plan);
  }
);

export const PATCH = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "testplan:manage");
    if (!auth.authorized) return auth.response;
    const parsed = updateSchema.parse(await req.json());

    // Handle environment relations update
    const environmentIds = parsed.environments;
    const data: any = { ...parsed };

    if (environmentIds) {
      data.environmentRelations = {
        set: environmentIds.map((id) => ({ id })),
      };
      // Keep legacy field in sync for now if needed, or just ignore it
      delete data.environments;
    }

    const plan = await prisma.testPlan.update({
      where: { id: params.id },
      data,
      include: { environmentRelations: true }
    });

    await logAudit(auth.session.user?.id, "UPDATE", "TestPlan", plan.id, parsed);

    return NextResponse.json(plan);
  }
);

export const DELETE = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "testplan:manage");
    if (!auth.authorized) return auth.response;
    await prisma.testPlan.delete({ where: { id: params.id } });

    await logAudit(auth.session.user?.id, "DELETE", "TestPlan", params.id, {});

    return NextResponse.json({ ok: true });
  }
);
