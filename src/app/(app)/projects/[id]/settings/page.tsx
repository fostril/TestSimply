"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { useProjectStore } from "@/lib/stores/project-store";
import { AlertTriangle, Trash2 } from "lucide-react";
import { usePermissions } from "@/lib/hooks/use-permissions";

const generalSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    description: z.string().optional(),
});

const jiraSchema = z.object({
    jiraUrl: z.string().url("Invalid URL").optional().or(z.literal("")),
    jiraEmail: z.string().email("Invalid email").optional().or(z.literal("")),
    jiraApiToken: z.string().optional(),
    jiraProjectKey: z.string().optional(),
});

const ciSchema = z.object({
    ciProvider: z.string().optional(),
    ciUrl: z.string().url("Invalid URL").optional().or(z.literal("")),
    ciToken: z.string().optional(),
    ciWorkflowId: z.string().optional(),
});

type GeneralFormValues = z.infer<typeof generalSchema>;
type JiraFormValues = z.infer<typeof jiraSchema>;
type CiFormValues = z.infer<typeof ciSchema>;

export default function ProjectSettingsPage({ params }: { params: { id: string } }) {
    const router = useRouter();
    const toast = useToast();
    const queryClient = useQueryClient();
    const setProject = useProjectStore((state) => state.setProject);
    const { can } = usePermissions();
    const canManageSettings = can("settings:manage");
    const canDeleteProject = can("project:delete");
    const [isDeleting, setIsDeleting] = useState(false);
    const [testConnectionResult, setTestConnectionResult] = useState<{ success: boolean; message?: string } | null>(null);
    const [jiraTestResult, setJiraTestResult] = useState<{ success: boolean; message?: string } | null>(null);

    const { data: project, isLoading } = useQuery({
        queryKey: ["project", params.id],
        queryFn: async () => {
            const res = await fetch(`/api/projects/${params.id}`);
            if (!res.ok) throw new Error("Failed to load project");
            return res.json();
        },
    });

    const generalForm = useForm<GeneralFormValues>({
        resolver: zodResolver(generalSchema),
        defaultValues: { name: "", description: "" },
    });

    const jiraForm = useForm<JiraFormValues>({
        resolver: zodResolver(jiraSchema),
        defaultValues: { jiraUrl: "", jiraEmail: "", jiraApiToken: "", jiraProjectKey: "" },
    });

    const ciForm = useForm<CiFormValues>({
        resolver: zodResolver(ciSchema),
        defaultValues: { ciProvider: "", ciUrl: "", ciToken: "", ciWorkflowId: "" },
    });
    const selectedCiProvider = ciForm.watch("ciProvider");

    useEffect(() => {
        if (project) {
            generalForm.reset({
                name: project.name,
                description: project.description || "",
            });
            jiraForm.reset({
                jiraUrl: project.settings?.jiraUrl || "",
                jiraEmail: project.settings?.jiraEmail || "",
                jiraApiToken: project.settings?.jiraApiToken || "",
                jiraProjectKey: project.settings?.jiraProjectKey || "",
            });
            ciForm.reset({
                ciProvider: project.settings?.ciProvider || "",
                ciUrl: project.settings?.ciUrl || "",
                ciToken: project.settings?.ciToken || "",
                ciWorkflowId: project.settings?.ciWorkflowId || "",
            });
        }
    }, [project, generalForm, jiraForm, ciForm]);

    const updateGeneralMutation = useMutation({
        mutationFn: async (values: GeneralFormValues) => {
            const res = await fetch(`/api/projects/${params.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(values),
            });
            if (!res.ok) {
                const error = await res.text();
                throw new Error(error || "Failed to update project details");
            }
            return res.json();
        },
        onSuccess: () => {
            toast({ title: "Project details updated" });
            queryClient.invalidateQueries({ queryKey: ["project", params.id] });
            queryClient.invalidateQueries({ queryKey: ["projects"] });
        },
        onError: (err) => toast({ title: "Update failed", description: (err as Error).message }),
    });

    const updateSettingsMutation = useMutation({
        mutationFn: async (values: JiraFormValues | CiFormValues) => {
            const res = await fetch(`/api/projects/settings`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId: project?.id ?? params.id, ...values }),
            });
            if (!res.ok) {
                const error = await res.text();
                throw new Error(error || "Failed to update settings");
            }
            return res.json();
        },
        onSuccess: () => {
            toast({ title: "Settings updated" });
            queryClient.invalidateQueries({ queryKey: ["project", params.id] });
        },
        onError: (err) => toast({ title: "Update failed", description: (err as Error).message }),
    });

    const deleteMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch(`/api/projects/${params.id}`, { method: "DELETE" });
            if (!res.ok) throw new Error("Failed to delete project");
            return res.json();
        },
        onSuccess: () => {
            toast({ title: "Project deleted" });
            setProject(null);
            router.push("/");
            queryClient.invalidateQueries({ queryKey: ["projects"] });
        },
        onError: (err) => toast({ title: "Delete failed", description: (err as Error).message }),
    });

    const testConnectionMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch("/api/integrations/ci/test-connection", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId: project?.id }),
            });
            if (!res.ok) throw new Error("Failed to test connection");
            return res.json();
        },
        onSuccess: (data) => {
            setTestConnectionResult(data);
            if (data.success) {
                toast({ title: "Connection successful", description: data.message });
            } else {
                toast({ title: "Connection failed", description: data.message });
            }
        },
        onError: (err) => {
            setTestConnectionResult({ success: false, message: (err as Error).message });
            toast({ title: "Connection test failed", description: (err as Error).message });
        },
    });

    const testJiraConnectionMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch("/api/integrations/jira/test-connection", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectId: project?.id ?? params.id }),
            });
            if (!res.ok) throw new Error("Failed to test Jira connection");
            return res.json();
        },
        onSuccess: (data) => {
            setJiraTestResult(data);
            if (data.success) {
                toast({ title: "Jira connected", description: data.message });
            } else {
                toast({ title: "Jira connection failed", description: data.message });
            }
        },
        onError: (err) => {
            setJiraTestResult({ success: false, message: (err as Error).message });
            toast({ title: "Jira connection test failed", description: (err as Error).message });
        },
    });

    if (isLoading) return <div className="p-8 text-slate-500">Loading...</div>;
    if (!project) return <div className="p-8 text-red-600">Project not found</div>;

    return (
        <div className="mx-auto max-w-2xl px-6 py-8">
            <h1 className="mb-6 text-2xl font-semibold text-slate-900">Project Settings</h1>

            <div className="space-y-6">
                {/* General Settings */}
                <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                    <h2 className="mb-4 text-base font-semibold text-slate-900">General</h2>
                    <form onSubmit={generalForm.handleSubmit((v) => updateGeneralMutation.mutate(v))} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700" htmlFor="name">Project Name</label>
                            <input
                                id="name"
                                {...generalForm.register("name")}
                                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                            />
                            {generalForm.formState.errors.name && (
                                <p className="mt-1 text-xs text-red-600">{generalForm.formState.errors.name.message}</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700" htmlFor="description">Description</label>
                            <textarea
                                id="description"
                                rows={3}
                                {...generalForm.register("description")}
                                className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                            />
                        </div>
                        {canManageSettings && (
                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={updateGeneralMutation.isPending}
                                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                                {updateGeneralMutation.isPending ? "Saving..." : "Save Changes"}
                            </button>
                        </div>
                        )}
                    </form>
                </div>

                {/* Jira Integration */}
                <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                    <h2 className="mb-4 text-base font-semibold text-slate-900">Jira Integration</h2>
                    <form onSubmit={jiraForm.handleSubmit((v) => updateSettingsMutation.mutate(v))} className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <label className="block text-sm font-medium text-slate-700" htmlFor="jiraUrl">Jira URL</label>
                                <input
                                    id="jiraUrl"
                                    {...jiraForm.register("jiraUrl")}
                                    placeholder="https://your-domain.atlassian.net"
                                    className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                                />
                                {jiraForm.formState.errors.jiraUrl && (
                                    <p className="mt-1 text-xs text-red-600">{jiraForm.formState.errors.jiraUrl.message}</p>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700" htmlFor="jiraEmail">Jira Email</label>
                                <input
                                    id="jiraEmail"
                                    {...jiraForm.register("jiraEmail")}
                                    placeholder="email@example.com"
                                    className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                                />
                                {jiraForm.formState.errors.jiraEmail && (
                                    <p className="mt-1 text-xs text-red-600">{jiraForm.formState.errors.jiraEmail.message}</p>
                                )}
                            </div>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <label className="block text-sm font-medium text-slate-700" htmlFor="jiraApiToken">API Token</label>
                                <input
                                    id="jiraApiToken"
                                    type="password"
                                    {...jiraForm.register("jiraApiToken")}
                                    placeholder="••••••••••••••••"
                                    className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700" htmlFor="jiraProjectKey">Jira Project Key</label>
                                <input
                                    id="jiraProjectKey"
                                    {...jiraForm.register("jiraProjectKey")}
                                    placeholder="e.g. PROJ"
                                    className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                                />
                            </div>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                {jiraTestResult && (
                                    <span className={`text-sm ${jiraTestResult.success ? "text-emerald-600" : "text-red-600"}`}>
                                        {jiraTestResult.message}
                                    </span>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => testJiraConnectionMutation.mutate()}
                                    disabled={testJiraConnectionMutation.isPending}
                                    className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                >
                                    {testJiraConnectionMutation.isPending ? "Testing..." : "Test Connection"}
                                </button>
                                <button
                                    type="submit"
                                    disabled={updateSettingsMutation.isPending}
                                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {updateSettingsMutation.isPending ? "Saving..." : "Save Changes"}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>

                {/* CI/CD Integration */}
                <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                    <h2 className="mb-4 text-base font-semibold text-slate-900">CI/CD Integration</h2>
                    <form onSubmit={ciForm.handleSubmit((v) => updateSettingsMutation.mutate(v))} className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <label className="block text-sm font-medium text-slate-700" htmlFor="ciProvider">Provider</label>
                                <select
                                    id="ciProvider"
                                    {...ciForm.register("ciProvider")}
                                    className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                                >
                                    <option value="">Select Provider</option>
                                    <option value="GITHUB">GitHub Actions</option>
                                    <option value="GITLAB">GitLab CI</option>
                                    <option value="JENKINS">Jenkins</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700" htmlFor="ciUrl">
                                    {selectedCiProvider === "GITLAB"
                                        ? "GitLab Project URL"
                                        : selectedCiProvider === "JENKINS"
                                            ? "Jenkins Job / Base URL"
                                            : "GitHub Repository URL"}
                                </label>
                                <input
                                    id="ciUrl"
                                    {...ciForm.register("ciUrl")}
                                    placeholder={
                                        selectedCiProvider === "GITLAB"
                                            ? "https://gitlab.com/group/project"
                                            : selectedCiProvider === "JENKINS"
                                                ? "https://jenkins.example.com/job/my-tests"
                                                : "https://github.com/owner/repo"
                                    }
                                    className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                                />
                                {ciForm.formState.errors.ciUrl && (
                                    <p className="mt-1 text-xs text-red-600">{ciForm.formState.errors.ciUrl.message}</p>
                                )}
                            </div>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <label className="block text-sm font-medium text-slate-700" htmlFor="ciToken">
                                    {selectedCiProvider === "JENKINS" ? "CI Token (username:apiToken)" : "CI Token"}
                                </label>
                                <input
                                    id="ciToken"
                                    type="password"
                                    {...ciForm.register("ciToken")}
                                    placeholder={selectedCiProvider === "JENKINS" ? "user:apiToken" : "••••••••••••••••"}
                                    className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700" htmlFor="ciWorkflowId">
                                    {selectedCiProvider === "JENKINS"
                                        ? "Job Name (optional if in URL)"
                                        : selectedCiProvider === "GITLAB"
                                            ? "Workflow Tag / Label (optional)"
                                            : "Workflow Filename"}
                                </label>
                                <input
                                    id="ciWorkflowId"
                                    {...ciForm.register("ciWorkflowId")}
                                    placeholder={
                                        selectedCiProvider === "JENKINS"
                                            ? "e.g. e2e-suite"
                                            : selectedCiProvider === "GITLAB"
                                                ? "e.g. nightly"
                                                : "e.g. main.yml"
                                    }
                                    className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                                />
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <div>
                                {testConnectionResult && (
                                    <span className={`text-sm ${testConnectionResult.success ? "text-emerald-600" : "text-red-600"}`}>
                                        {testConnectionResult.message}
                                    </span>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => testConnectionMutation.mutate()}
                                    disabled={testConnectionMutation.isPending}
                                    className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                >
                                    {testConnectionMutation.isPending ? "Testing..." : "Test Connection"}
                                </button>
                                <button
                                    type="submit"
                                    disabled={updateSettingsMutation.isPending}
                                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                    {updateSettingsMutation.isPending ? "Saving..." : "Save Changes"}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>

                {/* Danger Zone */}
                {canDeleteProject && (
                <div className="rounded-lg border border-red-200 bg-red-50/50 p-6">
                    <h2 className="mb-2 text-base font-semibold text-red-700">Danger Zone</h2>
                    <p className="mb-4 text-sm text-slate-600">
                        Deleting a project is irreversible. All test cases, executions, and results associated with this project will be permanently removed.
                    </p>

                    {!isDeleting ? (
                        <button
                            onClick={() => setIsDeleting(true)}
                            className="flex items-center gap-2 rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                        >
                            <Trash2 className="h-4 w-4" />
                            Delete Project
                        </button>
                    ) : (
                        <div className="rounded-md border border-red-200 bg-white p-4">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="h-5 w-5 text-red-600" />
                                <div>
                                    <h3 className="font-semibold text-red-700">Are you absolutely sure?</h3>
                                    <p className="mt-1 text-sm text-slate-600">
                                        This action cannot be undone. This will permanently delete the project <strong>{project.name}</strong> and all its data.
                                    </p>
                                    <div className="mt-4 flex gap-2">
                                        <button
                                            onClick={() => deleteMutation.mutate()}
                                            disabled={deleteMutation.isPending}
                                            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                        >
                                            {deleteMutation.isPending ? "Deleting..." : "Yes, Delete Project"}
                                        </button>
                                        <button
                                            onClick={() => setIsDeleting(false)}
                                            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                )}
            </div>
        </div>
    );
}
