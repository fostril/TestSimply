"use client";

import { useMemo } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { useProjectStore } from "@/lib/stores/project-store";

const schema = z.object({
  key: z.string().min(2),
  name: z.string().min(2),
  planId: z.string().optional(),
  description: z.string().optional(),
  environment: z.string().optional(),
  revision: z.string().optional(),
  buildUrl: z.string().optional(),
  commitSha: z.string().optional(),
  labels: z.string().optional()
});

type FormValues = z.infer<typeof schema>;

export default function NewExecutionPage() {
  const projectId = useProjectStore((state) => state.projectId);
  const router = useRouter();
  const toast = useToast();
  const { data: plans } = useQuery({
    queryKey: ["testplans", projectId, "select"],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const res = await fetch(`/api/testplans?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to load plans");
      return res.json() as Promise<any[]>;
    }
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      key: "",
      name: "",
      planId: "",
      description: "",
      environment: "",
      revision: "",
      buildUrl: "",
      commitSha: "",
      labels: ""
    }
  });

  const submit = form.handleSubmit(async (values) => {
    if (!projectId) {
      toast({ title: "Select a project", description: "Choose a project before creating an execution." });
      return;
    }
    const res = await fetch("/api/executions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        planId: values.planId ? values.planId : undefined,
        key: values.key,
        name: values.name,
        description: values.description,
        environment: values.environment,
        revision: values.revision,
        buildUrl: values.buildUrl,
        commitSha: values.commitSha,
        labels: values.labels ? values.labels.split(",").map((value) => value.trim()).filter(Boolean) : []
      })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast({ title: "Unable to create execution", description: body.error ?? "Unknown error" });
      return;
    }
    const execution = await res.json();
    toast({ title: "Execution created", description: execution.name });
    router.push(`/executions/${execution.id}`);
  });

  const sortedPlans = useMemo(() => (plans ?? []).sort((a: any, b: any) => a.key.localeCompare(b.key)), [plans]);

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <h1 className="text-3xl font-semibold text-white">New Execution</h1>
      <p className="mt-2 text-sm text-slate-400">Track a manual or automated run.</p>
      <form onSubmit={submit} className="mt-8 space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-300" htmlFor="key">
              Execution Key
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
            <label className="text-sm font-medium text-slate-300" htmlFor="name">
              Execution Name
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
        </div>
        <div>
          <label className="text-sm font-medium text-slate-300" htmlFor="planId">
            Test Plan
          </label>
          <select
            id="planId"
            {...form.register("planId")}
            className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="">Ad-hoc execution</option>
            {sortedPlans.map((plan: any) => (
              <option key={plan.id} value={plan.id}>
                {plan.key} — {plan.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-300" htmlFor="description">
            Description
          </label>
          <textarea
            id="description"
            rows={4}
            {...form.register("description")}
            className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-300" htmlFor="environment">
              Environment
            </label>
            <input
              id="environment"
              {...form.register("environment")}
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300" htmlFor="revision">
              Revision
            </label>
            <input
              id="revision"
              {...form.register("revision")}
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-300" htmlFor="buildUrl">
              Build URL
            </label>
            <input
              id="buildUrl"
              {...form.register("buildUrl")}
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300" htmlFor="commitSha">
              Commit SHA
            </label>
            <input
              id="commitSha"
              {...form.register("commitSha")}
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-300" htmlFor="labels">
            Labels (comma separated)
          </label>
          <input
            id="labels"
            {...form.register("labels")}
            className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
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
            {form.formState.isSubmitting ? "Saving..." : "Create execution"}
          </button>
        </div>
      </form>
    </div>
  );
}
