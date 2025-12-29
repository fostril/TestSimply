"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/lib/stores/project-store";

export function ProjectSwitcher() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to load projects");
      return res.json();
    }
  });
  const projectId = useProjectStore((state) => state.projectId);
  const setProject = useProjectStore((state) => state.setProject);

  useEffect(() => {
    if (!projectId && data?.length) {
      setProject({ id: data[0].id, key: data[0].key });
    }
  }, [data, projectId, setProject]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/projects/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete project");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Project deleted" });
      setProjectToDelete(null);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      // If we deleted the active project, switch to another one or clear selection
      if (projectToDelete === projectId) {
        const remaining = data?.filter((p: any) => p.id !== projectToDelete) || [];
        if (remaining.length > 0) {
          setProject({ id: remaining[0].id, key: remaining[0].key });
          router.push(`/projects/${remaining[0].key}`);
        } else {
          setProject(null);
          router.push("/");
        }
      }
    },
    onError: (err) => {
      toast({ title: "Failed to delete project", description: (err as Error).message });
    }
  });

  return (
    <>
      {projectToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
            <h2 className="text-xl font-semibold text-white">Delete Project?</h2>
            <p className="mt-2 text-sm text-slate-400">
              Are you sure you want to delete this project? This action cannot be undone and will delete all test cases, executions, and results associated with it.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setProjectToDelete(null)}
                className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(projectToDelete)}
                disabled={deleteMutation.isPending}
                className="rounded-full bg-red-500 px-5 py-2 text-sm font-semibold text-white shadow-lg hover:bg-red-600 disabled:opacity-50"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Projects</p>
        <div className="mt-3 max-h-48 space-y-2 overflow-y-auto pr-1 scrollbar-thin scrollbar-track-slate-800 scrollbar-thumb-slate-600">
          {(data ?? []).map((project: any) => (
            <div key={project.id} className="group relative flex items-center">
              <button
                type="button"
                onClick={() => {
                  setProject({ id: project.id, key: project.key });

                  // Get current path segments
                  const path = window.location.pathname;
                  const parts = path.split("/");
                  // Expected format: /projects/[key]/[section]
                  // parts: ["", "projects", "OLD_KEY", "section", ...]

                  if (parts[1] === "projects" && parts[2]) {
                    // Replace the key (index 2) with new project key
                    parts[2] = project.key;
                    const newPath = parts.join("/");
                    router.push(newPath);
                  } else {
                    // Fallback to dashboard
                    router.push(`/projects/${project.key}`);
                  }
                }}
                className={cn(
                  "w-full rounded-xl px-3 py-2 text-left text-sm text-slate-300 transition hover:bg-slate-800",
                  projectId === project.id ? "bg-slate-800 text-white" : ""
                )}
              >
                <div className="font-medium">{project.name}</div>
                <div className="text-xs text-slate-500">{project.key}</div>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setProjectToDelete(project.id);
                }}
                className="absolute right-2 hidden rounded-lg p-1 text-slate-500 hover:bg-red-500/10 hover:text-red-400 group-hover:block"
                title="Delete Project"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        <a
          href="/projects/new"
          className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-dashed border-slate-700 px-3 py-2 text-xs font-medium text-slate-400 transition hover:border-brand hover:text-white"
        >
          + New project
        </a>
      </div>
    </>
  );
}
