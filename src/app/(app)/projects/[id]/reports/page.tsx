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
    <div className="min-h-screen bg-slate-950 text-slate-300">
      <div className="border-b border-slate-800 bg-slate-900/50 px-8 py-4">
        <div className="flex items-center gap-6">
          <button
            onClick={() => setTab("dashboard")}
            className={`text-sm font-medium ${tab === "dashboard" ? "text-white" : "text-slate-400 hover:text-slate-200"}`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setTab("coverage")}
            className={`text-sm font-medium ${tab === "coverage" ? "text-white" : "text-slate-400 hover:text-slate-200"}`}
          >
            Requirement Coverage
          </button>
          <button
            onClick={() => setTab("traceability")}
            className={`text-sm font-medium ${tab === "traceability" ? "text-white" : "text-slate-400 hover:text-slate-200"}`}
          >
            Traceability Matrix
          </button>
          <button
            onClick={() => setTab("bugs")}
            className={`text-sm font-medium ${tab === "bugs" ? "text-white" : "text-slate-400 hover:text-slate-200"}`}
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
        <div className="p-8">
          <h1 className="mb-6 text-2xl font-bold text-white">Requirement Coverage</h1>

          {isLoading ? (
            <div className="text-slate-400">Loading coverage data...</div>
          ) : (
            <div className="space-y-8">
              {/* Summary Cards */}
              <div className="grid gap-6 md:grid-cols-3">
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
                  <p className="text-xs font-medium uppercase text-slate-500">Total Requirements</p>
                  <p className="mt-2 text-3xl font-bold text-white">{coverage?.length ?? 0}</p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
                  <p className="text-xs font-medium uppercase text-slate-500">Covered (Linked)</p>
                  <p className="mt-2 text-3xl font-bold text-blue-400">
                    {coverage?.filter((r: any) => r.totalCases > 0).length ?? 0}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
                  <p className="text-xs font-medium uppercase text-slate-500">Passing</p>
                  <p className="mt-2 text-3xl font-bold text-emerald-400">
                    {coverage?.filter((r: any) => r.status === "OK").length ?? 0}
                  </p>
                </div>
              </div>

              {/* Traceability Matrix */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-900 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-6 py-4 font-medium">Requirement</th>
                      <th className="px-6 py-4 font-medium">Linked Tests</th>
                      <th className="px-6 py-4 font-medium">Status</th>
                      <th className="px-6 py-4 font-medium">Coverage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {(coverage ?? []).map((req: any) => (
                      <tr key={req.key ?? req.url ?? req.title} className="hover:bg-slate-800/50">
                        <td className="px-6 py-4">
                          {req.url ? (
                            <a href={req.url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-400 hover:underline">
                              {req.key ?? req.title ?? req.url}
                            </a>
                          ) : (
                            <span className="font-medium text-white">{req.key ?? req.title ?? "Untitled requirement"}</span>
                          )}
                          {req.title && req.key ? (
                            <p className="text-xs text-slate-500">{req.title}</p>
                          ) : null}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-2">
                            {req.cases.map((c: any) => (
                              <span key={c.key} className={`rounded px-2 py-0.5 text-xs font-medium ${c.status === "PASS" ? "bg-emerald-900/30 text-emerald-400" :
                                c.status === "FAIL" ? "bg-red-900/30 text-red-400" :
                                  "bg-slate-800 text-slate-400"
                                }`}>
                                {c.key}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium $                            {req.status === "OK" ? "bg-emerald-900/30 text-emerald-400" :
                            req.status === "NOK" ? "bg-red-900/30 text-red-400" :
                            req.status === "WIP" ? "bg-yellow-900/30 text-yellow-400" :
                              "bg-slate-800 text-slate-400"
                            }`}>
                            {req.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-400">
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
        <div className="p-8">
          <h1 className="mb-6 text-2xl font-bold text-white">Bug Reports</h1>
          <BugReports />
        </div>
      )}
    </div>
  );
}
