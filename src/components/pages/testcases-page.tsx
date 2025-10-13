"use client";

import { ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useProjectStore } from "@/lib/stores/project-store";

export type TestCaseRow = {
  id: string;
  key: string;
  name: string;
  priority: string;
  status: string;
  component?: string;
  tags: string[];
};

export function TestCasesPage() {
  const projectId = useProjectStore((state) => state.projectId);
  const { data } = useQuery<TestCaseRow[]>({
    queryKey: ["testcases", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const res = await fetch(`/api/testcases?projectId=${projectId}`);
      if (!res.ok) throw new Error("Failed to load test cases");
      return res.json();
    }
  });

  const columns = useMemo<ColumnDef<TestCaseRow>[]>(
    () => [
      { header: "Key", accessorKey: "key" },
      { header: "Name", accessorKey: "name" },
      { header: "Priority", accessorKey: "priority" },
      { header: "Status", accessorKey: "status" },
      { header: "Component", accessorKey: "component" },
      {
        header: "Tags",
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-2">
            {row.original.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-slate-800 px-2 py-0.5 text-xs uppercase tracking-wide">
                {tag}
              </span>
            ))}
          </div>
        )
      }
    ],
    []
  );

  const table = useReactTable({
    data: data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel()
  });

  return (
    <div className="px-8 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Test Cases</h1>
          <p className="text-sm text-slate-400">Organize manual and automated coverage.</p>
        </div>
        <Link
          href="/testcases/new"
          className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-blue-500"
        >
          New Case
        </Link>
      </div>
      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50">
        <table className="min-w-full divide-y divide-slate-800 text-sm">
          <thead className="bg-slate-900/80">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-4 py-3 text-left font-medium uppercase tracking-wide text-slate-400">
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-800">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-900/60">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 text-slate-200">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
