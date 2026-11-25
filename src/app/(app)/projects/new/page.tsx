"use client";

import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { useProjectStore } from "@/lib/stores/project-store";
import { usePermissions } from "@/lib/hooks/use-permissions";

const schema = z.object({
  key: z
    .string()
    .min(2, "Project key must be at least 2 characters")
    .max(10, "Keep keys short (<= 10 characters)")
    .regex(/^[A-Z0-9-]+$/, "Use uppercase letters, numbers, and dashes"),
  name: z.string().min(2, "Project name is required"),
  description: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function NewProjectPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const setProject = useProjectStore((state) => state.setProject);
  const { can } = usePermissions();
  const canCreateProject = can("project:create");
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { key: "", name: "", description: "" },
  });

  const submit = form.handleSubmit(async (values) => {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      toast({ title: "Unable to create project", description: payload.error ?? "Unexpected error" });
      return;
    }
    const project = await res.json();
    toast({ title: "Project created", description: `${project.name} is ready to use.` });
    await queryClient.invalidateQueries({ queryKey: ["projects"] });
    setProject({ id: project.id, key: project.key });
    router.push(`/projects/${project.key}`);
  });

  if (!canCreateProject) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">Insufficient Permissions</h1>
          <p className="mt-2 text-sm text-slate-600">
            Only Project Leads and Administrators can create new projects.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="text-2xl font-semibold text-slate-900">New Project</h1>
      <p className="mt-1 text-sm text-slate-600">Define a workspace for your quality assets.</p>
      <form onSubmit={submit} className="mt-6 space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="key">
            Project Key
          </label>
          <input
            id="key"
            {...form.register("key")}
            className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            placeholder="QAE"
          />
          {form.formState.errors.key ? (
            <p className="mt-1 text-xs text-red-600">{form.formState.errors.key.message}</p>
          ) : null}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="name">
            Project Name
          </label>
          <input
            id="name"
            {...form.register("name")}
            className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            placeholder="Quality Enablement"
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
            {...form.register("description")}
            className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            rows={4}
          />
        </div>
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? "Saving..." : "Create project"}
          </button>
        </div>
      </form>
    </div>
  );
}
