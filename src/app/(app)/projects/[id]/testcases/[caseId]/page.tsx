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

  if (isLoading) return <div className="p-8 text-sm text-slate-500">Loading...</div>;
  if (!testCase) return <div className="p-8 text-sm text-red-600">Test case not found</div>;

  return (
    <div className="mx-auto max-w-6xl px-8 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
          <button onClick={() => router.push(`/projects/${projectKey}/testcases`)} className="transition-colors hover:text-slate-900">
            Test Cases
          </button>
          <span>/</span>
          <span className="font-mono text-slate-700">{testCase.key}</span>
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{testCase.name}</h1>
          </div>
          <div className="flex gap-2">
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Edit Case
              </button>
            )}
          </div>
        </div>
      </div>

      {!isEditing ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main Content (Left) */}
          <div className="space-y-6 lg:col-span-2">
            {/* Description */}
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Description</h3>
              <div className="text-sm leading-relaxed text-slate-700">
                {testCase.description || <span className="italic text-slate-400">No description provided.</span>}
              </div>
            </div>

            {/* Expected Result */}
            {testCase.expected && (
              <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Expected Result</h3>
                <div className="text-sm leading-relaxed text-slate-700">
                  {testCase.expected}
                </div>
              </div>
            )}

            {/* Steps */}
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Test Steps</h3>
              <div className="space-y-3">
                {(testCase.steps as any[]).map((step, i) => (
                  <div key={i} className="flex gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-700">
                      {i + 1}
                    </div>
                    <div className="grid w-full gap-4 md:grid-cols-3">
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Action</p>
                        <p className="text-sm text-slate-900">{step.action}</p>
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Data</p>
                        <p className="text-sm text-slate-700">{step.data || "-"}</p>
                      </div>
                      {step.expected && (
                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase text-slate-500">Expected Result</p>
                          <p className="text-sm text-slate-700">{step.expected}</p>
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
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Details</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-sm text-slate-600">Status</span>
                  <span className={`rounded border px-2 py-0.5 text-xs font-medium ${testCase.status === 'Approved' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
                    testCase.status === 'Draft' ? 'border-slate-200 bg-slate-100 text-slate-700' :
                      'border-blue-200 bg-blue-50 text-blue-700'
                    }`}>
                    {testCase.status}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-sm text-slate-600">Priority</span>
                  <span className={`rounded border px-2 py-0.5 text-xs font-medium ${testCase.priority === 'CRITICAL' ? 'border-red-200 bg-red-50 text-red-700' :
                    testCase.priority === 'HIGH' ? 'border-orange-200 bg-orange-50 text-orange-700' :
                      testCase.priority === 'MEDIUM' ? 'border-blue-200 bg-blue-50 text-blue-700' :
                        'border-slate-200 bg-slate-100 text-slate-700'
                    }`}>
                    {testCase.priority}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-sm text-slate-600">Component</span>
                  <span className="text-sm font-medium text-slate-900">{testCase.component || "-"}</span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-sm text-slate-600">Automation</span>
                  <div className="flex gap-2">
                    {testCase.isAutomated && (
                      <span className="rounded border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                        AUTO
                      </span>
                    )}
                    {testCase.isFlaky && (
                      <span className="rounded border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
                        FLAKY
                      </span>
                    )}
                    {!testCase.isAutomated && !testCase.isFlaky && (
                      <span className="text-sm text-slate-500">Manual</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Preconditions Card */}
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Preconditions</h3>
                <button
                  onClick={() => setIsAddingPrecondition(!isAddingPrecondition)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  {isAddingPrecondition ? "Cancel" : "+ Link"}
                </button>
              </div>

              {isAddingPrecondition && (
                <div className="mb-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                  <input
                    type="text"
                    placeholder="Search preconditions..."
                    className="mb-2 w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  />
                  <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
                    {(availablePreconditions || []).length === 0 ? (
                      <p className="py-2 text-center text-xs text-slate-500">No available preconditions.</p>
                    ) : (
                      availablePreconditions.map((pre: any) => (
                        <button
                          key={pre.id}
                          onClick={() => linkPreconditionMutation.mutate(pre.id)}
                          className="group flex w-full items-center justify-between rounded p-2 text-left transition-colors hover:bg-slate-200/70"
                        >
                          <span className="max-w-[180px] truncate text-xs font-medium text-slate-700 group-hover:text-slate-900">{pre.key}: {pre.name}</span>
                          <span className="text-[10px] font-medium text-blue-600 opacity-0 group-hover:opacity-100">Link</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {(testCase.preconditions ?? []).length === 0 ? (
                  <p className="text-sm italic text-slate-400">No preconditions linked.</p>
                ) : (
                  (testCase.preconditions as any[]).map((pre) => (
                    <div key={pre.id} className="group flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 p-3 transition-colors hover:border-slate-300">
                      <div className="min-w-0">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-600">{pre.key}</span>
                        </div>
                        <p className="truncate text-xs font-medium text-slate-700">{pre.name}</p>
                      </div>
                      <button
                        onClick={() => unlinkPreconditionMutation.mutate(pre.id)}
                        className="rounded p-1.5 text-slate-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
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
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Requirements</h3>
                <button
                  onClick={() => {
                    const url = prompt("Enter Requirement URL (e.g., Jira Issue):");
                    if (url) {
                      addRequirementMutation.mutate({ externalUrl: url, type: "Jira" });
                    }
                  }}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  + Add Link
                </button>
              </div>
              <div className="space-y-2">
                {(testCase.requirements ?? []).length === 0 ? (
                  <p className="text-sm italic text-slate-400">No requirements linked.</p>
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
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-500">Linked Bugs</h3>
              <div className="space-y-2">
                {(testCase.bugs ?? []).length === 0 ? (
                  <p className="text-sm italic text-slate-400">No linked bugs.</p>
                ) : (
                  (testCase.bugs as any[]).map((bug) => (
                    <a
                      key={bug.id}
                      href={`/projects/${projectKey}/bugs/${bug.id}`}
                      className="group flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 p-3 transition-colors hover:border-slate-300 hover:bg-slate-100"
                    >
                      <div className="min-w-0">
                        <div className="mb-1 flex items-center gap-2">
                          <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${bug.priority === 'CRITICAL' ? 'border-red-200 bg-red-50 text-red-700' :
                              bug.priority === 'HIGH' ? 'border-orange-200 bg-orange-50 text-orange-700' :
                                'border-blue-200 bg-blue-50 text-blue-700'
                            }`}>{bug.key}</span>
                          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${bug.status === 'RESOLVED' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
                              'border-slate-200 bg-white text-slate-600'
                            }`}>{bug.status}</span>
                        </div>
                        <p className="truncate text-xs font-medium text-slate-700 group-hover:text-slate-900">{bug.summary}</p>
                      </div>
                    </a>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="mx-auto mt-6 max-w-4xl space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Edit Test Case</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-700" htmlFor="key">
                Case Key
              </label>
              <input
                id="key"
                {...form.register("key")}
                disabled
                className="mt-1.5 w-full cursor-not-allowed rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700" htmlFor="priority">
                Priority
              </label>
              <select
                id="priority"
                {...form.register("priority")}
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700" htmlFor="status">
                Status
              </label>
              <select
                id="status"
                {...form.register("status")}
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              >
                <option value="Draft">Draft</option>
                <option value="In Review">In Review</option>
                <option value="Approved">Approved</option>
                <option value="Deprecated">Deprecated</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="name">
              Name
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
              Description (Markdown supported)
            </label>
            <textarea
              id="description"
              rows={5}
              {...form.register("description")}
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="expected">
              Expected Result
            </label>
            <textarea
              id="expected"
              rows={3}
              {...form.register("expected")}
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-700" htmlFor="component">
                Component
              </label>
              <input
                id="component"
                {...form.register("component")}
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700" htmlFor="tags">
                Tags (comma separated)
              </label>
              <input
                id="tags"
                {...form.register("tags")}
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              />
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Steps</h2>
              <button
                type="button"
                onClick={() => append({ action: "", data: "", expected: "" })}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                + Add step
              </button>
            </div>
            {fields.map((field, index) => (
              <div key={field.id} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step {index + 1}</p>
                  {fields.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="text-xs text-slate-500 hover:text-red-600"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
                <div className="mt-3 grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="text-xs font-medium text-slate-700">Action</label>
                    <textarea
                      {...form.register(`steps.${index}.action` as const)}
                      rows={2}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-700">Data</label>
                    <textarea
                      {...form.register(`steps.${index}.data` as const)}
                      rows={2}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-700">Expected</label>
                    <textarea
                      {...form.register(`steps.${index}.expected` as const)}
                      rows={2}
                      className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                    />
                  </div>
                </div>
              </div>
            ))}
            {form.formState.errors.steps ? (
              <p className="text-xs text-red-600">{form.formState.errors.steps.message as string}</p>
            ) : null}
          </div>
        </form>
      )}
    </div>
  );
}
