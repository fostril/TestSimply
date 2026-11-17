"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

type RunnerStatus = "PASS" | "FAIL" | "BLOCKED";

type StepStatus = "PASS" | "FAIL" | "BLOCKED" | "SKIPPED" | "NOT_RUN";

type StepResultState = {
  stepIndex: number;
  status: StepStatus;
  actual: string;
  comments: string;
};

const STEP_STATUS_ORDER: StepStatus[] = ["NOT_RUN", "PASS", "FAIL", "BLOCKED", "SKIPPED"];

const stepStatusStyle: Record<StepStatus, string> = {
  NOT_RUN: "bg-slate-800 text-slate-400 border-slate-700",
  PASS: "bg-emerald-500 text-emerald-950 border-emerald-500",
  FAIL: "bg-red-500 text-red-950 border-red-500",
  BLOCKED: "bg-amber-500 text-amber-950 border-amber-500",
  SKIPPED: "bg-slate-600 text-white border-slate-600",
};

// Collapse a set of per-step statuses into an overall result — same precedence
// Jira Xray uses: FAIL dominates BLOCKED > SKIPPED > PASS. NOT_RUN means
// "nothing conclusive yet" so we don't auto-submit for those.
function deriveOverallStatus(steps: StepResultState[]): RunnerStatus | null {
  if (steps.length === 0) return null;
  if (steps.some((s) => s.status === "FAIL")) return "FAIL";
  if (steps.some((s) => s.status === "BLOCKED")) return "BLOCKED";
  if (steps.every((s) => s.status === "PASS")) return "PASS";
  return null;
}

type Bug = {
  id: string;
  key: string;
  summary: string;
  status: string;
};

type TestCase = {
  id: string;
  key: string;
  name: string;
};

interface ManualRunnerProps {
  executionId: string;
  projectKey?: string;
}

