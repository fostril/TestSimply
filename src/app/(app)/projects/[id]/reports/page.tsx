"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DashboardPage } from "@/components/pages/dashboard-page";
import { BugReports } from "@/components/reports/bug-reports";
import { TraceabilityMatrix } from "@/components/reports/traceability-matrix";
import { useProjectStore } from "@/lib/stores/project-store";
import { usePermissions } from "@/lib/hooks/use-permissions";
import { useToast } from "@/components/ui/toast";

type ReportTab = "dashboard" | "coverage" | "traceability" | "flaky" | "bugs";

type FlakyReportItem = {
  id: string;
  key: string;
  name: string;
  priority: string;
  type: string;
  component: string | null;
  isAutomated: boolean;
  flakyDetectedAt: string | null;
  flips: number;
  runCount: number;
  passCount: number;
  failCount: number;
  blockedCount: number;
  failRate: number;
  recentRuns: Array<{
    id: string;
    status: string;
    createdAt: string;
    executionKey: string | null;
    executionId: string | null;
  }>;
};

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>("dashboard");
  const projectId = useProjectStore((state) => state.projectId);
  const projectKey = useProjectStore((state) => state.projectKey);
  const { can } = usePermissions();
  const canEditCase = can("testcase:update");
  const toast = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("tab") as ReportTab | null;
    if (
      requested &&
      ["dashboard", "coverage", "traceability", "flaky", "bugs"].includes(requested)
    ) {
      setTab(requested);
    }
  }, []);

  const { data: coverage, isLoading: isCoverageLoading } = useQuery({
    queryKey: ["reports", "coverage", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await fetch(`/api/reports/coverage?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to load coverage");
      return res.json();
    },
    enabled: !!projectId && tab === "coverage",
  });

  const { data: flakyCases, isLoading: isFlakyLoading } = useQuery<FlakyReportItem[]>({
    queryKey: ["reports", "flaky", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await fetch(`/api/reports/flaky?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to load flaky tests");
      return res.json();
    },
    enabled: !!projectId && tab === "flaky",
  });

  const clearFlakyMutation = useMutation({
    mutationFn: async (caseId: string) => {
      const res = await fetch(`/api/testcases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFlaky: false }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to clear flaky flag");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Flaky flag cleared" });
      queryClient.invalidateQueries({ queryKey: ["reports", "flaky", projectId] });
      queryClient.invalidateQueries({ queryKey: ["summary", projectId] });
      queryClient.invalidateQueries({ queryKey: ["testcases", projectId] });
    },
    onError: (err) => {
      toast({ title: "Update failed", description: (err as Error).message });
    },
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-700">
      <div className="border-b border-slate-200 bg-white px-8">
        <div className="flex flex-wrap items-center gap-6">
          <button
            onClick={() => setTab("dashboard")}
            className={`border-b-2 py-3.5 text-sm font-medium transition-colors ${tab === "dashboard" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-600 hover:text-slate-900"}`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setTab("coverage")}
            className={`border-b-2 py-3.5 text-sm font-medium transition-colors ${tab === "coverage" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-600 hover:text-slate-900"}`}
          >
            Requirement Coverage
          </button>
          <button
            onClick={() => setTab("traceability")}
            className={`border-b-2 py-3.5 text-sm font-medium transition-colors ${tab === "traceability" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-600 hover:text-slate-900"}`}
          >
            Traceability Matrix
          </button>
          <button
            onClick={() => setTab("flaky")}
            className={`border-b-2 py-3.5 text-sm font-medium transition-colors ${tab === "flaky" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-600 hover:text-slate-900"}`}
          >
            Flaky Tests
          </button>
          <button
            onClick={() => setTab("bugs")}
            className={`border-b-2 py-3.5 text-sm font-medium transition-colors ${tab === "bugs" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-600 hover:text-slate-900"}`}
          >
            Bug Reports
          </button>
        </div>
      </div>

      {tab === "dashboard" ? (
        <DashboardPage />
      ) : tab === "traceability" ? (
        <TraceabilityMatrix projectId={projectId} />
      ) : tab === "flaky" ? (
        <div className="mx-auto max-w-6xl p-8">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Flaky Test Detection</h1>
              <p className="mt-1 text-sm text-slate-600">
                Tests with 2 or more status transitions (e.g. PASS ↔ FAIL) across their last 10 non-skipped runs.
              </p>
            </div>
          </div>

          {isFlakyLoading ? (
            <div className="text-sm text-slate-500">Loading flaky tests...</div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-3">Test Case</th>
                    <th className="px-6 py-3">Last 10 Runs (Oldest → Newest)</th>
                    <th className="px-6 py-3">Flips</th>
                    <th className="px-6 py-3">Fail Rate</th>
                    <th className="px-6 py-3">Detected</th>
                    {canEditCase && <th className="px-6 py-3 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {(flakyCases ?? []).map((tc) => (
                    <tr key={tc.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        {projectKey ? (
                          <Link
                            href={`/projects/${projectKey}/testcases/${tc.id}`}
                            className="font-medium text-blue-600 hover:underline"
                          >
                            <span className="font-mono text-xs">{tc.key}</span> · {tc.name}
                          </Link>
                        ) : (
                          <span className="font-medium text-slate-900">
                            <span className="font-mono text-xs">{tc.key}</span> · {tc.name}
                          </span>
                        )}
                        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                          <span>{tc.type}</span>
                          <span>·</span>
                          <span>{tc.priority}</span>
                          {tc.component && (
                            <>
                              <span>·</span>
                              <span>{tc.component}</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {tc.recentRuns.length === 0 ? (
                          <span className="text-xs italic text-slate-400">Manually flagged (no recent runs)</span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1">
                            {tc.recentRuns.map((run) => {
                              const badgeClass =
                                run.status === "PASS"
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : run.status === "FAIL"
                                    ? "border-red-200 bg-red-50 text-red-700"
                                    : "border-amber-200 bg-amber-50 text-amber-700";
                              const label = run.status.charAt(0);
                              const title = `${run.status}${run.executionKey ? ` (${run.executionKey})` : ""} · ${new Date(run.createdAt).toLocaleString()}`;
                              return projectKey && run.executionKey ? (
                                <Link
                                  key={run.id}
                                  href={`/projects/${projectKey}/executions/${run.executionKey}`}
                                  title={title}
                                  className={`inline-flex h-6 w-6 items-center justify-center rounded border font-mono text-xs font-semibold ${badgeClass} hover:opacity-80`}
                                >
                                  {label}
                                </Link>
                              ) : (
                                <span
                                  key={run.id}
                                  title={title}
                                  className={`inline-flex h-6 w-6 items-center justify-center rounded border font-mono text-xs font-semibold ${badgeClass}`}
                                >
                                  {label}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 font-medium text-orange-700">
                        {tc.flips} flip{tc.flips === 1 ? "" : "s"} ({tc.runCount} runs)
                      </td>
                      <td className="px-6 py-4 text-slate-700">
                        {tc.failRate}% ({tc.failCount}/{tc.runCount})
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500">
                        {tc.flakyDetectedAt
                          ? new Date(tc.flakyDetectedAt).toLocaleDateString()
                          : "Manual"}
                      </td>
                      {canEditCase && (
                        <td className="px-6 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => clearFlakyMutation.mutate(tc.id)}
                            disabled={clearFlakyMutation.isPending}
                            className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            Clear Flaky
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {(flakyCases ?? []).length === 0 && (
                    <tr>
                      <td colSpan={canEditCase ? 6 : 5} className="px-6 py-10 text-center text-slate-500">
                        No flaky test cases detected in this project.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : tab === "coverage" ? (
        <div className="mx-auto max-w-6xl p-8">
          <h1 className="mb-6 text-2xl font-semibold text-slate-900">Requirement Coverage</h1>

          {isCoverageLoading ? (
            <div className="text-sm text-slate-500">Loading coverage data...</div>
          ) : (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total Requirements</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900">{coverage?.length ?? 0}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Covered (Linked)</p>
                  <p className="mt-2 text-2xl font-semibold text-blue-600">
                    {coverage?.filter((r: any) => r.totalCases > 0).length ?? 0}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Passing</p>
                  <p className="mt-2 text-2xl font-semibold text-emerald-600">
                    {coverage?.filter((r: any) => r.status === "OK").length ?? 0}
                  </p>
                </div>
              </div>

              {/* Coverage Table */}
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-6 py-3">Requirement</th>
                      <th className="px-6 py-3">Linked Tests</th>
                      <th className="px-6 py-3">Status</th>
                      <th className="px-6 py-3">Coverage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {(coverage ?? []).map((req: any) => (
                      <tr key={req.id ?? req.key ?? req.url ?? req.title} className="hover:bg-slate-50">
                        <td className="px-6 py-4">
                          {req.id && projectKey ? (
                            <Link
                              href={`/projects/${projectKey}/requirements/${req.id}`}
                              className="font-medium text-blue-600 hover:underline"
                            >
                              {req.key ?? req.title}
                            </Link>
                          ) : req.url ? (
                            <a href={req.url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline">
                              {req.key ?? req.title ?? req.url}
                            </a>
                          ) : (
                            <span className="font-medium text-slate-900">{req.key ?? req.title ?? "Untitled requirement"}</span>
                          )}
                          {req.title && req.key ? (
                            <p className="text-xs text-slate-500">{req.title}</p>
                          ) : null}
                        </td>
                        <td className="px-6 py-4">
                          {req.cases.length === 0 ? (
                            <span className="text-xs italic text-slate-400">Uncovered</span>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              {req.cases.map((c: any) => {
                                const pillClass =
                                  c.status === "PASS"
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : c.status === "FAIL"
                                      ? "border-red-200 bg-red-50 text-red-700"
                                      : c.status === "BLOCKED"
                                        ? "border-amber-200 bg-amber-50 text-amber-700"
                                        : "border-slate-200 bg-slate-100 text-slate-700";
                                return c.id && projectKey ? (
                                  <Link
                                    key={c.id}
                                    href={`/projects/${projectKey}/testcases/${c.id}`}
                                    className={`rounded border px-2 py-0.5 text-xs font-medium hover:opacity-80 ${pillClass}`}
                                  >
                                    {c.key}
                                  </Link>
                                ) : (
                                  <span key={c.key} className={`rounded border px-2 py-0.5 text-xs font-medium ${pillClass}`}>
                                    {c.key}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${req.status === "OK" ? "border-emerald-200 bg-emerald-50 text-emerald-700" :
                            req.status === "NOK" ? "border-red-200 bg-red-50 text-red-700" :
                            req.status === "WIP" ? "border-amber-200 bg-amber-50 text-amber-700" :
                              "border-slate-200 bg-slate-100 text-slate-700"
                            }`}>
                            {req.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-600">
                          {req.passCases}/{req.totalCases} Passing
                        </td>
                      </tr>
                    ))}
                    {(coverage ?? []).length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                          No requirements found. Create or link requirements to see them here.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="mx-auto max-w-6xl p-8">
          <h1 className="mb-6 text-2xl font-semibold text-slate-900">Bug Reports</h1>
          <BugReports />
        </div>
      )}
    </div>
  );
}
