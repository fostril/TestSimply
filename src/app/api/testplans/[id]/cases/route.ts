import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { z } from "zod";

const bodySchema = z.object({ caseIds: z.array(z.string()) });

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(req, "testplan:manage");
  if (!auth.authorized) return auth.response;
  const parsed = bodySchema.parse(await req.json());
  await prisma.$transaction([
    prisma.testCasePlan.deleteMany({ where: { planId: params.id } }),
    prisma.testCasePlan.createMany({
      data: parsed.caseIds.map((caseId) => ({ planId: params.id, caseId })),
      skipDuplicates: true
    })
  ]);
  return NextResponse.json({ ok: true });
}
