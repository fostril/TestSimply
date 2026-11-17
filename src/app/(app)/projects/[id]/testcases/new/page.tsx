"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { useProjectStore } from "@/lib/stores/project-store";

const stepSchema = z.object({
  action: z.string().min(1, "Action is required"),
  data: z.string().optional(),
  expected: z.string().optional()
});

const schema = z
  .object({
    name: z.string().min(2, "Name is required"),
    description: z.string().optional(),
    preconditions: z.string().optional(),
    expected: z.string().optional(),
    priority: z.string().default("MEDIUM"),
    component: z.string().optional(),
    folderId: z.string().optional(),
    tags: z.string().optional(),
    type: z.enum(["MANUAL", "CUCUMBER", "GENERIC"]).default("MANUAL"),
    steps: z.array(stepSchema),
    gherkin: z.string().optional(),
    genericDefinition: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "MANUAL" && data.steps.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Add at least one step",
        path: ["steps"],
      });
    }
    if (data.type === "CUCUMBER" && !data.gherkin?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Gherkin body is required",
        path: ["gherkin"],
      });
    }
    if (data.type === "GENERIC" && !data.genericDefinition?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Definition is required",
        path: ["genericDefinition"],
      });
    }
  });

type FormValues = z.infer<typeof schema>;

export default function NewTestCasePage() {
  const { projectId, projectKey } = useProjectStore();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: preconditions } = useQuery({
    queryKey: ["preconditions", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const res = await fetch(`/api/preconditions?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to load preconditions");
      return res.json();
    }
  });

  const { data: folders } = useQuery({
    queryKey: ["folders", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const res = await fetch(`/api/folders?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to load folders");
      return res.json();
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      description: "",
      preconditions: "",
      expected: "",
      priority: "MEDIUM",
      component: "",
      folderId: "",
      tags: "",
      type: "MANUAL",
      steps: [{ action: "", data: "", expected: "" }],
      gherkin: "",
      genericDefinition: "",
    }
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "steps" });
  const [selectedPrecondition, setSelectedPrecondition] = useState("");
  const testType = form.watch("type");

  useEffect(() => {
    if (!projectId) {
      toast({ title: "Select a project", description: "Choose a project before creating test cases." });
    }
  }, [projectId, toast]);

  useEffect(() => {
    const paramFolderId = new URLSearchParams(window.location.search).get("folderId");
    if (paramFolderId) {
      form.setValue("folderId", paramFolderId);
    }
  }, [form]);

  const submit = form.handleSubmit(async (values) => {
    if (!projectId) {
      toast({ title: "Project required", description: "Select a project in the left sidebar." });
      return;
    }
    const payload = {
      ...values,
      projectId,
      folderId: values.folderId || undefined,
      // When the test type is not MANUAL, don't send the placeholder steps —
      // the backend only accepts Gherkin or genericDefinition in that case.
      steps: values.type === "MANUAL" ? values.steps : [],
      gherkin: values.type === "CUCUMBER" ? values.gherkin : undefined,
      genericDefinition:
        values.type === "GENERIC" ? values.genericDefinition : undefined,
      tags: values.tags
        ? values.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
        : [],
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
    queryClient.invalidateQueries({ queryKey: ["testcases", projectId] });
    queryClient.invalidateQueries({ queryKey: ["folders", projectId] });
    toast({ title: "Test case created", description: values.name });
    router.push(`/projects/${projectKey}/testcases`);
  });

  return (
    <div className="mx-auto max-w-4xl px-8 py-8">
      <h1 className="text-2xl font-semibold text-slate-900">New Test Case</h1>
      <p className="mt-1 text-sm text-slate-600">Document manual steps and expectations.</p>
      <form onSubmit={submit} className="mt-6 space-y-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-5 md:grid-cols-2">
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
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="preconditions">
              Preconditions
            </label>
            {preconditions && preconditions.length > 0 && (
              <select
                value={selectedPrecondition}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value) {
                    const selected = preconditions.find((p: any) => p.id === value);
                    if (selected) {
                      const currentValue = form.getValues("preconditions") || "";
                      const newValue = currentValue ? `${currentValue}\n${selected.description}` : selected.description;
                      form.setValue("preconditions", newValue);
                    }
                  }
                  setSelectedPrecondition(""); // Reset to default
                }}
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              >
                <option value="">Select existing precondition...</option>
                {preconditions.map((precondition: any) => (
                  <option key={precondition.id} value={precondition.id}>
                    {precondition.key} - {precondition.name}
                  </option>
                ))}
              </select>
            )}
            <textarea
              id="preconditions"
              rows={3}
              {...form.register("preconditions")}
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
        </div>
        <div className="grid gap-5 md:grid-cols-3">
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
            <label className="text-sm font-medium text-slate-700" htmlFor="folderId">
              Folder
            </label>
            <select
              id="folderId"
              {...form.register("folderId")}
              className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            >
              <option value="">(unfiled)</option>
              {folders?.map((f: { id: string; path: string; name: string }) => (
                <option key={f.id} value={f.id}>
                  {f.path}
                </option>
              ))}
            </select>
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

        <div>
          <label className="text-sm font-medium text-slate-700">Test type</label>
          <div className="mt-1.5 inline-flex rounded-md border border-slate-200 bg-slate-100 p-1">
            {(["MANUAL", "CUCUMBER", "GENERIC"] as const).map((t) => (
              <label
                key={t}
                className={`cursor-pointer rounded px-3.5 py-1.5 text-xs font-medium ${
                  testType === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <input
                  type="radio"
                  value={t}
                  {...form.register("type")}
                  className="sr-only"
                />
                {t === "MANUAL" ? "Manual" : t === "CUCUMBER" ? "Cucumber (BDD)" : "Generic / Automated"}
              </label>
            ))}
          </div>
        </div>

        {testType === "MANUAL" && (
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
                      className={`mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 ${
                        form.formState.errors.steps?.[index]?.action ? "border-red-500" : "border-slate-300"
                      }`}
                    />
                    {form.formState.errors.steps?.[index]?.action && (
                      <p className="mt-1 text-xs text-red-600">{form.formState.errors.steps[index]?.action?.message}</p>
                    )}
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
        )}

        {testType === "CUCUMBER" && (
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="gherkin">
              Gherkin scenario
            </label>
            <p className="mt-1 text-xs text-slate-500">
              Paste or write a Gherkin scenario. Imported Cucumber reports will be matched against this test.
            </p>
            <textarea
              id="gherkin"
              rows={12}
              {...form.register("gherkin")}
              placeholder={`Feature: Login\n  Scenario: Successful login\n    Given a registered user\n    When they submit valid credentials\n    Then they land on the dashboard`}
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
            {form.formState.errors.gherkin ? (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.gherkin.message as string}</p>
            ) : null}
          </div>
        )}

        {testType === "GENERIC" && (
          <div>
            <label className="text-sm font-medium text-slate-700" htmlFor="genericDefinition">
              Definition
            </label>
            <p className="mt-1 text-xs text-slate-500">
              Free-form reference for automated tests, e.g. a pytest node id, Playwright spec path, or TestNG class.
            </p>
            <textarea
              id="genericDefinition"
              rows={8}
              {...form.register("genericDefinition")}
              placeholder="tests/e2e/checkout.spec.ts:should_complete_purchase"
              className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            />
            {form.formState.errors.genericDefinition ? (
              <p className="mt-1 text-xs text-red-600">{form.formState.errors.genericDefinition.message as string}</p>
            ) : null}
          </div>
        )}
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
            {form.formState.isSubmitting ? "Saving..." : "Create case"}
          </button>
        </div>
      </form>
    </div>
  );
}
