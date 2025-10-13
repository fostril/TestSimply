"use client";

import { ReactNode, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@/lib/simple-query";
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

type Column<T> = {
  header: string;
  accessor?: keyof T;
  render?: (row: T) => ReactNode;
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

  const columns = useMemo<Column<TestCaseRow>[]>(
    () => [
      { header: "Key", accessor: "key" },
      { header: "Name", accessor: "name" },
      { header: "Priority", accessor: "priority" },
      { header: "Status", accessor: "status" },
      { header: "Component", accessor: "component" },
      {
        header: "Tags",
        render: (row) => (
          <div className="flex flex-wrap gap-2">
            {row.tags.map((tag) => (
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

  const rows = data ?? [];

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
            <tr>
              {columns.map((column) => (
                <th key={column.header} className="px-4 py-3 text-left font-medium uppercase tracking-wide text-slate-400">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-900/60">
                {columns.map((column) => {
                  const key = column.accessor ?? column.header;
                  return (
                    <td key={String(key)} className="px-4 py-3 text-slate-200">
                      {column.render ? column.render(row) : (row[column.accessor as keyof TestCaseRow] as ReactNode) ?? ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
