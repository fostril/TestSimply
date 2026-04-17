import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  requireProjectAccessOrForbid,
  withApiHandler,
} from "@/lib/api";
import type { TestStatus } from "@prisma/client";

type EnvId = string | null;

type CaseRow = {
  id: string;
  key: string;
  name: string;
  type: string;
  priority: string;
  folderPath: string | null;
  tags: string[];
  // latestByEnv[envId|"-"] = { status, executedAt, executionKey }
  latestByEnv: Record<string, { status: TestStatus; executedAt: string; executionKey: string } | null>;
  bugs: Array<{ id: string; key: string; summary: string; status: string }>;
};

type RequirementRow = {
  id: string | null;
  key: string | null;
  title: string | null;
  externalUrl: string | null;
  status: string | null;
  coverage: {
    totalCases: number;
    passCases: number;
    failCases: number;
    blockedCases: number;
    skippedCases: number;
    notRunCases: number;
    // 'OK' when every linked case has a PASS on the latest run across
    // all considered environments, 'NOK' if any FAIL, 'WIP' partial pass,
    // 'NOT_RUN' when nothing has been executed yet.
    derivedStatus: "OK" | "NOK" | "WIP" | "NOT_RUN";
  };
  cases: CaseRow[];
};

/**
 * GET /api/reports/traceability?projectId=...&planId=...&environmentId=...&includeUnlinked=1
 *
 * Returns the full Requirements × Tests × Executions × Defects matrix for a
 * project. Optional filters:
 *   - planId: restrict to cases that are part of a specific test plan
 *   - environmentId: restrict latest-result lookup to a specific env
 *   - includeUnlinked=1: include a synthetic "(no requirement)" bucket for
 *     test cases that aren't linked to any requirement
 */
