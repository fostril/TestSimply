"use client";

import { useQuery } from "@tanstack/react-query";
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
    },
  });

  return (
    <div className="mt-4 space-y-3">
      {(data ?? []).map((execution) => (
        <div key={execution.id} className="rounded-md border border-slate-200 bg-slate-50 p-3.5">
          <div className="flex items-center justify-between gap-4 text-sm font-medium">
            <span className="truncate text-slate-900">
              {execution.key} · {execution.name}
            </span>
            <span className="flex-shrink-0 rounded border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600">
              {execution.status}
            </span>
          </div>
          <div className="mt-2.5 h-2 rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-emerald-600"
              style={{ width: `${execution.passRate}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
