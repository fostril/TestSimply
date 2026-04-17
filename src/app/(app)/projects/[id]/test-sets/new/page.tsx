"use client";

import { useEffect } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { useProjectStore } from "@/lib/stores/project-store";

const schema = z.object({
    name: z.string().min(2, "Name is required"),
    description: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function NewTestSetPage() {
    const { projectId, projectKey } = useProjectStore();
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const toast = useToast();
    // Prefer the URL param as authoritative for navigation — the project
    // store may not be seeded yet when landing directly on this page.
    const projectKeyForLink = projectKey || params?.id;

    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            name: "",
            description: "",
        }
    });

    useEffect(() => {
        if (!projectId) {
            toast({ title: "Select a project", description: "Choose a project before creating test sets." });
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
        const res = await fetch("/api/test-sets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            toast({ title: "Unable to create test set", description: body.error ?? "Unknown error" });
            return;
        }

        toast({ title: "Test set created", description: values.name });
        router.push(`/projects/${projectKeyForLink}/test-sets`);
    });

    return (
        <div className="mx-auto max-w-2xl px-8 py-10">
            <h1 className="text-3xl font-semibold text-white">New Test Set</h1>
            <p className="mt-2 text-sm text-slate-400">Group related test cases together.</p>
            <form onSubmit={submit} className="mt-8 space-y-6">
                <div>
                    <label className="text-sm font-medium text-slate-300" htmlFor="name">
                        Name
                    </label>
                    <input
                        id="name"
                        {...form.register("name")}
                        className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
                        placeholder="e.g. Login Tests"
                    />
                    {form.formState.errors.name ? (
                        <p className="mt-1 text-xs text-red-400">{form.formState.errors.name.message}</p>
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
                        placeholder="Describe the purpose of this test set..."
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
                        {form.formState.isSubmitting ? "Creating..." : "Create Set"}
                    </button>
                </div>
            </form>
        </div>
    );
}
