"use client";

import { DashboardPage } from "@/components/pages/dashboard-page";
import { BugReports } from "@/components/reports/bug-reports";
import { TraceabilityMatrix } from "@/components/reports/traceability-matrix";
import { useState } from "react";
import { useProjectStore } from "@/lib/stores/project-store";
import { useQuery } from "@tanstack/react-query";

export default function ReportsPage() {
  const [tab, setTab] = useState<"dashboard" | "coverage" | "traceability" | "bugs">("dashboard");
  const projectId = useProjectStore((state) => state.projectId);

  const { data: coverage, isLoading } = useQuery({
    queryKey: ["reports", "coverage", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const res = await fetch(`/api/reports/coverage?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to load coverage");
      return res.json();
    },
    enabled: !!projectId && tab === "coverage",
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-700">
      <div className="border-b border-slate-200 bg-white px-8">
        <div className="flex items-center gap-6">
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
      ) : tab === "coverage" ? (
        <div className="mx-auto max-w-6xl p-8">
          <h1 className="mb-6 text-2xl font-semibold text-slate-900">Requirement Coverage</h1>

          {isLoading ? (
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

              {/* Traceability Matrix */}
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
                      <tr key={req.key ?? req.url ?? req.title} className="hover:bg-slate-50">
                        <td className="px-6 py-4">
                          {req.url ? (
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
                          <div className="flex flex-wrap gap-1.5">
                            {req.cases.map((c: any) => (
                              <span key={c.key} className={`rounded border px-2 py-0.5 text-xs font-medium ${c.status === "PASS" ? "border-emerald-200 bg-emerald-50 text-emerald-700" :
                                c.status === "FAIL" ? "border-red-200 bg-red-50 text-red-700" :
                                  "border-slate-200 bg-slate-100 text-slate-700"
                                }`}>
                                {c.key}
                              </span>
                            ))}
                          </div>
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
                          No requirements found. Link test cases to requirements to see them here.
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
