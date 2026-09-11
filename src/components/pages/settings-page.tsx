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
      const res = await fetch("/api/settings/tokens", { method: "POST" });
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
        <button
          type="button"
          onClick={() => tokenMutation.mutate()}
          className="mt-4 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-blue-500"
        >
          Generate token
        </button>
        {token ? (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4 font-mono text-sm break-all">
            {token}
          </div>
        ) : null}
        {tokens && tokens.length > 0 ? (
          <ul className="mt-4 space-y-2 text-sm text-slate-300">
            {tokens.map((item) => (
              <li key={item.id} className="flex justify-between rounded-lg border border-slate-800 px-3 py-2">
                <span>{item.label}</span>
                <span className="text-xs text-slate-500">
                  {new Date(item.createdAt).toLocaleDateString()}
                </span>
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
