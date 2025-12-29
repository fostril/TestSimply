"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useProjectStore } from "@/lib/stores/project-store";
import { useToast } from "@/components/ui/toast";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

export function TestSetsPage() {
    const projectId = useProjectStore((state) => state.projectId);
    const projectKey = useProjectStore((state) => state.projectKey);
    const toast = useToast();
    const queryClient = useQueryClient();
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
        <div className="px-8 py-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-semibold">Test Sets</h1>
                    <p className="text-sm text-slate-400">Group test cases for easier management.</p>
                </div>
                <Link
                    href={`/projects/${projectKey}/test-sets/new`}
                    className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-blue-500"
                >
                    New Set
                </Link>
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
                {(data ?? []).map((set: any) => (
                    <Link key={set.id} href={`/projects/${projectKey}/test-sets/${set.key}`}>
                        <div className="group rounded-2xl border border-slate-800 bg-slate-900/60 p-6 hover:bg-slate-800/80 transition-colors relative">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs uppercase tracking-wide text-slate-500">{set.key}</p>
                                    <h2 className="text-xl font-semibold text-white">{set.name}</h2>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="text-xs text-slate-400">{set._count.cases} cases</span>
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setItemToDelete(set.id);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 p-2 text-slate-500 hover:text-red-400 transition-all"
                                        title="Delete Test Set"
                                    >
                                        <Trash2 className="h-5 w-5" />
                                    </button>
                                </div>
                            </div>
                            <p className="mt-3 text-sm text-slate-400">{set.description || "No description"}</p>
                        </div>
                    </Link>
                ))}
                {(data ?? []).length === 0 && (
                    <div className="col-span-2 py-12 text-center text-slate-500">
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
