"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { useProjectStore } from "@/lib/stores/project-store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RequirementRow } from "@/components/requirement-row";

const stepSchema = z.object({
  action: z.string().min(1, "Action is required"),
  data: z.string().optional(),
  expected: z.string().optional()
});

const schema = z.object({
  key: z.string().min(2, "Key is required"),
  name: z.string().min(2, "Name is required"),
  description: z.string().optional(),
  preconditions: z.string().optional(),
  expected: z.string().optional(),
  priority: z.string().default("MEDIUM"),
  status: z.string().optional(),
  component: z.string().optional(),
  tags: z.string().optional(),
  steps: z.array(stepSchema).min(1, "Add at least one step"),
  isAutomated: z.boolean().default(false),
  automationId: z.string().optional(),
  isFlaky: z.boolean().default(false),
});

type FormValues = z.infer<typeof schema>;

export default function TestCaseDetailPage({ params }: { params: { caseId: string } }) {
  const { projectId, projectKey } = useProjectStore();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);

  const { data: testCase, isLoading } = useQuery({
    queryKey: ["testcase", params.caseId],
    queryFn: async () => {
      const res = await fetch(`/api/testcases/${params.caseId}`);
      if (!res.ok) throw new Error("Failed to load test case");
      return res.json();
    }
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      key: "",
      name: "",
      description: "",
      preconditions: "",
      expected: "",
      priority: "MEDIUM",
      status: "Draft",
      component: "",
      tags: "",
      steps: [{ action: "", data: "", expected: "" }],
      isAutomated: false,
      automationId: "",
      isFlaky: false,
    }
  });

  const { fields, append, remove, replace } = useFieldArray({ control: form.control, name: "steps" });

  useEffect(() => {
    if (testCase) {
      form.reset({
        key: testCase.key,
        name: testCase.name,
        description: testCase.description ?? "",
        preconditions: testCase.preconditionsText ?? "",
        expected: testCase.expected ?? "",
        priority: testCase.priority,
        status: testCase.status,
        component: testCase.component ?? "",
        tags: testCase.tags.join(", "),
        steps: (testCase.steps as any[]).length > 0 ? (testCase.steps as any[]) : [{ action: "", data: "", expected: "" }],
        isAutomated: testCase.isAutomated ?? false,
        automationId: testCase.automationId ?? "",
        isFlaky: testCase.isFlaky ?? false,
      });
    }
  }, [testCase, form]);

  const updateMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        ...values,
        tags: values.tags ? values.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : []
      };
      const res = await fetch(`/api/testcases/${params.caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to update");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Test case updated" });
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ["testcase", params.caseId] });
    },
    onError: (err) => {
      toast({ title: "Update failed", description: err.message });
    }
  });

  const addRequirementMutation = useMutation({
    mutationFn: async (data: { externalUrl: string; type: string }) => {
      const res = await fetch(`/api/testcases/${params.caseId}/requirements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to add requirement");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Requirement linked" });
      queryClient.invalidateQueries({ queryKey: ["testcase", params.caseId] });
    },
    onError: (err) => {
      toast({ title: "Failed to link requirement", description: (err as Error).message });
    },
  });

  const deleteRequirementMutation = useMutation({
    mutationFn: async (linkId: string) => {
      const res = await fetch(`/api/testcases/${params.caseId}/requirements?linkId=${linkId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to remove requirement");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Requirement removed" });
      queryClient.invalidateQueries({ queryKey: ["testcase", params.caseId] });
    },
    onError: (err) => {
      toast({ title: "Failed to remove requirement", description: (err as Error).message });
    },
  });

  const { data: allPreconditions } = useQuery({
    queryKey: ["preconditions", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const res = await fetch(`/api/preconditions?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to load preconditions");
      return res.json();
    }
  });

  const linkPreconditionMutation = useMutation({
    mutationFn: async (preconditionId: string) => {
      const res = await fetch(`/api/testcases/${params.caseId}/preconditions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preconditionId }),
      });
      if (!res.ok) throw new Error("Failed to link precondition");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Precondition linked" });
      queryClient.invalidateQueries({ queryKey: ["testcase", params.caseId] });
      setIsAddingPrecondition(false);
    },
    onError: (err) => {
      toast({ title: "Failed to link", description: (err as Error).message });
    },
  });

  const unlinkPreconditionMutation = useMutation({
    mutationFn: async (preconditionId: string) => {
      const res = await fetch(`/api/testcases/${params.caseId}/preconditions`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preconditionId }),
      });
      if (!res.ok) throw new Error("Failed to unlink precondition");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Precondition unlinked" });
      queryClient.invalidateQueries({ queryKey: ["testcase", params.caseId] });
    },
    onError: (err) => {
      toast({ title: "Failed to unlink", description: (err as Error).message });
    },
  });

  const [isAddingPrecondition, setIsAddingPrecondition] = useState(false);
  const linkedPreconditionIds = new Set((testCase?.preconditions || []).map((p: any) => p.id));
  const availablePreconditions = (allPreconditions || []).filter((p: any) => !linkedPreconditionIds.has(p.id));

  const submit = form.handleSubmit(
    (values) => {
      updateMutation.mutate(values);
    },
    (errors) => {
      toast({ title: "Validation failed", description: "Please check the form for errors." });
    }
  );

  if (isLoading) return <div className="p-8 text-slate-400">Loading...</div>;
  if (!testCase) return <div className="p-8 text-red-400">Test case not found</div>;

  return (
    <div className="mx-auto max-w-6xl px-8 py-10">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
          <button onClick={() => router.push(`/projects/${projectKey}/testcases`)} className="hover:text-white transition-colors">
            Test Cases
          </button>
          <span>/</span>
          <span className="text-slate-200">{testCase.key}</span>
        </div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">{testCase.name}</h1>
          </div>
          <div className="flex gap-2">
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white shadow-lg hover:bg-blue-500 transition-all"
              >
                Edit Case
              </button>
            )}
          </div>
        </div>
      </div>

      {!isEditing ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content (Left) */}
          <div className="lg:col-span-2 space-y-8">
            {/* Description */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Description</h3>
              <div className="prose prose-invert max-w-none text-slate-300 text-sm leading-relaxed">
                {testCase.description || <span className="text-slate-600 italic">No description provided.</span>}
              </div>
            </div>

            {/* Expected Result */}
            {testCase.expected && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Expected Result</h3>
                <div className="text-slate-300 text-sm leading-relaxed">
                  {testCase.expected}
                </div>
              </div>
            )}

            {/* Steps */}
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Test Steps</h3>
              <div className="space-y-4">
                {(testCase.steps as any[]).map((step, i) => (
                  <div key={i} className="flex gap-4 rounded-xl border border-slate-800 bg-slate-900/20 p-5 hover:bg-slate-900/40 transition-colors">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm font-bold text-slate-400 shadow-inner">
                      {i + 1}
                    </div>
                    <div className="grid w-full gap-6 md:grid-cols-3">
                      <div>
                        <p className="mb-1 text-xs font-bold uppercase text-slate-500">Action</p>
                        <p className="text-slate-200 text-sm">{step.action}</p>
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-bold uppercase text-slate-500">Data</p>
                        <p className="text-slate-200 text-sm">{step.data || "-"}</p>
                      </div>
                      {step.expected && (
                        <div>
                          <p className="mb-1 text-xs font-bold uppercase text-slate-500">Expected Result</p>
                          <p className="text-slate-300 text-sm">{step.expected}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar (Right) */}
          <div className="space-y-6">
            {/* Metadata Card */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Details</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/50 pb-3">
                  <span className="text-sm text-slate-400">Status</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium border ${testCase.status === 'Approved' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                    testCase.status === 'Draft' ? 'bg-slate-700/30 text-slate-400 border-slate-700/50' :
                      'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    }`}>
                    {testCase.status}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-800/50 pb-3">
                  <span className="text-sm text-slate-400">Priority</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium border ${testCase.priority === 'CRITICAL' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                    testCase.priority === 'HIGH' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                      testCase.priority === 'MEDIUM' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                        'bg-slate-500/10 text-slate-400 border-slate-500/20'
                    }`}>
                    {testCase.priority}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-800/50 pb-3">
                  <span className="text-sm text-slate-400">Component</span>
                  <span className="text-sm text-white font-medium">{testCase.component || "-"}</span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-sm text-slate-400">Automation</span>
                  <div className="flex gap-2">
                    {testCase.isAutomated && (
                      <span className="rounded bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold text-purple-400 ring-1 ring-inset ring-purple-500/20">
                        AUTO
                      </span>
                    )}
                    {testCase.isFlaky && (
                      <span className="rounded bg-orange-500/10 px-2 py-0.5 text-[10px] font-bold text-orange-400 ring-1 ring-inset ring-orange-500/20">
                        FLAKY
                      </span>
                    )}
                    {!testCase.isAutomated && !testCase.isFlaky && (
                      <span className="text-sm text-slate-600">Manual</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Preconditions Card */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Preconditions</h3>
                <button
                  onClick={() => setIsAddingPrecondition(!isAddingPrecondition)}
                  className="text-xs font-medium text-brand hover:text-blue-400 transition-colors"
                >
                  {isAddingPrecondition ? "Cancel" : "+ Link"}
                </button>
              </div>

              {isAddingPrecondition && (
                <div className="mb-4 rounded-xl border border-slate-700 bg-slate-800/50 p-3 animate-in fade-in slide-in-from-top-2">
                  <input
                    type="text"
                    placeholder="Search preconditions..."
                    className="w-full bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none mb-2"
                  />
                  <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                    {(availablePreconditions || []).length === 0 ? (
                      <p className="text-xs text-slate-500 py-2 text-center">No available preconditions.</p>
                    ) : (
                      availablePreconditions.map((pre: any) => (
                        <button
                          key={pre.id}
                          onClick={() => linkPreconditionMutation.mutate(pre.id)}
                          className="flex w-full items-center justify-between rounded-lg p-2 text-left hover:bg-slate-700/50 transition-colors group"
                        >
                          <span className="text-xs font-medium text-slate-300 group-hover:text-white truncate max-w-[180px]">{pre.key}: {pre.name}</span>
                          <span className="text-[10px] text-brand opacity-0 group-hover:opacity-100">Link</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {(testCase.preconditions ?? []).length === 0 ? (
                  <p className="text-sm text-slate-600 italic">No preconditions linked.</p>
                ) : (
                  (testCase.preconditions as any[]).map((pre) => (
                    <div key={pre.id} className="group flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 p-3 hover:border-slate-700 transition-colors">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-bold text-slate-500 bg-slate-900 px-1.5 py-0.5 rounded">{pre.key}</span>
                        </div>
                        <p className="text-xs font-medium text-slate-300 truncate">{pre.name}</p>
                      </div>
                      <button
                        onClick={() => unlinkPreconditionMutation.mutate(pre.id)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-red-400 transition-all"
                        title="Unlink"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Requirements Card */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Requirements</h3>
                <button
                  onClick={() => {
                    const url = prompt("Enter Requirement URL (e.g., Jira Issue):");
                    if (url) {
                      addRequirementMutation.mutate({ externalUrl: url, type: "Jira" });
                    }
                  }}
                  className="text-xs font-medium text-brand hover:text-blue-400 transition-colors"
                >
                  + Add Link
                </button>
              </div>
              <div className="space-y-2">
                {(testCase.requirements ?? []).length === 0 ? (
                  <p className="text-sm text-slate-600 italic">No requirements linked.</p>
                ) : (
                  (testCase.requirements as any[]).map((req) => (
                    <RequirementRow
                      key={req.id}
                      requirement={req}
                      projectId={projectId}
                      onDelete={() => deleteRequirementMutation.mutate(req.id)}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Linked Bugs Card */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">Linked Bugs</h3>
              <div className="space-y-2">
                {(testCase.bugs ?? []).length === 0 ? (
                  <p className="text-sm text-slate-600 italic">No linked bugs.</p>
                ) : (
                  (testCase.bugs as any[]).map((bug) => (
                    <a
                      key={bug.id}
                      href={`/projects/${projectKey}/bugs/${bug.id}`}
                      className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 p-3 hover:border-slate-700 hover:bg-slate-900 transition-colors group"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${bug.priority === 'CRITICAL' ? 'bg-red-500/10 text-red-400' :
                              bug.priority === 'HIGH' ? 'bg-orange-500/10 text-orange-400' :
                                'bg-blue-500/10 text-blue-400'
                            }`}>{bug.key}</span>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${bug.status === 'RESOLVED' ? 'border-green-500/20 text-green-400' :
                              'border-slate-700 text-slate-400'
                            }`}>{bug.status}</span>
                        </div>
                        <p className="text-xs font-medium text-slate-300 truncate group-hover:text-white">{bug.summary}</p>
                      </div>
                    </a>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-8 space-y-6 max-w-4xl mx-auto bg-slate-900/40 p-8 rounded-3xl border border-slate-800">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-white">Edit Test Case</h2>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white shadow-lg hover:bg-blue-500"
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-300" htmlFor="key">
                Case Key
              </label>
              <input
                id="key"
                {...form.register("key")}
                disabled
                className="mt-2 w-full cursor-not-allowed rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-400 focus:outline-none"
              />
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
            <div>
              <label className="text-sm font-medium text-slate-300" htmlFor="status">
                Status
              </label>
              <select
                id="status"
                {...form.register("status")}
                className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
              >
                <option value="Draft">Draft</option>
                <option value="In Review">In Review</option>
                <option value="Approved">Approved</option>
                <option value="Deprecated">Deprecated</option>
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
                onClick={() => append({ action: "", data: "", expected: "" })}
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
                <div className="mt-3 grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="text-xs font-medium text-slate-300">Action</label>
                    <textarea
                      {...form.register(`steps.${index}.action` as const)}
                      rows={2}
                      className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-300">Data</label>
                    <textarea
                      {...form.register(`steps.${index}.data` as const)}
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
        </form>
      )}
    </div>
  );
}
