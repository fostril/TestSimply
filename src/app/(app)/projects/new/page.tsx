"use client";

import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { useProjectStore } from "@/lib/stores/project-store";

const schema = z.object({
  key: z
    .string()
    .min(2, "Project key must be at least 2 characters")
    .max(10, "Keep keys short (<= 10 characters)")
    .regex(/^[A-Z0-9-]+$/, "Use uppercase letters, numbers, and dashes"),
  name: z.string().min(2, "Project name is required"),
  description: z.string().optional()
});

type FormValues = z.infer<typeof schema>;

export default function NewProjectPage() {
  const router = useRouter();
  const toast = useToast();
  const setProjectId = useProjectStore((state) => state.setProjectId);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { key: "", name: "", description: "" }
  });

  const submit = form.handleSubmit(async (values) => {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values)
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      toast({ title: "Unable to create project", description: payload.error ?? "Unexpected error" });
      return;
    }
    const project = await res.json();
    toast({ title: "Project created", description: `${project.name} is ready to use.` });
    setProjectId(project.id);
    router.push("/");
  });

  return (
    <div className="mx-auto max-w-2xl px-8 py-10">
      <h1 className="text-3xl font-semibold text-white">New Project</h1>
      <p className="mt-2 text-sm text-slate-400">Define a workspace for your quality assets.</p>
      <form onSubmit={submit} className="mt-8 space-y-6">
        <div>
          <label className="text-sm font-medium text-slate-300" htmlFor="key">
            Project Key
          </label>
          <input
            id="key"
            {...form.register("key")}
            className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
            placeholder="QAE"
          />
          {form.formState.errors.key ? (
            <p className="mt-1 text-xs text-red-400">{form.formState.errors.key.message}</p>
          ) : null}
        </div>
        <div>
          <label className="text-sm font-medium text-slate-300" htmlFor="name">
            Project Name
          </label>
          <input
            id="name"
            {...form.register("name")}
            className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
            placeholder="Quality Enablement"
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
            {...form.register("description")}
            className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
            rows={4}
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
            {form.formState.isSubmitting ? "Saving..." : "Create project"}
          </button>
        </div>
      </form>
    </div>
  );
}
