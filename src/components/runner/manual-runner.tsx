"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";

type RunnerStatus = "PASS" | "FAIL" | "BLOCKED";

interface ManualRunnerProps {
  executionId: string;
}

export function ManualRunner({ executionId }: ManualRunnerProps) {
  const { data, refetch, error, isLoading } = useQuery({
    queryKey: ["execution", executionId],
    queryFn: async () => {
      const res = await fetch(`/api/executions/${executionId}`);
      if (!res.ok) throw new Error("Failed to load execution");
      return res.json();
    },
  });

  const [activeIndex, setActiveIndex] = useState(0);

  // Avoid creating new arrays in render: memoize each derivation
  const rawResults = data?.results as any[] | undefined;
  const results = useMemo(() => rawResults ?? [], [rawResults]);

  const rawPlanCases = data?.plan?.cases as any[] | undefined;
  const planCases = useMemo(
    () => (rawPlanCases ? rawPlanCases.map((entry: any) => entry.case) : []),
    [rawPlanCases]
  );

  const cases = useMemo(
    () => (planCases.length > 0 ? planCases : results.map((r: any) => r.testCase)),
    [planCases, results]
  );

  const statusByCase = useMemo(() => {
    const map = new Map<string, string>();
    for (const result of results) {
      map.set(result.caseId, result.status);
    }
    return map;
  }, [results]);

  const activeCase = cases[activeIndex];

  const [notes, setNotes] = useState<Record<string, string>>({});
  const toast = useToast();

  // Initialize notes entry when active case changes
  useEffect(() => {
    const id = activeCase?.id as string | undefined;
    if (!id) return;
    setNotes((prev) => (prev[id] === undefined ? { ...prev, [id]: "" } : prev));
  }, [activeCase?.id]);

  const mutation = useMutation({
    mutationFn: async (payload: { caseId: string; status: RunnerStatus; note?: string }) => {
      await fetch(`/api/results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          executionId,
          caseId: payload.caseId,
          status: payload.status,
          stepsLog: payload.note ? [{ note: payload.note }] : [],
        }),
      });
    },
    onSuccess: () => {
      const id = activeCase?.id as string | undefined;
      if (id) {
        setNotes((prev) => {
          const next = { ...prev };
          next[id] = "";
          return next;
        });
      }
      void refetch();
    },
    onError: (err: unknown) => {
      toast({ title: "Failed to record result", description: (err as Error).message });
    },
  });

  const progress = useMemo(() => {
    const total = cases.length || 1;
    const completed = results.filter((r: any) => r.status && r.status !== "SKIPPED").length;
    return Math.round((completed / total) * 100);
  }, [cases.length, results]);

  if (isLoading) {
    return (
      <div className="px-8 py-6">
        <h1 className="text-3xl font-semibold">Manual Runner</h1>
        <p className="mt-2 text-slate-400">Loading execution…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-8 py-6">
        <h1 className="text-3xl font-semibold">Manual Runner</h1>
        <p className="mt-2 text-slate-400">
          Unable to load execution: {(error as Error).message}
        </p>
      </div>
    );
  }

  if (!activeCase) {
    return (
      <div className="px-8 py-6">
        <h1 className="text-3xl font-semibold">Manual Runner</h1>
        <p className="mt-2 text-slate-400">No test cases available for this execution.</p>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[320px,1fr]">
      <aside className="border-r border-slate-800 bg-slate-950/80 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Progress</h2>
        <div className="mt-2 h-2 rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} />
        </div>
        <ol className="mt-6 space-y-2 text-sm">
          {cases.map((testCase: any, index: number) => (
            <li key={testCase.id}>
              <button
                type="button"
                onClick={() => setActiveIndex(index)}
                className={`w-full rounded-xl px-3 py-2 text-left transition ${
                  activeIndex === index
                    ? "bg-slate-900 text-white"
                    : "text-slate-400 hover:bg-slate-900/60"
                }`}
              >
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  {testCase.key}
                </div>
                <div className="text-sm font-medium">{testCase.name}</div>
                {statusByCase.has(testCase.id) ? (
                  <span className="mt-1 inline-flex rounded-full bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
                    {statusByCase.get(testCase.id)}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ol>
      </aside>

      <section className="px-10 py-8">
        <header className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">{activeCase.key}</p>
            <h1 className="text-2xl font-semibold text-white">{activeCase.name}</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-400">{activeCase.description}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() =>
                mutation.mutate({ caseId: activeCase.id, status: "PASS", note: notes[activeCase.id] })
              }
              className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 shadow-lg hover:bg-emerald-400"
            >
              Pass
            </button>
            <button
              onClick={() =>
                mutation.mutate({ caseId: activeCase.id, status: "FAIL", note: notes[activeCase.id] })
              }
              className="rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-red-950 shadow-lg hover:bg-red-400"
            >
              Fail
            </button>
            <button
              onClick={() =>
                mutation.mutate({
                  caseId: activeCase.id,
                  status: "BLOCKED",
                  note: notes[activeCase.id],
                })
              }
              className="rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-amber-950 shadow-lg hover:bg-amber-400"
            >
              Blocked
            </button>
          </div>
        </header>

        <div className="mt-8 space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Steps</h2>
            <ol className="mt-4 space-y-3">
              {(activeCase.steps ?? []).map((step: any, index: number) => (
                <li
                  key={index}
                  className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-200"
                >
                  <p className="font-semibold">{step.action}</p>
                  <p className="mt-1 text-xs text-slate-400">Expected: {step.expected}</p>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Notes</h2>
            <textarea
              value={notes[activeCase.id] ?? ""}
              onChange={(event) =>
                setNotes((prev) => ({ ...prev, [activeCase.id]: event.target.value }))
              }
              className="mt-3 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
              rows={4}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
