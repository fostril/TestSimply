"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

type RunnerStatus = "PASS" | "FAIL" | "BLOCKED";

interface ManualRunnerProps {
  executionId: string;
}

export function ManualRunner({ executionId }: ManualRunnerProps) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["execution", executionId],
    queryFn: async () => {
      const res = await fetch(`/api/executions/${executionId}`);
      if (!res.ok) throw new Error("Failed to load execution");
      return res.json();
    }
  });

  const [activeIndex, setActiveIndex] = useState(0);
  const cases = data?.results?.map((result: any) => result.testCase) ?? [];
  const activeCase = cases[activeIndex];

  const [notes, setNotes] = useState<Record<string, string>>({});
  useEffect(() => {
    if (activeCase && !notes[activeCase.id]) {
      setNotes((prev) => ({ ...prev, [activeCase.id]: "" }));
    }
  }, [activeCase, notes]);

  const mutation = useMutation({
    mutationFn: async (payload: { caseId: string; status: RunnerStatus; note?: string }) => {
      await fetch(`/api/results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          executionId,
          caseId: payload.caseId,
          status: payload.status,
          stepsLog: payload.note ? [{ note: payload.note }] : []
        })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["execution", executionId] });
    }
  });

  const progress = useMemo(() => {
    const total = cases.length || 1;
    const completed = (data?.results ?? []).filter((r: any) => r.status !== "SKIPPED").length;
    return Math.round((completed / total) * 100);
  }, [cases.length, data?.results]);

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
                  activeIndex === index ? "bg-slate-900 text-white" : "text-slate-400 hover:bg-slate-900/60"
                }`}
              >
                <div className="text-xs uppercase tracking-wide text-slate-500">{testCase.key}</div>
                <div className="text-sm font-medium">{testCase.name}</div>
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
              onClick={() => mutation.mutate({ caseId: activeCase.id, status: "PASS", note: notes[activeCase.id] })}
              className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 shadow-lg hover:bg-emerald-400"
            >
              Pass
            </button>
            <button
              onClick={() => mutation.mutate({ caseId: activeCase.id, status: "FAIL", note: notes[activeCase.id] })}
              className="rounded-full bg-red-500 px-4 py-2 text-sm font-semibold text-red-950 shadow-lg hover:bg-red-400"
            >
              Fail
            </button>
            <button
              onClick={() => mutation.mutate({ caseId: activeCase.id, status: "BLOCKED", note: notes[activeCase.id] })}
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
                <li key={index} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-200">
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
              onChange={(event) => setNotes((prev) => ({ ...prev, [activeCase.id]: event.target.value }))}
              className="mt-3 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
              rows={4}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
