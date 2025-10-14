"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useProjectStore } from "@/lib/stores/project-store";

export function TestPlansPage() {
  const projectId = useProjectStore((state) => state.projectId);
  const { data } = useQuery({
    queryKey: ["testplans", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const res = await fetch(`/api/testplans?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to load plans");
      return res.json();
    }
  });

  return (
    <div className="px-8 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Test Plans</h1>
          <p className="text-sm text-slate-400">Bundle test cases for releases and environments.</p>
        </div>
        <Link
          href="/testplans/new"
          className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-blue-500"
        >
          New Plan
        </Link>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {(data ?? []).map((plan: any) => (
          <div key={plan.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">{plan.key}</p>
                <h2 className="text-xl font-semibold text-white">{plan.name}</h2>
              </div>
              <span className="text-xs text-slate-400">{plan.cases.length} cases</span>
            </div>
            <p className="mt-3 text-sm text-slate-400">{plan.description}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-400">
              {(plan.environments ?? []).map((env: string) => (
                <span key={env} className="rounded-full bg-slate-800 px-3 py-1 uppercase tracking-wide">
                  {env}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
