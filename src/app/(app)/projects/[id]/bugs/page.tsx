"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useProjectStore } from "@/lib/stores/project-store";
import { useRouter } from "next/navigation";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { useToast } from "@/components/ui/toast";
import { Search, Trash2, X, Bug } from "lucide-react";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { DEFAULT_PAGE_LIMIT, fetchPaginated, type PaginatedResult } from "@/lib/pagination";

type BugData = {
    id: string;
    key: string;
    summary: string;
    priority: string;
    status: string;
};

const PRIORITIES = ["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
const STATUSES = ["ALL", "OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;

export default function BugsPage() {
    const projectId = useProjectStore((state) => state.projectId);
    const projectKey = useProjectStore((state) => state.projectKey);
    const router = useRouter();
    const toast = useToast();
    const queryClient = useQueryClient();

    const [searchQuery, setSearchQuery] = useState("");
    const [priorityFilter, setPriorityFilter] = useState<string>("ALL");
    const [statusFilter, setStatusFilter] = useState<string>("ALL");
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [itemToDelete, setItemToDelete] = useState<string | null>(null);
    const [showBulkDelete, setShowBulkDelete] = useState(false);
    const [page, setPage] = useState(1);

    const { data: paginated, isLoading, error } = useQuery<PaginatedResult<BugData>>({
        queryKey: ["bugs", projectId, page],
        enabled: Boolean(projectId),
        queryFn: () =>
            fetchPaginated<BugData>(
                `/api/bugs?projectId=${projectId}&page=${page}&limit=${DEFAULT_PAGE_LIMIT}`,
                "Failed to load bugs"
            ),
    });
    const data = paginated?.items;

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`/api/bugs/${id}`, {
                method: "DELETE",
            });
            if (!res.ok) throw new Error("Failed to delete bug");
            return res.json();
        },
        onSuccess: () => {
            toast({ title: "Bug deleted" });
            queryClient.invalidateQueries({ queryKey: ["bugs", projectId] });
        },
        onError: (err) => {
            toast({ title: "Failed to delete", description: (err as Error).message });
        }
    });

    const bulkDeleteMutation = useMutation({
        mutationFn: async (ids: string[]) => {
            const results = await Promise.all(
                ids.map(id =>
                    fetch(`/api/bugs/${id}`, { method: "DELETE" })
                )
            );
            const failed = results.filter(r => !r.ok).length;
            if (failed > 0) throw new Error(`Failed to delete ${failed} bug(s)`);
            return { deleted: ids.length };
        },
        onSuccess: (data) => {
            toast({ title: `Deleted ${data.deleted} bug(s)` });
            queryClient.invalidateQueries({ queryKey: ["bugs", projectId] });
            setSelectedIds(new Set());
        },
        onError: (err) => {
            toast({ title: "Failed to delete", description: (err as Error).message });
        }
    });

    const filteredBugs = useMemo(() => {
        if (!data) return [];
        return data.filter((bug) => {
            const matchesSearch = searchQuery === "" ||
                bug.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
                bug.summary.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesPriority = priorityFilter === "ALL" || bug.priority === priorityFilter;
            const matchesStatus = statusFilter === "ALL" || bug.status === statusFilter;
            return matchesSearch && matchesPriority && matchesStatus;
        });
    }, [data, searchQuery, priorityFilter, statusFilter]);

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredBugs.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredBugs.map(b => b.id)));
        }
    };

    const hasActiveFilters = searchQuery || priorityFilter !== "ALL" || statusFilter !== "ALL";

    const clearFilters = () => {
        setSearchQuery("");
        setPriorityFilter("ALL");
        setStatusFilter("ALL");
    };

    return (
        <div className="mx-auto max-w-6xl space-y-6 px-8 py-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Bugs</h1>
                    <p className="mt-1 text-sm text-slate-600">Track defects and issues.</p>
                </div>
                <Link
                    href={`/projects/${projectKey}/bugs/new`}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                    Report Bug
                </Link>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[200px] max-w-md flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search by key or summary..."
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
                        <option key={s} value={s}>{s === "ALL" ? "All Statuses" : s.replace("_", " ")}</option>
                    ))}
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
                <div className="flex items-center gap-3 rounded-md border border-blue-200 bg-blue-50 p-3">
                    <span className="text-sm font-medium text-slate-900">
                        {selectedIds.size} selected
                    </span>
                    <button
                        onClick={() => setShowBulkDelete(true)}
                        className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
                    >
                        <Trash2 className="h-4 w-4" />
                        Delete Selected
                    </button>
                    <button
                        onClick={() => setSelectedIds(new Set())}
                        className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900"
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
                        <Bug className="mx-auto mb-3 h-10 w-10 text-red-400" />
                        <p className="text-sm text-red-600">{(error as Error).message}</p>
                    </div>
                ) : (
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="w-10 px-4 py-3 text-left">
                                    <input
                                        type="checkbox"
                                        checked={filteredBugs.length > 0 && selectedIds.size === filteredBugs.length}
                                        onChange={toggleSelectAll}
                                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                                    />
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Key</th>
                                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Summary</th>
                                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Priority</th>
                                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Status</th>
                                <th className="w-10 px-4 py-3 text-left"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                            {filteredBugs.map((bug) => (
                                <tr
                                    key={bug.id}
                                    className="group cursor-pointer transition-colors hover:bg-slate-50"
                                >
                                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(bug.id)}
                                            onChange={() => toggleSelect(bug.id)}
                                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                                        />
                                    </td>
                                    <td
                                        className="px-4 py-3 font-mono text-xs font-semibold text-slate-900"
                                        onClick={() => router.push(`/projects/${projectKey}/bugs/${bug.key}`)}
                                    >
                                        {bug.key}
                                    </td>
                                    <td
                                        className="px-4 py-3 text-slate-900"
                                        onClick={() => router.push(`/projects/${projectKey}/bugs/${bug.key}`)}
                                    >
                                        {bug.summary}
                                    </td>
                                    <td
                                        className="px-4 py-3"
                                        onClick={() => router.push(`/projects/${projectKey}/bugs/${bug.key}`)}
                                    >
                                        <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${bug.priority === 'CRITICAL' ? 'border-red-200 bg-red-50 text-red-700' :
                                            bug.priority === 'HIGH' ? 'border-orange-200 bg-orange-50 text-orange-700' :
                                                bug.priority === 'MEDIUM' ? 'border-blue-200 bg-blue-50 text-blue-700' :
                                                    'border-slate-200 bg-slate-100 text-slate-700'
                                            }`}>
                                            {bug.priority}
                                        </span>
                                    </td>
                                    <td
                                        className="px-4 py-3"
                                        onClick={() => router.push(`/projects/${projectKey}/bugs/${bug.key}`)}
                                    >
                                        <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${bug.status === 'RESOLVED' || bug.status === 'CLOSED' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
                                            bug.status === 'IN_PROGRESS' ? 'border-blue-200 bg-blue-50 text-blue-700' :
                                                'border-slate-200 bg-slate-100 text-slate-700'
                                            }`}>
                                            {bug.status.replace("_", " ")}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                        <button
                                            onClick={() => setItemToDelete(bug.id)}
                                            className="rounded p-1.5 text-slate-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                                            title="Delete Bug"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {filteredBugs.length === 0 && !isLoading && (
                                <tr>
                                    <td colSpan={6} className="px-4 py-12 text-center">
                                        <Bug className="mx-auto mb-3 h-10 w-10 text-slate-300" />
                                        <p className="text-sm text-slate-500">
                                            {hasActiveFilters ? "No bugs match your filters." : "No bugs found. Report one to get started."}
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

            {/* Pagination & results summary */}
            {!isLoading && paginated && (
                <PaginationControls
                    page={paginated.page}
                    totalPages={paginated.totalPages}
                    total={paginated.total}
                    limit={paginated.limit}
                    onPageChange={(nextPage) => {
                        setPage(nextPage);
                        setSelectedIds(new Set());
                    }}
                />
            )}

            {/* Single Delete Confirmation */}
            <ConfirmationDialog
                open={!!itemToDelete}
                onOpenChange={(open) => !open && setItemToDelete(null)}
                title="Delete Bug"
                description="Are you sure you want to delete this bug? This action cannot be undone."
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

            {/* Bulk Delete Confirmation */}
            <ConfirmationDialog
                open={showBulkDelete}
                onOpenChange={setShowBulkDelete}
                title="Delete Selected Bugs"
                description={`Are you sure you want to delete ${selectedIds.size} bug(s)? This action cannot be undone.`}
                confirmLabel="Delete All"
                variant="destructive"
                onConfirm={() => {
                    bulkDeleteMutation.mutate(Array.from(selectedIds));
                    setShowBulkDelete(false);
                }}
                isLoading={bulkDeleteMutation.isPending}
            />
        </div>
    );
}
