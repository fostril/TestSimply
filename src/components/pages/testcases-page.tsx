"use client";

import { ReactNode, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { Trash2, Search, X, FileText } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useProjectStore } from "@/lib/stores/project-store";
import { CsvImporter } from "@/components/csv-importer";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

export type TestCaseRow = {
  id: string;
  key: string;
  name: string;
  priority: string;
  status: string;
  component?: string;
  tags: string[];
  isAutomated: boolean;
  isFlaky: boolean;
};

type Column<T> = {
  header: string;
  accessor?: keyof T;
  render?: (row: T) => ReactNode;
};

const PRIORITIES = ["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
const STATUSES = ["ALL", "DRAFT", "READY", "DEPRECATED", "ARCHIVED"] as const;

export function TestCasesPage() {
  const projectId = useProjectStore((state) => state.projectId);
  const projectKey = useProjectStore((state) => state.projectKey);
  const toast = useToast();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isAddToPlanOpen, setIsAddToPlanOpen] = useState(false);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const { data, isLoading, error } = useQuery<TestCaseRow[]>({
    queryKey: ["testcases", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const res = await fetch(`/api/testcases?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to load test cases");
      return res.json();
    }
  });

  const { data: testPlans } = useQuery({
    queryKey: ["testplans", projectId],
    enabled: Boolean(projectId) && isAddToPlanOpen,
    queryFn: async () => {
      const res = await fetch(`/api/testplans?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to load test plans");
      return res.json();
    }
  });

  const rows = data ?? [];

  // Filter rows based on search and filters
  const filteredRows = useMemo(() => {
    return rows.filter((tc) => {
      const matchesSearch = searchQuery === "" ||
        tc.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tc.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPriority = priorityFilter === "ALL" || tc.priority === priorityFilter;
      const matchesStatus = statusFilter === "ALL" || tc.status === statusFilter;
      return matchesSearch && matchesPriority && matchesStatus;
    });
  }, [rows, searchQuery, priorityFilter, statusFilter]);

  const hasActiveFilters = searchQuery || priorityFilter !== "ALL" || statusFilter !== "ALL";

  const clearFilters = () => {
    setSearchQuery("");
    setPriorityFilter("ALL");
    setStatusFilter("ALL");
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredRows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRows.map((r) => r.id)));
    }
  };

  const bulkMutation = useMutation({
    mutationFn: async ({ action, data }: { action: "update" | "delete"; data?: any }) => {
      const res = await fetch("/api/testcases/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selectedIds), action, data }),
      });
      if (!res.ok) throw new Error("Bulk action failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["testcases", projectId] });
      setSelectedIds(new Set());
      toast({ title: "Bulk action completed" });
    },
    onError: () => {
      toast({ title: "Bulk action failed" });
    }
  });

  const addToPlanMutation = useMutation({
    mutationFn: async (planId: string) => {
      const res = await fetch(`/api/testplans/${planId}/cases/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseIds: Array.from(selectedIds) }),
      });
      if (!res.ok) throw new Error("Failed to add cases to plan");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `Added ${data.count} cases to plan` });
      setIsAddToPlanOpen(false);
      setSelectedIds(new Set());
    },
    onError: (err) => {
      toast({ title: "Failed to add to plan", description: (err as Error).message });
    }
  });

  const router = useRouter();

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/testcases/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete test case");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Test case deleted" });
      queryClient.invalidateQueries({ queryKey: ["testcases", projectId] });
    },
    onError: (err) => {
      toast({ title: "Failed to delete", description: (err as Error).message });
    }
  });

  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  return (
    <div className="px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Test Cases</h1>
          <p className="text-sm text-muted-foreground">Manage and organize your test scenarios.</p>
        </div>
        <div className="flex gap-3">
          {projectId && <CsvImporter projectId={projectId} />}
          <Link
            href={`/projects/${projectKey}/testcases/new`}
            className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
          >
            New Test Case
          </Link>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by key or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          {PRIORITIES.map(p => (
            <option key={p} value={p}>{p === "ALL" ? "All Priorities" : p}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          {STATUSES.map(s => (
            <option key={s} value={s}>{s === "ALL" ? "All Statuses" : s}</option>
          ))}
        </select>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
          >
            <X className="h-4 w-4" />
            Clear
          </button>
        )}
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-4 rounded-lg border border-primary/20 bg-primary/10 p-3 text-sm text-primary">
          <span className="font-medium">{selectedIds.size} selected</span>
          <div className="h-4 w-px bg-primary/20" />
          <button
            onClick={() => bulkMutation.mutate({ action: "delete" })}
            disabled={bulkMutation.isPending}
            className="flex items-center gap-2 hover:text-primary/80 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
          <div className="h-4 w-px bg-primary/20" />
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wide opacity-70">Set Priority:</span>
            {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((p) => (
              <button
                key={p}
                onClick={() => bulkMutation.mutate({ action: "update", data: { priority: p } })}
                disabled={bulkMutation.isPending}
                className="rounded px-2 py-0.5 text-xs font-medium hover:bg-primary/20"
              >
                {p}
              </button>
            ))}
          </div>
          <div className="h-4 w-px bg-primary/20" />
          <div className="relative">
            <button
              onClick={() => setIsAddToPlanOpen(!isAddToPlanOpen)}
              className="font-medium hover:text-primary/80"
            >
              Add to Plan
            </button>
            {isAddToPlanOpen && (
              <div className="absolute left-0 top-full mt-2 w-64 rounded-xl border border-slate-800 bg-slate-950 p-2 shadow-xl z-10">
                <p className="mb-2 px-2 text-xs font-medium text-slate-500">Select Test Plan</p>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {testPlans?.map((plan: any) => (
                    <button
                      key={plan.id}
                      onClick={() => addToPlanMutation.mutate(plan.id)}
                      disabled={addToPlanMutation.isPending}
                      className="w-full rounded px-2 py-1.5 text-left text-sm text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-50"
                    >
                      {plan.name}
                    </button>
                  ))}
                  {testPlans?.length === 0 && (
                    <p className="px-2 text-sm text-slate-500">No test plans found.</p>
                  )}
                </div>
              </div>
            )}
          </div>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border bg-card/40 overflow-hidden">
        {isLoading ? (
          <div className="p-6">
            <LoadingSkeleton count={5} />
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <FileText className="h-12 w-12 mx-auto text-destructive/50 mb-4" />
            <p className="text-destructive">{(error as Error).message}</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase font-medium text-muted-foreground">
              <tr>
                <th className="w-10 px-6 py-4">
                  <input
                    type="checkbox"
                    checked={filteredRows.length > 0 && selectedIds.size === filteredRows.length}
                    onChange={toggleSelectAll}
                    className="rounded border-slate-700 bg-slate-800 text-primary focus:ring-primary"
                  />
                </th>
                <th className="px-6 py-4">Key</th>
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Priority</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRows.map((testCase) => (
                <tr
                  key={testCase.id}
                  onClick={() => router.push(`/projects/${projectKey}/testcases/${testCase.id}`)}
                  className={`group hover:bg-muted/30 transition-colors cursor-pointer ${selectedIds.has(testCase.id) ? "bg-primary/5" : ""}`}
                >
                  <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(testCase.id)}
                      onChange={() => toggleSelect(testCase.id)}
                      className="rounded border-slate-700 bg-slate-800 text-primary focus:ring-primary"
                    />
                  </td>
                  <td className="px-6 py-4 font-medium text-muted-foreground">{testCase.key}</td>
                  <td className="px-6 py-4 font-medium text-foreground group-hover:text-primary transition-colors">
                    <div className="flex items-center gap-2">
                      <span>{testCase.name}</span>
                      {testCase.isAutomated && (
                        <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-bold text-purple-400 ring-1 ring-inset ring-purple-500/20">
                          AUTO
                        </span>
                      )}
                      {testCase.isFlaky && (
                        <span className="rounded bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-bold text-orange-400 ring-1 ring-inset ring-orange-500/20">
                          FLAKY
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${testCase.priority === 'CRITICAL' ? 'bg-red-400/10 text-red-400 ring-red-400/20' :
                      testCase.priority === 'HIGH' ? 'bg-orange-400/10 text-orange-400 ring-orange-400/20' :
                        testCase.priority === 'MEDIUM' ? 'bg-blue-400/10 text-blue-400 ring-blue-400/20' :
                          'bg-slate-400/10 text-slate-400 ring-slate-400/20'
                      }`}>
                      {testCase.priority}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-muted-foreground">{testCase.status}</td>
                  <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setItemToDelete(testCase.id);
                      }}
                      className="text-slate-500 hover:text-red-400 p-1"
                      title="Delete Test Case"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                    <p className="text-muted-foreground">
                      {hasActiveFilters ? "No test cases match your filters." : "No test cases found. Create one to get started."}
                    </p>
                    {hasActiveFilters && (
                      <button
                        onClick={clearFilters}
                        className="mt-2 text-sm text-primary hover:underline"
                      >
                        Clear filters
                      </button>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Results count */}
      {!isLoading && data && data.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Showing {filteredRows.length} of {data.length} test case{data.length !== 1 ? "s" : ""}
        </p>
      )}

      <ConfirmationDialog
        open={!!itemToDelete}
        onOpenChange={(open) => !open && setItemToDelete(null)}
        title="Delete Test Case"
        description="Are you sure you want to delete this test case? This action cannot be undone."
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
