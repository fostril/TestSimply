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
  const projectKey = useProjectStore((state) => state.projectKey);
  const router = useRouter();
  const queryClient = useQueryClient();
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

  const { data: cases } = useQuery({
    queryKey: ["testcases", projectId, "select"],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const res = await fetch(`/api/testcases?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to load test cases");
      return res.json() as Promise<any[]>;
    }
  });

  const [selectedCases, setSelectedCases] = useState<string[]>([]);
  const toggleCase = (id: string) => {
    setSelectedCases((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
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
        name: values.name,
        description: values.description,
        environment: values.environment,
        revision: values.revision,
        buildUrl: values.buildUrl,
        commitSha: values.commitSha,
        labels: values.labels ? values.labels.split(",").map((value) => value.trim()).filter(Boolean) : [],
        caseIds: !values.planId ? selectedCases : undefined
      })
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast({ title: "Unable to create execution", description: body.error ?? "Unknown error" });
      return;
    }
    const execution = await res.json();
    await queryClient.invalidateQueries({ queryKey: ["executions", projectId] });
    toast({ title: "Execution created", description: execution.name });
    router.push(`/projects/${projectKey}/executions/${execution.id}`);
  });

  const sortedPlans = useMemo(() => (plans ?? []).sort((a: any, b: any) => a.key.localeCompare(b.key)), [plans]);
  const sortedCases = useMemo(() => (cases ?? []).sort((a: any, b: any) => a.key.localeCompare(b.key)), [cases]);
  const selectedPlanId = form.watch("planId");

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <h1 className="text-2xl font-semibold text-slate-900">New Execution</h1>
      <p className="mt-1 text-sm text-slate-600">Track a manual or automated run.</p>
      <form onSubmit={submit} className="mt-6 space-y-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="name">
              Execution Name
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
            <label className="text-sm font-medium text-slate-700" htmlFor="planId">
              Test Plan
            </label>
            <select
              id="planId"
              {...form.register("planId")}
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            >
              <option value="">Ad-hoc execution</option>
              {sortedPlans.map((plan: any) => (
                <option key={plan.id} value={plan.id}>
                  {plan.key} — {plan.name}
                </option>
              ))}

            </select>
          </div>
        </div>

        {
          !selectedPlanId && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Select Ad-hoc Cases</h2>
                <span className="text-xs text-slate-500">{selectedCases.length} selected</span>
              </div>
              <div className="mt-3 max-h-[320px] space-y-2 overflow-y-auto pr-1">
                {sortedCases.map((testCase: any) => {
                  const checked = selectedCases.includes(testCase.id);
                  return (
                    <label
                      key={testCase.id}
                      className={`flex cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-sm transition ${checked ? "border-blue-600 bg-blue-50 text-slate-900" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
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
                  <p className="text-sm text-slate-500">No test cases found in this project.</p>
                ) : null}
              </div>
            </div>
          )
        }
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
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="environment">
              Environment
            </label>
            {projectId && <EnvironmentSelect projectId={projectId} form={form} />}
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="revision">
              Revision
            </label>
            <input
              id="revision"
              {...form.register("revision")}
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="buildUrl">
              Build URL
            </label>
            <input
              id="buildUrl"
              {...form.register("buildUrl")}
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="commitSha">
              Commit SHA
            </label>
            <input
              id="commitSha"
              {...form.register("commitSha")}
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-slate-700" htmlFor="labels">
            Labels (comma separated)
          </label>
          <input
            id="labels"
            {...form.register("labels")}
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
            {form.formState.isSubmitting ? "Saving..." : "Create execution"}
          </button>
        </div>
      </form>
    </div>
  );
}

function EnvironmentSelect({ projectId, form }: { projectId: string, form: any }) {
  const { data: environments } = useQuery({
    queryKey: ["environments", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const res = await fetch(`/api/environments?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to load environments");
      return res.json();
    }
  });

  return (
    <select
      id="environment"
      {...form.register("environment")}
      className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
    >
      <option value="">Select Environment...</option>
      {(environments || []).map((env: any) => (
        <option key={env.id} value={env.id}>
          {env.name} ({env.key})
        </option>
      ))}
    </select>
  );
}
