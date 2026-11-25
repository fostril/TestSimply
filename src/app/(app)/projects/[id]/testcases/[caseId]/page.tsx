"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { useProjectStore } from "@/lib/stores/project-store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { RequirementRow } from "@/components/requirement-row";
import { usePermissions } from "@/lib/hooks/use-permissions";

const stepSchema = z.object({
  action: z.string().min(1, "Action is required"),
  data: z.string().optional(),
  expected: z.string().optional()
});

const schema = z
  .object({
    key: z.string().min(2, "Key is required"),
    name: z.string().min(2, "Name is required"),
    description: z.string().optional(),
    preconditions: z.string().optional(),
    expected: z.string().optional(),
    priority: z.string().default("MEDIUM"),
    status: z.string().optional(),
    component: z.string().optional(),
    folderId: z.string().nullable().optional(),
    tags: z.string().optional(),
    type: z.enum(["MANUAL", "CUCUMBER", "GENERIC"]).default("MANUAL"),
    steps: z.array(stepSchema),
    gherkin: z.string().optional(),
    genericDefinition: z.string().optional(),
    isAutomated: z.boolean().default(false),
    automationId: z.string().optional(),
    isFlaky: z.boolean().default(false),
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

export default function TestCaseDetailPage({ params }: { params: { caseId: string } }) {
  const { projectId, projectKey } = useProjectStore();
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { can } = usePermissions();
  const canEditCase = can("testcase:update");
  const canCreatePre = can("testcase:create");
  const canCreateReq = can("project:update");
  const canManageBugs = can("bug:manage");
  const [isEditing, setIsEditing] = useState(false);
  const [isLinkingBug, setIsLinkingBug] = useState(false);
  const [bugSearch, setBugSearch] = useState("");

  const [isCreatingInlinePre, setIsCreatingInlinePre] = useState(false);
  const [newPreName, setNewPreName] = useState("");
  const [newPreDescription, setNewPreDescription] = useState("");
  const [creatingPreLoading, setCreatingPreLoading] = useState(false);

  const [isAddingRequirement, setIsAddingRequirement] = useState(false);
  const [reqTitleOrUrl, setReqTitleOrUrl] = useState("");
  const [reqExternalKey, setReqExternalKey] = useState("");
  const [creatingReqLoading, setCreatingReqLoading] = useState(false);

  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolderLoading, setCreatingFolderLoading] = useState(false);

  const { data: testCase, isLoading } = useQuery({
    queryKey: ["testcase", params.caseId],
    queryFn: async () => {
      const res = await fetch(`/api/testcases/${params.caseId}`);
      if (!res.ok) throw new Error("Failed to load test case");
      return res.json();
    }
  });

  const { data: folders } = useQuery<{ id: string; path: string; name: string }[]>({
    queryKey: ["folders", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const res = await fetch(`/api/folders?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to load folders");
      return res.json();
    },
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
      folderId: "",
      tags: "",
      type: "MANUAL",
      steps: [{ action: "", data: "", expected: "" }],
      gherkin: "",
      genericDefinition: "",
      isAutomated: false,
      automationId: "",
      isFlaky: false,
    }
  });

  const currentType = form.watch("type");
  const isAutomated = form.watch("isAutomated");
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "steps" });

  useEffect(() => {
    if (testCase) {
      const resolvedType = (testCase.type as "MANUAL" | "CUCUMBER" | "GENERIC") || "MANUAL";
      const rawSteps = Array.isArray(testCase.steps) ? (testCase.steps as any[]) : [];
      form.reset({
        key: testCase.key,
        name: testCase.name,
        description: testCase.description ?? "",
        preconditions: testCase.preconditionsText ?? "",
        expected: testCase.expected ?? "",
        priority: testCase.priority,
        status: testCase.status,
        component: testCase.component ?? "",
        folderId: testCase.folderId ?? "",
        tags: Array.isArray(testCase.tags) ? testCase.tags.join(", ") : "",
        type: resolvedType,
        steps:
          rawSteps.length > 0
            ? rawSteps
            : resolvedType === "MANUAL"
              ? [{ action: "", data: "", expected: "" }]
              : [],
        gherkin: testCase.gherkin ?? "",
        genericDefinition: testCase.genericDefinition ?? "",
        isAutomated: testCase.isAutomated ?? false,
        automationId: testCase.automationId ?? "",
        isFlaky: testCase.isFlaky ?? false,
      });
    }
  }, [testCase, form]);

  const updateMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        name: values.name,
        description: values.description,
        preconditions: values.preconditions,
        expected: values.expected,
        priority: values.priority,
        status: values.status,
        component: values.component,
        folderId: values.folderId || null,
        tags: values.tags ? values.tags.split(",").map((tag) => tag.trim()).filter(Boolean) : [],
        type: values.type,
        steps: values.type === "MANUAL" ? values.steps : [],
        gherkin: values.type === "CUCUMBER" ? (values.gherkin ?? "") : null,
        genericDefinition: values.type === "GENERIC" ? (values.genericDefinition ?? "") : null,
        isAutomated: values.isAutomated,
        automationId: values.isAutomated ? (values.automationId ?? "") : "",
        isFlaky: values.isFlaky,
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
      queryClient.invalidateQueries({ queryKey: ["testcases", projectId] });
      queryClient.invalidateQueries({ queryKey: ["folders", projectId] });
    },
    onError: (err) => {
      toast({ title: "Update failed", description: err.message });
    }
  });

  const moveFolderMutation = useMutation({
    mutationFn: async (folderId: string | null) => {
      const res = await fetch(`/api/testcases/${params.caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to update folder");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Folder updated" });
      queryClient.invalidateQueries({ queryKey: ["testcase", params.caseId] });
      queryClient.invalidateQueries({ queryKey: ["testcases", projectId] });
      queryClient.invalidateQueries({ queryKey: ["folders", projectId] });
    },
    onError: (err) => {
      toast({ title: "Failed to update folder", description: (err as Error).message });
    },
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
  const [preconditionSearch, setPreconditionSearch] = useState("");
  const linkedPreconditionIds = new Set((testCase?.preconditions || []).map((p: any) => p.id));
  const availablePreconditions = (allPreconditions || []).filter((p: any) => {
    if (linkedPreconditionIds.has(p.id)) return false;
    const q = preconditionSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      String(p.key ?? "").toLowerCase().includes(q) ||
      String(p.name ?? "").toLowerCase().includes(q)
    );
  });

  const { data: projectRequirements } = useQuery({
    queryKey: ["requirements", projectId, "case-picker"],
    enabled: !!projectId && isAddingRequirement,
    queryFn: async () => {
      const res = await fetch(`/api/requirements?projectId=${projectId}&limit=100`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: projectBugs } = useQuery({
    queryKey: ["bugs", projectId, "case-picker"],
    enabled: !!projectId && isLinkingBug,
    queryFn: async () => {
      const res = await fetch(`/api/bugs?projectId=${projectId}&limit=100`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const linkedBugIds = new Set((testCase?.bugs || []).map((b: any) => b.id));
  const availableBugs = (projectBugs || []).filter((b: any) => {
    if (linkedBugIds.has(b.id)) return false;
    const q = bugSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      String(b.key ?? "").toLowerCase().includes(q) ||
      String(b.summary ?? "").toLowerCase().includes(q)
    );
  });

  const linkBugMutation = useMutation({
    mutationFn: async (bugId: string) => {
      const res = await fetch(`/api/bugs/${bugId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testCaseId: testCase?.id ?? params.caseId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to link bug");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Bug linked" });
      queryClient.invalidateQueries({ queryKey: ["testcase", params.caseId] });
      queryClient.invalidateQueries({ queryKey: ["bugs", projectId] });
      setIsLinkingBug(false);
    },
    onError: (err) => {
      toast({ title: "Failed to link bug", description: (err as Error).message });
    },
  });

  const unlinkBugMutation = useMutation({
    mutationFn: async (bugId: string) => {
      const res = await fetch(`/api/bugs/${bugId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testCaseId: null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to unlink bug");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Bug unlinked" });
      queryClient.invalidateQueries({ queryKey: ["testcase", params.caseId] });
      queryClient.invalidateQueries({ queryKey: ["bugs", projectId] });
    },
    onError: (err) => {
      toast({ title: "Failed to unlink bug", description: (err as Error).message });
    },
  });

  const handleCreateAndLinkPrecondition = async (name: string, description: string) => {
    if (!projectId || !name.trim()) return;
    setCreatingPreLoading(true);
    try {
      const res = await fetch("/api/preconditions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: name.trim(),
          description: description.trim() || undefined,
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Failed to create precondition");
      await queryClient.invalidateQueries({ queryKey: ["preconditions", projectId] });
      linkPreconditionMutation.mutate(body.id);
      setNewPreName("");
      setNewPreDescription("");
      setIsCreatingInlinePre(false);
    } catch (err: unknown) {
      toast({ title: "Failed to create precondition", description: (err as Error).message });
    } finally {
      setCreatingPreLoading(false);
    }
  };

  const handleCreateInlineFolder = async () => {
    if (!projectId || !newFolderName.trim()) return;
    setCreatingFolderLoading(true);
    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: newFolderName.trim(),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Failed to create folder");
      await queryClient.invalidateQueries({ queryKey: ["folders", projectId] });
      form.setValue("folderId", body.id);
      setNewFolderName("");
      setIsCreatingFolder(false);
      toast({ title: "Folder created", description: body.path });
    } catch (err: unknown) {
      toast({ title: "Failed to create folder", description: (err as Error).message });
    } finally {
      setCreatingFolderLoading(false);
    }
  };

  const handleCreateOrLinkRequirement = async () => {
    if (!reqTitleOrUrl.trim()) return;
    const raw = reqTitleOrUrl.trim();
    if (/^https?:\/\//i.test(raw)) {
      addRequirementMutation.mutate({ externalUrl: raw, type: "Jira" });
      setReqTitleOrUrl("");
      setReqExternalKey("");
      setIsAddingRequirement(false);
      return;
    }
    if (!projectId) return;
    setCreatingReqLoading(true);
    try {
      const createRes = await fetch("/api/requirements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          title: raw,
          priority: "MEDIUM",
          externalIssueKey: reqExternalKey.trim() || undefined,
        }),
      });
      const created = await createRes.json().catch(() => null);
      if (!createRes.ok) throw new Error(created?.error || "Failed to create requirement");
      const linkRes = await fetch(`/api/testcases/${params.caseId}/requirements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirementId: created.id, type: "covers" }),
      });
      if (!linkRes.ok) throw new Error("Failed to link requirement");
      await queryClient.invalidateQueries({ queryKey: ["testcase", params.caseId] });
      await queryClient.invalidateQueries({ queryKey: ["requirements", projectId] });
      setReqTitleOrUrl("");
      setReqExternalKey("");
      setIsAddingRequirement(false);
      toast({ title: "Requirement created and linked", description: `${created.key}: ${created.title}` });
    } catch (err: unknown) {
      toast({ title: "Failed to link requirement", description: (err as Error).message });
    } finally {
      setCreatingReqLoading(false);
    }
  };

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
            {!isEditing && canEditCase && (
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

            {/* Preconditions Text */}
            {testCase.preconditionsText && (
              <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Preconditions Text</h3>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                  {testCase.preconditionsText}
                </div>
              </div>
            )}

            {/* Expected Result */}
            {testCase.expected && (
              <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Expected Result</h3>
                <div className="text-sm leading-relaxed text-slate-700">
                  {testCase.expected}
                </div>
              </div>
            )}

            {/* Body by Test Type */}
            {testCase.type === "CUCUMBER" ? (
              <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Gherkin Scenario</h3>
                <pre className="whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-4 font-mono text-xs text-slate-800">
                  {testCase.gherkin || "No Gherkin body provided."}
                </pre>
              </div>
            ) : testCase.type === "GENERIC" ? (
              <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Automated / Generic Definition</h3>
                <pre className="whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-50 p-4 font-mono text-xs text-slate-800">
                  {testCase.genericDefinition || "No definition provided."}
                </pre>
              </div>
            ) : (
              <div>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Test Steps</h3>
                <div className="space-y-3">
                  {(Array.isArray(testCase.steps) ? (testCase.steps as any[]) : []).map((step, i) => (
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
            )}
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
                  <span className="text-sm text-slate-600">Type</span>
                  <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {testCase.type ?? "MANUAL"}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-sm text-slate-600">Component</span>
                  <span className="text-sm font-medium text-slate-900">{testCase.component || "-"}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <span className="text-sm text-slate-600">Folder</span>
                  <select
                    aria-label="Test case folder"
                    value={testCase.folderId ?? ""}
                    disabled={moveFolderMutation.isPending || !canEditCase}
                    onChange={(e) => moveFolderMutation.mutate(e.target.value || null)}
                    className="max-w-[180px] rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20 disabled:opacity-50"
                  >
                    <option value="">(unfiled)</option>
                    {folders?.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.path}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 pt-1">
                  <span className="text-sm text-slate-600">Automation</span>
                  <div className="flex flex-wrap justify-end gap-2">
                    {testCase.isAutomated && (
                      <span className="rounded border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
                        AUTO{testCase.automationId ? `: ${testCase.automationId}` : ""}
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
                {Array.isArray(testCase.tags) && testCase.tags.length > 0 && (
                  <div className="flex items-start justify-between gap-2 pt-1">
                    <span className="text-sm text-slate-600">Tags</span>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {(testCase.tags as string[]).map((tag) => (
                        <span
                          key={tag}
                          className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Preconditions Card */}
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Preconditions</h3>
                {canEditCase && (
                  <button
                    onClick={() => setIsAddingPrecondition(!isAddingPrecondition)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    {isAddingPrecondition ? "Cancel" : "+ Link / Create"}
                  </button>
                )}
              </div>

              {isAddingPrecondition && (
                <div className="mb-4 space-y-2.5 rounded-md border border-slate-200 bg-slate-50 p-3">
                  <input
                    type="text"
                    value={preconditionSearch}
                    onChange={(e) => setPreconditionSearch(e.target.value)}
                    placeholder="Search existing preconditions..."
                    className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                  />
                  <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
                    {(availablePreconditions || []).length === 0 ? (
                      <p className="py-1.5 text-center text-xs text-slate-500">No matching preconditions.</p>
                    ) : (
                      availablePreconditions.map((pre: any) => (
                        <button
                          key={pre.id}
                          type="button"
                          onClick={() => linkPreconditionMutation.mutate(pre.id)}
                          className="group flex w-full items-center justify-between rounded p-2 text-left transition-colors hover:bg-slate-200/70"
                        >
                          <span className="max-w-[180px] truncate text-xs font-medium text-slate-700 group-hover:text-slate-900">{pre.key}: {pre.name}</span>
                          <span className="text-[10px] font-medium text-blue-600 opacity-0 group-hover:opacity-100">Link</span>
                        </button>
                      ))
                    )}
                  </div>
                  {canCreatePre && (
                    <div className="border-t border-slate-200 pt-2">
                      {!isCreatingInlinePre ? (
                        <button
                          type="button"
                          onClick={() => {
                            setNewPreName(preconditionSearch.trim());
                            setIsCreatingInlinePre(true);
                          }}
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Create & link new precondition
                        </button>
                      ) : (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={newPreName}
                            onChange={(e) => setNewPreName(e.target.value)}
                            placeholder="Precondition name..."
                            className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                          />
                          <textarea
                            rows={2}
                            value={newPreDescription}
                            onChange={(e) => setNewPreDescription(e.target.value)}
                            placeholder="Description (optional)..."
                            className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                          />
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setIsCreatingInlinePre(false)}
                              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={!newPreName.trim() || creatingPreLoading}
                              onClick={() => handleCreateAndLinkPrecondition(newPreName, newPreDescription)}
                              className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                              {creatingPreLoading ? "Saving..." : "Create & Link"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
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
                      {canEditCase && (
                        <button
                          onClick={() => unlinkPreconditionMutation.mutate(pre.id)}
                          className="rounded p-1.5 text-slate-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                          title="Unlink"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Requirements Card */}
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Requirements</h3>
                {canEditCase && (
                  <button
                    type="button"
                    onClick={() => setIsAddingRequirement(!isAddingRequirement)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    {isAddingRequirement ? "Cancel" : "+ Link / Create"}
                  </button>
                )}
              </div>
              {isAddingRequirement && (
                <div className="mb-4 space-y-2.5 rounded-md border border-slate-200 bg-slate-50 p-3">
                  {(projectRequirements || []).length > 0 && (
                    <div className="max-h-32 space-y-1 overflow-y-auto border-b border-slate-200 pb-2">
                      <p className="text-[11px] font-medium text-slate-500">Existing requirements:</p>
                      {(projectRequirements as any[]).map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={async () => {
                            const res = await fetch(`/api/testcases/${params.caseId}/requirements`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ requirementId: r.id, type: "covers" }),
                            });
                            if (res.ok) {
                              toast({ title: "Requirement linked" });
                              queryClient.invalidateQueries({ queryKey: ["testcase", params.caseId] });
                              setIsAddingRequirement(false);
                            } else {
                              toast({ title: "Failed to link requirement" });
                            }
                          }}
                          className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-slate-200/70"
                        >
                          <span className="truncate font-medium text-slate-700">
                            <span className="font-mono text-slate-500">{r.key}</span>: {r.title}
                          </span>
                          <span className="ml-2 shrink-0 text-[10px] font-medium text-blue-600">Link</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="space-y-2">
                    <p className="text-[11px] font-medium text-slate-500">
                      {canCreateReq ? "Or create requirement / paste external URL:" : "Paste external Jira/Requirement URL:"}
                    </p>
                    <input
                      type="text"
                      value={reqTitleOrUrl}
                      onChange={(e) => setReqTitleOrUrl(e.target.value)}
                      placeholder={canCreateReq ? "Requirement title or https://..." : "https://your-domain.atlassian.net/browse/PROJ-123"}
                      className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                    />
                    {canCreateReq && !/^https?:\/\//i.test(reqTitleOrUrl.trim()) && reqTitleOrUrl.trim().length > 0 && (
                      <input
                        type="text"
                        value={reqExternalKey}
                        onChange={(e) => setReqExternalKey(e.target.value)}
                        placeholder="Optional Jira key (e.g. PROJ-123)"
                        className="w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                      />
                    )}
                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={!reqTitleOrUrl.trim() || creatingReqLoading}
                        onClick={handleCreateOrLinkRequirement}
                        className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {creatingReqLoading ? "Saving..." : "Add & Link"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                {(testCase.requirements ?? []).length === 0 ? (
                  <p className="text-sm italic text-slate-400">No requirements linked.</p>
                ) : (
                  (testCase.requirements as any[]).map((req) => (
                    <RequirementRow
                      key={req.id}
                      requirement={req}
                      projectId={projectId}
                      projectKey={projectKey}
                      onDelete={() => deleteRequirementMutation.mutate(req.id)}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Linked Bugs Card */}
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Linked Bugs</h3>
                {canManageBugs && (
                  <button
                    type="button"
                    onClick={() => setIsLinkingBug(!isLinkingBug)}
                    className="text-xs font-medium text-blue-600 hover:text-blue-700"
                  >
                    {isLinkingBug ? "Cancel" : "+ Link Bug"}
                  </button>
                )}
              </div>

              {isLinkingBug && (
                <div className="mb-4 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
                  <input
                    type="text"
                    value={bugSearch}
                    onChange={(e) => setBugSearch(e.target.value)}
                    placeholder="Search existing bugs..."
                    className="w-full rounded border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none"
                  />
                  <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
                    {availableBugs.length === 0 ? (
                      <p className="py-1.5 text-center text-xs text-slate-500">No matching unlinked bugs.</p>
                    ) : (
                      availableBugs.map((b: any) => (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => linkBugMutation.mutate(b.id)}
                          className="group flex w-full items-center justify-between rounded p-2 text-left transition-colors hover:bg-slate-200/70"
                        >
                          <span className="max-w-[180px] truncate text-xs font-medium text-slate-700 group-hover:text-slate-900">
                            {b.key}: {b.summary}
                          </span>
                          <span className="text-[10px] font-medium text-blue-600 opacity-0 group-hover:opacity-100">Link</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {(testCase.bugs ?? []).length === 0 ? (
                  <p className="text-sm italic text-slate-400">No linked bugs.</p>
                ) : (
                  (testCase.bugs as any[]).map((bug) => (
                    <div
                      key={bug.id}
                      className="group flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 p-3 transition-colors hover:border-slate-300"
                    >
                      <a
                        href={`/projects/${projectKey}/bugs/${bug.id}`}
                        className="min-w-0 flex-1"
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${bug.priority === 'CRITICAL' ? 'border-red-200 bg-red-50 text-red-700' :
                              bug.priority === 'HIGH' ? 'border-orange-200 bg-orange-50 text-orange-700' :
                                'border-blue-200 bg-blue-50 text-blue-700'
                            }`}>{bug.key}</span>
                          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${bug.status === 'RESOLVED' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
                              'border-slate-200 bg-white text-slate-600'
                            }`}>{bug.status}</span>
                        </div>
                        <p className="truncate text-xs font-medium text-slate-700 group-hover:text-blue-600">{bug.summary}</p>
                      </a>
                      {canManageBugs && (
                        <button
                          type="button"
                          onClick={() => unlinkBugMutation.mutate(bug.id)}
                          disabled={unlinkBugMutation.isPending}
                          className="rounded p-1.5 text-slate-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                          title="Unlink bug from test case"
                          aria-label={`Unlink ${bug.key}`}
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
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
                <option value="Imported">Imported</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700" htmlFor="type">
                Test Type
              </label>
              <select
                id="type"
                {...form.register("type")}
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              >
                <option value="MANUAL">Manual (Step-by-step)</option>
                <option value="CUCUMBER">Cucumber / Gherkin</option>
                <option value="GENERIC">Generic / Automated</option>
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
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700" htmlFor="preconditions">
                Preconditions
              </label>
              {canCreatePre && (form.watch("preconditions") || "").trim().length > 0 && (
                <button
                  type="button"
                  disabled={creatingPreLoading}
                  onClick={() => {
                    const text = (form.getValues("preconditions") || "").trim();
                    if (!text) return;
                    const firstLine = text.split("\n")[0].slice(0, 60);
                    handleCreateAndLinkPrecondition(
                      firstLine || `${form.getValues("name") || "Case"} Precondition`,
                      text
                    );
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {creatingPreLoading ? "Saving..." : "Save text as reusable precondition"}
                </button>
              )}
            </div>
            <textarea
              id="preconditions"
              rows={2}
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
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700" htmlFor="folderId">
                  Folder
                </label>
                <button
                  type="button"
                  onClick={() => setIsCreatingFolder(!isCreatingFolder)}
                  className="inline-flex items-center gap-0.5 text-xs font-medium text-blue-600 hover:text-blue-700"
                >
                  <Plus className="h-3 w-3" />
                  {isCreatingFolder ? "Cancel" : "New Folder"}
                </button>
              </div>
              <select
                id="folderId"
                {...form.register("folderId")}
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              >
                <option value="">(unfiled)</option>
                {folders?.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.path}
                  </option>
                ))}
              </select>
              {isCreatingFolder && (
                <div className="mt-2 flex gap-1.5">
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="New folder name..."
                    className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 focus:border-blue-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={!newFolderName.trim() || creatingFolderLoading}
                    onClick={handleCreateInlineFolder}
                    className="rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {creatingFolderLoading ? "..." : "Add"}
                  </button>
                </div>
              )}
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
          <div className="grid gap-4 rounded-md border border-slate-200 bg-slate-50 p-4 md:grid-cols-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" {...form.register("isAutomated")} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
              Automated
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" {...form.register("isFlaky")} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
              Flaky
            </label>
            {isAutomated && (
              <div>
                <label className="text-xs font-medium text-slate-700" htmlFor="automationId">
                  Automation ID
                </label>
                <input
                  id="automationId"
                  {...form.register("automationId")}
                  placeholder="e.g. specs/login.spec.ts#should-sign-in"
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                />
              </div>
            )}
          </div>
          {currentType === "CUCUMBER" ? (
            <div>
              <label className="text-sm font-medium text-slate-700" htmlFor="gherkin">
                Gherkin Scenario
              </label>
              <textarea
                id="gherkin"
                rows={8}
                {...form.register("gherkin")}
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                placeholder={"Feature: ...\n  Scenario: ...\n    Given ...\n    When ...\n    Then ..."}
              />
              {form.formState.errors.gherkin ? (
                <p className="mt-1 text-xs text-red-600">{form.formState.errors.gherkin.message}</p>
              ) : null}
            </div>
          ) : currentType === "GENERIC" ? (
            <div>
              <label className="text-sm font-medium text-slate-700" htmlFor="genericDefinition">
                Test Definition / Spec Reference
              </label>
              <textarea
                id="genericDefinition"
                rows={5}
                {...form.register("genericDefinition")}
                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              />
              {form.formState.errors.genericDefinition ? (
                <p className="mt-1 text-xs text-red-600">{form.formState.errors.genericDefinition.message}</p>
              ) : null}
            </div>
          ) : (
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
          )}
        </form>
      )}
    </div>
  );
}
