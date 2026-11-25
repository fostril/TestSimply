import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, assertProjectAccessForResource } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { ExecutionStatus, TestStatus } from "@prisma/client";
import { checkAndMarkFlaky } from "@/lib/flakiness";
import { apiLogger } from "@/lib/logger";
import { validateBodySize } from "@/lib/upload";

// Per-step result entry logged against a TestResult. This is the shape the
// manual-execution UI produces — one entry per case step, stored inside the
// result's JSON column so we don't pay for extra tables on every run.
const stepResultSchema = z.object({
  stepIndex: z.number().int().min(0),
  status: z.enum(["PASS", "FAIL", "BLOCKED", "SKIPPED", "NOT_RUN"]),
  actual: z.string().max(5000).optional(),
  comments: z.string().max(5000).optional(),
  attachmentIds: z.array(z.string().max(128)).max(50).optional(),
});

// Bounded step-log entry accepted from CI importers / scripted runners.
const ciStepLogEntrySchema = z
  .object({
    stepIndex: z.number().int().min(0).optional(),
    name: z.string().max(1000).optional(),
    action: z.string().max(2000).optional(),
    expected: z.string().max(2000).optional(),
    status: z.string().max(32).optional(),
    actual: z.string().max(5000).optional(),
    error: z.string().max(10000).nullable().optional(),
    note: z.string().max(5000).optional(),
    notes: z.string().max(5000).optional(),
    comments: z.string().max(5000).optional(),
    durationMs: z.number().nonnegative().optional(),
    attachmentIds: z.array(z.string().max(128)).max(50).optional(),
  })
  .strict();

const createSchema = z.object({
  executionId: z.string().min(1),
  caseId: z.string().min(1),
  status: z.nativeEnum(TestStatus),
  durationMs: z.number().optional(),
  errorMessage: z.string().max(20000).optional(),
  stepsLog: z
    .array(z.union([stepResultSchema, ciStepLogEntrySchema]))
    .max(500, "stepsLog cannot exceed 500 entries")
    .optional(),
  bugIds: z.array(z.string().max(128)).max(100).optional(),
});

export const POST = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "execution:run");
  if (!auth.authorized) return auth.response;

  const sizeError = validateBodySize(req);
  if (sizeError) return sizeError;

  const body = await req.json();
  const parsed = createSchema.parse(body);

  const execution = await prisma.testExecution.findUnique({
    where: { id: parsed.executionId },
    select: { id: true, projectId: true, finishedAt: true, planId: true, status: true },
  });

  const denied = await assertProjectAccessForResource(
    auth.session.user.id,
    auth.session.user.role,
    execution,
  );
  if (denied) return denied;

  // Case must exist (not deleted) and belong to the same project as the execution
  const testCase = await prisma.testCase.findUnique({
    where: { id: parsed.caseId },
    select: { projectId: true, deletedAt: true },
  });
  if (!testCase || testCase.deletedAt || testCase.projectId !== execution!.projectId) {
    return NextResponse.json({ error: "Invalid caseId" }, { status: 400 });
  }

  // Bugs (if any) must also belong to the same project
  let validBugIds: string[] = [];
  if (parsed.bugIds && parsed.bugIds.length > 0) {
    const existingBugs = await prisma.bug.findMany({
      where: { id: { in: parsed.bugIds }, projectId: execution!.projectId },
      select: { id: true },
    });
    validBugIds = existingBugs.map((b) => b.id);
  }

  const existingResult = await prisma.testResult.findFirst({
    where: {
      executionId: parsed.executionId,
      caseId: parsed.caseId,
    },
  });

  let result;
  if (existingResult) {
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

  // Auto-complete the execution when every planned case has a non-SKIPPED result.
  // We also set `status = COMPLETED` so the UI reflects the state correctly.
  if (execution!.planId && !execution!.finishedAt) {
    const [planCaseCount, resultStats] = await Promise.all([
      prisma.testCasePlan.count({
        where: { planId: execution!.planId, case: { deletedAt: null } },
      }),
      prisma.testResult.groupBy({
        by: ["caseId"],
        where: {
          executionId: execution!.id,
          status: { not: TestStatus.SKIPPED },
          testCase: {
            deletedAt: null,
            plans: { some: { planId: execution!.planId } },
          },
        },
        _count: { _all: true },
      }),
    ]);
    const distinctResultCases = resultStats.length;

    if (distinctResultCases >= planCaseCount && planCaseCount > 0) {
      await prisma.testExecution.update({
        where: { id: execution!.id },
        data: {
          finishedAt: new Date(),
          status: ExecutionStatus.COMPLETED,
        },
      });
    }
  }

  checkAndMarkFlaky(parsed.caseId).catch((err) => {
    apiLogger.warn({ err, caseId: parsed.caseId }, "Flakiness check failed");
  });

  await logAudit(auth.session.user?.id, existingResult ? "UPDATE" : "CREATE", "TestResult", result.id, {
    executionId: parsed.executionId,
    caseId: parsed.caseId,
    status: parsed.status,
  }, execution!.projectId);

  return NextResponse.json(result, { status: existingResult ? 200 : 201 });
});
