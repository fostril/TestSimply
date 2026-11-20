"use client";

import { useState } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { useProjectStore } from "@/lib/stores/project-store";
import { ExternalLink, Link2, Search, Trash2 } from "lucide-react";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { DEFAULT_PAGE_LIMIT, fetchPaginated, type PaginatedResult } from "@/lib/pagination";

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

function JiraStatusBadge({ projectId, issueKey }: { projectId: string | null; issueKey: string }) {
  const { data: jiraIssue } = useQuery<{ status: string; statusColor?: string } | null>({
    queryKey: ["jira", issueKey, projectId],
    enabled: Boolean(projectId && issueKey),
    queryFn: async () => {
      const res = await fetch(
        `/api/integrations/jira/issue?projectId=${projectId}&key=${encodeURIComponent(issueKey)}`
      );
      if (!res.ok) return null;
      return res.json();
    },
    retry: false,
  });

  if (!jiraIssue?.status) return null;

  return (
    <span
      className={`rounded border px-2 py-0.5 font-medium ${
        jiraIssue.statusColor === "green" || jiraIssue.status === "Done"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : jiraIssue.statusColor === "yellow" || jiraIssue.status === "In Progress"
            ? "border-blue-200 bg-blue-50 text-blue-700"
            : "border-slate-200 bg-slate-100 text-slate-700"
      }`}
    >
      Jira: {jiraIssue.status}
    </span>
  );
}

export function RequirementsPage() {
  const projectId = useProjectStore((s) => s.projectId);
  const projectKey = useProjectStore((s) => s.projectKey);
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  const { data: paginated } = useQuery<PaginatedResult<Requirement>>({
    queryKey: ["requirements", projectId, searchQuery, statusFilter, page],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(DEFAULT_PAGE_LIMIT),
      });
      if (projectId) params.set("projectId", projectId);
      if (searchQuery) params.set("search", searchQuery);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      return fetchPaginated<Requirement>(
        `/api/requirements?${params.toString()}`,
        "Failed to load requirements"
      );
    },
  });
  const data = paginated?.items;

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
    <div className="mx-auto max-w-6xl px-8 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Requirements</h1>
          <p className="mt-1 text-sm text-slate-600">
            Track requirements and link them to test cases for coverage traceability.
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Requirement
        </button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by key, title or external key..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="w-full rounded-md border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
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
            className="group relative cursor-pointer rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-wide text-slate-500">
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
                <h2 className="mt-1 truncate text-base font-semibold text-slate-900 group-hover:text-blue-600">
                  {req.title}
                </h2>
                {req.description && (
                  <p className="mt-1.5 line-clamp-2 text-sm text-slate-600">
                    {req.description}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
                  <span
                    className={`rounded border px-2 py-0.5 font-medium ${
                      req.status === "DONE"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : req.status === "IN_PROGRESS"
                          ? "border-blue-200 bg-blue-50 text-blue-700"
                          : req.status === "REJECTED"
                            ? "border-red-200 bg-red-50 text-red-700"
                            : "border-slate-200 bg-slate-100 text-slate-700"
                    }`}
                  >
                    {req.status}
                  </span>
                  {req.externalIssueKey && (
                    <JiraStatusBadge projectId={projectId} issueKey={req.externalIssueKey} />
                  )}
                  <span className="font-medium text-slate-600">{req.priority}</span>
                  <span className="flex items-center gap-1 text-slate-500">
                    <Link2 className="h-3.5 w-3.5" />
                    {req._count?.links ?? 0} linked cases
                  </span>
                  {req.externalUrl && (
                    <a
                      href={req.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 font-medium text-blue-600 hover:underline"
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
                className="rounded p-1.5 text-slate-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        {(data ?? []).length === 0 && (
          <div className="col-span-2 rounded-lg border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-500">
            No requirements found. Create one to get started.
          </div>
        )}
      </div>

      {paginated && (
        <div className="mt-6">
          <PaginationControls
            page={paginated.page}
            totalPages={paginated.totalPages}
            total={paginated.total}
            limit={paginated.limit}
            onPageChange={setPage}
          />
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold text-slate-900">Create requirement</h2>
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
                <label className="text-sm font-medium text-slate-700">Title</label>
                <input
                  name="title"
                  required
                  className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Description</label>
                <textarea
                  name="description"
                  rows={3}
                  className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-700">Priority</label>
                  <select
                    name="priority"
                    defaultValue="MEDIUM"
                    className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700">
                    Jira issue key
                  </label>
                  <input
                    name="externalIssueKey"
                    placeholder="ACME-123"
                    className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">External URL</label>
                <input
                  name="externalUrl"
                  type="url"
                  placeholder="https://..."
                  className="mt-1.5 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
                />
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
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
