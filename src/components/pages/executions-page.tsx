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
      <div className="h-2 rounded-full bg-muted overflow-hidden flex">
        {passedPct > 0 && (
          <div
            className="bg-green-500 transition-all duration-300"
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
            className="bg-slate-600 transition-all duration-300"
            style={{ width: `${pendingPct}%` }}
          />
        )}
      </div>
      {/* Stats */}
      <div className="flex items-center gap-3 mt-1.5 text-[10px]">
        {stats.passed > 0 && (
          <span className="flex items-center gap-0.5 text-green-400">
            <CheckCircle2 className="h-3 w-3" />
            {stats.passed}
          </span>
        )}
        {stats.failed > 0 && (
          <span className="flex items-center gap-0.5 text-red-400">
            <XCircle className="h-3 w-3" />
            {stats.failed}
          </span>
        )}
        {stats.blocked > 0 && (
          <span className="flex items-center gap-0.5 text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            {stats.blocked}
          </span>
        )}
        {stats.pending > 0 && (
          <span className="flex items-center gap-0.5 text-slate-400">
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
    <div className="px-8 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Executions</h1>
          <p className="text-sm text-muted-foreground">Track manual and automated runs with live health.</p>
        </div>
        <Link
          href={`/projects/${projectKey}/executions/new`}
          className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
        >
          New Execution
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={showOnlyCI}
            onChange={(e) => setShowOnlyCI(e.target.checked)}
            className="rounded border-border bg-card text-primary focus:ring-primary"
          />
          Show only CI Runs
        </label>
      </div>

      <div className="grid gap-4">
        {isLoading && <LoadingSkeleton count={3} />}
        {filteredExecutions.map((execution) => (
          <Link
            key={execution.id}
            href={`/projects/${projectKey}/executions/${execution.key}`}
            className="block rounded-xl border border-border bg-card/40 p-6 transition-all hover:border-primary/50 hover:bg-card/60 hover:shadow-lg hover:shadow-primary/5 group relative"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex-1">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{execution.key}</p>
                <div className="flex items-center gap-2 mt-1">
                  <h2 className="text-xl font-semibold text-foreground">{execution.name}</h2>
                  {(execution.buildUrl || execution.commitSha) && (
                    <span className="rounded-md bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-purple-400 border border-purple-500/20">
                      CI Run
                    </span>
                  )}
                  {execution.finishedAt ? (
                    <span className="rounded-md bg-green-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-400 border border-green-500/20">
                      Completed
                    </span>
                  ) : (
                    <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-400 border border-blue-500/20 flex items-center gap-1">
                      <Play className="h-3 w-3" />
                      Active
                    </span>
                  )}
                </div>
                {execution.description && (
                  <p className="text-sm text-muted-foreground mt-1">{execution.description}</p>
                )}
              </div>

              <div className="flex items-center gap-6">
                <ExecutionProgressBar execution={execution} />

                <div className="text-right text-xs text-muted-foreground">
                  <p>Env: {execution.environmentRelation?.name ?? "n/a"}</p>
                </div>

                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setItemToDelete(execution.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-2 text-muted-foreground hover:text-red-400 transition-all"
                  title="Delete Execution"
                >
                  <Trash2 className="h-5 w-5" />
                </button>
              </div>
            </div>
          </Link>
        ))}
        {!isLoading && filteredExecutions.length === 0 && (
          <div className="rounded-xl border border-border bg-card/40 p-12 text-center">
            <Play className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">
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
