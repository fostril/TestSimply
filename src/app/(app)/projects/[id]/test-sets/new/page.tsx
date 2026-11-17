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
        <div className="mx-auto max-w-2xl px-6 py-8">
            <h1 className="text-2xl font-semibold text-slate-900">New Test Set</h1>
            <p className="mt-1 text-sm text-slate-600">Group related test cases together.</p>
            <form onSubmit={submit} className="mt-6 space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <div>
                    <label className="block text-sm font-medium text-slate-700" htmlFor="name">
                        Name
                    </label>
                    <input
                        id="name"
                        {...form.register("name")}
                        className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                        placeholder="e.g. Login Tests"
                    />
                    {form.formState.errors.name ? (
                        <p className="mt-1 text-xs text-red-600">{form.formState.errors.name.message}</p>
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
                        placeholder="Describe the purpose of this test set..."
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
                        {form.formState.isSubmitting ? "Creating..." : "Create Set"}
                    </button>
                </div>
            </form>
        </div>
    );
}
