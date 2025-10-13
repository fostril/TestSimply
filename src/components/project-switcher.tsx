"use client";

import { useQuery } from "@/lib/simple-query";
import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/lib/stores/project-store";

export function ProjectSwitcher() {
  const { data } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to load projects");
      return res.json();
    }
  });
  const projectId = useProjectStore((state) => state.projectId);
  const setProjectId = useProjectStore((state) => state.setProjectId);

  useEffect(() => {
    if (!projectId && data?.length) {
      setProjectId(data[0].id);
    }
  }, [data, projectId, setProjectId]);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Projects</p>
      <div className="mt-3 space-y-2">
        {(data ?? []).map((project: any) => (
          <button
            key={project.id}
            type="button"
            onClick={() => setProjectId(project.id)}
            className={cn(
              "w-full rounded-xl px-3 py-2 text-left text-sm text-slate-300 transition hover:bg-slate-800",
              projectId === project.id ? "bg-slate-800 text-white" : ""
            )}
          >
            <div className="font-medium">{project.name}</div>
            <div className="text-xs text-slate-500">{project.key}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
