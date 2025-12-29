"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useProjectStore } from "@/lib/stores/project-store";
import { useState } from "react";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

export function TestSetDetailsPage({ id, projectKey }: { id: string, projectKey?: string }) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const projectId = useProjectStore((state) => state.projectId);

    const { data: testSet, isLoading } = useQuery({
        queryKey: ["test-set", id],
        queryFn: async () => {
            const res = await fetch(`/api/test-sets/${id}${projectKey ? `?projectKey=${projectKey}` : ""}`);
            if (!res.ok) throw new Error("Failed to load test set");
            return res.json();
        }
    });

    const { data: allCases } = useQuery({
        queryKey: ["testcases", projectId],
        enabled: !!projectId,
        queryFn: async () => {
            const res = await fetch(`/api/testcases?projectId=${projectId}`);
            if (!res.ok) throw new Error("Failed to load test cases");
            return res.json();
        }
    });

    const addCasesMutation = useMutation({
        mutationFn: async (caseIds: string[]) => {
            const res = await fetch(`/api/test-sets/${id}/cases${projectKey ? `?projectKey=${projectKey}` : ""}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ caseIds }),
            });
            if (!res.ok) throw new Error("Failed to add cases");
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["test-set", id] });
        },
    });

    const removeCaseMutation = useMutation({
        mutationFn: async (caseId: string) => {
            const res = await fetch(`/api/test-sets/${id}/cases${projectKey ? `?projectKey=${projectKey}` : ""}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ caseIds: [caseId] }),
            });
            if (!res.ok) throw new Error("Failed to remove case");
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["test-set", id] });
        },
    });

    const deleteSetMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch(`/api/test-sets/${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Failed to delete set");
            return res.json();
        },
        onSuccess: () => {
            router.push("/test-sets");
        },
    });

    const [isAdding, setIsAdding] = useState(false);

    if (isLoading) return <div className="p-8"><LoadingSkeleton count={5} /></div>;
    if (!testSet) return <div className="p-8 text-red-400">Test Set not found</div>;

    const existingCaseIds = new Set((testSet.cases || []).map((c: any) => c.id));
    const availableCases = (allCases || []).filter((c: any) => !existingCaseIds.has(c.id));

    return (
        <div className="mx-auto max-w-5xl px-8 py-10">
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-bold text-slate-300">
                            {testSet.key}
                        </span>
                        <h1 className="text-3xl font-semibold text-white">{testSet.name}</h1>
                    </div>
                    <p className="mt-2 text-slate-400">{testSet.description}</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => router.back()}
                        className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
                    >
                        Back
                    </button>
                    <button
                        onClick={() => {
                            if (confirm("Are you sure you want to delete this Test Set?")) {
                                deleteSetMutation.mutate();
                            }
                        }}
                        className="rounded-full border border-red-900/50 px-4 py-2 text-sm text-red-400 hover:bg-red-900/30"
                    >
                        Delete
                    </button>
                </div>
            </div>

            <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-white">Test Cases ({testSet.cases?.length || 0})</h2>
                    <button
                        onClick={() => setIsAdding(!isAdding)}
                        className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-blue-500"
                    >
                        {isAdding ? "Done" : "Add Cases"}
                    </button>
                </div>

                {isAdding && (
                    <div className="mb-8 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                        <h3 className="mb-3 text-sm font-medium text-slate-300">Select Cases to Add</h3>
                        <div className="max-h-60 overflow-y-auto space-y-2">
                            {availableCases.length === 0 ? (
                                <p className="text-sm text-slate-500">No more cases available to add.</p>
                            ) : (
                                availableCases.map((c: any) => (
                                    <div key={c.id} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 p-3">
                                        <div>
                                            <span className="mr-2 font-mono text-xs text-slate-500">{c.key}</span>
                                            <span className="text-sm text-slate-300">{c.name}</span>
                                        </div>
                                        <button
                                            onClick={() => addCasesMutation.mutate([c.id])}
                                            className="text-xs font-medium text-blue-400 hover:text-blue-300"
                                        >
                                            Add
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                <div className="space-y-3">
                    {(testSet.cases || []).map((c: any) => (
                        <div key={c.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/30 p-4">
                            <div>
                                <span className="mr-3 rounded bg-slate-800 px-2 py-0.5 text-xs font-bold text-slate-300">
                                    {c.key}
                                </span>
                                <span className="font-medium text-slate-200">{c.name}</span>
                            </div>
                            <button
                                onClick={() => removeCaseMutation.mutate(c.id)}
                                className="text-sm text-slate-500 hover:text-red-400"
                            >
                                Remove
                            </button>
                        </div>
                    ))}
                    {(testSet.cases || []).length === 0 && (
                        <p className="text-center text-slate-500 py-8">No test cases in this set yet.</p>
                    )}
                </div>
            </div>
        </div>
    );
}
