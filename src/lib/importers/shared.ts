import type { Prisma, PrismaClient, TestStatus } from "@prisma/client";
import { checkAndMarkFlaky } from "@/lib/flakiness";
import { apiLogger } from "@/lib/logger";

export type ResultUpsertInput = {
  executionId: string;
  caseId: string;
  status: TestStatus;
  durationMs: number | null;
  errorMessage: string | null;
  stepsLog?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
};

/**
 * Upsert a TestResult keyed by (executionId, caseId) inside a transaction so
 * repeated CI imports update the existing result instead of creating duplicates.
 */
export async function upsertTestResult(
  tx: Prisma.TransactionClient | PrismaClient,
  input: ResultUpsertInput,
) {
  const existing = await tx.testResult.findFirst({
    where: {
      executionId: input.executionId,
      caseId: input.caseId,
    },
    select: { id: true },
  });

  if (existing) {
    return tx.testResult.update({
      where: { id: existing.id },
      data: {
        status: input.status,
        durationMs: input.durationMs,
        errorMessage: input.errorMessage,
        stepsLog: input.stepsLog,
      },
    });
  }

  return tx.testResult.create({
    data: {
      executionId: input.executionId,
      caseId: input.caseId,
      status: input.status,
      durationMs: input.durationMs,
      errorMessage: input.errorMessage,
      stepsLog: input.stepsLog,
    },
  });
}

/**
 * Trigger fire-and-forget flakiness detection for every test case touched by
 * a CI import after the database transaction commits.
 */
export function triggerFlakinessChecks(
  caseIds: Iterable<string>,
  client: PrismaClient,
) {
  if (typeof client.testResult?.findMany !== "function") return;
  for (const caseId of new Set(caseIds)) {
    checkAndMarkFlaky(caseId, client).catch((err) => {
      apiLogger.warn({ err, caseId }, "Flakiness check failed");
    });
  }
}
