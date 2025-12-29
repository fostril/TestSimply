"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useProjectStore } from "@/lib/stores/project-store";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { ExternalLink } from "lucide-react";

function EnvironmentsManager({ planId, projectId, initialEnvironments }: { planId: string, projectId: string, initialEnvironments: any[] }) {
    const toast = useToast();
    const queryClient = useQueryClient();
    const [isEditing, setIsEditing] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>(initialEnvironments.map(e => e.id));

    const { data: allEnvironments } = useQuery({
        queryKey: ["environments", projectId],
        enabled: !!projectId,
        queryFn: async () => {
            const res = await fetch(`/api/environments?projectId=${projectId}`);
            if (!res.ok) throw new Error("Failed to load environments");
            return res.json();
        }
    });

    const updateMutation = useMutation({
        mutationFn: async (ids: string[]) => {
            const res = await fetch(`/api/testplans/${planId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ environments: ids }),
            });
            if (!res.ok) throw new Error("Failed to update environments");
            return res.json();
        },
        onSuccess: () => {
            toast({ title: "Environments updated" });
            setIsEditing(false);
            queryClient.invalidateQueries({ queryKey: ["testplan", planId] });
        },
        onError: (err) => {
            toast({ title: "Failed to update", description: (err as Error).message });
        }
    });

    if (!isEditing) {
        return (
            <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-2">
                    {initialEnvironments.length === 0 ? (
                        <span className="text-sm text-slate-500">No environments linked.</span>
                    ) : (
                        initialEnvironments.map((env: any) => (
                            <span key={env.id} className="rounded bg-slate-800 px-2 py-1 text-xs font-medium text-slate-300">
                                {env.name}
                            </span>
                        ))
                    )}
                </div>
                <button
                    onClick={() => {
                        setSelectedIds(initialEnvironments.map(e => e.id));
                        setIsEditing(true);
                    }}
                    className="text-sm text-blue-400 hover:text-blue-300"
                >
                    Manage
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {(allEnvironments || []).map((env: any) => (
                    <label key={env.id} className="flex items-center gap-2 rounded border border-slate-800 bg-slate-950 p-3 hover:bg-slate-900 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={selectedIds.includes(env.id)}
                            onChange={(e) => {
                                if (e.target.checked) {
                                    setSelectedIds([...selectedIds, env.id]);
                                } else {
                                    setSelectedIds(selectedIds.filter(id => id !== env.id));
                                }
                            }}
                            className="rounded border-slate-700 bg-slate-900 text-brand focus:ring-brand"
                        />
                        <div className="flex flex-col">
                            <span className="text-sm font-medium text-slate-200">{env.name}</span>
                            <span className="text-xs text-slate-500">{env.key}</span>
                        </div>
                    </label>
                ))}
            </div>
            <div className="flex justify-end gap-2">
                <button
                    onClick={() => setIsEditing(false)}
                    className="rounded px-3 py-1 text-sm text-slate-400 hover:text-white"
                >
                    Cancel
                </button>
                <button
                    onClick={() => updateMutation.mutate(selectedIds)}
                    disabled={updateMutation.isPending}
                    className="rounded bg-brand px-3 py-1 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                >
                    {updateMutation.isPending ? "Saving..." : "Save"}
                </button>
            </div>
        </div>
    );
}

export function TestPlanDetailsPage({ id }: { id: string }) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const toast = useToast();
    const projectId = useProjectStore((state) => state.projectId);

    const { data: testPlan, isLoading } = useQuery({
        queryKey: ["testplan", id],
        queryFn: async () => {
            const res = await fetch(`/api/testplans/${id}`);
            if (!res.ok) throw new Error("Failed to load test plan");
            return res.json();
        }
    });

    const { data: testSets } = useQuery({
        queryKey: ["test-sets", projectId],
        enabled: !!projectId,
        queryFn: async () => {
            const res = await fetch(`/api/test-sets?projectId=${projectId}`);
            if (!res.ok) throw new Error("Failed to load test sets");
            return res.json();
        }
    });

    const importSetMutation = useMutation({
        mutationFn: async (testSetId: string) => {
            const res = await fetch(`/api/testplans/${id}/import-set`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ testSetId }),
            });
            if (!res.ok) throw new Error("Failed to import test set");
            return res.json();
        },
        onSuccess: (data) => {
            toast({ title: `Imported ${data.count} cases.` });
            queryClient.invalidateQueries({ queryKey: ["testplan", id] });
            setIsImporting(false);
        },
        onError: (err) => {
            toast({ title: "Import failed", description: (err as Error).message });
        }
    });

    const removeCaseMutation = useMutation({
        mutationFn: async (caseId: string) => {
            const res = await fetch(`/api/testplans/${id}/cases`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ caseIds: [caseId] }),
            });
            if (!res.ok) throw new Error("Failed to remove case");
            return res.json();
        },
        onSuccess: () => {
            toast({ title: "Case removed from plan" });
            queryClient.invalidateQueries({ queryKey: ["testplan", id] });
        },
        onError: (err) => {
            toast({ title: "Failed to remove", description: (err as Error).message });
        }
    });

    const [workflowUrl, setWorkflowUrl] = useState<string | null>(null);

    const triggerCiMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch(`/api/integrations/ci/trigger`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId, planId: id }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || "Failed to trigger CI");
            }
            return res.json();
        },
        onSuccess: (data) => {
            setWorkflowUrl(data.workflowUrl || null);
            toast({
                title: "CI Workflow Triggered",
                description: data.workflowUrl ? "View the workflow run on GitHub." : "Check your GitHub Actions tab."
            });
        },
        onError: (err) => {
            toast({ title: "Trigger Failed", description: (err as Error).message });
        }
    });

    const [isImporting, setIsImporting] = useState(false);

    if (isLoading) return <div className="p-8"><LoadingSkeleton count={5} /></div>;
    if (!testPlan) return <div className="p-8 text-red-400">Test Plan not found</div>;

    return (
        <div className="mx-auto max-w-5xl px-8 py-10">
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-3">
                        <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-bold text-slate-300">
                            {testPlan.key}
                        </span>
                        <h1 className="text-3xl font-semibold text-white">{testPlan.name}</h1>
                    </div>
                    <p className="mt-2 text-slate-400">{testPlan.description}</p>
                </div>
                <div className="flex gap-2 items-center">
                    <button
                        onClick={() => triggerCiMutation.mutate()}
                        disabled={triggerCiMutation.isPending}
                        className="rounded-full bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-lg hover:bg-purple-700 disabled:opacity-50"
                    >
                        {triggerCiMutation.isPending ? "Triggering..." : "Run in CI"}
                    </button>
                    {workflowUrl && (
                        <a
                            href={workflowUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 rounded-full bg-green-600/10 border border-green-600/20 px-4 py-2 text-sm font-medium text-green-400 hover:bg-green-600/20"
                        >
                            <ExternalLink className="h-4 w-4" />
                            View Workflow
                        </a>
                    )}
                    <button
                        onClick={() => router.back()}
                        className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
                    >
                        Back
                    </button>
                </div>
            </div>

            <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900/50 p-6">
                <h3 className="mb-4 text-lg font-semibold text-white">Environments</h3>
                {projectId && <EnvironmentsManager planId={id} projectId={projectId} initialEnvironments={testPlan.environmentRelations || []} />}
            </div>

            <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-white">Test Cases ({testPlan.cases?.length || 0})</h2>
                    <button
                        onClick={() => setIsImporting(!isImporting)}
                        className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-blue-500"
                    >
                        {isImporting ? "Cancel" : "Import from Test Set"}
                    </button>
                </div>

                {isImporting && (
                    <div className="mb-8 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                        <h3 className="mb-3 text-sm font-medium text-slate-300">Select Test Set to Import</h3>
                        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                            {(testSets || []).map((set: any) => (
                                <button
                                    key={set.id}
                                    onClick={() => {
                                        if (confirm(`Import cases from "${set.name}"?`)) {
                                            importSetMutation.mutate(set.id);
                                        }
                                    }}
                                    className="flex flex-col items-start rounded-lg border border-slate-800 bg-slate-950 p-3 hover:bg-slate-900"
                                >
                                    <span className="text-xs font-bold text-slate-500">{set.key}</span>
                                    <span className="font-medium text-slate-300">{set.name}</span>
                                    <span className="mt-1 text-xs text-slate-500">{set._count.cases} cases</span>
                                </button>
                            ))}
                            {(testSets || []).length === 0 && (
                                <p className="text-sm text-slate-500">No test sets available.</p>
                            )}
                        </div>
                    </div>
                )}

                <div className="space-y-3">
                    {(testPlan.cases || []).map((entry: any, index: number) => {
                        const c = entry.case; // TestCasePlan relation has 'case'
                        const canMoveUp = index > 0;
                        const canMoveDown = index < (testPlan.cases?.length || 0) - 1;

                        const handleMove = async (direction: 'up' | 'down') => {
                            const cases = [...(testPlan.cases || [])];
                            const newIndex = direction === 'up' ? index - 1 : index + 1;
                            [cases[index], cases[newIndex]] = [cases[newIndex], cases[index]];
                            const caseIds = cases.map((e: any) => e.case.id);

                            try {
                                const res = await fetch(`/api/testplans/${id}/reorder`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ caseIds }),
                                });
                                if (!res.ok) throw new Error('Failed to reorder');
                                queryClient.invalidateQueries({ queryKey: ['testplan', id] });
                            } catch (err) {
                                toast({ title: 'Failed to reorder', description: (err as Error).message });
                            }
                        };

                        return (
                            <div key={c.id} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/30 p-4 group">
                                <div className="flex items-center gap-3">
                                    <div className="flex flex-col gap-1">
                                        <button
                                            onClick={() => handleMove('up')}
                                            disabled={!canMoveUp}
                                            className="p-1 text-slate-500 hover:text-white disabled:opacity-30 disabled:hover:text-slate-500"
                                            title="Move up"
                                        >
                                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                            </svg>
                                        </button>
                                        <button
                                            onClick={() => handleMove('down')}
                                            disabled={!canMoveDown}
                                            className="p-1 text-slate-500 hover:text-white disabled:opacity-30 disabled:hover:text-slate-500"
                                            title="Move down"
                                        >
                                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>
                                    </div>
                                    <div>
                                        <span className="mr-3 rounded bg-slate-800 px-2 py-0.5 text-xs font-bold text-slate-300">
                                            {c.key}
                                        </span>
                                        <span className="font-medium text-slate-200">{c.name}</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => removeCaseMutation.mutate(c.id)}
                                    className="text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Remove from plan"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        );
                    })}
                    {(testPlan.cases || []).length === 0 && (
                        <p className="text-center text-slate-500 py-8">No test cases in this plan yet.</p>
                    )}
                </div>
            </div>
        </div>
    );
}
