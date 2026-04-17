"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { useProjectStore } from "@/lib/stores/project-store";
import { ExternalLink, Trash2 } from "lucide-react";

type LinkedCase = {
  id: string;
  key: string;
  name: string;
  status: string | null;
  type: string;
};

type LinkRow = {
  id: string;
  type: string;
  testCase: LinkedCase;
};

type RequirementDetail = {
  id: string;
  key: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  externalIssueKey: string | null;
  externalUrl: string | null;
  source: string;
  tags: string[];
  links: LinkRow[];
};

export function RequirementDetailPage() {
  const params = useParams<{ id: string; reqId: string }>();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const projectId = useProjectStore((s) => s.projectId);
  const projectKey = useProjectStore((s) => s.projectKey);
  const reqId = params.reqId;

  const [caseSearch, setCaseSearch] = useState("");

  const { data: req } = useQuery<RequirementDetail>({
    queryKey: ["requirement", reqId],
    enabled: Boolean(reqId),
    queryFn: async () => {
      const res = await fetch(`/api/requirements/${reqId}`);
      if (!res.ok) throw new Error("Failed to load requirement");
      return res.json();
    },
  });

  const { data: caseOptions } = useQuery({
    queryKey: ["testcases-search", projectId, caseSearch],
    enabled: Boolean(projectId) && caseSearch.length >= 1,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (projectId) params.set("projectId", projectId);
      params.set("search", caseSearch);
      params.set("limit", "20");
      const res = await fetch(`/api/testcases?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to search test cases");
      return res.json() as Promise<{ id: string; key: string; name: string }[]>;
    },
  });

  const linkCase = useMutation({
    mutationFn: async (caseId: string) => {
      const res = await fetch(`/api/testcases/${caseId}/requirements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirementId: reqId, type: "covers" }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "Failed to link case");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Test case linked" });
      qc.invalidateQueries({ queryKey: ["requirement", reqId] });
      setCaseSearch("");
    },
    onError: (e) => toast({ title: "Link failed", description: (e as Error).message }),
  });

  const unlink = useMutation({
    mutationFn: async (link: LinkRow) => {
      const res = await fetch(
        `/api/testcases/${link.testCase.id}/requirements?linkId=${link.id}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error("Failed to unlink");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Test case unlinked" });
      qc.invalidateQueries({ queryKey: ["requirement", reqId] });
    },
  });

  const deleteReq = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/requirements/${reqId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      router.push(`/projects/${projectKey}/requirements`);
    },
  });

  if (!req) return <div className="p-8 text-muted-foreground">Loading…</div>;

  return (
    <div className="px-8 py-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {req.key} · {req.source}
            {req.externalIssueKey && ` · ${req.externalIssueKey}`}
          </p>
          <h1 className="mt-1 text-3xl font-semibold text-foreground">{req.title}</h1>
          {req.description && (
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{req.description}</p>
          )}
          <div className="mt-4 flex items-center gap-3 text-xs">
            <span className="rounded-md bg-muted/40 px-2 py-1">{req.status}</span>
            <span className="rounded-md bg-muted/40 px-2 py-1">{req.priority}</span>
            {req.externalUrl && (
              <a
                href={req.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-primary hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open external
              </a>
            )}
          </div>
        </div>
        <button
          onClick={() => {
            if (window.confirm("Delete this requirement?")) deleteReq.mutate();
          }}
          className="rounded-full border border-border px-3 py-2 text-sm text-muted-foreground hover:text-red-400"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card/40 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Linked test cases</h2>
          <span className="text-sm text-muted-foreground">{req.links.length} linked</span>
        </div>

        <div className="mt-4 relative">
          <input
            value={caseSearch}
            onChange={(e) => setCaseSearch(e.target.value)}
            placeholder="Search test cases to link…"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {caseSearch && caseOptions && caseOptions.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-card shadow-xl">
              {caseOptions.map((c) => {
                const alreadyLinked = req.links.some((l) => l.testCase.id === c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    disabled={alreadyLinked}
                    onClick={() => linkCase.mutate(c.id)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/40 disabled:opacity-50"
                  >
                    <span>
                      <span className="text-muted-foreground">{c.key}</span>{" "}
                      <span className="text-foreground">{c.name}</span>
                    </span>
                    {alreadyLinked && (
                      <span className="text-xs text-muted-foreground">linked</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-4 divide-y divide-border">
          {req.links.map((l) => (
            <div key={l.id} className="flex items-center gap-4 py-3">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/projects/${projectKey}/testcases/${l.testCase.id}`}
                  className="text-sm font-medium hover:text-primary"
                >
                  <span className="text-muted-foreground">{l.testCase.key}</span>{" "}
                  {l.testCase.name}
                </Link>
              </div>
              <span className="text-xs text-muted-foreground">{l.testCase.type}</span>
              <button
                onClick={() => unlink.mutate(l)}
                className="text-muted-foreground hover:text-red-400"
                title="Unlink"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {req.links.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No test cases linked yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
