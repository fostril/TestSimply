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

const generalSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    description: z.string().optional(),
});

const jiraSchema = z.object({
    jiraUrl: z.string().url("Invalid URL").optional().or(z.literal("")),
    jiraEmail: z.string().email("Invalid email").optional().or(z.literal("")),
    jiraApiToken: z.string().optional(),
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
    const setProjectId = useProjectStore((state) => state.setProjectId);
    const [isDeleting, setIsDeleting] = useState(false);
    const [testConnectionResult, setTestConnectionResult] = useState<{ success: boolean; message?: string } | null>(null);

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
        defaultValues: { jiraUrl: "", jiraEmail: "", jiraApiToken: "" },
    });

    const ciForm = useForm<CiFormValues>({
        resolver: zodResolver(ciSchema),
        defaultValues: { ciProvider: "", ciUrl: "", ciToken: "", ciWorkflowId: "" },
    });

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
                body: JSON.stringify({ projectId: params.id, ...values }),
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
            setProjectId(null);
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

    if (isLoading) return <div className="p-8 text-slate-400">Loading...</div>;
    if (!project) return <div className="p-8 text-red-400">Project not found</div>;

    return (
        <div className="mx-auto max-w-2xl px-8 py-10">
            <h1 className="mb-8 text-3xl font-bold text-white">Project Settings</h1>

            <div className="space-y-8">
                {/* General Settings */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
                    <h2 className="mb-4 text-lg font-semibold text-white">General</h2>
                    <form onSubmit={generalForm.handleSubmit((v) => updateGeneralMutation.mutate(v))} className="space-y-4">
                        <div>
                            <label className="text-sm font-medium text-slate-300" htmlFor="name">Project Name</label>
                            <input
                                id="name"
                                {...generalForm.register("name")}
                                className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
                            />
                            {generalForm.formState.errors.name && (
                                <p className="mt-1 text-xs text-red-400">{generalForm.formState.errors.name.message}</p>
                            )}
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-300" htmlFor="description">Description</label>
                            <textarea
                                id="description"
                                rows={3}
                                {...generalForm.register("description")}
                                className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
                            />
                        </div>
                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={updateGeneralMutation.isPending}
                                className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white shadow-lg hover:bg-blue-500 disabled:opacity-50"
                            >
                                {updateGeneralMutation.isPending ? "Saving..." : "Save Changes"}
                            </button>
                        </div>
                    </form>
                </div>

                {/* Jira Integration */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
                    <h2 className="mb-4 text-lg font-semibold text-white">Jira Integration</h2>
                    <form onSubmit={jiraForm.handleSubmit((v) => updateSettingsMutation.mutate(v))} className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <label className="text-sm font-medium text-slate-300" htmlFor="jiraUrl">Jira URL</label>
                                <input
                                    id="jiraUrl"
                                    {...jiraForm.register("jiraUrl")}
                                    placeholder="https://your-domain.atlassian.net"
                                    className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
                                />
                                {jiraForm.formState.errors.jiraUrl && (
                                    <p className="mt-1 text-xs text-red-400">{jiraForm.formState.errors.jiraUrl.message}</p>
                                )}
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-300" htmlFor="jiraEmail">Jira Email</label>
                                <input
                                    id="jiraEmail"
                                    {...jiraForm.register("jiraEmail")}
                                    placeholder="email@example.com"
                                    className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
                                />
                                {jiraForm.formState.errors.jiraEmail && (
                                    <p className="mt-1 text-xs text-red-400">{jiraForm.formState.errors.jiraEmail.message}</p>
                                )}
                            </div>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-300" htmlFor="jiraApiToken">API Token</label>
                            <input
                                id="jiraApiToken"
                                type="password"
                                {...jiraForm.register("jiraApiToken")}
                                placeholder="••••••••••••••••"
                                className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
                            />
                        </div>
                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={updateSettingsMutation.isPending}
                                className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white shadow-lg hover:bg-blue-500 disabled:opacity-50"
                            >
                                {updateSettingsMutation.isPending ? "Saving..." : "Save Changes"}
                            </button>
                        </div>
                    </form>
                </div>

                {/* CI/CD Integration */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
                    <h2 className="mb-4 text-lg font-semibold text-white">CI/CD Integration</h2>
                    <form onSubmit={ciForm.handleSubmit((v) => updateSettingsMutation.mutate(v))} className="space-y-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <label className="text-sm font-medium text-slate-300" htmlFor="ciProvider">Provider</label>
                                <select
                                    id="ciProvider"
                                    {...ciForm.register("ciProvider")}
                                    className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
                                >
                                    <option value="">Select Provider</option>
                                    <option value="GITHUB">GitHub Actions</option>
                                    <option value="GITLAB">GitLab CI</option>
                                    <option value="JENKINS">Jenkins</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-300" htmlFor="ciUrl">CI URL</label>
                                <input
                                    id="ciUrl"
                                    {...ciForm.register("ciUrl")}
                                    placeholder="https://api.github.com"
                                    className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
                                />
                                {ciForm.formState.errors.ciUrl && (
                                    <p className="mt-1 text-xs text-red-400">{ciForm.formState.errors.ciUrl.message}</p>
                                )}
                            </div>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <label className="text-sm font-medium text-slate-300" htmlFor="ciToken">CI Token</label>
                                <input
                                    id="ciToken"
                                    type="password"
                                    {...ciForm.register("ciToken")}
                                    placeholder="••••••••••••••••"
                                    className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-300" htmlFor="ciWorkflowId">Workflow Filename</label>
                                <input
                                    id="ciWorkflowId"
                                    {...ciForm.register("ciWorkflowId")}
                                    placeholder="e.g. main.yml"
                                    className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
                                />
                            </div>
                        </div>
                        <div className="flex items-center justify-between">
                            <div>
                                {testConnectionResult && (
                                    <span className={`text-sm ${testConnectionResult.success ? 'text-green-400' : 'text-red-400'}`}>
                                        {testConnectionResult.message}
                                    </span>
                                )}
                            </div>
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => testConnectionMutation.mutate()}
                                    disabled={testConnectionMutation.isPending}
                                    className="rounded-full border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                                >
                                    {testConnectionMutation.isPending ? "Testing..." : "Test Connection"}
                                </button>
                                <button
                                    type="submit"
                                    disabled={updateSettingsMutation.isPending}
                                    className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white shadow-lg hover:bg-blue-500 disabled:opacity-50"
                                >
                                    {updateSettingsMutation.isPending ? "Saving..." : "Save Changes"}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>

                {/* Danger Zone */}
                <div className="rounded-xl border border-red-900/30 bg-red-950/10 p-6">
                    <h2 className="mb-2 text-lg font-semibold text-red-400">Danger Zone</h2>
                    <p className="mb-6 text-sm text-slate-400">
                        Deleting a project is irreversible. All test cases, executions, and results associated with this project will be permanently removed.
                    </p>

                    {!isDeleting ? (
                        <button
                            onClick={() => setIsDeleting(true)}
                            className="flex items-center gap-2 rounded-full border border-red-900/50 bg-red-950/30 px-5 py-2 text-sm font-semibold text-red-400 hover:bg-red-900/50"
                        >
                            <Trash2 className="h-4 w-4" />
                            Delete Project
                        </button>
                    ) : (
                        <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-4">
                            <div className="flex items-start gap-3">
                                <AlertTriangle className="h-5 w-5 text-red-400" />
                                <div>
                                    <h3 className="font-semibold text-red-400">Are you absolutely sure?</h3>
                                    <p className="mt-1 text-sm text-slate-300">
                                        This action cannot be undone. This will permanently delete the project <strong>{project.name}</strong> and all its data.
                                    </p>
                                    <div className="mt-4 flex gap-3">
                                        <button
                                            onClick={() => deleteMutation.mutate()}
                                            disabled={deleteMutation.isPending}
                                            className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                                        >
                                            {deleteMutation.isPending ? "Deleting..." : "Yes, Delete Project"}
                                        </button>
                                        <button
                                            onClick={() => setIsDeleting(false)}
                                            className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
