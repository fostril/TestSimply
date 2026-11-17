"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { useToast } from "@/components/ui/toast";
import Link from "next/link";

type TokenRecord = {
  id: string;
  label: string;
  scopes: string[];
  createdAt: string;
  expiresAt: string | null;
};

export function SettingsPage() {
  const toast = useToast();
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "ADMIN";
  const [token, setToken] = useState<string | null>(null);
  const [label, setLabel] = useState("CI Token");
  const [expiryDays, setExpiryDays] = useState("90");

  const { data: tokens, refetch } = useQuery({
    queryKey: ["settings", "tokens"],
    queryFn: async () => {
      const res = await fetch("/api/settings/tokens");
      if (!res.ok) throw new Error("Failed to load tokens");
      return res.json() as Promise<TokenRecord[]>;
    },
  });

  const tokenMutation = useMutation({
    mutationFn: async () => {
      const days = Number(expiryDays);
      const expiresAt =
        Number.isFinite(days) && days > 0
          ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
          : undefined;
      const res = await fetch("/api/settings/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || "CI Token", expiresAt }),
      });
      if (!res.ok) throw new Error("Unable to generate token");
      return (await res.json()) as { token: string };
    },
    onSuccess: (payload) => {
      setToken(payload.token);
      toast({ title: "Token generated", description: "Copy this value now — it will not be shown again" });
      void refetch();
    },
    onError: (error: unknown) => {
      toast({ title: "Unable to generate", description: (error as Error).message });
    },
  });

  const deleteTokenMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/settings/tokens/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Unable to revoke token");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Token revoked" });
      void refetch();
    },
    onError: (error: unknown) => {
      toast({ title: "Unable to revoke", description: (error as Error).message });
    },
  });

  return (
    <div className="px-8 py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Settings</h1>
        <p className="text-sm text-slate-400">
          Manage personal access tokens{isAdmin ? ", users, and audit history" : ""}.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="text-lg font-semibold">Personal Access Tokens</h2>
        <p className="mt-1 text-sm text-slate-400">
          Use a token as a Bearer credential when calling CI import endpoints.
          Jira and CI workflow settings live on each project&apos;s Settings page.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs uppercase tracking-wide text-slate-400">Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="CI Token"
              className="mt-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-slate-400">Expires</label>
            <select
              value={expiryDays}
              onChange={(e) => setExpiryDays(e.target.value)}
              className="mt-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => tokenMutation.mutate()}
            className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-blue-500"
          >
            Generate token
          </button>
        </div>
        {token ? (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4 font-mono text-sm break-all">
            {token}
          </div>
        ) : null}
        {tokens && tokens.length > 0 ? (
          <ul className="mt-4 space-y-2 text-sm text-slate-300">
            {tokens.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 px-3 py-2">
                <div>
                  <span className="font-medium text-white">{item.label}</span>
                  <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase text-slate-300">
                    {item.scopes.join(", ")}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">
                    Created {new Date(item.createdAt).toLocaleDateString()}
                    {item.expiresAt ? ` · Expires ${new Date(item.expiresAt).toLocaleDateString()}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteTokenMutation.mutate(item.id)}
                    className="text-xs text-red-400 hover:text-red-300"
                  >
                    Revoke
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {isAdmin ? (
        <>
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Audit Logs</h2>
                <p className="mt-1 text-sm text-slate-400">View history of changes across projects.</p>
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
                <p className="mt-1 text-sm text-slate-400">Manage user roles and project membership.</p>
              </div>
              <Link
                href="/settings/users"
                className="rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                Manage Users
              </Link>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
