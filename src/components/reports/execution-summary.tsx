"use client";

import { useQuery } from "@/lib/simple-query";
import { useProjectStore } from "@/lib/stores/project-store";

export type ExecutionSummaryItem = {
  id: string;
  key: string;
  name: string;
  status: string;
  passRate: number;
};

export function ExecutionSummary() {
  const projectId = useProjectStore((state) => state.projectId);
  const { data } = useQuery<ExecutionSummaryItem[]>({
    queryKey: ["executions", "recent", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const res = await fetch(`/api/reports/recent-executions${projectId ? `?projectId=${projectId}` : ""}`);
      if (!res.ok) throw new Error("Failed to load executions");
      return res.json();
    }
  });

  return (
    <div className="mt-4 space-y-4">
      {(data ?? []).map((execution) => (
        <div key={execution.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
          <div className="flex items-center justify-between text-sm font-medium">
            <span className="text-slate-200">
              {execution.key} · {execution.name}
            </span>
            <span className="text-xs uppercase tracking-wide text-slate-400">{execution.status}</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${execution.passRate}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
