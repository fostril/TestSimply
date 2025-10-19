import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  environment: z.string().optional(),
  revision: z.string().optional(),
  buildUrl: z.string().optional(),
  commitSha: z.string().optional(),
  startedAt: z.string().optional(),
  finishedAt: z.string().optional(),
  labels: z.array(z.string()).optional()
});

export const GET = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "project:view");
    if (!auth.authorized) return auth.response;
    const execution = await prisma.testExecution.findUnique({
      where: { id: params.id },
      include: {
        results: { include: { testCase: true } },
        plan: { include: { cases: { include: { case: true } } } }
      }
    });
    if (!execution) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(execution);
  }
);

export const PATCH = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "execution:manage");
    if (!auth.authorized) return auth.response;
    const parsed = updateSchema.parse(await req.json());
    const execution = await prisma.testExecution.update({
      where: { id: params.id },
    data: {
      ...parsed,
      startedAt: parsed.startedAt ? new Date(parsed.startedAt) : undefined,
      finishedAt: parsed.finishedAt ? new Date(parsed.finishedAt) : undefined
    }
    });
    return NextResponse.json(execution);
  }
);

export const DELETE = withApiHandler(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "execution:manage");
    if (!auth.authorized) return auth.response;
    await prisma.testExecution.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  }
);