export const GET = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "project:view");
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const planId = searchParams.get("planId") || undefined;
  const environmentId = searchParams.get("environmentId") || undefined;
  const includeUnlinked = searchParams.get("includeUnlinked") === "1";

  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const access = await requireProjectAccessOrForbid(
    auth.session.user.id,
    auth.session.user.role,
    projectId,
  );
  if (access instanceof NextResponse) return access;

  // Optionally narrow to a specific plan.
  let planCaseIds: Set<string> | null = null;
  if (planId) {
    const plan = await prisma.testPlan.findUnique({
      where: { id: planId },
      select: { projectId: true, cases: { select: { caseId: true } } },
    });
    if (!plan || plan.projectId !== projectId) {
      return NextResponse.json({ error: "Invalid planId" }, { status: 400 });
    }
    planCaseIds = new Set(plan.cases.map((c) => c.caseId));
  }

  // All requirements + their linked cases, including cases that have NO
  // requirement (so we can render an "unlinked" bucket).
  const requirements = await prisma.requirement.findMany({
    where: { projectId },
    include: {
      links: {
        include: {
          testCase: {
            include: {
              folder: { select: { path: true } },
              bugs: { select: { id: true, key: true, summary: true, status: true } },
            },
          },
        },
      },
    },
    orderBy: [{ key: "asc" }],
  });

  // Collect the set of case ids we care about (either inside a plan or linked
  // to any requirement, plus optionally unlinked ones).
  const caseIds = new Set<string>();
  for (const r of requirements) {
    for (const link of r.links) {
      if (planCaseIds && !planCaseIds.has(link.testCaseId)) continue;
      caseIds.add(link.testCaseId);
    }
  }

  // If we need unlinked cases, fetch them separately.
  let unlinkedCases: typeof requirements[number]["links"][number]["testCase"][] = [];
  if (includeUnlinked) {
    const fetched = await prisma.testCase.findMany({
      where: {
        projectId,
        deletedAt: null,
        requirements: { none: {} },
        ...(planCaseIds ? { id: { in: Array.from(planCaseIds) } } : {}),
      },
      include: {
        folder: { select: { path: true } },
        bugs: { select: { id: true, key: true, summary: true, status: true } },
      },
    });
    unlinkedCases = fetched as typeof unlinkedCases;
    fetched.forEach((c) => caseIds.add(c.id));
  }

  // Fetch the latest result per (caseId, environmentId) in one query. We
  // order by createdAt desc and dedup in JS — at this scale it's acceptable.
  const allResults = caseIds.size
    ? await prisma.testResult.findMany({
        where: {
          caseId: { in: Array.from(caseIds) },
          ...(environmentId
            ? { execution: { environmentId } }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        include: {
          execution: {
            select: { key: true, environmentId: true, projectId: true },
          },
        },
      })
    : [];

  // Discard results whose execution belongs to another project (defence in
  // depth — the joins above already scope to `projectId` via the case list).
  const latestByCaseEnv = new Map<string, Map<EnvId, { status: TestStatus; executedAt: string; executionKey: string }>>();
  for (const r of allResults) {
    if (r.execution.projectId !== projectId) continue;
    const byEnv = latestByCaseEnv.get(r.caseId) ?? new Map();
    const envKey: EnvId = r.execution.environmentId;
    if (!byEnv.has(envKey)) {
      byEnv.set(envKey, {
        status: r.status,
        executedAt: r.createdAt.toISOString(),
        executionKey: r.execution.key,
      });
      latestByCaseEnv.set(r.caseId, byEnv);
    }
  }

  const toCaseRow = (
    tc: typeof requirements[number]["links"][number]["testCase"],
  ): CaseRow => {
    const envMap = latestByCaseEnv.get(tc.id);
    const latestByEnv: CaseRow["latestByEnv"] = {};
    if (envMap) {
      for (const [env, v] of envMap.entries()) {
        latestByEnv[env ?? "-"] = v;
      }
    }
    return {
      id: tc.id,
      key: tc.key,
      name: tc.name,
      type: tc.type,
      priority: tc.priority,
      folderPath: tc.folder?.path ?? null,
      tags: tc.tags,
      latestByEnv,
      bugs: tc.bugs,
    };
  };

  const rollup = (cases: CaseRow[]): RequirementRow["coverage"] => {
    let pass = 0, fail = 0, blocked = 0, skipped = 0, notRun = 0;
    for (const c of cases) {
      // Consider the "worst" status across envs — if any env failed, mark fail;
      // otherwise pick the best available. This matches Xray semantics.
      const statuses = Object.values(c.latestByEnv)
        .filter((v): v is NonNullable<typeof v> => v !== null)
        .map((v) => v.status);
      if (statuses.length === 0) notRun++;
      else if (statuses.includes("FAIL")) fail++;
      else if (statuses.every((s) => s === "PASS")) pass++;
      else if (statuses.includes("BLOCKED")) blocked++;
      else skipped++;
    }
    const total = cases.length;
    let derivedStatus: RequirementRow["coverage"]["derivedStatus"] = "NOT_RUN";
    if (total === 0) derivedStatus = "NOT_RUN";
    else if (fail > 0) derivedStatus = "NOK";
    else if (pass === total) derivedStatus = "OK";
    else if (pass > 0) derivedStatus = "WIP";
    else derivedStatus = "NOT_RUN";

    return {
      totalCases: total,
      passCases: pass,
      failCases: fail,
      blockedCases: blocked,
      skippedCases: skipped,
      notRunCases: notRun,
      derivedStatus,
    };
  };

  const requirementRows: RequirementRow[] = requirements.map((r) => {
    const cases = r.links
      .filter((l) => !planCaseIds || planCaseIds.has(l.testCaseId))
      .map((l) => toCaseRow(l.testCase));
    return {
      id: r.id,
      key: r.key,
      title: r.title,
      externalUrl: r.externalUrl,
      status: r.status,
      coverage: rollup(cases),
      cases,
    };
  });

  if (includeUnlinked && unlinkedCases.length > 0) {
    const cases = unlinkedCases.map(toCaseRow);
    requirementRows.push({
      id: null,
      key: null,
      title: "(no requirement)",
      externalUrl: null,
      status: null,
      coverage: rollup(cases),
      cases,
    });
  }

  const summary = {
    totalRequirements: requirementRows.filter((r) => r.id !== null).length,
    ok: requirementRows.filter((r) => r.id && r.coverage.derivedStatus === "OK").length,
    nok: requirementRows.filter((r) => r.id && r.coverage.derivedStatus === "NOK").length,
    wip: requirementRows.filter((r) => r.id && r.coverage.derivedStatus === "WIP").length,
    notRun: requirementRows.filter((r) => r.id && r.coverage.derivedStatus === "NOT_RUN").length,
  };

  return NextResponse.json({ summary, rows: requirementRows });
});
