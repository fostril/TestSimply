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

export function SettingsPage({ section = "all" }: { section?: "all" | "tokens" | "admin" } = {}) {
  const toast = useToast();
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "ADMIN";
  const showTokens = section !== "admin" || !isAdmin;
  const showAdmin = isAdmin && section !== "tokens";
  const [token, setToken] = useState<string | null>(null);
  const [label, setLabel] = useState("CI Token");
  const [scope, setScope] = useState<"import" | "full">("import");
  const [expiryDays, setExpiryDays] = useState("90");

  const { data: tokens, refetch } = useQuery({
    queryKey: ["settings", "tokens"],
    enabled: showTokens,
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
        body: JSON.stringify({
          label: label.trim() || "CI Token",
          scopes: [scope],
          expiresAt,
        }),
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
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          {section === "tokens" ? "Personal Access Tokens" : section === "admin" && isAdmin ? "Administration" : "Settings"}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {section === "tokens"
            ? "Create and revoke API tokens for CI imports and integrations."
            : section === "admin" && isAdmin
              ? "Manage users, roles, and audit history."
              : `Manage personal access tokens${isAdmin ? ", users, and audit history" : ""}.`}
        </p>
      </div>

      {showTokens ? (
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Personal Access Tokens</h2>
          <p className="mt-1 text-sm text-slate-600">
            Use a token as a Bearer credential when calling CI import endpoints.
            Jira and CI workflow settings live on each project&apos;s Settings page.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700">Label</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="CI Token"
                className="mt-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Scope</label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as "import" | "full")}
                className="mt-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
              >
                <option value="import">Import only (CI results)</option>
                <option value="full">Full access</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Expires</label>
            <select
              value={expiryDays}
              onChange={(e) => setExpiryDays(e.target.value)}
              className="mt-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
            >
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="365">1 year</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => tokenMutation.mutate()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Generate token
          </button>
        </div>
        {token ? (
          <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 font-mono text-sm text-emerald-900 break-all">
            {token}
          </div>
        ) : null}
        {tokens && tokens.length > 0 ? (
          <ul className="mt-4 divide-y divide-slate-200 rounded-md border border-slate-200 text-sm">
            {tokens.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{item.label}</span>
                  <span className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                    {item.scopes.join(", ")}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-slate-500">
                    Created {new Date(item.createdAt).toLocaleDateString()}
                    {item.expiresAt ? ` · Expires ${new Date(item.expiresAt).toLocaleDateString()}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteTokenMutation.mutate(item.id)}
                    className="text-xs font-medium text-red-600 hover:underline"
                  >
                    Revoke
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      ) : null}

      {showAdmin ? (
        <>
          <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Audit Logs</h2>
                <p className="mt-1 text-sm text-slate-600">View history of changes across projects.</p>
              </div>
              <Link
                href="/settings/audit-logs"
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                View Logs
              </Link>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">User Management</h2>
                <p className="mt-1 text-sm text-slate-600">Manage user roles and project membership.</p>
              </div>
              <Link
                href="/settings/users"
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
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
