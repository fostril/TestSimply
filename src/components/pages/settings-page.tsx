"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useToast } from "@/components/ui/toast";

export function SettingsPage() {
  const toast = useToast();
  const { data, refetch } = useQuery({
    queryKey: ["settings", "project"],
    queryFn: async () => {
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to load settings");
      const projects = await res.json();
      return projects[0];
    }
  });

  const [token, setToken] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/settings/tokens", { method: "POST" });
      if (!res.ok) throw new Error("Unable to generate token");
      return res.json() as Promise<{ token: string }>;
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
          onClick={() => mutation.mutate()}
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
