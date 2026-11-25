"use client";

import { useEffect } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { useProjectStore } from "@/lib/stores/project-store";

const schema = z.object({
    summary: z.string().min(2, "Summary is required"),
    description: z.string().optional(),
    priority: z.string().default("MEDIUM"),
    testCaseId: z.string().optional(),
    testSetId: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function NewBugPage() {
    const { projectId, projectKey } = useProjectStore();
    const router = useRouter();
    const queryClient = useQueryClient();
    const toast = useToast();

    const { data: testCases } = useQuery({
        queryKey: ["testcases", projectId, "new-bug-form"],
        enabled: !!projectId,
        queryFn: async () => {
            const res = await fetch(`/api/testcases?projectId=${projectId}&limit=200`);
            if (!res.ok) return [];
            return res.json();
        },
    });

    const { data: testSets } = useQuery({
        queryKey: ["test-sets", projectId],
        enabled: !!projectId,
        queryFn: async () => {
            const res = await fetch(`/api/test-sets?projectId=${projectId}`);
            if (!res.ok) return [];
            return res.json();
        },
    });

    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            summary: "",
            description: "",
            priority: "MEDIUM",
            testCaseId: "",
            testSetId: "",
        }
    });

    useEffect(() => {
        if (!projectId) {
            toast({ title: "Select a project", description: "Choose a project before reporting bugs." });
        }
    }, [projectId, toast]);

    const submit = form.handleSubmit(async (values) => {
        if (!projectId) {
            toast({ title: "Project required", description: "Select a project in the left sidebar." });
            return;
        }
        const payload = {
            summary: values.summary,
            description: values.description,
            priority: values.priority,
            testCaseId: values.testCaseId || undefined,
            testSetId: values.testSetId || undefined,
            projectId,
        };
        const res = await fetch("/api/bugs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            toast({ title: "Unable to report bug", description: body.error ?? "Unknown error" });
            return;
        }
        await queryClient.invalidateQueries({ queryKey: ["bugs", projectId] });
        toast({ title: "Bug reported", description: values.summary });
        router.push(`/projects/${projectKey}/bugs`);
    });

    return (
        <div className="mx-auto max-w-2xl px-6 py-8">
            <h1 className="text-2xl font-semibold text-slate-900">Report Bug</h1>
            <p className="mt-1 text-sm text-slate-600">Track a new defect.</p>
            <form onSubmit={submit} className="mt-6 space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <div className="grid gap-4 md:grid-cols-3">
                    <div>
                        <label className="block text-sm font-medium text-slate-700" htmlFor="priority">
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
                        <label className="block text-sm font-medium text-slate-700" htmlFor="testCaseId">
                            Linked Test Case (Optional)
                        </label>
                        <select
                            id="testCaseId"
                            {...form.register("testCaseId")}
                            className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                        >
                            <option value="">None</option>
                            {testCases?.map((tc: any) => (
                                <option key={tc.id} value={tc.id}>
                                    {tc.key}: {tc.name}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700" htmlFor="testSetId">
                            Linked Test Set (Optional)
                        </label>
                        <select
                            id="testSetId"
                            {...form.register("testSetId")}
                            className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                        >
                            <option value="">None</option>
                            {testSets?.map((ts: any) => (
                                <option key={ts.id} value={ts.id}>
                                    {ts.key}: {ts.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700" htmlFor="summary">
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
                    <label className="block text-sm font-medium text-slate-700" htmlFor="description">
                        Description
                    </label>
                    <textarea
                        id="description"
                        rows={5}
                        {...form.register("description")}
                        className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                    />
                </div>
                <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        disabled={form.formState.isSubmitting}
                    >
                        {form.formState.isSubmitting ? "Saving..." : "Report Bug"}
                    </button>
                </div>
            </form>
        </div>
    );
}
