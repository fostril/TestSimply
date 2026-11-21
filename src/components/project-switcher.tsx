"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { useProjectStore } from "@/lib/stores/project-store";
import { usePermissions } from "@/lib/hooks/use-permissions";

export function ProjectSwitcher() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const { can } = usePermissions();
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to load projects");
      return res.json();
    },
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
    },
  });

  const handleProjectChange = (selectedId: string) => {
    const project = (data ?? []).find((p: any) => p.id === selectedId);
    if (!project) return;
    setProject({ id: project.id, key: project.key });

    const path = window.location.pathname;
    const parts = path.split("/");
    if (parts[1] === "projects" && parts[2] && parts[2] !== "new") {
      if (parts.length > 4 && parts[4] !== "new") {
        router.push(`/projects/${project.key}/${parts[3]}`);
      } else {
        parts[2] = project.key;
        router.push(parts.join("/"));
      }
    } else {
      router.push(`/projects/${project.key}`);
    }
  };

  return (
    <>
      {projectToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-slate-900">Delete Project?</h2>
            <p className="mt-2 text-sm text-slate-600">
              Are you sure you want to delete this project? This action cannot be undone and will delete all test cases, executions, and results associated with it.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setProjectToDelete(null)}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(projectToDelete)}
                disabled={deleteMutation.isPending}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-2 border-b border-slate-200 pb-4">
        <div className="flex items-center justify-between px-1">
          <label htmlFor="project-switcher-select" className="text-xs font-medium text-slate-500">
            Project
          </label>
          <div className="flex items-center gap-1">
            {projectId && can("project:delete") ? (
              <button
                type="button"
                onClick={() => setProjectToDelete(projectId)}
                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                title="Delete current project"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
            {can("project:create") ? (
              <Link
                href="/projects/new"
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
              >
                <Plus className="h-3.5 w-3.5" />
                New
              </Link>
            ) : null}
          </div>
        </div>
        <select
          id="project-switcher-select"
          value={projectId ?? ""}
          onChange={(e) => handleProjectChange(e.target.value)}
          className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
        >
          {(data ?? []).length === 0 ? (
            <option value="">No projects</option>
          ) : (
            (data ?? []).map((project: any) => (
              <option key={project.id} value={project.id}>
                {project.name} ({project.key})
              </option>
            ))
          )}
        </select>
      </div>
    </>
  );
}
