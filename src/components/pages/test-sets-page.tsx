"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useProjectStore } from "@/lib/stores/project-store";
import { useToast } from "@/components/ui/toast";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { usePermissions } from "@/lib/hooks/use-permissions";

export function TestSetsPage() {
    const projectId = useProjectStore((state) => state.projectId);
    const projectKey = useProjectStore((state) => state.projectKey);
    const toast = useToast();
    const queryClient = useQueryClient();
    const { can } = usePermissions();
    const canManageSets = can("testset:manage");
    const [itemToDelete, setItemToDelete] = useState<string | null>(null);

    const { data } = useQuery({
        queryKey: ["test-sets", projectId],
        enabled: Boolean(projectId),
        queryFn: async () => {
            const res = await fetch(`/api/test-sets?projectId=${projectId}`);
            if (!res.ok) throw new Error("Failed to load test sets");
            return res.json();
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`/api/test-sets/${id}`, {
                method: "DELETE",
            });
            if (!res.ok) throw new Error("Failed to delete test set");
            return res.json();
        },
        onSuccess: () => {
            toast({ title: "Test set deleted" });
            queryClient.invalidateQueries({ queryKey: ["test-sets", projectId] });
        },
        onError: (err) => {
            toast({ title: "Failed to delete", description: (err as Error).message });
        }
    });

    return (
        <div className="mx-auto max-w-6xl px-6 py-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-900">Test Sets</h1>
                    <p className="mt-1 text-sm text-slate-600">Group test cases for easier management.</p>
                </div>
                {canManageSets && (
                    <Link
                        href={`/projects/${projectKey}/test-sets/new`}
                        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                        New Set
                    </Link>
                )}
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
                {(data ?? []).map((set: any) => (
                    <Link key={set.id} href={`/projects/${projectKey}/test-sets/${set.key}`}>
                        <div className="group relative rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50/50">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-mono text-xs text-slate-500">{set.key}</p>
                                    <h2 className="text-lg font-semibold text-slate-900">{set.name}</h2>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-slate-500">{set._count.cases} cases</span>
                                    {canManageSets && (
                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setItemToDelete(set.id);
                                            }}
                                            className="rounded p-1.5 text-slate-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                                            title="Delete Test Set"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                            <p className="mt-2 text-sm text-slate-600">{set.description || "No description"}</p>
                        </div>
                    </Link>
                ))}
                {(data ?? []).length === 0 && (
                    <div className="col-span-2 py-12 text-center text-sm text-slate-500">
                        No test sets found. Create one to get started.
                    </div>
                )}
            </div>

            <ConfirmationDialog
                open={!!itemToDelete}
                onOpenChange={(open) => !open && setItemToDelete(null)}
                title="Delete Test Set"
                description="Are you sure you want to delete this test set? This action cannot be undone."
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
