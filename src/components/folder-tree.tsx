"use client";

import { ChevronRight, Folder as FolderIcon, FolderOpen, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/toast";
import { usePermissions } from "@/lib/hooks/use-permissions";

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
  onDropCases,
}: {
  projectId: string;
  selectedFolderId: string | null;
  onSelect: (id: string | null) => void;
  onDropCases?: (caseIds: string[], folderId: string | null) => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canCreateFolder = can("testcase:create");
  const canManageFolder = can("testcase:update");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dragOverId, setDragOverId] = useState<string | null>(null);

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
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["folders", projectId] });
      if (vars.parentId) {
        setExpanded((prev) => new Set(prev).add(vars.parentId!));
      }
    },
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
      qc.invalidateQueries({ queryKey: ["testcases", projectId] });
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

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    if (!onDropCases) return;
    if (!e.dataTransfer.types.includes("application/x-testcase-ids")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverId !== targetId) setDragOverId(targetId);
  };

  const handleDrop = (e: React.DragEvent, folderId: string | null) => {
    setDragOverId(null);
    if (!onDropCases) return;
    const raw = e.dataTransfer.getData("application/x-testcase-ids");
    if (!raw) return;
    e.preventDefault();
    try {
      const ids = JSON.parse(raw) as string[];
      if (Array.isArray(ids) && ids.length > 0) {
        onDropCases(ids, folderId);
      }
    } catch {
      // ignore invalid drag payload
    }
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const isOpen = expanded.has(node.id);
    const isSelected = selectedFolderId === node.id;
    const isDropTarget = dragOverId === node.id;
    return (
      <div key={node.id}>
        <div
          onDragOver={(e) => handleDragOver(e, node.id)}
          onDragLeave={() => dragOverId === node.id && setDragOverId(null)}
          onDrop={(e) => handleDrop(e, node.id)}
          className={`group flex items-center gap-1 rounded px-2 py-1.5 text-sm transition-colors ${
            isDropTarget
              ? "bg-blue-100 text-blue-800 ring-2 ring-blue-500"
              : isSelected
                ? "bg-blue-50 font-medium text-blue-700"
                : "text-slate-700 hover:bg-slate-100"
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <button
            type="button"
            onClick={() => toggle(node.id)}
            className="flex-shrink-0 text-slate-400 hover:text-slate-700"
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
              <span className="ml-auto text-xs text-slate-400">
                {node._count.testCases}
              </span>
            ) : null}
          </button>
          {canCreateFolder && (
            <button
              type="button"
              onClick={() => {
                const name = window.prompt("New subfolder name");
                if (name) createFolder.mutate({ name, parentId: node.id });
              }}
              className="hidden text-slate-400 hover:text-slate-900 group-hover:block"
              aria-label="Add subfolder"
              title="Add subfolder"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
          {canManageFolder && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Delete folder "${node.name}"? Test cases will be unfiled.`)) {
                  deleteFolder.mutate(node.id);
                }
              }}
              className="hidden text-slate-400 hover:text-red-600 group-hover:block"
              aria-label="Delete folder"
              title="Delete folder"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {isOpen && node.children.map((c) => renderNode(c, depth + 1))}
      </div>
    );
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Folders
        </p>
        {canCreateFolder && (
          <button
            type="button"
            onClick={() => {
              const name = window.prompt("New top-level folder name");
              if (name) createFolder.mutate({ name });
            }}
            className="rounded p-0.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            title="New folder"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="max-h-[60vh] space-y-0.5 overflow-auto p-1.5">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm ${
            selectedFolderId === null ? "bg-blue-50 font-medium text-blue-700" : "text-slate-700 hover:bg-slate-100"
          }`}
        >
          <FolderIcon className="h-4 w-4 text-slate-400" />
          All test cases
        </button>
        <button
          type="button"
          onClick={() => onSelect("-")}
          onDragOver={(e) => handleDragOver(e, "-")}
          onDragLeave={() => dragOverId === "-" && setDragOverId(null)}
          onDrop={(e) => handleDrop(e, null)}
          className={`flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm transition-colors ${
            dragOverId === "-"
              ? "bg-blue-100 text-blue-800 ring-2 ring-blue-500"
              : selectedFolderId === "-"
                ? "bg-blue-50 font-medium text-blue-700"
                : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <FolderIcon className="h-4 w-4 text-slate-400" />
          <em>(unfiled)</em>
        </button>
        {tree.map((n) => renderNode(n, 0))}
      </div>
      {onDropCases && (
        <div className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
          Tip: Drag test cases onto a folder, or select rows and click Move to Folder.
        </div>
      )}
    </div>
  );
}
