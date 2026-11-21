"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { useProjectStore } from "@/lib/stores/project-store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { usePermissions } from "@/lib/hooks/use-permissions";

const schema = z.object({
    summary: z.string().min(2, "Summary is required"),
    description: z.string().optional(),
    priority: z.string().default("MEDIUM"),
    status: z.string().default("OPEN"),
    testSetId: z.string().nullable().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function BugDetailPage({ params }: { params: { id: string, bugId: string } }) {
    const { projectId, projectKey } = useProjectStore();
    const router = useRouter();
    const toast = useToast();
    const queryClient = useQueryClient();
    const { can } = usePermissions();
    const [isEditing, setIsEditing] = useState(false);
    const [isCreatingSet, setIsCreatingSet] = useState(false);
    const [newSetName, setNewSetName] = useState("");
    const [creatingSetLoading, setCreatingSetLoading] = useState(false);

    const handleCreateInlineSet = async () => {
        if (!projectId || !newSetName.trim()) return;
        setCreatingSetLoading(true);
        try {
            const res = await fetch("/api/test-sets", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectId,
                    name: newSetName.trim(),
                }),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok) throw new Error(body?.error || "Failed to create test set");
            await queryClient.invalidateQueries({ queryKey: ["test-sets", projectId] });
            form.setValue("testSetId", body.id);
            setNewSetName("");
            setIsCreatingSet(false);
            toast({ title: "Test set created", description: `${body.key}: ${body.name}` });
        } catch (err: unknown) {
            toast({ title: "Failed to create test set", description: (err as Error).message });
        } finally {
            setCreatingSetLoading(false);
        }
    };

    const { data: bug, isLoading } = useQuery({
        queryKey: ["bug", params.bugId],
        queryFn: async () => {
            const res = await fetch(`/api/bugs/${params.bugId}?projectKey=${params.id}`);
            if (!res.ok) throw new Error("Failed to load bug");
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

    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            summary: "",
            description: "",
            priority: "MEDIUM",
            status: "OPEN",
            testSetId: null,
        }
    });

    useEffect(() => {
        if (bug) {
            form.reset({
                summary: bug.summary,
                description: bug.description ?? "",
                priority: bug.priority,
                status: bug.status,
                testSetId: bug.testSetId ?? null,
            });
        }
    }, [bug, form]);

    const updateMutation = useMutation({
        mutationFn: async (values: FormValues) => {
            if (!bug?.id) throw new Error("Bug ID missing");
            const res = await fetch(`/api/bugs/${bug.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...values,
                    testSetId: values.testSetId || null,
                }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? "Failed to update");
            }
            return res.json();
        },
        onSuccess: () => {
            toast({ title: "Bug updated" });
            setIsEditing(false);
            queryClient.invalidateQueries({ queryKey: ["bug", params.bugId] });
            queryClient.invalidateQueries({ queryKey: ["bugs", projectId] });
        },
        onError: (err) => {
            toast({ title: "Update failed", description: err.message });
        }
    });

    const submit = form.handleSubmit((values) => {
        updateMutation.mutate(values);
    });

    if (isLoading) return <div className="p-8 text-sm text-slate-500">Loading...</div>;
    if (!bug) return <div className="p-8 text-sm text-red-600">Bug not found</div>;

    return (
        <div className="mx-auto max-w-6xl px-8 py-8">
            {/* Header */}
            <div className="mb-6">
                <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
                    <button onClick={() => router.push(`/projects/${projectKey}/bugs`)} className="transition-colors hover:text-slate-900">
                        Bugs
                    </button>
                    <span>/</span>
                    <span className="font-mono text-slate-700">{bug.key}</span>
                </div>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{bug.summary}</h1>
                    </div>
                    <div className="flex gap-2">
                        {!isEditing && can("bug:manage") && (
                            <button
                                onClick={() => setIsEditing(true)}
                                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                            >
                                Edit Bug
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {!isEditing ? (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    {/* Main Content (Left) */}
                    <div className="space-y-6 lg:col-span-2">
                        {/* Description */}
                        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Description</h3>
                            <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                                {bug.description || <span className="italic text-slate-400">No description provided.</span>}
                            </div>
                        </div>
                    </div>

                    {/* Sidebar (Right) */}
                    <div className="space-y-6">
                        {/* Metadata Card */}
                        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Details</h3>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                    <span className="text-sm text-slate-600">Status</span>
                                    <span className={`rounded border px-2 py-0.5 text-xs font-medium ${bug.status === 'RESOLVED' || bug.status === 'CLOSED' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
                                        bug.status === 'IN_PROGRESS' ? 'border-blue-200 bg-blue-50 text-blue-700' :
                                            'border-slate-200 bg-slate-100 text-slate-700'
                                        }`}>
                                        {bug.status}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                    <span className="text-sm text-slate-600">Priority</span>
                                    <span className={`rounded border px-2 py-0.5 text-xs font-medium ${bug.priority === 'CRITICAL' ? 'border-red-200 bg-red-50 text-red-700' :
                                        bug.priority === 'HIGH' ? 'border-orange-200 bg-orange-50 text-orange-700' :
                                            bug.priority === 'MEDIUM' ? 'border-blue-200 bg-blue-50 text-blue-700' :
                                                'border-slate-200 bg-slate-100 text-slate-700'
                                        }`}>
                                        {bug.priority}
                                    </span>
                                </div>
                                {bug.testCase && (
                                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                        <span className="text-sm text-slate-600">Test Case</span>
                                        <a
                                            href={`/projects/${projectKey}/testcases/${bug.testCase.id}`}
                                            className="max-w-[150px] truncate font-mono text-sm text-blue-600 hover:underline"
                                            title={bug.testCase.name}
                                        >
                                            {bug.testCase.key}
                                        </a>
                                    </div>
                                )}
                                {bug.testSet && (
                                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                                        <span className="text-sm text-slate-600">Test Set</span>
                                        <a
                                            href={`/projects/${projectKey}/test-sets/${bug.testSet.id}`}
                                            className="max-w-[150px] truncate font-mono text-sm text-blue-600 hover:underline"
                                            title={bug.testSet.name}
                                        >
                                            {bug.testSet.key}
                                        </a>
                                    </div>
                                )}
                                <div className="flex items-center justify-between pt-1">
                                    <span className="text-sm text-slate-600">Key</span>
                                    <span className="font-mono text-sm font-medium text-slate-900">{bug.key}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <form onSubmit={submit} className="mx-auto mt-6 max-w-4xl space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-lg font-semibold text-slate-900">Edit Bug</h2>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setIsEditing(false)}
                                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                                disabled={updateMutation.isPending}
                            >
                                {updateMutation.isPending ? "Saving..." : "Save Changes"}
                            </button>
                        </div>
                    </div>

                    <div className="grid gap-5 md:grid-cols-2">
                        <div>
                            <label className="text-sm font-medium text-slate-700" htmlFor="priority">
                                Priority
                            </label>
                            <select
                                id="priority"
                                {...form.register("priority")}
                                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                            >
                                <option value="LOW">Low</option>
                                <option value="MEDIUM">Medium</option>
                                <option value="HIGH">High</option>
                                <option value="CRITICAL">Critical</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700" htmlFor="status">
                                Status
                            </label>
                            <select
                                id="status"
                                {...form.register("status")}
                                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                            >
                                <option value="OPEN">Open</option>
                                <option value="IN_PROGRESS">In Progress</option>
                                <option value="RESOLVED">Resolved</option>
                                <option value="CLOSED">Closed</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-slate-700" htmlFor="testSetId">
                                Linked Test Set
                            </label>
                            {can("testset:manage") && (
                                <button
                                    type="button"
                                    onClick={() => setIsCreatingSet(!isCreatingSet)}
                                    className="inline-flex items-center gap-0.5 text-xs font-medium text-blue-600 hover:text-blue-700"
                                >
                                    <Plus className="h-3 w-3" />
                                    {isCreatingSet ? "Cancel" : "New Test Set"}
                                </button>
                            )}
                        </div>
                        <select
                            id="testSetId"
                            {...form.register("testSetId")}
                            className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                        >
                            <option value="">None</option>
                            {testSets?.map((set: any) => (
                                <option key={set.id} value={set.id}>
                                    {set.key}: {set.name}
                                </option>
                            ))}
                        </select>
                        {isCreatingSet && (
                            <div className="mt-2 flex gap-1.5">
                                <input
                                    type="text"
                                    value={newSetName}
                                    onChange={(e) => setNewSetName(e.target.value)}
                                    placeholder="New test set name..."
                                    className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                                />
                                <button
                                    type="button"
                                    disabled={!newSetName.trim() || creatingSetLoading}
                                    onClick={handleCreateInlineSet}
                                    className="rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {creatingSetLoading ? "..." : "Create & Select"}
                                </button>
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="text-sm font-medium text-slate-700" htmlFor="summary">
                            Summary
                        </label>
                        <input
                            id="summary"
                            {...form.register("summary")}
                            className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                        />
                        {form.formState.errors.summary ? (
                            <p className="mt-1 text-xs text-red-600">{form.formState.errors.summary.message}</p>
                        ) : null}
                    </div>
                    <div>
                        <label className="text-sm font-medium text-slate-700" htmlFor="description">
                            Description
                        </label>
                        <textarea
                            id="description"
                            rows={5}
                            {...form.register("description")}
                            className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                        />
                    </div>
                </form>
            )}
        </div>
    );
}
