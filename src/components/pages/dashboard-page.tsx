import Link from "next/link";
import { Suspense } from "react";
import { ExecutionSummary } from "@/components/reports/execution-summary";
import { TrendChart } from "@/components/reports/trend-chart";
import { cn } from "@/lib/utils";

export function DashboardPage() {
  return (
    <div className="px-8 py-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className={cn("text-3xl font-semibold")}>Project Overview</h1>
          <p className="text-sm text-slate-400">
            Track execution health, coverage, and quality insights.
          </p>
        </div>
        <Link
          href="/executions/new"
          className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-blue-500"
        >
          New Execution
        </Link>
      </header>
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl bg-slate-900 p-6 shadow-xl">
          <p className="text-sm uppercase tracking-wide text-slate-400">Pass rate</p>
          <p className="mt-2 text-3xl font-bold">82%</p>
          <p className="text-xs text-slate-500">+5% vs last week</p>
        </div>
        <div className="rounded-2xl bg-slate-900 p-6 shadow-xl">
          <p className="text-sm uppercase tracking-wide text-slate-400">Active executions</p>
          <p className="mt-2 text-3xl font-bold">4</p>
          <p className="text-xs text-slate-500">2 blocked</p>
        </div>
        <div className="rounded-2xl bg-slate-900 p-6 shadow-xl">
          <p className="text-sm uppercase tracking-wide text-slate-400">Flaky candidates</p>
          <p className="mt-2 text-3xl font-bold">6</p>
          <p className="text-xs text-slate-500">Fail rate &gt;= 30%</p>
        </div>
      </section>
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl bg-slate-900 p-6 shadow-xl lg:col-span-2">
          <h2 className="text-lg font-semibold">Pass / Fail Trend</h2>
          <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-slate-800" />}>
            <TrendChart />
          </Suspense>
        </div>
        <div className="rounded-2xl bg-slate-900 p-6 shadow-xl">
          <h2 className="text-lg font-semibold">Latest Executions</h2>
          <Suspense fallback={<div className="h-48 animate-pulse rounded-xl bg-slate-800" />}>
            <ExecutionSummary />
          </Suspense>
        </div>
      </section>
    </div>
  );
}
