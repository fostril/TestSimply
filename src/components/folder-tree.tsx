"use client";

import { ChevronRight, Folder as FolderIcon, FolderOpen, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";

export type Folder = {
  id: string;
  parentId: string | null;
  name: string;
  path: string;
  _count?: { testCases: number; children: number };
};

type TreeNode = Folder & { children: TreeNode[] };

function buildTree(folders: Folder[]): TreeNode[] {
  const byId: Record<string, TreeNode> = {};
  for (const f of folders) byId[f.id] = { ...f, children: [] };
  const roots: TreeNode[] = [];
  for (const f of folders) {
    const node = byId[f.id];
    if (f.parentId && byId[f.parentId]) {
      byId[f.parentId].children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortNodes = (ns: TreeNode[]) => {
    ns.sort((a, b) => a.name.localeCompare(b.name));
    ns.forEach((n) => sortNodes(n.children));
  };
  sortNodes(roots);
  return roots;
}

export function FolderTree({
  projectId,
  selectedFolderId,
  onSelect,
}: {
  projectId: string;
  selectedFolderId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: folders } = useQuery<Folder[]>({
    queryKey: ["folders", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const res = await fetch(`/api/folders?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to load folders");
      return res.json();
    },
  });

  const tree = useMemo(() => buildTree(folders ?? []), [folders]);

  const createFolder = useMutation({
    mutationFn: async (input: { name: string; parentId?: string }) => {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, ...input }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "Failed to create folder");
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["folders", projectId] }),
    onError: (e) => toast({ title: "Create failed", description: (e as Error).message }),
  });

  const deleteFolder = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/folders/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? "Failed to delete folder");
      }
      return res.json();
    },
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["folders", projectId] });
      if (selectedFolderId === id) onSelect(null);
    },
    onError: (e) => toast({ title: "Delete failed", description: (e as Error).message }),
  });

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const isOpen = expanded.has(node.id);
    const isSelected = selectedFolderId === node.id;
    return (
      <div key={node.id}>
        <div
          className={`group flex items-center gap-1 rounded px-2 py-1 text-sm hover:bg-muted/40 ${
            isSelected ? "bg-primary/10 text-primary" : "text-foreground"
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <button
            type="button"
            onClick={() => toggle(node.id)}
            className="flex-shrink-0 text-muted-foreground"
            aria-label={isOpen ? "Collapse folder" : "Expand folder"}
          >
            <ChevronRight
              className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`}
            />
          </button>
          <button
            type="button"
            onClick={() => onSelect(node.id)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            {isOpen ? (
              <FolderOpen className="h-4 w-4 flex-shrink-0 text-amber-500" />
            ) : (
              <FolderIcon className="h-4 w-4 flex-shrink-0 text-amber-500" />
            )}
            <span className="truncate">{node.name}</span>
            {node._count ? (
              <span className="ml-auto text-xs text-muted-foreground">
                {node._count.testCases}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => {
              const name = window.prompt("New subfolder name");
              if (name) createFolder.mutate({ name, parentId: node.id });
            }}
            className="hidden text-muted-foreground hover:text-foreground group-hover:block"
            aria-label="Add subfolder"
            title="Add subfolder"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Delete folder "${node.name}"? Test cases will be unfiled.`)) {
                deleteFolder.mutate(node.id);
              }
            }}
            className="hidden text-muted-foreground hover:text-red-400 group-hover:block"
            aria-label="Delete folder"
            title="Delete folder"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        {isOpen && node.children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  return (
    <div className="rounded-lg border border-border bg-card/40">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Repository
        </p>
        <button
          type="button"
          onClick={() => {
            const name = window.prompt("New top-level folder name");
            if (name) createFolder.mutate({ name });
          }}
          className="text-muted-foreground hover:text-foreground"
          title="New folder"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-[60vh] overflow-auto py-1">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`flex w-full items-center gap-2 px-3 py-1 text-left text-sm hover:bg-muted/40 ${
            selectedFolderId === null ? "bg-primary/10 text-primary" : "text-foreground"
          }`}
        >
          <FolderIcon className="h-4 w-4 text-muted-foreground" />
          All test cases
        </button>
        <button
          type="button"
          onClick={() => onSelect("-")}
          className={`flex w-full items-center gap-2 px-3 py-1 text-left text-sm hover:bg-muted/40 ${
            selectedFolderId === "-" ? "bg-primary/10 text-primary" : "text-muted-foreground"
          }`}
        >
          <FolderIcon className="h-4 w-4" />
          <em>(unfiled)</em>
        </button>
        {tree.map((n) => renderNode(n, 0))}
      </div>
    </div>
  );
}
