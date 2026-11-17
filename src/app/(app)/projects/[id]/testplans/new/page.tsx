"use client";

import { useMemo, useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { useProjectStore } from "@/lib/stores/project-store";

const schema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  targetVersions: z.string().optional(),
  environments: z.string().optional(),
  tags: z.string().optional()
});

type FormValues = z.infer<typeof schema>;

export default function NewTestPlanPage() {
  const { projectId, projectKey } = useProjectStore();
  const router = useRouter();
  const queryClient = useQueryClient();
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

  const { data: projectEnvs } = useQuery<{ id: string; key: string; name: string }[]>({
    queryKey: ["environments", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const res = await fetch(`/api/environments?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to load environments");
      return res.json();
    },
  });

  const [selected, setSelected] = useState<string[]>([]);
  const [selectedEnvIds, setSelectedEnvIds] = useState<string[]>([]);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
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
        name: values.name,
        description: values.description,
        targetVersions: values.targetVersions
          ? values.targetVersions.split(",").map((value) => value.trim()).filter(Boolean)
          : [],
        environments: values.environments
          ? values.environments.split(",").map((value) => value.trim()).filter(Boolean)
          : [],
        environmentIds: selectedEnvIds,
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
    await queryClient.invalidateQueries({ queryKey: ["testplans", projectId] });
    toast({ title: "Plan created", description: `${plan.name} with ${selected.length} cases.` });
    router.push(`/projects/${projectKey}/testplans`);
  });

  const sortedCases = useMemo(() => (cases ?? []).sort((a: any, b: any) => a.key.localeCompare(b.key)), [cases]);

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <h1 className="text-2xl font-semibold text-slate-900">New Test Plan</h1>
      <p className="mt-1 text-sm text-slate-600">Bundle cases for coordinated execution.</p>
      <form onSubmit={submit} className="mt-6 grid gap-8 lg:grid-cols-[2fr,3fr]">
        <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="name">
              Plan Name
            </label>
            <input
              id="name"
              {...form.register("name")}
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
            {form.formState.errors.name ? (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.name.message}</p>
            ) : null}
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="description">
              Description
            </label>
            <textarea
              id="description"
              rows={4}
              {...form.register("description")}
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="targetVersions">
              Target Versions (comma separated)
            </label>
            <input
              id="targetVersions"
              {...form.register("targetVersions")}
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="environments">
              Environments
            </label>
            {(projectEnvs ?? []).length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-2">
                {(projectEnvs ?? []).map((env) => {
                  const active = selectedEnvIds.includes(env.id);
                  return (
                    <label
                      key={env.id}
                      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                        active
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={(e) =>
                          setSelectedEnvIds((prev) =>
                            e.target.checked ? [...prev, env.id] : prev.filter((id) => id !== env.id),
                          )
                        }
                        className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
                      />
                      {env.name}
                    </label>
                  );
                })}
              </div>
            )}
            <input
              id="environments"
              {...form.register("environments")}
              placeholder="Optional custom names (comma separated)"
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="tags">
              Tags
            </label>
            <input
              id="tags"
              {...form.register("tags")}
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
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
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "Saving..." : "Create plan"}
            </button>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Select Cases</h2>
            <span className="text-xs text-slate-500">{selected.length} selected</span>
          </div>
          <div className="mt-4 max-h-[480px] space-y-2.5 overflow-y-auto pr-1">
            {sortedCases.map((testCase: any) => {
              const checked = selected.includes(testCase.id);
              return (
                <label
                  key={testCase.id}
                  className={`flex cursor-pointer items-center justify-between rounded-md border px-3 py-2.5 text-sm transition ${checked ? "border-blue-600 bg-blue-50 text-slate-900" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                >
                  <div>
                    <p className="font-mono text-xs font-semibold text-slate-900">{testCase.key}</p>
                    <p className="text-xs text-slate-600">{testCase.name}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleCase(testCase.id)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
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
