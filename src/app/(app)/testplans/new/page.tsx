"use client";

import { useMemo, useState } from "react";
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
  description: z.string().optional(),
  targetVersions: z.string().optional(),
  environments: z.string().optional(),
  tags: z.string().optional()
});

type FormValues = z.infer<typeof schema>;

export default function NewTestPlanPage() {
  const projectId = useProjectStore((state) => state.projectId);
  const router = useRouter();
  const toast = useToast();
  const { data: cases } = useQuery({
    queryKey: ["testcases", projectId, "select"],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const res = await fetch(`/api/testcases?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to load test cases");
      return res.json() as Promise<any[]>;
    }
  });

  const [selected, setSelected] = useState<string[]>([]);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      key: "",
      name: "",
      description: "",
      targetVersions: "",
      environments: "",
      tags: ""
    }
  });

  const toggleCase = (id: string) => {
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  };

  const submit = form.handleSubmit(async (values) => {
    if (!projectId) {
      toast({ title: "Select a project", description: "Choose a project first." });
      return;
    }
    if (selected.length === 0) {
      toast({ title: "No cases selected", description: "Include at least one test case." });
      return;
    }
    const res = await fetch("/api/testplans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        key: values.key,
        name: values.name,
        description: values.description,
        targetVersions: values.targetVersions
          ? values.targetVersions.split(",").map((value) => value.trim()).filter(Boolean)
          : [],
        environments: values.environments
          ? values.environments.split(",").map((value) => value.trim()).filter(Boolean)
          : [],
        tags: values.tags ? values.tags.split(",").map((value) => value.trim()).filter(Boolean) : []
      })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast({ title: "Unable to create plan", description: body.error ?? "Unknown error" });
      return;
    }
    const plan = await res.json();
    await fetch(`/api/testplans/${plan.id}/cases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseIds: selected })
    });
    toast({ title: "Plan created", description: `${plan.name} with ${selected.length} cases.` });
    router.push("/testplans");
  });

  const sortedCases = useMemo(() => (cases ?? []).sort((a: any, b: any) => a.key.localeCompare(b.key)), [cases]);

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <h1 className="text-3xl font-semibold text-white">New Test Plan</h1>
      <p className="mt-2 text-sm text-slate-400">Bundle cases for coordinated execution.</p>
      <form onSubmit={submit} className="mt-8 grid gap-8 lg:grid-cols-[2fr,3fr]">
        <div className="space-y-5">
          <div>
            <label className="text-sm font-medium text-slate-300" htmlFor="key">
              Plan Key
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
              Plan Name
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
              Description
            </label>
            <textarea
              id="description"
              rows={4}
              {...form.register("description")}
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300" htmlFor="targetVersions">
              Target Versions (comma separated)
            </label>
            <input
              id="targetVersions"
              {...form.register("targetVersions")}
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300" htmlFor="environments">
              Environments
            </label>
            <input
              id="environments"
              {...form.register("environments")}
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-300" htmlFor="tags">
              Tags
            </label>
            <input
              id="tags"
              {...form.register("tags")}
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
              {form.formState.isSubmitting ? "Saving..." : "Create plan"}
            </button>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Select Cases</h2>
            <span className="text-xs text-slate-500">{selected.length} selected</span>
          </div>
          <div className="mt-4 max-h-[480px] space-y-3 overflow-y-auto pr-2">
            {sortedCases.map((testCase: any) => {
              const checked = selected.includes(testCase.id);
              return (
                <label
                  key={testCase.id}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-2 text-sm transition ${
                    checked ? "border-brand bg-slate-900 text-white" : "border-slate-800 bg-slate-950 text-slate-300"
                  }`}
                >
                  <div>
                    <p className="font-medium">{testCase.key}</p>
                    <p className="text-xs text-slate-400">{testCase.name}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleCase(testCase.id)}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-brand focus:ring-brand"
                  />
                </label>
              );
            })}
            {sortedCases.length === 0 ? (
              <p className="text-sm text-slate-500">Create test cases first to include them in the plan.</p>
            ) : null}
          </div>
        </div>
      </form>
    </div>
  );
}
