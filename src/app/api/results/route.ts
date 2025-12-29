import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { z } from "zod";
import { TestStatus } from "@prisma/client";
import { checkAndMarkFlaky } from "@/lib/flakiness";

const createSchema = z.object({
  executionId: z.string(),
  caseId: z.string(),
  status: z.nativeEnum(TestStatus),
  durationMs: z.number().optional(),
  errorMessage: z.string().optional(),
  stepsLog: z.any().optional(),
  bugIds: z.array(z.string()).optional(), // New field for bug linking
});

export const POST = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "execution:run");
  if (!auth.authorized) return auth.response;

  const body = await req.json();
  const parsed = createSchema.parse(body);

  try {
    // Validate bug IDs if provided
    let validBugIds: string[] = [];
    if (parsed.bugIds && parsed.bugIds.length > 0) {
      const existingBugs = await prisma.bug.findMany({
        where: { id: { in: parsed.bugIds } },
        select: { id: true },
      });
      validBugIds = existingBugs.map((b) => b.id);
    }

    // 1. Check for existing result to prevent duplicates
    const existingResult = await prisma.testResult.findFirst({
      where: {
        executionId: parsed.executionId,
        caseId: parsed.caseId,
      },
    });

    let result;
    if (existingResult) {
      // Update existing result
      result = await prisma.testResult.update({
        where: { id: existingResult.id },
        data: {
          status: parsed.status,
          durationMs: parsed.durationMs,
          errorMessage: parsed.errorMessage,
          stepsLog: parsed.stepsLog,
          bugs: parsed.bugIds ? { set: validBugIds.map((id) => ({ id })) } : undefined,
        },
      });
    } else {
      // Create new result
      result = await prisma.testResult.create({
        data: {
          executionId: parsed.executionId,
          caseId: parsed.caseId,
          status: parsed.status,
          durationMs: parsed.durationMs,
          errorMessage: parsed.errorMessage,
          stepsLog: parsed.stepsLog,
          bugs: parsed.bugIds ? { connect: validBugIds.map((id) => ({ id })) } : undefined,
        },
      });
    }

    // 2. Check for auto-completion
    const execution = await prisma.testExecution.findUnique({
      where: { id: parsed.executionId },
      include: {
        plan: {
          include: {
            cases: true,
          },
        },
        results: true,
      },
    });

    if (execution && execution.plan) {
      const totalCases = execution.plan.cases.length;
      // Count unique cases that have results
      const completedCases = new Set(execution.results.map((r) => r.caseId)).size;

      if (completedCases >= totalCases && !execution.finishedAt) {
        await prisma.testExecution.update({
          where: { id: execution.id },
          data: { finishedAt: new Date() },
        });
      }
    }

    // 3. Check for flakiness (async, don't await)
    checkAndMarkFlaky(parsed.caseId).catch((err) => {
      console.error("Failed to check flakiness:", err);
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("[API] Error creating/updating result:", error);
    throw error; // Let the global error handler handle it, or return a custom response
  }
});
