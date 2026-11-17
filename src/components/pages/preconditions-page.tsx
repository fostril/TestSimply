"use client";

import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { useProjectStore } from "@/lib/stores/project-store";
import { Trash2 } from "lucide-react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

export function PreconditionsPage() {
    const projectId = useProjectStore((state) => state.projectId);
    const toast = useToast();
    const queryClient = useQueryClient();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPrecondition, setEditingPrecondition] = useState<any>(null);
    const [itemToDelete, setItemToDelete] = useState<string | null>(null);

    const { data } = useQuery({
        queryKey: ["preconditions", projectId],
        enabled: Boolean(projectId),
        queryFn: async () => {
            const res = await fetch(`/api/preconditions?projectId=${projectId}`);
            if (!res.ok) throw new Error("Failed to load preconditions");
            return res.json();
        }
    });

    const createMutation = useMutation({
        mutationFn: async (data: { name: string; description?: string }) => {
            const res = await fetch("/api/preconditions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...data, projectId }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || "Failed to create precondition");
            }
            return res.json();
        },
        onSuccess: () => {
            toast({ title: "Precondition created" });
            setIsModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ["preconditions", projectId] });
        },
        onError: (err) => {
            toast({ title: "Failed to create", description: (err as Error).message });
        }
    });

    const updateMutation = useMutation({
        mutationFn: async (data: { id: string; name: string; description?: string }) => {
            const res = await fetch(`/api/preconditions/${data.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: data.name, description: data.description }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || "Failed to update precondition");
            }
            return res.json();
        },
        onSuccess: () => {
            toast({ title: "Precondition updated" });
            setIsModalOpen(false);
            setEditingPrecondition(null);
            queryClient.invalidateQueries({ queryKey: ["preconditions", projectId] });
        },
        onError: (err) => {
            toast({ title: "Failed to update", description: (err as Error).message });
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`/api/preconditions/${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Failed to delete precondition");
            return res.json();
        },
        onSuccess: () => {
            toast({ title: "Precondition deleted" });
            queryClient.invalidateQueries({ queryKey: ["preconditions", projectId] });
        },
    });

    const openCreateModal = () => {
        setEditingPrecondition(null);
        setIsModalOpen(true);
    };

    const openEditModal = (pre: any) => {
        setEditingPrecondition(pre);
        setIsModalOpen(true);
    };

    return (
        <div className="mx-auto max-w-6xl px-8 py-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-900">Preconditions</h1>
                    <p className="mt-1 text-sm text-slate-600">Manage reusable preconditions for test cases.</p>
                </div>
                <button
                    onClick={openCreateModal}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                    New Precondition
                </button>
            </div>

            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
                    <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-lg">
                        <h2 className="text-lg font-semibold text-slate-900">
                            {editingPrecondition ? "Edit Precondition" : "Create Precondition"}
                        </h2>
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                const formData = new FormData(e.currentTarget);
                                const name = formData.get("name") as string;
                                const description = formData.get("description") as string;

                                if (editingPrecondition) {
                                    updateMutation.mutate({ id: editingPrecondition.id, name, description });
                                } else {
                                    createMutation.mutate({ name, description });
                                }
                            }}
                            className="mt-4 space-y-4"
                        >
                            <div>
                                <label className="text-sm font-medium text-slate-700">Name</label>
                                <input
                                    name="name"
                                    defaultValue={editingPrecondition?.name}
                                    required
                                    className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-700">Description</label>
                                <textarea
                                    name="description"
                                    defaultValue={editingPrecondition?.description}
                                    rows={3}
                                    className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                                />
                            </div>
                            <div className="mt-6 flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={createMutation.isPending || updateMutation.isPending}
                                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {editingPrecondition ? "Save Changes" : "Create"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
                {(data ?? []).map((pre: any) => (
                    <div
                        key={pre.id}
                        onClick={() => openEditModal(pre)}
                        className="group relative cursor-pointer rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="font-mono text-xs font-semibold uppercase tracking-wide text-slate-500">{pre.key}</p>
                                <h2 className="mt-1 text-base font-semibold text-slate-900">{pre.name}</h2>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                                    {pre._count.cases} linked cases
                                </span>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setItemToDelete(pre.id);
                                    }}
                                    className="rounded p-1.5 text-slate-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                                    title="Delete Precondition"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                        <p className="mt-2.5 text-sm text-slate-600">{pre.description || "No description"}</p>
                    </div>
                ))}
                {(data ?? []).length === 0 && (
                    <div className="col-span-2 rounded-lg border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-500">
                        No preconditions found. Create one to get started.
                    </div>
                )}
            </div>

            <ConfirmationDialog
                open={!!itemToDelete}
                onOpenChange={(open) => !open && setItemToDelete(null)}
                title="Delete Precondition"
                description="Are you sure you want to delete this precondition? This action cannot be undone."
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
