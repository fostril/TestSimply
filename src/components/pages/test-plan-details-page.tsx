"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useProjectStore } from "@/lib/stores/project-store";
import { useMemo, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { ExternalLink, Play, Plus, Search } from "lucide-react";

function EnvironmentsManager({
    planId,
    projectId,
    initialEnvironments,
}: {
    planId: string;
    projectId: string;
    initialEnvironments: any[];
}) {
    const toast = useToast();
    const queryClient = useQueryClient();
    const [isEditing, setIsEditing] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>(initialEnvironments.map((e) => e.id));

    const { data: allEnvironments } = useQuery({
        queryKey: ["environments", projectId],
        enabled: !!projectId,
        queryFn: async () => {
            const res = await fetch(`/api/environments?projectId=${projectId}`);
            if (!res.ok) throw new Error("Failed to load environments");
            return res.json();
        },
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
        },
    });

    if (!isEditing) {
        return (
            <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-2">
                    {initialEnvironments.length === 0 ? (
                        <span className="text-sm text-slate-500">No environments linked.</span>
                    ) : (
                        initialEnvironments.map((env: any) => (
                            <span
                                key={env.id}
                                className="rounded border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700"
                            >
                                {env.name}
                            </span>
                        ))
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => {
                        setSelectedIds(initialEnvironments.map((e) => e.id));
                        setIsEditing(true);
                    }}
                    className="text-sm font-medium text-blue-600 hover:text-blue-700"
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
                    <label
                        key={env.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 hover:bg-slate-100"
                    >
                        <input
                            type="checkbox"
                            checked={selectedIds.includes(env.id)}
                            onChange={(e) => {
                                if (e.target.checked) {
                                    setSelectedIds([...selectedIds, env.id]);
                                } else {
                                    setSelectedIds(selectedIds.filter((id) => id !== env.id));
                                }
                            }}
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                        />
                        <div className="flex flex-col">
                            <span className="text-sm font-medium text-slate-900">{env.name}</span>
                            <span className="font-mono text-xs text-slate-500">{env.key}</span>
                        </div>
                    </label>
                ))}
            </div>
            <div className="flex justify-end gap-2">
                <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={() => updateMutation.mutate(selectedIds)}
                    disabled={updateMutation.isPending}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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
    const projectKey = useProjectStore((state) => state.projectKey);

    const [isImporting, setIsImporting] = useState(false);
    const [setToImport, setSetToImport] = useState<{ id: string; name: string } | null>(null);
    const [isAddingCases, setIsAddingCases] = useState(false);
    const [caseSearch, setCaseSearch] = useState("");
    const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);

    const { data: testPlan, isLoading } = useQuery({
        queryKey: ["testplan", id],
        queryFn: async () => {
            const res = await fetch(`/api/testplans/${id}`);
            if (!res.ok) throw new Error("Failed to load test plan");
            return res.json();
        },
    });

    const { data: testSets } = useQuery({
        queryKey: ["test-sets", projectId],
        enabled: !!projectId && isImporting,
        queryFn: async () => {
            const res = await fetch(`/api/test-sets?projectId=${projectId}`);
            if (!res.ok) throw new Error("Failed to load test sets");
            return res.json();
        },
    });

    const { data: allCases } = useQuery({
        queryKey: ["testcases", projectId, "plan-picker"],
        enabled: !!projectId && isAddingCases,
        queryFn: async () => {
            const res = await fetch(`/api/testcases?projectId=${projectId}&limit=200`);
            if (!res.ok) throw new Error("Failed to load test cases");
            return res.json();
        },
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
            toast({
                title: `Imported ${data.count ?? 0} cases.`,
                ...(data.message ? { description: data.message } : {}),
            });
            queryClient.invalidateQueries({ queryKey: ["testplan", id] });
            setIsImporting(false);
            setSetToImport(null);
        },
        onError: (err) => {
            toast({ title: "Import failed", description: (err as Error).message });
        },
    });

    const addCasesMutation = useMutation({
        mutationFn: async (caseIds: string[]) => {
            const res = await fetch(`/api/testplans/${id}/cases/add`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ caseIds }),
            });
            if (!res.ok) throw new Error("Failed to add test cases");
            return res.json();
        },
        onSuccess: (data) => {
            toast({ title: `Added ${data.count ?? selectedCaseIds.length} test case(s) to plan` });
            setSelectedCaseIds([]);
            queryClient.invalidateQueries({ queryKey: ["testplan", id] });
            queryClient.invalidateQueries({ queryKey: ["testplans", projectId] });
        },
        onError: (err) => {
            toast({ title: "Failed to add cases", description: (err as Error).message });
        },
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
        },
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
            queryClient.invalidateQueries({ queryKey: ["executions", projectId] });
            const execDesc = data.executionKey ? `Execution ${data.executionKey} started.` : undefined;
            toast({
                title: "CI Workflow Triggered",
                description:
                    execDesc ||
                    (data.workflowUrl
                        ? "View the workflow run in your CI provider."
                        : "Check your CI provider dashboard."),
            });
        },
        onError: (err) => {
            toast({ title: "Trigger Failed", description: (err as Error).message });
        },
    });

    const [isEditingMeta, setIsEditingMeta] = useState(false);
    const [editName, setEditName] = useState("");
    const [editDescription, setEditDescription] = useState("");
    const [editVersions, setEditVersions] = useState("");
    const [editTags, setEditTags] = useState("");

    const updateMetaMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch(`/api/testplans/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: editName.trim(),
                    description: editDescription,
                    targetVersions: editVersions
                        .split(",")
                        .map((v) => v.trim())
                        .filter(Boolean),
                    tags: editTags
                        .split(",")
                        .map((t) => t.trim())
                        .filter(Boolean),
                }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || "Failed to update test plan");
            }
            return res.json();
        },
        onSuccess: () => {
            toast({ title: "Test plan updated" });
            setIsEditingMeta(false);
            queryClient.invalidateQueries({ queryKey: ["testplan", id] });
            queryClient.invalidateQueries({ queryKey: ["testplans", projectId] });
        },
        onError: (err) => {
            toast({ title: "Update failed", description: (err as Error).message });
        },
    });

    const existingCaseIds = useMemo(
        () => new Set((testPlan?.cases || []).map((entry: any) => entry.case?.id).filter(Boolean)),
        [testPlan?.cases]
    );

    const availableCases = useMemo(() => {
        const q = caseSearch.trim().toLowerCase();
        return (allCases || []).filter((c: any) => {
            if (existingCaseIds.has(c.id)) return false;
            if (!q) return true;
            return c.key?.toLowerCase().includes(q) || c.name?.toLowerCase().includes(q);
        });
    }, [allCases, existingCaseIds, caseSearch]);

    if (isLoading)
        return (
            <div className="p-8">
                <LoadingSkeleton count={5} />
            </div>
        );
    if (!testPlan) return <div className="p-8 text-sm text-red-600">Test Plan not found</div>;

    return (
        <div className="mx-auto max-w-5xl px-8 py-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                        <span className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                            {testPlan.key}
                        </span>
                        <h1 className="text-2xl font-semibold text-slate-900">{testPlan.name}</h1>
                    </div>
                    {testPlan.description && (
                        <p className="mt-1.5 text-sm text-slate-600">{testPlan.description}</p>
                    )}
                    {((testPlan.targetVersions?.length ?? 0) > 0 || (testPlan.tags?.length ?? 0) > 0) && (
                        <div className="mt-2.5 flex flex-wrap gap-2">
                            {(testPlan.targetVersions ?? []).map((ver: string) => (
                                <span
                                    key={`v-${ver}`}
                                    className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700"
                                >
                                    v{ver}
                                </span>
                            ))}
                            {(testPlan.tags ?? []).map((tag: string) => (
                                <span
                                    key={`t-${tag}`}
                                    className="rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                                >
                                    #{tag}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {projectKey && (
                        <Link
                            href={`/projects/${projectKey}/executions/new?planId=${encodeURIComponent(id)}`}
                            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                        >
                            <Play className="h-4 w-4" />
                            Start Execution
                        </Link>
                    )}
                    <button
                        type="button"
                        onClick={() => triggerCiMutation.mutate()}
                        disabled={triggerCiMutation.isPending}
                        className="rounded-md bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                    >
                        {triggerCiMutation.isPending ? "Triggering..." : "Run in CI"}
                    </button>
                    {workflowUrl && (
                        <a
                            href={workflowUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
                        >
                            <ExternalLink className="h-4 w-4" />
                            View Workflow
                        </a>
                    )}
                    <button
                        type="button"
                        onClick={() => {
                            setEditName(testPlan.name ?? "");
                            setEditDescription(testPlan.description ?? "");
                            setEditVersions((testPlan.targetVersions ?? []).join(", "));
                            setEditTags((testPlan.tags ?? []).join(", "));
                            setIsEditingMeta(!isEditingMeta);
                        }}
                        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                        {isEditingMeta ? "Close" : "Edit"}
                    </button>
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                        Back
                    </button>
                </div>
            </div>

            {isEditingMeta && (
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (!editName.trim()) {
                            toast({ title: "Plan name is required" });
                            return;
                        }
                        updateMetaMutation.mutate();
                    }}
                    className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
                >
                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="block text-xs font-medium text-slate-700">Name</label>
                            <input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-700">
                                Target Versions (comma separated)
                            </label>
                            <input
                                value={editVersions}
                                onChange={(e) => setEditVersions(e.target.value)}
                                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                            />
                        </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="block text-xs font-medium text-slate-700">Description</label>
                            <textarea
                                value={editDescription}
                                onChange={(e) => setEditDescription(e.target.value)}
                                rows={2}
                                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-slate-700">
                                Tags (comma separated)
                            </label>
                            <input
                                value={editTags}
                                onChange={(e) => setEditTags(e.target.value)}
                                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={() => setIsEditingMeta(false)}
                            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={updateMetaMutation.isPending}
                            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                            {updateMetaMutation.isPending ? "Saving..." : "Save Plan"}
                        </button>
                    </div>
                </form>
            )}

            <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-base font-semibold text-slate-900">Environments</h3>
                {projectId && (
                    <EnvironmentsManager
                        planId={id}
                        projectId={projectId}
                        initialEnvironments={testPlan.environmentRelations || []}
                    />
                )}
            </div>

            <div className="mt-8">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold text-slate-900">
                        Test Cases ({testPlan.cases?.length || 0})
                    </h2>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => {
                                setIsAddingCases(!isAddingCases);
                                setIsImporting(false);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                            <Plus className="h-4 w-4" />
                            {isAddingCases ? "Close Case Picker" : "Add Test Cases"}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setIsImporting(!isImporting);
                                setIsAddingCases(false);
                            }}
                            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                        >
                            {isImporting ? "Cancel" : "Import from Test Set"}
                        </button>
                    </div>
                </div>

                {isAddingCases && (
                    <div className="mb-6 space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="relative min-w-[220px] flex-1">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    value={caseSearch}
                                    onChange={(e) => setCaseSearch(e.target.value)}
                                    placeholder="Search test cases by key or name..."
                                    className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                                />
                            </div>
                            <button
                                type="button"
                                disabled={selectedCaseIds.length === 0 || addCasesMutation.isPending}
                                onClick={() => addCasesMutation.mutate(selectedCaseIds)}
                                className="rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                                {addCasesMutation.isPending
                                    ? "Adding..."
                                    : `Add Selected (${selectedCaseIds.length})`}
                            </button>
                        </div>
                        <div className="max-h-60 space-y-1.5 overflow-y-auto">
                            {availableCases.length === 0 ? (
                                <p className="py-4 text-center text-sm text-slate-500">
                                    No matching test cases available to add.
                                </p>
                            ) : (
                                availableCases.map((c: any) => {
                                    const checked = selectedCaseIds.includes(c.id);
                                    return (
                                        <div
                                            key={c.id}
                                            className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2"
                                        >
                                            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setSelectedCaseIds((prev) => [...prev, c.id]);
                                                        } else {
                                                            setSelectedCaseIds((prev) =>
                                                                prev.filter((id) => id !== c.id)
                                                            );
                                                        }
                                                    }}
                                                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                                                />
                                                <span className="font-mono text-xs font-medium text-slate-500">
                                                    {c.key}
                                                </span>
                                                <span className="truncate text-sm text-slate-900">{c.name}</span>
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => addCasesMutation.mutate([c.id])}
                                                disabled={addCasesMutation.isPending}
                                                className="ml-3 shrink-0 text-xs font-medium text-blue-600 hover:text-blue-700"
                                            >
                                                Add
                                            </button>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}

                {isImporting && (
                    <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                        <h3 className="mb-3 text-sm font-medium text-slate-700">Select Test Set to Import</h3>
                        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                            {(testSets || []).map((set: any) => (
                                <button
                                    key={set.id}
                                    type="button"
                                    onClick={() => setSetToImport({ id: set.id, name: set.name })}
                                    className="flex flex-col items-start rounded-md border border-slate-200 bg-slate-50 p-3 text-left hover:border-blue-300 hover:bg-blue-50"
                                >
                                    <span className="font-mono text-xs font-semibold text-slate-500">
                                        {set.key}
                                    </span>
                                    <span className="font-medium text-slate-900">{set.name}</span>
                                    <span className="mt-1 text-xs text-slate-500">
                                        {set._count?.cases ?? 0} cases
                                    </span>
                                </button>
                            ))}
                            {(testSets || []).length === 0 && (
                                <p className="text-sm text-slate-500">No test sets available.</p>
                            )}
                        </div>
                    </div>
                )}

                <div className="space-y-2.5">
                    {(testPlan.cases || []).map((entry: any, index: number) => {
                        const c = entry.case;
                        const canMoveUp = index > 0;
                        const canMoveDown = index < (testPlan.cases?.length || 0) - 1;

                        const handleMove = async (direction: "up" | "down") => {
                            const cases = [...(testPlan.cases || [])];
                            const newIndex = direction === "up" ? index - 1 : index + 1;
                            [cases[index], cases[newIndex]] = [cases[newIndex], cases[index]];
                            const caseIds = cases.map((e: any) => e.case.id);

                            try {
                                const res = await fetch(`/api/testplans/${id}/reorder`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ caseIds }),
                                });
                                if (!res.ok) throw new Error("Failed to reorder");
                                queryClient.invalidateQueries({ queryKey: ["testplan", id] });
                            } catch (err) {
                                toast({
                                    title: "Failed to reorder",
                                    description: (err as Error).message,
                                });
                            }
                        };

                        return (
                            <div
                                key={c.id}
                                className="group flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                            >
                                <div className="flex min-w-0 items-center gap-3">
                                    <div className="flex flex-col gap-0.5">
                                        <button
                                            type="button"
                                            onClick={() => handleMove("up")}
                                            disabled={!canMoveUp}
                                            className="p-1 text-slate-400 hover:text-slate-900 disabled:opacity-30 disabled:hover:text-slate-400"
                                            title="Move up"
                                        >
                                            <svg
                                                className="h-3 w-3"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M5 15l7-7 7 7"
                                                />
                                            </svg>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleMove("down")}
                                            disabled={!canMoveDown}
                                            className="p-1 text-slate-400 hover:text-slate-900 disabled:opacity-30 disabled:hover:text-slate-400"
                                            title="Move down"
                                        >
                                            <svg
                                                className="h-3 w-3"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M19 9l-7 7-7-7"
                                                />
                                            </svg>
                                        </button>
                                    </div>
                                    <div className="min-w-0">
                                        <span className="mr-3 rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                                            {c.key}
                                        </span>
                                        {projectKey ? (
                                            <Link
                                                href={`/projects/${projectKey}/testcases/${c.id}`}
                                                className="font-medium text-slate-900 hover:text-blue-600 hover:underline"
                                            >
                                                {c.name}
                                            </Link>
                                        ) : (
                                            <span className="font-medium text-slate-900">{c.name}</span>
                                        )}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => removeCaseMutation.mutate(c.id)}
                                    className="rounded p-1 text-slate-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                                    title="Remove from plan"
                                >
                                    <svg
                                        className="h-4 w-4"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M6 18L18 6M6 6l12 12"
                                        />
                                    </svg>
                                </button>
                            </div>
                        );
                    })}
                    {(testPlan.cases || []).length === 0 && (
                        <div className="rounded-lg border border-dashed border-slate-300 bg-white py-8 text-center text-sm text-slate-500">
                            No test cases in this plan yet. Click &ldquo;Add Test Cases&rdquo; or &ldquo;Import from Test Set&rdquo; above.
                        </div>
                    )}
                </div>
            </div>

            <ConfirmationDialog
                open={!!setToImport}
                onOpenChange={(open) => !open && setSetToImport(null)}
                title="Import Test Set"
                description={
                    setToImport
                        ? `Import all test cases from "${setToImport.name}" into this test plan?`
                        : ""
                }
                confirmLabel="Import Cases"
                variant="default"
                onConfirm={() => {
                    if (setToImport) {
                        importSetMutation.mutate(setToImport.id);
                    }
                }}
                isLoading={importSetMutation.isPending}
            />
        </div>
    );
}
