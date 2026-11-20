import { ExecutionStatus, type Prisma, type PrismaClient, type TestStatus } from "@prisma/client";
import { checkAndMarkFlaky } from "@/lib/flakiness";
import { generateEntityKey } from "@/lib/keys";
import { apiLogger } from "@/lib/logger";

export type ResultUpsertInput = {
  executionId: string;
  caseId: string;
  status: TestStatus;
  durationMs: number | null;
  errorMessage: string | null;
  stepsLog?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
};

export interface ImportExecutionParams {
  project: { id: string; key: string };
  execKey: string | null;
  createExecutionIfMissing: boolean;
  environment: string | null;
  buildUrl: string | null;
  commitSha: string | null;
  revision: string | null;
  labels?: string[];
}

/**
 * Resolve an existing TestExecution (or create one if requested) for CI imports,
 * linking a matching Environment record when `environment` is provided.
 */
export async function resolveOrCreateImportExecution(
  client: PrismaClient,
  params: ImportExecutionParams,
) {
  const { project, execKey, createExecutionIfMissing, environment, buildUrl, commitSha, revision, labels } = params;

  let resolvedEnvId: string | undefined;
  let resolvedEnvName: string | undefined = environment ?? undefined;

  if (environment && typeof client.environment?.findFirst === "function") {
    const envRecord = await client.environment.findFirst({
      where: {
        projectId: project.id,
        OR: [{ id: environment }, { key: environment }, { name: environment }],
      },
      select: { id: true, name: true },
    });
    if (envRecord) {
      resolvedEnvId = envRecord.id;
      resolvedEnvName = envRecord.name;
    }
  }

  let execution = execKey
    ? await client.testExecution.findFirst({ where: { projectId: project.id, key: execKey } })
    : null;

  if (!execution && createExecutionIfMissing) {
    const key = execKey ?? (await generateEntityKey(client, project.id, project.key, "EXEC"));
    execution = await client.testExecution.create({
      data: {
        projectId: project.id,
        key,
        name: `CI Execution ${new Date().toISOString()}`,
        environment: resolvedEnvName,
        environmentId: resolvedEnvId,
        buildUrl: buildUrl ?? undefined,
        commitSha: commitSha ?? undefined,
        revision: revision ?? undefined,
        labels: labels ?? [],
        startedAt: new Date(),
      },
    });
    return execution;
  }

  if (execution && (environment || buildUrl || commitSha || revision || labels)) {
    execution = await client.testExecution.update({
      where: { id: execution.id },
      data: {
        environment: resolvedEnvName ?? undefined,
        environmentId: resolvedEnvId ?? undefined,
        buildUrl: buildUrl ?? undefined,
        commitSha: commitSha ?? undefined,
        revision: revision ?? undefined,
        labels: labels ?? execution.labels,
      },
    });
  }

  return execution;
}

/**
 * Mark an imported CI execution as COMPLETED unless the caller explicitly
 * passed `completeExecution=false` (for multi-part batch uploads).
 */
export async function finalizeImportExecution(
  client: PrismaClient,
  executionId: string,
  completeExecution: boolean,
) {
  if (!completeExecution) return;
  await client.testExecution.update({
    where: { id: executionId },
    data: {
      status: ExecutionStatus.COMPLETED,
      finishedAt: new Date(),
    },
  });
}

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
