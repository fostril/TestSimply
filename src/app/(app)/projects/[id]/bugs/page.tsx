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

    const { data, isLoading, error } = useQuery<BugData[]>({
        queryKey: ["bugs", projectId],
        enabled: Boolean(projectId),
        queryFn: async () => {
            const res = await fetch(`/api/bugs?projectId=${projectId}`);
            if (!res.ok) throw new Error("Failed to load bugs");
            return res.json();
        }
    });

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
        <div className="px-8 py-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Bugs</h1>
                    <p className="text-sm text-muted-foreground">Track defects and issues.</p>
                </div>
                <Link
                    href={`/projects/${projectKey}/bugs/new`}
                    className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
                >
                    Report Bug
                </Link>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px] max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search by key or summary..."
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
                        <option key={s} value={s}>{s === "ALL" ? "All Statuses" : s.replace("_", " ")}</option>
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
                <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
                    <span className="text-sm text-foreground font-medium">
                        {selectedIds.size} selected
                    </span>
                    <button
                        onClick={() => setShowBulkDelete(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                        <Trash2 className="h-4 w-4" />
                        Delete Selected
                    </button>
                    <button
                        onClick={() => setSelectedIds(new Set())}
                        className="px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            )}

            {/* Table */}
            <div className="overflow-hidden rounded-2xl border border-border bg-card/50">
                {isLoading ? (
                    <div className="p-6">
                        <LoadingSkeleton count={5} />
                    </div>
                ) : error ? (
                    <div className="p-8 text-center">
                        <Bug className="h-12 w-12 mx-auto text-destructive/50 mb-4" />
                        <p className="text-destructive">{(error as Error).message}</p>
                    </div>
                ) : (
                    <table className="min-w-full divide-y divide-border text-sm">
                        <thead className="bg-card/80">
                            <tr>
                                <th className="px-4 py-3 text-left w-10">
                                    <input
                                        type="checkbox"
                                        checked={filteredBugs.length > 0 && selectedIds.size === filteredBugs.length}
                                        onChange={toggleSelectAll}
                                        className="rounded border-border bg-card text-primary focus:ring-primary"
                                    />
                                </th>
                                <th className="px-4 py-3 text-left font-medium uppercase tracking-wide text-muted-foreground">Key</th>
                                <th className="px-4 py-3 text-left font-medium uppercase tracking-wide text-muted-foreground">Summary</th>
                                <th className="px-4 py-3 text-left font-medium uppercase tracking-wide text-muted-foreground">Priority</th>
                                <th className="px-4 py-3 text-left font-medium uppercase tracking-wide text-muted-foreground">Status</th>
                                <th className="px-4 py-3 text-left w-10"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {filteredBugs.map((bug) => (
                                <tr
                                    key={bug.id}
                                    className="hover:bg-card/60 cursor-pointer transition-colors group"
                                >
                                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(bug.id)}
                                            onChange={() => toggleSelect(bug.id)}
                                            className="rounded border-border bg-card text-primary focus:ring-primary"
                                        />
                                    </td>
                                    <td
                                        className="px-4 py-3 text-foreground font-medium"
                                        onClick={() => router.push(`/projects/${projectKey}/bugs/${bug.key}`)}
                                    >
                                        {bug.key}
                                    </td>
                                    <td
                                        className="px-4 py-3 text-foreground"
                                        onClick={() => router.push(`/projects/${projectKey}/bugs/${bug.key}`)}
                                    >
                                        {bug.summary}
                                    </td>
                                    <td
                                        className="px-4 py-3"
                                        onClick={() => router.push(`/projects/${projectKey}/bugs/${bug.key}`)}
                                    >
                                        <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${bug.priority === 'CRITICAL' ? 'bg-red-400/10 text-red-400 ring-red-400/20' :
                                            bug.priority === 'HIGH' ? 'bg-orange-400/10 text-orange-400 ring-orange-400/20' :
                                                bug.priority === 'MEDIUM' ? 'bg-blue-400/10 text-blue-400 ring-blue-400/20' :
                                                    'bg-muted text-muted-foreground ring-muted'
                                            }`}>
                                            {bug.priority}
                                        </span>
                                    </td>
                                    <td
                                        className="px-4 py-3"
                                        onClick={() => router.push(`/projects/${projectKey}/bugs/${bug.key}`)}
                                    >
                                        <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${bug.status === 'RESOLVED' || bug.status === 'CLOSED' ? 'bg-green-400/10 text-green-400 ring-green-400/20' :
                                            bug.status === 'IN_PROGRESS' ? 'bg-blue-400/10 text-blue-400 ring-blue-400/20' :
                                                'bg-muted text-muted-foreground ring-muted'
                                            }`}>
                                            {bug.status.replace("_", " ")}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                        <button
                                            onClick={() => setItemToDelete(bug.id)}
                                            className="opacity-0 group-hover:opacity-100 p-2 text-muted-foreground hover:text-red-400 transition-all"
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
                                        <Bug className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                                        <p className="text-muted-foreground">
                                            {hasActiveFilters ? "No bugs match your filters." : "No bugs found. Report one to get started."}
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
                    Showing {filteredBugs.length} of {data.length} bug{data.length !== 1 ? "s" : ""}
                </p>
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
