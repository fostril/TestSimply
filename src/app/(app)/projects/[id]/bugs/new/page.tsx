"use client";

import { useEffect } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { useProjectStore } from "@/lib/stores/project-store";

const schema = z.object({
    summary: z.string().min(2, "Summary is required"),
    description: z.string().optional(),
    priority: z.string().default("MEDIUM"),
});

type FormValues = z.infer<typeof schema>;

export default function NewBugPage() {
    const { projectId, projectKey } = useProjectStore();
    const router = useRouter();
    const toast = useToast();

    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            summary: "",
            description: "",
            priority: "MEDIUM",
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
            ...values,
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
        toast({ title: "Bug reported", description: values.summary });
        router.push(`/projects/${projectKey}/bugs`);
    });

    return (
        <div className="mx-auto max-w-2xl px-8 py-10">
            <h1 className="text-3xl font-semibold text-white">Report Bug</h1>
            <p className="mt-2 text-sm text-slate-400">Track a new defect.</p>
            <form onSubmit={submit} className="mt-8 space-y-6">
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
                <div className="flex items-center justify-end gap-3">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white shadow-lg hover:bg-blue-500"
                        disabled={form.formState.isSubmitting}
                    >
                        {form.formState.isSubmitting ? "Saving..." : "Report Bug"}
                    </button>
                </div>
            </form>
        </div>
    );
}
