import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { z } from "zod";
import { TestStatus } from "@prisma/client";

const resultSchema = z.object({
  executionId: z.string(),
  caseId: z.string(),
  status: z.nativeEnum(TestStatus),
  durationMs: z.number().optional(),
  evidenceURLs: z.array(z.string()).optional(),
  errorMessage: z.string().optional(),
  stepsLog: z.array(z.any()).optional(),
  retried: z.boolean().optional(),
  attempt: z.number().optional()
});

export const POST = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "execution:run");
  if (!auth.authorized) return auth.response;
  const body = await req.json();
  const payload = Array.isArray(body) ? body : [body];
  const parsed = payload.map((item) => resultSchema.parse(item));
  const created = await prisma.$transaction(
    parsed.map((result) =>
      prisma.testResult.create({
        data: {
          ...result,
          evidenceURLs: result.evidenceURLs ?? [],
          retried: result.retried ?? false,
          attempt: result.attempt ?? 1
        }
      })
    )
  );
  return NextResponse.json(created, { status: 201 });
});
