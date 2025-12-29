"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { useProjectStore } from "@/lib/stores/project-store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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
    const [isEditing, setIsEditing] = useState(false);

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
                body: JSON.stringify(values)
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
        },
        onError: (err) => {
            toast({ title: "Update failed", description: err.message });
        }
    });

    const submit = form.handleSubmit((values) => {
        updateMutation.mutate(values);
    });

    if (isLoading) return <div className="p-8 text-slate-400">Loading...</div>;
    if (!bug) return <div className="p-8 text-red-400">Bug not found</div>;

    return (
        <div className="mx-auto max-w-6xl px-8 py-10">
            {/* Header */}
            <div className="mb-8">
                <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
                    <button onClick={() => router.push(`/projects/${projectKey}/bugs`)} className="hover:text-white transition-colors">
                        Bugs
                    </button>
                    <span>/</span>
                    <span className="text-slate-200">{bug.key}</span>
                </div>
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-white tracking-tight">{bug.summary}</h1>
                    </div>
                    <div className="flex gap-2">
                        {!isEditing && (
                            <button
                                onClick={() => setIsEditing(true)}
                                className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white shadow-lg hover:bg-blue-500 transition-all"
                            >
                                Edit Bug
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {!isEditing ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main Content (Left) */}
                    <div className="lg:col-span-2 space-y-8">
                        {/* Description */}
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
                            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Description</h3>
                            <div className="prose prose-invert max-w-none text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
                                {bug.description || <span className="text-slate-600 italic">No description provided.</span>}
                            </div>
                        </div>
                    </div>

                    {/* Sidebar (Right) */}
                    <div className="space-y-6">
                        {/* Metadata Card */}
                        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
                            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Details</h3>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between border-b border-slate-800/50 pb-3">
                                    <span className="text-sm text-slate-400">Status</span>
                                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium border ${bug.status === 'RESOLVED' || bug.status === 'CLOSED' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                                        bug.status === 'IN_PROGRESS' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                            'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                        }`}>
                                        {bug.status}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between border-b border-slate-800/50 pb-3">
                                    <span className="text-sm text-slate-400">Priority</span>
                                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium border ${bug.priority === 'CRITICAL' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                        bug.priority === 'HIGH' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                                            bug.priority === 'MEDIUM' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                                'bg-slate-500/10 text-slate-400 border-slate-500/20'
                                        }`}>
                                        {bug.priority}
                                    </span>
                                </div>
                                {bug.testCase && (
                                    <div className="flex items-center justify-between border-b border-slate-800/50 pb-3">
                                        <span className="text-sm text-slate-400">Test Case</span>
                                        <a
                                            href={`/projects/${projectKey}/testcases/${bug.testCase.id}`}
                                            className="text-sm text-brand hover:text-blue-400 hover:underline truncate max-w-[150px]"
                                            title={bug.testCase.name}
                                        >
                                            {bug.testCase.key}
                                        </a>
                                    </div>
                                )}
                                {bug.testSet && (
                                    <div className="flex items-center justify-between border-b border-slate-800/50 pb-3">
                                        <span className="text-sm text-slate-400">Test Set</span>
                                        <a
                                            href={`/projects/${projectKey}/test-sets/${bug.testSet.id}`}
                                            className="text-sm text-brand hover:text-blue-400 hover:underline truncate max-w-[150px]"
                                            title={bug.testSet.name}
                                        >
                                            {bug.testSet.key}
                                        </a>
                                    </div>
                                )}
                                <div className="flex items-center justify-between pt-1">
                                    <span className="text-sm text-slate-400">Key</span>
                                    <span className="text-sm text-white font-medium">{bug.key}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <form onSubmit={submit} className="mt-8 space-y-6 max-w-4xl mx-auto bg-slate-900/40 p-8 rounded-3xl border border-slate-800">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-xl font-semibold text-white">Edit Bug</h2>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={() => setIsEditing(false)}
                                className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white shadow-lg hover:bg-blue-500"
                                disabled={updateMutation.isPending}
                            >
                                {updateMutation.isPending ? "Saving..." : "Save Changes"}
                            </button>
                        </div>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                        <div>
                            <label className="text-sm font-medium text-slate-300" htmlFor="priority">
                                Priority
                            </label>
                            <select
                                id="priority"
                                {...form.register("priority")}
                                className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
                            >
                                <option value="LOW">Low</option>
                                <option value="MEDIUM">Medium</option>
                                <option value="HIGH">High</option>
                                <option value="CRITICAL">Critical</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-300" htmlFor="status">
                                Status
                            </label>
                            <select
                                id="status"
                                {...form.register("status")}
                                className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
                            >
                                <option value="OPEN">Open</option>
                                <option value="IN_PROGRESS">In Progress</option>
                                <option value="RESOLVED">Resolved</option>
                                <option value="CLOSED">Closed</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-slate-300" htmlFor="testSetId">
                            Linked Test Set
                        </label>
                        <select
                            id="testSetId"
                            {...form.register("testSetId")}
                            className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
                        >
                            <option value="">None</option>
                            {testSets?.map((set: any) => (
                                <option key={set.id} value={set.id}>
                                    {set.key}: {set.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-sm font-medium text-slate-300" htmlFor="summary">
                            Summary
                        </label>
                        <input
                            id="summary"
                            {...form.register("summary")}
                            className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
                        />
                        {form.formState.errors.summary ? (
                            <p className="mt-1 text-xs text-red-400">{form.formState.errors.summary.message}</p>
                        ) : null}
                    </div>
                    <div>
                        <label className="text-sm font-medium text-slate-300" htmlFor="description">
                            Description
                        </label>
                        <textarea
                            id="description"
                            rows={5}
                            {...form.register("description")}
                            className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
                        />
                    </div>
                </form>
            )}
        </div>
    );
}
