"use client";

import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useProjectStore } from "@/lib/stores/project-store";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { Trash2, CheckCircle2, XCircle, AlertTriangle, Clock, Play } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

type ExecutionResult = {
  id: string;
  status: string;
  caseId: string;
};

type Execution = {
  id: string;
  key: string;
  name: string;
  description?: string;
  buildUrl?: string;
  commitSha?: string;
  status?: "ACTIVE" | "COMPLETED" | "BLOCKED";
  finishedAt?: string;
  environmentRelation?: { name: string };
  plan?: { cases?: { id: string }[] };
  results: ExecutionResult[];
};

function ExecutionProgressBar({ execution }: { execution: Execution }) {
  const results = useMemo(() => execution.results || [], [execution.results]);
  const totalCases = execution.plan?.cases?.length || results.length || 0;

  const stats = useMemo(() => {
    const passed = results.filter(r => r.status === "PASS").length;
    const failed = results.filter(r => r.status === "FAIL").length;
    const blocked = results.filter(r => r.status === "BLOCKED").length;
    const pending = totalCases - passed - failed - blocked;
    return { passed, failed, blocked, pending, total: totalCases };
  }, [results, totalCases]);

  if (stats.total === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="h-4 w-4" />
        <span>No test cases</span>
      </div>
    );
  }

  const passedPct = (stats.passed / stats.total) * 100;
  const failedPct = (stats.failed / stats.total) * 100;
  const blockedPct = (stats.blocked / stats.total) * 100;
  const pendingPct = (stats.pending / stats.total) * 100;

  return (
    <div className="w-48">
      {/* Progress bar */}
      <div className="flex h-2 overflow-hidden rounded-full bg-slate-100">
        {passedPct > 0 && (
          <div
            className="bg-emerald-500 transition-all duration-300"
            style={{ width: `${passedPct}%` }}
          />
        )}
        {failedPct > 0 && (
          <div
            className="bg-red-500 transition-all duration-300"
            style={{ width: `${failedPct}%` }}
          />
        )}
        {blockedPct > 0 && (
          <div
            className="bg-amber-500 transition-all duration-300"
            style={{ width: `${blockedPct}%` }}
          />
        )}
        {pendingPct > 0 && (
          <div
            className="bg-slate-300 transition-all duration-300"
            style={{ width: `${pendingPct}%` }}
          />
        )}
      </div>
      {/* Stats */}
      <div className="mt-1.5 flex items-center gap-3 text-[11px] font-medium">
        {stats.passed > 0 && (
          <span className="flex items-center gap-0.5 text-emerald-700">
            <CheckCircle2 className="h-3 w-3" />
            {stats.passed}
          </span>
        )}
        {stats.failed > 0 && (
          <span className="flex items-center gap-0.5 text-red-700">
            <XCircle className="h-3 w-3" />
            {stats.failed}
          </span>
        )}
        {stats.blocked > 0 && (
          <span className="flex items-center gap-0.5 text-amber-700">
            <AlertTriangle className="h-3 w-3" />
            {stats.blocked}
          </span>
        )}
        {stats.pending > 0 && (
          <span className="flex items-center gap-0.5 text-slate-500">
            <Clock className="h-3 w-3" />
            {stats.pending}
          </span>
        )}
      </div>
    </div>
  );
}

export function ExecutionsPage() {
  const projectId = useProjectStore((state) => state.projectId);
  const projectKey = useProjectStore((state) => state.projectKey);
  const [showOnlyCI, setShowOnlyCI] = useState(false);
  const toast = useToast();
  const queryClient = useQueryClient();
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  const { data, isLoading } = useQuery<Execution[]>({
    queryKey: ["executions", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const res = await fetch(`/api/executions?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to load executions");
      return res.json();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/executions/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete execution");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Execution deleted" });
      queryClient.invalidateQueries({ queryKey: ["executions", projectId] });
    },
    onError: (err) => {
      toast({ title: "Failed to delete", description: (err as Error).message });
    }
  });

  const filteredExecutions = useMemo(() => {
    if (!data) return [];
    return data.filter((ex) => !showOnlyCI || (ex.buildUrl || ex.commitSha));
  }, [data, showOnlyCI]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-8 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Executions</h1>
          <p className="mt-1 text-sm text-slate-600">Track manual and automated runs with live health.</p>
        </div>
        <Link
          href={`/projects/${projectKey}/executions/new`}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Execution
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={showOnlyCI}
            onChange={(e) => setShowOnlyCI(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
          />
          Show only CI Runs
        </label>
      </div>

      <div className="grid gap-3">
        {isLoading && <LoadingSkeleton count={3} />}
        {filteredExecutions.map((execution) => (
          <Link
            key={execution.id}
            href={`/projects/${projectKey}/executions/${execution.key}`}
            className="group relative block rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-blue-300 hover:bg-slate-50"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex-1">
                <p className="font-mono text-xs font-medium uppercase tracking-wider text-slate-500">{execution.key}</p>
                <div className="mt-1 flex items-center gap-2">
                  <h2 className="text-base font-semibold text-slate-900">{execution.name}</h2>
                  {(execution.buildUrl || execution.commitSha) && (
                    <span className="rounded border border-purple-200 bg-purple-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-purple-700">
                      CI Run
                    </span>
                  )}
                  {execution.status === "COMPLETED" || (!execution.status && execution.finishedAt) ? (
                    <span className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-emerald-700">
                      Completed
                    </span>
                  ) : execution.status === "BLOCKED" ? (
                    <span className="flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-amber-700">
                      <AlertTriangle className="h-3 w-3" />
                      Blocked
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-blue-700">
                      <Play className="h-3 w-3" />
                      Active
                    </span>
                  )}
                </div>
                {execution.description && (
                  <p className="mt-1 text-sm text-slate-600">{execution.description}</p>
                )}
              </div>

              <div className="flex items-center gap-6">
                <ExecutionProgressBar execution={execution} />

                <div className="text-right text-xs text-slate-500">
                  <p>Env: {execution.environmentRelation?.name ?? "n/a"}</p>
                </div>

                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setItemToDelete(execution.id);
                  }}
                  className="rounded p-1.5 text-slate-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                  title="Delete Execution"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </Link>
        ))}
        {!isLoading && filteredExecutions.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-12 text-center">
            <Play className="mx-auto mb-3 h-10 w-10 text-slate-300" />
            <p className="text-sm text-slate-500">
              {showOnlyCI ? "No CI runs found." : "No executions found. Create one to get started."}
            </p>
          </div>
        )}
      </div>

      <ConfirmationDialog
        open={!!itemToDelete}
        onOpenChange={(open) => !open && setItemToDelete(null)}
        title="Delete Execution"
        description="Are you sure you want to delete this execution? This action cannot be undone."
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
