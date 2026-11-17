"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProjectStore } from "@/lib/stores/project-store";
import { useToast } from "@/components/ui/toast";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

export function EnvironmentsPage() {
    const projectId = useProjectStore((state) => state.projectId);
    const toast = useToast();
    const queryClient = useQueryClient();
    const [isCreating, setIsCreating] = useState(false);
    const [editingEnvironment, setEditingEnvironment] = useState<any>(null);
    const [itemToDelete, setItemToDelete] = useState<string | null>(null);

    const { data: environments, isLoading } = useQuery({
        queryKey: ["environments", projectId],
        enabled: Boolean(projectId),
        queryFn: async () => {
            const res = await fetch(`/api/environments?projectId=${projectId}`);
            if (!res.ok) throw new Error("Failed to load environments");
            return res.json();
        }
    });

    const createMutation = useMutation({
        mutationFn: async (data: { name: string; description?: string; url?: string }) => {
            const res = await fetch("/api/environments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...data, projectId }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || "Failed to create environment");
            }
            return res.json();
        },
        onSuccess: () => {
            toast({ title: "Environment created" });
            setIsCreating(false);
            queryClient.invalidateQueries({ queryKey: ["environments", projectId] });
        },
        onError: (err) => {
            toast({ title: "Failed to create", description: (err as Error).message });
        }
    });

    const updateMutation = useMutation({
        mutationFn: async (data: { id: string; name: string; description?: string; url?: string }) => {
            const res = await fetch(`/api/environments/${data.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: data.name, description: data.description, url: data.url }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || "Failed to update environment");
            }
            return res.json();
        },
        onSuccess: () => {
            toast({ title: "Environment updated" });
            setIsCreating(false);
            setEditingEnvironment(null);
            queryClient.invalidateQueries({ queryKey: ["environments", projectId] });
        },
        onError: (err) => {
            toast({ title: "Failed to update", description: (err as Error).message });
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`/api/environments/${id}`, {
                method: "DELETE",
            });
            if (!res.ok) throw new Error("Failed to delete environment");
            return res.json();
        },
        onSuccess: () => {
            toast({ title: "Environment deleted" });
            queryClient.invalidateQueries({ queryKey: ["environments", projectId] });
        },
        onError: (err) => {
            toast({ title: "Failed to delete", description: (err as Error).message });
        }
    });

    const openCreate = () => {
        setEditingEnvironment(null);
        setIsCreating(true);
    };

    const openEdit = (env: any) => {
        setEditingEnvironment(env);
        setIsCreating(true);
    };

    if (isLoading) return <div className="p-8 text-sm text-slate-500">Loading...</div>;

    return (
        <div className="mx-auto max-w-6xl px-8 py-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-900">Environments</h1>
                    <p className="mt-1 text-sm text-slate-600">Manage test environments for your project.</p>
                </div>
                <button
                    onClick={openCreate}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                    New Environment
                </button>
            </div>

            {isCreating && (
                <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                    <h2 className="mb-4 text-base font-semibold text-slate-900">
                        {editingEnvironment ? "Edit Environment" : "Create Environment"}
                    </h2>
                    <form
                        key={editingEnvironment?.id ?? "new"}
                        onSubmit={(e) => {
                            e.preventDefault();
                            const formData = new FormData(e.currentTarget);
                            const name = formData.get("name") as string;
                            const description = formData.get("description") as string;
                            const url = formData.get("url") as string;

                            if (editingEnvironment) {
                                updateMutation.mutate({ id: editingEnvironment.id, name, description, url });
                            } else {
                                createMutation.mutate({ name, description, url });
                            }
                        }}
                        className="space-y-4"
                    >
                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <label className="text-sm font-medium text-slate-700">Name (e.g., Staging)</label>
                                <input
                                    name="name"
                                    defaultValue={editingEnvironment?.name}
                                    required
                                    className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700">URL (Optional)</label>
                            <input
                                name="url"
                                type="url"
                                defaultValue={editingEnvironment?.url}
                                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700">Description (Optional)</label>
                            <textarea
                                name="description"
                                defaultValue={editingEnvironment?.description}
                                rows={2}
                                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                            />
                        </div>
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setIsCreating(false)}
                                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={createMutation.isPending || updateMutation.isPending}
                                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                                {editingEnvironment ? "Save Changes" : "Create"}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
                {(environments ?? []).map((env: any) => (
                    <div
                        key={env.id}
                        onClick={() => openEdit(env)}
                        className="group relative cursor-pointer rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
                    >
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <span className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                                    {env.key}
                                </span>
                                <h2 className="text-base font-semibold text-slate-900">{env.name}</h2>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setItemToDelete(env.id);
                                    }}
                                    className="rounded p-1.5 text-slate-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                                    title="Delete Environment"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                        {env.url && (
                            <a
                                href={env.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="mt-2 block text-sm text-blue-600 hover:underline"
                            >
                                {env.url}
                            </a>
                        )}
                        <p className="mt-2 text-sm text-slate-600">{env.description || "No description"}</p>
                    </div>
                ))}
                {(environments ?? []).length === 0 && !isCreating && (
                    <div className="col-span-2 rounded-lg border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-500">
                        No environments found. Create one to get started.
                    </div>
                )}
            </div>

            <ConfirmationDialog
                open={!!itemToDelete}
                onOpenChange={(open) => !open && setItemToDelete(null)}
                title="Delete Environment"
                description="Are you sure you want to delete this environment? This action cannot be undone."
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