export function ManualRunner({ executionId, projectKey }: ManualRunnerProps) {
  const queryClient = useQueryClient();
  const { data, refetch, error, isLoading } = useQuery({
    queryKey: ["execution", executionId],
    queryFn: async () => {
      const res = await fetch(`/api/executions/${executionId}${projectKey ? `?projectKey=${projectKey}` : ""}`);
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

  // Map of caseId to linked bug IDs from existing results
  const linkedBugsByCase = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const result of results) {
      if (result.bugs && result.bugs.length > 0) {
        map.set(result.caseId, result.bugs.map((b: any) => b.id));
      }
    }
    return map;
  }, [results]);

  const activeCase = cases[activeIndex];

  const [notes, setNotes] = useState<Record<string, string>>({});
  // Per-step results keyed by caseId. Initialized from the existing stepsLog
  // on the result when switching cases.
  const [stepResults, setStepResults] = useState<Record<string, StepResultState[]>>({});
  const [selectedBugs, setSelectedBugs] = useState<Record<string, string[]>>({});
  const [bugSearchQuery, setBugSearchQuery] = useState("");
  const debouncedBugSearchQuery = useDebounce(bugSearchQuery, 300);
  const toast = useToast();

  const { data: bugs } = useQuery<Bug[]>({
    queryKey: ["bugs", data?.projectId, debouncedBugSearchQuery],
    enabled: Boolean(data?.projectId),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("projectId", data.projectId);
      if (debouncedBugSearchQuery) {
        params.set("search", debouncedBugSearchQuery);
      }
      const res = await fetch(`/api/bugs?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load bugs");
      return res.json();
    }
  });

  // Initialize notes entry when active case changes
  useEffect(() => {
    const id = activeCase?.id as string | undefined;
    if (!id) return;
    setNotes((prev) => (prev[id] === undefined ? { ...prev, [id]: "" } : prev));
    // Initialize with linked bugs from existing results
    setSelectedBugs((prev) => {
      if (prev[id] === undefined) {
        const existingBugs = linkedBugsByCase.get(id) || [];
        return { ...prev, [id]: existingBugs };
      }
      return prev;
    });

    // Hydrate step results from existing stepsLog (if the saved shape matches
    // the typed StepResult shape). Falls back to NOT_RUN for each step.
    setStepResults((prev) => {
      if (prev[id]) return prev;
      const steps = (activeCase?.steps ?? []) as unknown[];
      const existingResult = results.find((r: any) => r.caseId === id);
      const existingLog = Array.isArray(existingResult?.stepsLog)
        ? (existingResult.stepsLog as any[])
        : [];

      const hydrated: StepResultState[] = steps.map((_s, idx) => {
        const found = existingLog.find((e) => e && typeof e === "object" && e.stepIndex === idx);
        if (found && typeof found.status === "string" && STEP_STATUS_ORDER.includes(found.status)) {
          return {
            stepIndex: idx,
            status: found.status as StepStatus,
            actual: typeof found.actual === "string" ? found.actual : "",
            comments: typeof found.comments === "string" ? found.comments : "",
          };
        }
        return { stepIndex: idx, status: "NOT_RUN", actual: "", comments: "" };
      });
      return { ...prev, [id]: hydrated };
    });
  }, [activeCase?.id, activeCase?.steps, linkedBugsByCase, results]);

  // State for bulk action confirmation
  const [showBulkConfirm, setShowBulkConfirm] = useState<RunnerStatus | null>(null);

  // Get remaining (untested) cases
  const remainingCases = useMemo(() => {
    return cases.filter((c: any) => !statusByCase.has(c.id));
  }, [cases, statusByCase]);

  const [isJiraModalOpen, setIsJiraModalOpen] = useState(false);
  const [jiraSummary, setJiraSummary] = useState("");
  const [jiraDescription, setJiraDescription] = useState("");

  const createJiraMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/integrations/jira/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: data?.projectId,
          summary: jiraSummary,
          description: jiraDescription,
          issueType: "Bug",
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to create Jira issue");
      }
      return res.json();
    },
    onSuccess: (jiraIssue) => {
      toast({ title: "Jira Bug Created", description: `Issue ${jiraIssue.key} created.` });
      setIsJiraModalOpen(false);
    },
    onError: (err) => {
      toast({ title: "Failed to create Jira Bug", description: (err as Error).message });
    }
  });

  const [isLocalBugModalOpen, setIsLocalBugModalOpen] = useState(false);
  const [localBugSummary, setLocalBugSummary] = useState("");
  const [localBugDescription, setLocalBugDescription] = useState("");
  const [localBugPriority, setLocalBugPriority] = useState("MEDIUM");

  const createLocalBugMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/bugs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: data?.projectId,
          // Key is now generated by the backend
          summary: localBugSummary,
          description: localBugDescription,
          priority: localBugPriority,
          status: "OPEN",
          testCaseId: activeCase?.id
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to create bug");
      }
      return res.json();
    },
    onSuccess: (bug) => {
      toast({ title: "Bug Created", description: `${bug.key} created.` });
      setIsLocalBugModalOpen(false);
      // Invalidate bugs query to refresh the list
      queryClient.invalidateQueries({ queryKey: ["bugs", data?.projectId] });

      // Auto-select the new bug
      if (activeCase?.id) {
        setSelectedBugs((prev) => {
          const current = prev[activeCase.id] || [];
          return { ...prev, [activeCase.id]: [...current, bug.id] };
        });
      }
    },
    onError: (err) => {
      toast({ title: "Failed to create bug", description: (err as Error).message });
    }
  });

  const [isAddCaseModalOpen, setIsAddCaseModalOpen] = useState(false);
  const [caseSearchQuery, setCaseSearchQuery] = useState("");
  const debouncedCaseSearchQuery = useDebounce(caseSearchQuery, 300);
  const [selectedCasesToAdd, setSelectedCasesToAdd] = useState<string[]>([]);
  const [caseToRemove, setCaseToRemove] = useState<any>(null);

  const { data: availableCases } = useQuery<TestCase[]>({
    queryKey: ["cases", data?.projectId, debouncedCaseSearchQuery],
    enabled: Boolean(isAddCaseModalOpen && data?.projectId),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("projectId", data.projectId);
      if (debouncedCaseSearchQuery) {
        params.set("search", debouncedCaseSearchQuery);
      }
      const res = await fetch(`/api/testcases?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load cases");
      return res.json();
    }
  });

  const addCasesMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/executions/${executionId}/cases${projectKey ? `?projectKey=${projectKey}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testCaseIds: selectedCasesToAdd }),
      });
      if (!res.ok) throw new Error("Failed to add cases");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Cases Added", description: data.message });
      setIsAddCaseModalOpen(false);
      setSelectedCasesToAdd([]);
      void refetch();
    },
    onError: (err) => {
      toast({ title: "Failed to add cases", description: (err as Error).message });
    }
  });

  const removeCaseMutation = useMutation({
    mutationFn: async (caseId: string) => {
      const res = await fetch(`/api/executions/${executionId}/cases${projectKey ? `?projectKey=${projectKey}` : ""}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testCaseIds: [caseId] }),
      });
      if (!res.ok) throw new Error("Failed to remove case");
      return res.json();
    },
    onSuccess: (data, caseId) => {
      toast({ title: "Case Removed", description: data.message });
      setCaseToRemove(null);

      // Adjust active index if the removed case was active or before the active case
      const removedIndex = cases.findIndex((c: any) => c.id === caseId);
      if (removedIndex !== -1) {
        if (removedIndex === activeIndex && cases.length > 1) {
          // If removing the active case, switch to the previous one or the next if it's the first
          setActiveIndex(removedIndex > 0 ? removedIndex - 1 : 0);
        } else if (removedIndex < activeIndex) {
          // If removing a case before the active one, decrement the active index
          setActiveIndex(activeIndex - 1);
        }
      }

      void refetch();
    },
    onError: (err) => {
      toast({ title: "Failed to remove case", description: (err as Error).message });
    }
  });

  const openLocalBugModal = () => {
    if (!activeCase) return;
    setLocalBugSummary(`[Failure] ${activeCase.key}: ${activeCase.name}`);
    setLocalBugDescription(`Test Case: ${activeCase.name}\n\nSteps:\n${(activeCase.steps as any[]).map((s, i) => `${i + 1}. ${s.action} (Exp: ${s.expected})`).join("\n")}\n\nNotes:\n${notes[activeCase.id] || "No notes provided."}`);
    setLocalBugPriority("MEDIUM");
    setIsLocalBugModalOpen(true);
  };

  const mutation = useMutation({
    mutationFn: async (payload: { caseId: string; status: RunnerStatus; note?: string; bugIds?: string[] }) => {
      // Convert the per-step state to the typed StepResult shape. Blank
      // actuals/comments are omitted to keep the JSON small.
      const stepState = stepResults[payload.caseId] ?? [];
      const stepsLog = stepState
        .filter((s) => s.status !== "NOT_RUN" || s.actual || s.comments)
        .map((s) => ({
          stepIndex: s.stepIndex,
          status: s.status,
          ...(s.actual ? { actual: s.actual } : {}),
          ...(s.comments ? { comments: s.comments } : {}),
        }));

      // Also preserve the free-form note in a separate entry so existing
      // screens that look for a plain `note` keep working.
      if (payload.note) {
        (stepsLog as any[]).push({ note: payload.note });
      }

      await fetch(`/api/results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          executionId: data?.id,
          caseId: payload.caseId,
          status: payload.status,
          stepsLog,
          bugIds: payload.bugIds,
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

  const activeResult = useMemo(
    () => (activeCase?.id ? results.find((r: any) => r.caseId === activeCase.id) : undefined),
    [results, activeCase?.id],
  );

  const activeAttachments = useMemo(() => {
    if (!activeCase?.id) return [];
    const fromResult = (activeResult?.Attachment ?? []) as any[];
    const fromExecution = ((data?.attachments ?? []) as any[]).filter(
      (a) => a.testCaseId === activeCase.id && !a.testResultId,
    );
    return [...fromResult, ...fromExecution];
  }, [activeCase?.id, activeResult, data?.attachments]);

  const uploadAttachmentMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      if (activeResult?.id) {
        formData.append("testResultId", activeResult.id);
      } else if (data?.id && activeCase?.id) {
        formData.append("executionId", data.id);
        formData.append("testCaseId", activeCase.id);
      }
      const res = await fetch("/api/attachments", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to upload attachment");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Attachment uploaded" });
      void refetch();
    },
    onError: (err: unknown) => {
      toast({ title: "Upload failed", description: (err as Error).message });
    },
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      const res = await fetch(`/api/attachments/${attachmentId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete attachment");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Attachment deleted" });
      void refetch();
    },
    onError: (err: unknown) => {
      toast({ title: "Delete failed", description: (err as Error).message });
    },
  });

  // Keyboard shortcuts: P = Pass, F = Fail, B = Blocked
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input/textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (!activeCase?.id || mutation.isPending) return;

      const key = e.key.toLowerCase();
      if (key === "p") {
        mutation.mutate({
          caseId: activeCase.id,
          status: "PASS",
          note: notes[activeCase.id],
          bugIds: selectedBugs[activeCase.id],
        });
      } else if (key === "f") {
        mutation.mutate({
          caseId: activeCase.id,
          status: "FAIL",
          note: notes[activeCase.id],
          bugIds: selectedBugs[activeCase.id],
        });
      } else if (key === "b") {
        mutation.mutate({
          caseId: activeCase.id,
          status: "BLOCKED",
          note: notes[activeCase.id],
          bugIds: selectedBugs[activeCase.id],
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeCase?.id, notes, selectedBugs, mutation]);

  // Bulk mark remaining cases
  const bulkMarkMutation = useMutation({
    mutationFn: async (status: RunnerStatus) => {
      const remaining = cases.filter((c: any) => !statusByCase.has(c.id));
      for (const c of remaining) {
        await fetch(`/api/results`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            executionId: data?.id,
            caseId: c.id,
            status,
            stepsLog: [],
          }),
        });
      }
    },
    onSuccess: () => {
      toast({ title: "Bulk status update completed" });
      setShowBulkConfirm(null);
      void refetch();
    },
    onError: (err: unknown) => {
      toast({ title: "Failed to update", description: (err as Error).message });
    },
  });

  const progress = useMemo(() => {
    const total = cases.length || 1;
    const completed = results.filter((r: any) => r.status && r.status !== "SKIPPED").length;
    return Math.round((completed / total) * 100);
  }, [cases.length, results]);

  const statusMutation = useMutation({
    mutationFn: async (status: string) => {
      const res = await fetch(`/api/executions/${executionId}${projectKey ? `?projectKey=${projectKey}` : ""}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Execution status updated" });
      void refetch();
    },
    onError: (err: unknown) => {
      toast({ title: "Failed to update status", description: (err as Error).message });
    },
  });

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



  const openJiraModal = () => {
    if (!activeCase) return;
    setJiraSummary(`[Failure] ${activeCase.key}: ${activeCase.name}`);
    setJiraDescription(`Test Case: ${activeCase.name}\n\nSteps:\n${(activeCase.steps as any[]).map((s, i) => `${i + 1}. ${s.action} (Exp: ${s.expected})`).join("\n")}\n\nNotes:\n${notes[activeCase.id] || "No notes provided."}`);
    setIsJiraModalOpen(true);
  };

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[320px,1fr]">
      {isJiraModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
            <h2 className="text-xl font-semibold text-white">Create Jira Bug</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-300">Summary</label>
                <input
                  value={jiraSummary}
                  onChange={(e) => setJiraSummary(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-300">Description</label>
                <textarea
                  value={jiraDescription}
                  onChange={(e) => setJiraDescription(e.target.value)}
                  rows={5}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setIsJiraModalOpen(false)}
                className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => createJiraMutation.mutate()}
                disabled={createJiraMutation.isPending}
                className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white shadow-lg hover:bg-blue-500 disabled:opacity-50"
              >
                {createJiraMutation.isPending ? "Creating..." : "Create Bug"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isLocalBugModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
            <h2 className="text-xl font-semibold text-white">Create Local Bug</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-300">Summary</label>
                <input
                  value={localBugSummary}
                  onChange={(e) => setLocalBugSummary(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-300">Description</label>
                <textarea
                  value={localBugDescription}
                  onChange={(e) => setLocalBugDescription(e.target.value)}
                  rows={5}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-300">Priority</label>
                <select
                  value={localBugPriority}
                  onChange={(e) => setLocalBugPriority(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setIsLocalBugModalOpen(false)}
                className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => createLocalBugMutation.mutate()}
                disabled={createLocalBugMutation.isPending}
                className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white shadow-lg hover:bg-blue-500 disabled:opacity-50"
              >
                {createLocalBugMutation.isPending ? "Creating..." : "Create Bug"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isAddCaseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
            <h2 className="text-xl font-semibold text-white">Add Test Cases</h2>
            <div className="mt-4 space-y-4">
              <input
                type="text"
                placeholder="Search cases..."
                value={caseSearchQuery}
                onChange={(e) => setCaseSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
              />
              <div className="h-64 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900 p-2">
                {(availableCases ?? [])
                  .filter((c) => !cases.some((existing: any) => existing.id === c.id)) // Client-side filter for already added cases
                  .map((c) => {
                    const isSelected = selectedCasesToAdd.includes(c.id);
                    return (
                      <label key={c.id} className="flex items-center gap-2 rounded-lg p-2 hover:bg-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedCasesToAdd((prev) => [...prev, c.id]);
                            } else {
                              setSelectedCasesToAdd((prev) => prev.filter((id) => id !== c.id));
                            }
                          }}
                          className="rounded border-slate-700 bg-slate-900 text-brand focus:ring-brand"
                        />
                        <span className="text-sm text-slate-300">
                          <span className="font-medium text-white">{c.key}</span>: {c.name}
                        </span>
                      </label>
                    );
                  })}
                {(availableCases ?? []).length === 0 && (
                  <p className="p-2 text-sm text-slate-500">No cases found.</p>
                )}
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setIsAddCaseModalOpen(false)}
                className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => addCasesMutation.mutate()}
                disabled={addCasesMutation.isPending || selectedCasesToAdd.length === 0}
                className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white shadow-lg hover:bg-blue-500 disabled:opacity-50"
              >
                {addCasesMutation.isPending ? "Adding..." : `Add ${selectedCasesToAdd.length} Cases`}
              </button>
            </div>
          </div>
        </div>
      )}

      {caseToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
            <h2 className="text-xl font-semibold text-white">Remove Test Case?</h2>
            <p className="mt-2 text-sm text-slate-400">
              Are you sure you want to remove <span className="font-semibold text-white">{caseToRemove.name}</span> from this execution?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setCaseToRemove(null)}
                className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => removeCaseMutation.mutate(caseToRemove.id)}
                disabled={removeCaseMutation.isPending}
                className="rounded-full bg-red-500 px-5 py-2 text-sm font-semibold text-white shadow-lg hover:bg-red-600 disabled:opacity-50"
              >
                {removeCaseMutation.isPending ? "Removing..." : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}


      <aside className="border-r border-slate-800 bg-slate-950/80 p-6">
        <div className="mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Status</h2>
          <select
            value={data?.status || "ACTIVE"}
            onChange={(e) => statusMutation.mutate(e.target.value)}
            className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="ACTIVE">Active</option>
            <option value="COMPLETED">Completed</option>
            <option value="BLOCKED">Blocked</option>
          </select>
        </div>

        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Progress</h2>
        <div className="mt-2 h-2 rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} />
        </div>

        <div className="mt-6 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Test Cases</h2>
          <button onClick={() => setIsAddCaseModalOpen(true)} className="text-xs font-medium text-brand hover:text-brand/80">+ Add Case</button>
        </div>
        <ol className="mt-2 space-y-2 text-sm">
          {cases.map((testCase: any, index: number) => (
            <li key={testCase.id} className="group relative">
              <button
                type="button"
                onClick={() => setActiveIndex(index)}
                className={`w-full rounded-xl px-3 py-2 pr-10 text-left transition ${activeIndex === index
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
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setCaseToRemove(testCase);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 opacity-0 transition hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                title="Remove from execution"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </li>
          ))}
        </ol>

        {/* Bulk Actions */}
        {remainingCases.length > 0 && (
          <div className="mt-6 border-t border-slate-800 pt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400 mb-3">Quick Actions</h2>
            <div className="space-y-2">
              <button
                onClick={() => setShowBulkConfirm("PASS")}
                disabled={bulkMarkMutation.isPending}
                className="w-full rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
              >
                Mark {remainingCases.length} remaining as Passed
              </button>
              <button
                onClick={() => setShowBulkConfirm("BLOCKED")}
                disabled={bulkMarkMutation.isPending}
                className="w-full rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs font-medium text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
              >
                Mark {remainingCases.length} remaining as Blocked
              </button>
            </div>
          </div>
        )}

        {/* Keyboard shortcuts hint */}
        <div className="mt-6 border-t border-slate-800 pt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400 mb-2">Shortcuts</h2>
          <div className="text-xs text-slate-500 space-y-1">
            <p><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">P</kbd> Pass</p>
            <p><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">F</kbd> Fail</p>
            <p><kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">B</kbd> Blocked</p>
          </div>
        </div>

        {/* Export */}
        <div className="mt-6 border-t border-slate-800 pt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400 mb-3">Export</h2>
          <a
            href={`/api/executions/${executionId}/export${projectKey ? `?projectKey=${projectKey}` : ""}`}
            download
            className="block w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-center text-xs font-medium text-slate-300 hover:bg-slate-700 transition-colors"
          >
            📥 Download CSV Report
          </a>
        </div>
      </aside>

      {/* Bulk action confirmation */}
      {showBulkConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
            <h2 className="text-xl font-semibold text-white">Confirm Bulk Action</h2>
            <p className="mt-2 text-sm text-slate-400">
              Mark {remainingCases.length} remaining test case(s) as <span className="font-semibold text-white">{showBulkConfirm}</span>?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowBulkConfirm(null)}
                className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => bulkMarkMutation.mutate(showBulkConfirm)}
                disabled={bulkMarkMutation.isPending}
                className={`rounded-full px-5 py-2 text-sm font-semibold shadow-lg disabled:opacity-50 ${showBulkConfirm === "PASS"
                  ? "bg-emerald-500 text-emerald-950 hover:bg-emerald-400"
                  : "bg-amber-500 text-amber-950 hover:bg-amber-400"
                  }`}
              >
                {bulkMarkMutation.isPending ? "Processing..." : `Mark as ${showBulkConfirm}`}
              </button>
            </div>
          </div>
        </div>
      )}

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
                mutation.mutate({ caseId: activeCase.id, status: "PASS", note: notes[activeCase.id], bugIds: selectedBugs[activeCase.id] })
              }
              className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 shadow-lg hover:bg-emerald-400"
            >
              Pass
            </button>
            <button
              onClick={() =>
                mutation.mutate({ caseId: activeCase.id, status: "FAIL", note: notes[activeCase.id], bugIds: selectedBugs[activeCase.id] })
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
                  bugIds: selectedBugs[activeCase.id],
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
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                Steps
              </h2>
              {(() => {
                const derived = deriveOverallStatus(stepResults[activeCase.id] ?? []);
                return derived ? (
                  <span className="text-xs text-slate-400">
                    Derived: <span className="font-semibold text-white">{derived}</span>
                  </span>
                ) : null;
              })()}
            </div>
            <ol className="mt-4 space-y-3">
              {(activeCase.steps ?? []).map((step: any, index: number) => {
                const stepState =
                  stepResults[activeCase.id]?.[index] ??
                  ({ stepIndex: index, status: "NOT_RUN", actual: "", comments: "" } as StepResultState);
                return (
                  <li
                    key={index}
                    className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-200"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">
                          <span className="text-slate-500">{index + 1}.</span> {step.action}
                        </p>
                        {step.data && (
                          <p className="mt-1 text-xs text-slate-500">Data: {step.data}</p>
                        )}
                        {step.expected && (
                          <p className="mt-1 text-xs text-slate-400">Expected: {step.expected}</p>
                        )}
                      </div>
                      <div className="flex flex-shrink-0 gap-1">
                        {(["PASS", "FAIL", "BLOCKED", "SKIPPED"] as const).map((s) => {
                          const isActive = stepState.status === s;
                          return (
                            <button
                              key={s}
                              type="button"
                              onClick={() => {
                                setStepResults((prev) => {
                                  const existing = prev[activeCase.id] ?? [];
                                  const next = [...existing];
                                  next[index] = { ...stepState, status: isActive ? "NOT_RUN" : s };
                                  return { ...prev, [activeCase.id]: next };
                                });
                              }}
                              className={`rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition ${
                                isActive
                                  ? stepStatusStyle[s]
                                  : "border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800"
                              }`}
                            >
                              {s === "SKIPPED" ? "Skip" : s.charAt(0) + s.slice(1).toLowerCase()}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <textarea
                        placeholder="Actual result"
                        value={stepState.actual}
                        onChange={(e) =>
                          setStepResults((prev) => {
                            const existing = prev[activeCase.id] ?? [];
                            const next = [...existing];
                            next[index] = { ...stepState, actual: e.target.value };
                            return { ...prev, [activeCase.id]: next };
                          })
                        }
                        rows={2}
                        className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand"
                      />
                      <textarea
                        placeholder="Comments"
                        value={stepState.comments}
                        onChange={(e) =>
                          setStepResults((prev) => {
                            const existing = prev[activeCase.id] ?? [];
                            const next = [...existing];
                            next[index] = { ...stepState, comments: e.target.value };
                            return { ...prev, [activeCase.id]: next };
                          })
                        }
                        rows={2}
                        className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand"
                      />
                    </div>
                  </li>
                );
              })}
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

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                Attachments ({activeAttachments.length})
              </h2>
              <label className="cursor-pointer rounded-full border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700">
                {uploadAttachmentMutation.isPending ? "Uploading..." : "+ Upload File"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,text/csv,application/json,application/xml,text/xml"
                  disabled={uploadAttachmentMutation.isPending}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      uploadAttachmentMutation.mutate(file);
                      e.target.value = "";
                    }
                  }}
                  className="hidden"
                />
              </label>
            </div>
            {activeAttachments.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {activeAttachments.map((att: any) => (
                  <li
                    key={att.id}
                    className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300"
                  >
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate font-medium text-brand hover:underline"
                    >
                      {att.fileName}
                    </a>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-slate-500">
                        {Math.max(1, Math.round(att.size / 1024))} KB
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteAttachmentMutation.mutate(att.id)}
                        className="text-red-400 hover:text-red-300"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-slate-500">
                No attachments uploaded for this test case yet.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Link Bugs</h2>
              <button
                onClick={openLocalBugModal}
                className="mr-3 text-xs font-medium text-emerald-400 hover:text-emerald-300"
              >
                + Create Local Bug
              </button>
              <button
                onClick={openJiraModal}
                className="text-xs font-medium text-blue-400 hover:text-blue-300"
              >
                + Create Jira Bug
              </button>
            </div>
            <div className="mt-3 space-y-2">
              <input
                type="text"
                placeholder="Search bugs..."
                value={bugSearchQuery}
                onChange={(e) => setBugSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
              />
              <div className="h-48 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 p-2">
                {(bugs ?? [])
                  .map((bug) => {
                    const isSelected = (selectedBugs[activeCase.id] ?? []).includes(bug.id);
                    return (
                      <label key={bug.id} className="flex items-center gap-2 rounded-lg p-2 hover:bg-slate-900 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            const currentSelected = selectedBugs[activeCase.id] ?? [];
                            let newSelected;
                            if (e.target.checked) {
                              newSelected = [...currentSelected, bug.id];
                            } else {
                              newSelected = currentSelected.filter((id) => id !== bug.id);
                            }
                            setSelectedBugs((prev) => ({ ...prev, [activeCase.id]: newSelected }));
                          }}
                          className="rounded border-slate-700 bg-slate-900 text-brand focus:ring-brand"
                        />
                        <span className="flex-1 text-sm text-slate-300">
                          <span className="font-medium text-white">{bug.key}</span>: {bug.summary}
                        </span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${bug.status === "CLOSED" || bug.status === "RESOLVED"
                            ? "bg-green-500/10 text-green-400 border border-green-500/20"
                            : bug.status === "IN_PROGRESS"
                              ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                              : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          }`}>
                          {bug.status}
                        </span>
                      </label>
                    );
                  })}
                {(bugs ?? []).length === 0 && (
                  <p className="p-2 text-sm text-slate-500">No bugs found.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div >
  );
}
