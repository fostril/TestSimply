"use client";

import { ReactNode, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { Trash2, Search, X, FileText, Folder as FolderIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useProjectStore } from "@/lib/stores/project-store";
import { CsvImporter } from "@/components/csv-importer";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { FolderTree } from "@/components/folder-tree";

export type TestCaseRow = {
  id: string;
  key: string;
  name: string;
  priority: string;
  status: string;
  type?: "MANUAL" | "CUCUMBER" | "GENERIC";
  folderId?: string | null;
  folder?: { id: string; name: string; path: string } | null;
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
const STATUSES = ["ALL", "Draft", "In Review", "Approved", "Deprecated", "Imported"] as const;

export function TestCasesPage() {
  const projectId = useProjectStore((state) => state.projectId);
  const projectKey = useProjectStore((state) => state.projectKey);
  const toast = useToast();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isAddToPlanOpen, setIsAddToPlanOpen] = useState(false);
  const [isMoveToFolderOpen, setIsMoveToFolderOpen] = useState(false);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  // null = all, "-" = unfiled, else a specific folder id
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<TestCaseRow[]>({
    queryKey: ["testcases", projectId, selectedFolderId, typeFilter],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (projectId) params.set("projectId", projectId);
      if (selectedFolderId) params.set("folderId", selectedFolderId);
      if (typeFilter !== "ALL") params.set("type", typeFilter);
      const res = await fetch(`/api/testcases?${params.toString()}`);
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

  const { data: folders } = useQuery<{ id: string; name: string; path: string }[]>({
    queryKey: ["folders", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const res = await fetch(`/api/folders?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to load folders");
      return res.json();
    }
  });

  const rows = useMemo(() => data ?? [], [data]);

  // Filter rows based on search and filters
  const filteredRows = useMemo(() => {
    return rows.filter((tc) => {
      const matchesSearch = searchQuery === "" ||
        tc.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        tc.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPriority = priorityFilter === "ALL" || tc.priority === priorityFilter;
      const matchesStatus =
        statusFilter === "ALL" || tc.status.toLowerCase() === statusFilter.toLowerCase();
      return matchesSearch && matchesPriority && matchesStatus;
    });
  }, [rows, searchQuery, priorityFilter, statusFilter]);

  const hasActiveFilters =
    searchQuery || priorityFilter !== "ALL" || statusFilter !== "ALL" || typeFilter !== "ALL" || selectedFolderId !== null;

  const clearFilters = () => {
    setSearchQuery("");
    setPriorityFilter("ALL");
    setStatusFilter("ALL");
    setTypeFilter("ALL");
    setSelectedFolderId(null);
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
    mutationFn: async ({
      ids,
      action,
      data,
    }: {
      ids?: string[];
      action: "update" | "delete";
      data?: any;
    }) => {
      const targetIds = ids ?? Array.from(selectedIds);
      const res = await fetch("/api/testcases/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: targetIds, action, data }),
      });
      if (!res.ok) throw new Error("Bulk action failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["testcases", projectId] });
      queryClient.invalidateQueries({ queryKey: ["folders", projectId] });
      setSelectedIds(new Set());
      setIsMoveToFolderOpen(false);
      toast({ title: "Updated test cases" });
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
      queryClient.invalidateQueries({ queryKey: ["folders", projectId] });
    },
    onError: (err) => {
      toast({ title: "Failed to delete", description: (err as Error).message });
    }
  });

  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-8 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Test Cases</h1>
          <p className="mt-1 text-sm text-slate-600">Manage and organize your test scenarios.</p>
        </div>
        <div className="flex gap-3">
          {projectId && <CsvImporter projectId={projectId} />}
          <Link
            href={
              selectedFolderId && selectedFolderId !== "-"
                ? `/projects/${projectKey}/testcases/new?folderId=${encodeURIComponent(selectedFolderId)}`
                : `/projects/${projectKey}/testcases/new`
            }
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            New Test Case
          </Link>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[260px,1fr]">
        <aside>
          {projectId && (
            <FolderTree
              projectId={projectId}
              selectedFolderId={selectedFolderId}
              onSelect={setSelectedFolderId}
              onDropCases={(ids, folderId) =>
                bulkMutation.mutate({
                  ids,
                  action: "update",
                  data: { folderId },
                })
              }
            />
          )}
        </aside>
        <div className="space-y-4">

      {/* Search and Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by key or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          />
        </div>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
        >
          {PRIORITIES.map(p => (
            <option key={p} value={p}>{p === "ALL" ? "All Priorities" : p}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
        >
          {STATUSES.map(s => (
            <option key={s} value={s}>{s === "ALL" ? "All Statuses" : s}</option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
        >
          <option value="ALL">All Types</option>
          <option value="MANUAL">Manual</option>
          <option value="CUCUMBER">Cucumber</option>
          <option value="GENERIC">Generic</option>
        </select>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
            Clear
          </button>
        )}
      </div>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-4 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-slate-900">
          <span className="font-medium">{selectedIds.size} selected</span>
          <div className="h-4 w-px bg-blue-200" />
          <button
            onClick={() => bulkMutation.mutate({ action: "delete" })}
            disabled={bulkMutation.isPending}
            className="flex items-center gap-1.5 font-medium text-red-700 hover:text-red-800 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
          <div className="h-4 w-px bg-blue-200" />
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-600">Set Priority:</span>
            {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((p) => (
              <button
                key={p}
                onClick={() => bulkMutation.mutate({ action: "update", data: { priority: p } })}
                disabled={bulkMutation.isPending}
                className="rounded px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
              >
                {p}
              </button>
            ))}
          </div>
          <div className="h-4 w-px bg-blue-200" />
          <div className="relative">
            <button
              onClick={() => {
                setIsMoveToFolderOpen(!isMoveToFolderOpen);
                setIsAddToPlanOpen(false);
              }}
              className="flex items-center gap-1.5 font-medium text-blue-700 hover:text-blue-800"
            >
              <FolderIcon className="h-3.5 w-3.5" />
              Move to Folder
            </button>
            {isMoveToFolderOpen && (
              <div className="absolute left-0 top-full z-10 mt-2 w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                <p className="mb-2 px-2 text-xs font-medium text-slate-500">Select Destination Folder</p>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  <button
                    onClick={() => bulkMutation.mutate({ action: "update", data: { folderId: null } })}
                    disabled={bulkMutation.isPending}
                    className="w-full rounded px-2 py-1.5 text-left text-sm italic text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
                  >
                    (unfiled)
                  </button>
                  {folders?.map((folder) => (
                    <button
                      key={folder.id}
                      onClick={() => bulkMutation.mutate({ action: "update", data: { folderId: folder.id } })}
                      disabled={bulkMutation.isPending}
                      className="w-full truncate rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
                      title={folder.path}
                    >
                      {folder.path}
                    </button>
                  ))}
                  {(!folders || folders.length === 0) && (
                    <p className="px-2 py-1 text-xs text-slate-400">
                      Create a folder using + in the sidebar first.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="h-4 w-px bg-blue-200" />
          <div className="relative">
            <button
              onClick={() => {
                setIsAddToPlanOpen(!isAddToPlanOpen);
                setIsMoveToFolderOpen(false);
              }}
              className="font-medium text-blue-700 hover:text-blue-800"
            >
              Add to Plan
            </button>
            {isAddToPlanOpen && (
              <div className="absolute left-0 top-full z-10 mt-2 w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                <p className="mb-2 px-2 text-xs font-medium text-slate-500">Select Test Plan</p>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {testPlans?.map((plan: any) => (
                    <button
                      key={plan.id}
                      onClick={() => addToPlanMutation.mutate(plan.id)}
                      disabled={addToPlanMutation.isPending}
                      className="w-full rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
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
            className="ml-auto text-slate-600 hover:text-slate-900"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="p-6">
            <LoadingSkeleton count={5} />
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <FileText className="mx-auto mb-3 h-10 w-10 text-red-400" />
            <p className="text-sm text-red-600">{(error as Error).message}</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-10 px-6 py-3">
                  <input
                    type="checkbox"
                    checked={filteredRows.length > 0 && selectedIds.size === filteredRows.length}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                </th>
                <th className="px-6 py-3">Key</th>
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Priority</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredRows.map((testCase) => (
                <tr
                  key={testCase.id}
                  draggable
                  onDragStart={(e) => {
                    const dragIds = selectedIds.has(testCase.id)
                      ? Array.from(selectedIds)
                      : [testCase.id];
                    e.dataTransfer.setData("application/x-testcase-ids", JSON.stringify(dragIds));
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={() => router.push(`/projects/${projectKey}/testcases/${testCase.id}`)}
                  className={`group cursor-pointer transition-colors hover:bg-slate-50 ${selectedIds.has(testCase.id) ? "bg-blue-50/50" : ""}`}
                >
                  <td className="px-6 py-3.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(testCase.id)}
                      onChange={() => toggleSelect(testCase.id)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                    />
                  </td>
                  <td className="px-6 py-3.5 font-mono text-xs font-semibold text-slate-600">{testCase.key}</td>
                  <td className="px-6 py-3.5 font-medium text-slate-900 transition-colors group-hover:text-blue-600">
                    <div className="flex flex-wrap items-center gap-2">
                      <span>{testCase.name}</span>
                      {testCase.folder && (
                        <span
                          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[11px] font-normal text-slate-600"
                          title={testCase.folder.path}
                        >
                          <FolderIcon className="h-3 w-3 text-amber-500" />
                          {testCase.folder.name}
                        </span>
                      )}
                      {testCase.type && testCase.type !== "MANUAL" && (
                        <span className="rounded border border-cyan-200 bg-cyan-50 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-700">
                          {testCase.type === "CUCUMBER" ? "BDD" : "GEN"}
                        </span>
                      )}
                      {testCase.isAutomated && (
                        <span className="rounded border border-purple-200 bg-purple-50 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700">
                          AUTO
                        </span>
                      )}
                      {testCase.isFlaky && (
                        <span className="rounded border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700">
                          FLAKY
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-3.5">
                    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${testCase.priority === 'CRITICAL' ? 'border-red-200 bg-red-50 text-red-700' :
                      testCase.priority === 'HIGH' ? 'border-orange-200 bg-orange-50 text-orange-700' :
                        testCase.priority === 'MEDIUM' ? 'border-blue-200 bg-blue-50 text-blue-700' :
                          'border-slate-200 bg-slate-100 text-slate-700'
                      }`}>
                      {testCase.priority}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-slate-600">{testCase.status}</td>
                  <td className="px-6 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setItemToDelete(testCase.id);
                      }}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
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
                    <FileText className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                    <p className="text-sm text-slate-500">
                      {hasActiveFilters ? "No test cases match your filters." : "No test cases found. Create one to get started."}
                    </p>
                    {hasActiveFilters && (
                      <button
                        onClick={clearFilters}
                        className="mt-2 text-sm font-medium text-blue-600 hover:underline"
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
      </div>
    </div>
  );
}
