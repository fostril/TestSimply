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
    <div className="mx-auto max-w-6xl px-6 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Test Plans</h1>
          <p className="mt-1 text-sm text-slate-600">Bundle test cases for releases and environments.</p>
        </div>
        <Link
          href={`/projects/${projectKey}/testplans/new`}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Plan
        </Link>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {(data ?? []).map((plan: any) => (
          <Link key={plan.id} href={`/projects/${projectKey}/testplans/${plan.id}`}>
            <div className="group relative rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-mono text-xs text-slate-500">{plan.key}</p>
                  <h2 className="text-lg font-semibold text-slate-900">{plan.name}</h2>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">{plan.cases.length} cases</span>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setItemToDelete(plan.id);
                    }}
                    className="rounded p-1.5 text-slate-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                    title="Delete Plan"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-600">{plan.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5 text-xs text-slate-600">
                {(plan.environments ?? []).map((env: string) => (
                  <span key={env} className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-medium">
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
