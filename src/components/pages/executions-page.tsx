"use client";

import { useQuery } from "@/lib/simple-query";
import Link from "next/link";
import { useProjectStore } from "@/lib/stores/project-store";

export function ExecutionsPage() {
  const projectId = useProjectStore((state) => state.projectId);
  const { data } = useQuery({
    queryKey: ["executions", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const res = await fetch(`/api/executions?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to load executions");
      return res.json();
    }
  });

  return (
    <div className="px-8 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Executions</h1>
          <p className="text-sm text-slate-400">Track manual and automated runs with live health.</p>
        </div>
        <Link
          href="/executions/new"
          className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-blue-500"
        >
          New Execution
        </Link>
      </div>
      <div className="grid gap-4">
        {(data ?? []).map((execution: any) => (
          <div key={execution.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">{execution.key}</p>
                <h2 className="text-xl font-semibold text-white">{execution.name}</h2>
                <p className="text-sm text-slate-400">{execution.description}</p>
              </div>
              <div className="text-right text-xs text-slate-400">
                <p>Env: {execution.environment ?? "n/a"}</p>
                <p>Status: {execution.finishedAt ? "Completed" : "Active"}</p>
                <p>Results: {execution.results.length}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
