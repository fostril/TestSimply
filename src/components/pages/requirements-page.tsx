"use client";

import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { useProjectStore } from "@/lib/stores/project-store";
import { ExternalLink, Link2, Search, Trash2 } from "lucide-react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

type Requirement = {
  id: string;
  key: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  source: string;
  externalIssueKey: string | null;
  externalUrl: string | null;
  tags: string[];
  _count?: { links: number };
};

const STATUSES = ["OPEN", "IN_PROGRESS", "DONE", "REJECTED"] as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export function RequirementsPage() {
  const projectId = useProjectStore((s) => s.projectId);
  const projectKey = useProjectStore((s) => s.projectKey);
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  const { data } = useQuery<Requirement[]>({
    queryKey: ["requirements", projectId, searchQuery, statusFilter],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const params = new URLSearchParams();
      if (projectId) params.set("projectId", projectId);
      if (searchQuery) params.set("search", searchQuery);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      const res = await fetch(`/api/requirements?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load requirements");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: {
      title: string;
      description?: string;
      priority: string;
      externalIssueKey?: string;
      externalUrl?: string;
    }) => {
      const res = await fetch("/api/requirements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          title: input.title,
          description: input.description || undefined,
          priority: input.priority,
          externalIssueKey: input.externalIssueKey || undefined,
          externalUrl: input.externalUrl || undefined,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "Failed to create requirement");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Requirement created" });
      setIsModalOpen(false);
      qc.invalidateQueries({ queryKey: ["requirements", projectId] });
    },
    onError: (e) => toast({ title: "Create failed", description: (e as Error).message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/requirements/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Requirement deleted" });
      qc.invalidateQueries({ queryKey: ["requirements", projectId] });
    },
    onError: (e) => toast({ title: "Delete failed", description: (e as Error).message }),
  });

  return (
    <div className="px-8 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold text-foreground">Requirements</h1>
          <p className="text-sm text-muted-foreground">
            Track requirements and link them to test cases for coverage traceability.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg hover:bg-primary/90"
        >
          New Requirement
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by key, title or external key..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-border bg-card px-10 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="ALL">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {(data ?? []).map((req) => (
          <div
            key={req.id}
            onClick={() => router.push(`/projects/${projectKey}/requirements/${req.id}`)}
            className="group relative cursor-pointer rounded-2xl border border-border bg-card/40 p-6 transition-colors hover:bg-muted/30"
          >
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <span>{req.key}</span>
                  <span>·</span>
                  <span>{req.source}</span>
                  {req.externalIssueKey && (
                    <>
                      <span>·</span>
                      <span>{req.externalIssueKey}</span>
                    </>
                  )}
                </div>
                <h2 className="mt-1 truncate text-xl font-semibold text-foreground group-hover:text-primary">
                  {req.title}
                </h2>
                {req.description && (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {req.description}
                  </p>
                )}
                <div className="mt-4 flex items-center gap-3 text-xs">
                  <span
                    className={`rounded-md px-2 py-1 ring-1 ring-inset ${
                      req.status === "DONE"
                        ? "bg-emerald-400/10 text-emerald-400 ring-emerald-400/20"
                        : req.status === "IN_PROGRESS"
                          ? "bg-blue-400/10 text-blue-400 ring-blue-400/20"
                          : req.status === "REJECTED"
                            ? "bg-red-400/10 text-red-400 ring-red-400/20"
                            : "bg-slate-400/10 text-slate-400 ring-slate-400/20"
                    }`}
                  >
                    {req.status}
                  </span>
                  <span className="text-muted-foreground">{req.priority}</span>
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Link2 className="h-3.5 w-3.5" />
                    {req._count?.links ?? 0} linked cases
                  </span>
                  {req.externalUrl && (
                    <a
                      href={req.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open
                    </a>
                  )}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setItemToDelete(req.id);
                }}
                className="p-2 text-muted-foreground opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        {(data ?? []).length === 0 && (
          <div className="col-span-2 rounded-2xl border border-dashed border-border py-12 text-center text-muted-foreground">
            No requirements found. Create one to get started.
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <h2 className="text-xl font-semibold text-foreground">Create requirement</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                createMutation.mutate({
                  title: String(fd.get("title") ?? ""),
                  description: String(fd.get("description") ?? ""),
                  priority: String(fd.get("priority") ?? "MEDIUM"),
                  externalIssueKey: String(fd.get("externalIssueKey") ?? ""),
                  externalUrl: String(fd.get("externalUrl") ?? ""),
                });
              }}
              className="mt-4 space-y-4"
            >
              <div>
                <label className="text-xs font-medium text-muted-foreground">Title</label>
                <input
                  name="title"
                  required
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Description</label>
                <textarea
                  name="description"
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Priority</label>
                  <select
                    name="priority"
                    defaultValue="MEDIUM"
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Jira issue key
                  </label>
                  <input
                    name="externalIssueKey"
                    placeholder="ACME-123"
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">External URL</label>
                <input
                  name="externalUrl"
                  type="url"
                  placeholder="https://..."
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted/40"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmationDialog
        open={!!itemToDelete}
        onOpenChange={(open) => !open && setItemToDelete(null)}
        title="Delete requirement"
        description="This will unlink any test cases attached to it. This action cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          if (itemToDelete) {
            deleteMutation.mutate(itemToDelete);
            setItemToDelete(null);
          }
        }}
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
