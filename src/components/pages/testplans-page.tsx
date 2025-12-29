"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useProjectStore } from "@/lib/stores/project-store";
import { Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useState } from "react";

export function TestPlansPage() {
  const projectId = useProjectStore((state) => state.projectId);
  const projectKey = useProjectStore((state) => state.projectKey);
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["testplans", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const res = await fetch(`/api/testplans?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to load plans");
      return res.json();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/testplans/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete plan");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Test plan deleted" });
      queryClient.invalidateQueries({ queryKey: ["testplans", projectId] });
    },
    onError: (err) => {
      toast({ title: "Failed to delete", description: (err as Error).message });
    }
  });

  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  return (
    <div className="px-8 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Test Plans</h1>
          <p className="text-sm text-slate-400">Bundle test cases for releases and environments.</p>
        </div>
        <Link
          href={`/projects/${projectKey}/testplans/new`}
          className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-blue-500"
        >
          New Plan
        </Link>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {(data ?? []).map((plan: any) => (
          <Link key={plan.id} href={`/projects/${projectKey}/testplans/${plan.id}`}>
            <div className="group rounded-2xl border border-slate-800 bg-slate-900/60 p-6 hover:bg-slate-800/80 transition-colors relative">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">{plan.key}</p>
                  <h2 className="text-xl font-semibold text-white">{plan.name}</h2>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-slate-400">{plan.cases.length} cases</span>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setItemToDelete(plan.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-2 text-slate-500 hover:text-red-400 transition-all"
                    title="Delete Plan"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
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
          </Link>
        ))}
      </div>

      <ConfirmationDialog
        open={!!itemToDelete}
        onOpenChange={(open) => !open && setItemToDelete(null)}
        title="Delete Test Plan"
        description="Are you sure you want to delete this test plan? This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (itemToDelete) {
            deleteMutation.mutate(itemToDelete);
            setItemToDelete(null);
          }
        }}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
