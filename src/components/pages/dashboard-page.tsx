"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExecutionSummary } from "@/components/reports/execution-summary";
import { TrendChart } from "@/components/reports/trend-chart";
import { useProjectStore } from "@/lib/stores/project-store";

export function DashboardPage() {
  const projectId = useProjectStore((state) => state.projectId);
  const { data, isLoading } = useQuery({
    queryKey: ["summary", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const res = await fetch(`/api/reports/summary${projectId ? `?projectId=${projectId}` : ""}`);
      if (!res.ok) throw new Error("Failed to load summary");
      return res.json() as Promise<{ passRate: number; activeExecutions: number; flakyCount: number }>;
    },
  });

  const passRate = data?.passRate ?? 0;
  const activeExecutions = data?.activeExecutions ?? 0;
  const flakyCount = data?.flakyCount ?? 0;

  const projectKey = useProjectStore((state) => state.projectKey);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Project Overview</h1>
          <p className="mt-1 text-sm text-slate-600">
            Track execution health, coverage, and quality insights.
          </p>
        </div>
        <Link
          href={projectKey ? `/projects/${projectKey}/executions/new` : "/executions/new"}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Execution
        </Link>
      </header>
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Pass rate</p>
          {isLoading ? (
            <div className="mt-2 h-8 w-24 animate-pulse rounded bg-slate-200" />
          ) : (
            <p className="mt-2 text-3xl font-semibold text-slate-900">{passRate}%</p>
          )}
          <p className="mt-1 text-xs text-slate-500">Last 14 days</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Active executions</p>
          {isLoading ? (
            <div className="mt-2 h-8 w-16 animate-pulse rounded bg-slate-200" />
          ) : (
            <p className="mt-2 text-3xl font-semibold text-slate-900">{activeExecutions}</p>
          )}
          <p className="mt-1 text-xs text-slate-500">Currently in progress</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Flaky candidates</p>
          {isLoading ? (
            <div className="mt-2 h-8 w-16 animate-pulse rounded bg-slate-200" />
          ) : (
            <p className="mt-2 text-3xl font-semibold text-slate-900">{flakyCount}</p>
          )}
          <p className="mt-1 text-xs text-slate-500">Fail rate ≥ 30% (14d)</p>
        </div>
      </section>
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="text-base font-semibold text-slate-900">Pass / Fail Trend</h2>
          <Suspense fallback={<div className="mt-4 h-48 animate-pulse rounded bg-slate-100" />}>
            <TrendChart />
          </Suspense>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Latest Executions</h2>
          <Suspense fallback={<div className="mt-4 h-48 animate-pulse rounded bg-slate-100" />}>
            <ExecutionSummary />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
