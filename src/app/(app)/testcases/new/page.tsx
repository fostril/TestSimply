"use client";

import { useEffect } from "react";
import { z } from "zod";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { useProjectStore } from "@/lib/stores/project-store";

const stepSchema = z.object({
  action: z.string().min(1, "Action is required"),
  expected: z.string().optional()
});

const schema = z.object({
  key: z.string().min(2, "Key is required"),
  name: z.string().min(2, "Name is required"),
  description: z.string().optional(),
  preconditions: z.string().optional(),
  expected: z.string().optional(),
  priority: z.string().default("MEDIUM"),
  component: z.string().optional(),
  tags: z.string().optional(),
  steps: z.array(stepSchema).min(1, "Add at least one step")
});

type FormValues = z.infer<typeof schema>;

export default function NewTestCasePage() {
  const projectId = useProjectStore((state) => state.projectId);
  const router = useRouter();
  const toast = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      key: "",
      name: "",
      description: "",
      preconditions: "",
      expected: "",
      priority: "MEDIUM",
      component: "",
      tags: "",
      steps: [{ action: "", expected: "" }]
    }
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "steps" });

  useEffect(() => {
    if (!projectId) {
      toast({ title: "Select a project", description: "Choose a project before creating test cases." });
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
      tags: values.tags ? values.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : []
    };
    const res = await fetch("/api/testcases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast({ title: "Unable to create test case", description: body.error ?? "Unknown error" });
      return;
    }
    toast({ title: "Test case created", description: values.name });
    router.push("/testcases");
  });

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <h1 className="text-3xl font-semibold text-white">New Test Case</h1>
      <p className="mt-2 text-sm text-slate-400">Document manual steps and expectations.</p>
      <form onSubmit={submit} className="mt-8 space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-300" htmlFor="key">
              Case Key
            </label>
            <input
              id="key"
              {...form.register("key")}
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
            />
            {form.formState.errors.key ? (
              <p className="mt-1 text-xs text-red-400">{form.formState.errors.key.message}</p>
            ) : null}
          </div>
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
          <label className="text-sm font-medium text-slate-300" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            {...form.register("name")}
            className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
          />
          {form.formState.errors.name ? (
            <p className="mt-1 text-xs text-red-400">{form.formState.errors.name.message}</p>
          ) : null}
        </div>
        <div>
          <label className="text-sm font-medium text-slate-300" htmlFor="description">
            Description (Markdown supported)
          </label>
          <textarea
            id="description"
            rows={5}
            {...form.register("description")}
            className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-300" htmlFor="preconditions">
              Preconditions
            </label>
            <textarea
              id="preconditions"
              rows={3}
              {...form.register("preconditions")}
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300" htmlFor="expected">
              Expected Result
            </label>
            <textarea
              id="expected"
              rows={3}
              {...form.register("expected")}
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-300" htmlFor="component">
              Component
            </label>
            <input
              id="component"
              {...form.register("component")}
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300" htmlFor="tags">
              Tags (comma separated)
            </label>
            <input
              id="tags"
              {...form.register("tags")}
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Steps</h2>
            <button
              type="button"
              onClick={() => append({ action: "", expected: "" })}
              className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800"
            >
              + Add step
            </button>
          </div>
          {fields.map((field, index) => (
            <div key={field.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-slate-500">Step {index + 1}</p>
                {fields.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="text-xs text-slate-500 hover:text-red-400"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <div className="mt-3 space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-300">Action</label>
                  <textarea
                    {...form.register(`steps.${index}.action` as const)}
                    rows={2}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300">Expected</label>
                  <textarea
                    {...form.register(`steps.${index}.expected` as const)}
                    rows={2}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>
              </div>
            </div>
          ))}
          {form.formState.errors.steps ? (
            <p className="text-xs text-red-400">{form.formState.errors.steps.message as string}</p>
          ) : null}
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
            {form.formState.isSubmitting ? "Saving..." : "Create case"}
          </button>
        </div>
      </form>
    </div>
  );
}
