"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import Link from "next/link";

export function SettingsPage() {
  const toast = useToast();
  const [jiraUrl, setJiraUrl] = useState("");
  const [jiraEmail, setJiraEmail] = useState("");
  const [jiraApiToken, setJiraApiToken] = useState("");

  const { data, refetch } = useQuery({
    queryKey: ["settings", "project"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to load settings");
      const projects = await res.json();
      const project = projects[0];
      if (project?.settings) {
        setJiraUrl(project.settings.jiraUrl || "");
        setJiraEmail(project.settings.jiraEmail || "");
        setJiraApiToken(project.settings.jiraApiToken || "");
      }
      return project;
    }
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/projects/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: data.id,
          jiraUrl,
          jiraEmail,
          jiraApiToken,
        }),
      });
      if (!res.ok) throw new Error("Failed to update settings");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Settings updated" });
      void refetch();
    },
    onError: (error: unknown) => {
      toast({ title: "Update failed", description: (error as Error).message });
    }
  });

  const [token, setToken] = useState<string | null>(null);
  const tokenMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/settings/tokens", { method: "POST" });
      if (!res.ok) throw new Error("Unable to generate token");
      return (await res.json()) as { token: string };
    },
    onSuccess: (payload) => {
      setToken(payload.token);
      toast({ title: "Token generated", description: "Copy this value now - it will not be shown again" });
      void refetch();
    },
    onError: (error: unknown) => {
      toast({ title: "Unable to generate", description: (error as Error).message });
    }
  });

  return (
    <div className="px-8 py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Settings</h1>
        <p className="text-sm text-slate-400">Manage project metadata and API tokens.</p>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="text-lg font-semibold mb-4">Jira Integration</h2>
        <div className="grid gap-4 max-w-xl">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Jira URL</label>
            <input
              type="text"
              value={jiraUrl}
              onChange={(e) => setJiraUrl(e.target.value)}
              placeholder="https://your-domain.atlassian.net"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
            <input
              type="email"
              value={jiraEmail}
              onChange={(e) => setJiraEmail(e.target.value)}
              placeholder="email@example.com"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">API Token</label>
            <input
              type="password"
              value={jiraApiToken}
              onChange={(e) => setJiraApiToken(e.target.value)}
              placeholder="••••••••••••••••"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-primary focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-500">
              Generate an API token from your Atlassian account settings.
            </p>
          </div>
          <div className="flex justify-end mt-2">
            <button
              onClick={() => updateSettingsMutation.mutate()}
              disabled={updateSettingsMutation.isPending}
              className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {updateSettingsMutation.isPending ? "Saving..." : "Save Configuration"}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Audit Logs</h2>
            <p className="mt-1 text-sm text-slate-400">View history of changes to test cases and plans.</p>
          </div>
          <Link
            href="/settings/audit-logs"
            className="rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 hover:text-white"
          >
            View Logs
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">User Management</h2>
            <p className="mt-1 text-sm text-slate-400">Manage user roles and permissions.</p>
          </div>
          <Link
            href="/settings/users"
            className="rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 hover:text-white"
          >
            Manage Users
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="text-lg font-semibold">Project Metadata</h2>
        <p className="mt-1 text-sm text-slate-400">Tags, components, and environments.</p>
        <div className="mt-4 grid gap-4 text-sm text-slate-300 lg:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Tags</p>
            <p>{(data?.settings?.tags ?? []).join(", ")}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Components</p>
            <p>{(data?.settings?.components ?? []).join(", ")}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Environments</p>
            <p>{(data?.settings?.environments ?? []).join(", ")}</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="text-lg font-semibold">CI Personal Token</h2>
        <p className="mt-1 text-sm text-slate-400">
          Use this token as a Bearer credential when calling import endpoints.
        </p>
        <button
          type="button"
          onClick={() => tokenMutation.mutate()}
          className="mt-4 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-blue-500"
        >
          Generate token
        </button>
        {token ? (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4 font-mono text-sm">
            {token}
          </div>
        ) : null}
      </section>
    </div>
  );
}
