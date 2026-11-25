"use client";

import Link from "next/link";
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
  const projectKey = useProjectStore((state) => state.projectKey);
  const { data } = useQuery<ExecutionSummaryItem[]>({
    queryKey: ["executions", "recent", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const res = await fetch(`/api/reports/recent-executions${projectId ? `?projectId=${projectId}` : ""}`);
      if (!res.ok) throw new Error("Failed to load executions");
      return res.json();
    },
  });

  if (data && data.length === 0) {
    return (
      <p className="mt-4 text-sm italic text-slate-400">
        No executions recorded yet.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {(data ?? []).map((execution) => {
        const content = (
          <>
            <div className="flex items-center justify-between gap-4 text-sm font-medium">
              <span className="truncate text-slate-900 group-hover:text-blue-600">
                {execution.key} · {execution.name}
              </span>
              <span className="flex-shrink-0 rounded border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600">
                {execution.status} ({execution.passRate}%)
              </span>
            </div>
            <div className="mt-2.5 h-2 rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all"
                style={{ width: `${execution.passRate}%` }}
              />
            </div>
          </>
        );
        return projectKey ? (
          <Link
            key={execution.id}
            href={`/projects/${projectKey}/executions/${execution.key}`}
            className="group block rounded-md border border-slate-200 bg-slate-50 p-3.5 transition-colors hover:border-blue-300 hover:bg-white"
          >
            {content}
          </Link>
        ) : (
          <div key={execution.id} className="rounded-md border border-slate-200 bg-slate-50 p-3.5">
            {content}
          </div>
        );
      })}
    </div>
  );
}
