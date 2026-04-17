"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useProjectStore } from "@/lib/stores/project-store";
import { Download, ExternalLink } from "lucide-react";

type Status = "OK" | "NOK" | "WIP" | "NOT_RUN";

type CaseRow = {
  id: string;
  key: string;
  name: string;
  type: string;
  priority: string;
  folderPath: string | null;
  tags: string[];
  latestByEnv: Record<
    string,
    { status: string; executedAt: string; executionKey: string } | null
  >;
  bugs: Array<{ id: string; key: string; summary: string; status: string }>;
};

type RequirementRow = {
  id: string | null;
  key: string | null;
  title: string | null;
  externalUrl: string | null;
  status: string | null;
  coverage: {
    totalCases: number;
    passCases: number;
    failCases: number;
    blockedCases: number;
    skippedCases: number;
    notRunCases: number;
    derivedStatus: Status;
  };
  cases: CaseRow[];
};

type Report = {
  summary: {
    totalRequirements: number;
    ok: number;
    nok: number;
    wip: number;
    notRun: number;
  };
  rows: RequirementRow[];
};

const statusStyles: Record<Status, string> = {
  OK: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
  NOK: "bg-red-500/10 text-red-400 ring-red-500/20",
  WIP: "bg-yellow-500/10 text-yellow-400 ring-yellow-500/20",
  NOT_RUN: "bg-slate-500/10 text-slate-400 ring-slate-500/20",
};

const caseStatusStyle = (status: string | undefined) => {
  if (!status) return "bg-slate-800 text-slate-400";
  if (status === "PASS") return "bg-emerald-900/40 text-emerald-400";
  if (status === "FAIL") return "bg-red-900/40 text-red-400";
  if (status === "BLOCKED") return "bg-yellow-900/40 text-yellow-400";
  return "bg-slate-800 text-slate-400";
};

export function TraceabilityMatrix({ projectId }: { projectId: string | null }) {
  const projectKey = useProjectStore((s) => s.projectKey);
  const [includeUnlinked, setIncludeUnlinked] = useState(false);
  const [planId, setPlanId] = useState<string>("");
  const [environmentId, setEnvironmentId] = useState<string>("");

  const { data: plans } = useQuery({
    queryKey: ["traceability-plans", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const res = await fetch(`/api/testplans?projectId=${projectId}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: environments } = useQuery({
    queryKey: ["traceability-environments", projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const res = await fetch(`/api/environments?projectId=${projectId}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data, isLoading } = useQuery<Report>({
    queryKey: ["traceability", projectId, planId, environmentId, includeUnlinked],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("projectId", projectId!);
      if (planId) params.set("planId", planId);
      if (environmentId) params.set("environmentId", environmentId);
      if (includeUnlinked) params.set("includeUnlinked", "1");
      const res = await fetch(`/api/reports/traceability?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load traceability");
      return res.json();
    },
  });

  // Flatten env columns — every env that appears in at least one row.
  const envColumns = useMemo(() => {
    const set = new Set<string>();
    for (const r of data?.rows ?? []) {
      for (const c of r.cases) {
        Object.keys(c.latestByEnv).forEach((e) => set.add(e));
      }
    }
    return Array.from(set).sort();
  }, [data]);

  const exportCsv = () => {
    if (!data) return;
    const headers = [
      "RequirementKey",
      "RequirementTitle",
      "CoverageStatus",
      "Total",
      "Pass",
      "Fail",
      "Blocked",
      "NotRun",
      "CaseKey",
      "CaseName",
      "CaseType",
      "Bugs",
      ...envColumns.map((e) => `Env:${e}`),
    ];
    const rows: string[] = [headers.join(",")];
    for (const r of data.rows) {
      for (const c of r.cases) {
        const envStatuses = envColumns.map((e) => c.latestByEnv[e]?.status ?? "");
        const row = [
          r.key ?? "",
          r.title ?? "",
          r.coverage.derivedStatus,
          String(r.coverage.totalCases),
          String(r.coverage.passCases),
          String(r.coverage.failCases),
          String(r.coverage.blockedCases),
          String(r.coverage.notRunCases),
          c.key,
          c.name,
          c.type,
          c.bugs.map((b) => b.key).join("|"),
          ...envStatuses,
        ]
          .map((v) => `"${(v ?? "").toString().replace(/"/g, '""')}"`)
          .join(",");
        rows.push(row);
      }
      if (r.cases.length === 0) {
        rows.push(
          [r.key ?? "", r.title ?? "", r.coverage.derivedStatus, "0", "0", "0", "0", "0", "", "", "", ""]
            .map((v) => `"${(v ?? "").toString().replace(/"/g, '""')}"`)
            .join(","),
        );
      }
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `traceability-${projectKey ?? "project"}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!projectId) {
    return <div className="p-8 text-slate-400">Select a project to view traceability.</div>;
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Traceability Matrix</h1>
        <button
          onClick={exportCsv}
          disabled={!data}
          className="inline-flex items-center gap-2 rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select
          value={planId}
          onChange={(e) => setPlanId(e.target.value)}
          className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200"
        >
          <option value="">All plans</option>
          {(plans ?? []).map((p: { id: string; name: string; key: string }) => (
            <option key={p.id} value={p.id}>
              {p.key} · {p.name}
            </option>
          ))}
        </select>
        <select
          value={environmentId}
          onChange={(e) => setEnvironmentId(e.target.value)}
          className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200"
        >
          <option value="">All environments</option>
          {(environments ?? []).map((e: { id: string; name: string }) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={includeUnlinked}
            onChange={(e) => setIncludeUnlinked(e.target.checked)}
            className="rounded border-slate-700 bg-slate-800"
          />
          Include unlinked tests
        </label>
      </div>

      {isLoading ? (
        <div className="mt-6 text-slate-400">Loading…</div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-5">
            <SummaryCard label="Requirements" value={data?.summary.totalRequirements ?? 0} />
            <SummaryCard label="OK" value={data?.summary.ok ?? 0} color="emerald" />
            <SummaryCard label="NOK" value={data?.summary.nok ?? 0} color="red" />
            <SummaryCard label="WIP" value={data?.summary.wip ?? 0} color="yellow" />
            <SummaryCard label="Not run" value={data?.summary.notRun ?? 0} color="slate" />
          </div>

          <div className="mt-6 overflow-auto rounded-xl border border-slate-800 bg-slate-900/50">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Requirement</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Tests</th>
                  <th className="px-4 py-3">Case</th>
                  {envColumns.map((e) => (
                    <th key={e} className="px-4 py-3">
                      {e === "-" ? "(no env)" : e}
                    </th>
                  ))}
                  <th className="px-4 py-3">Bugs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {(data?.rows ?? []).map((r) => {
                  const rowSpan = Math.max(1, r.cases.length);
                  return (
                    <>
                      {r.cases.length === 0 ? (
                        <tr key={`${r.id ?? "none"}-empty`} className="text-slate-500">
                          <td className="px-4 py-3">
                            <RequirementCell r={r} projectKey={projectKey ?? null} />
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded px-2 py-0.5 text-xs ring-1 ring-inset ${statusStyles[r.coverage.derivedStatus]}`}>
                              {r.coverage.derivedStatus}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {r.coverage.passCases}/{r.coverage.totalCases}
                          </td>
                          <td className="px-4 py-3 italic" colSpan={envColumns.length + 2}>
                            No linked tests
                          </td>
                        </tr>
                      ) : (
                        r.cases.map((c, i) => (
                          <tr key={`${r.id ?? "none"}-${c.id}`} className="hover:bg-slate-800/50">
                            {i === 0 && (
                              <>
                                <td rowSpan={rowSpan} className="align-top px-4 py-3">
                                  <RequirementCell r={r} projectKey={projectKey ?? null} />
                                </td>
                                <td rowSpan={rowSpan} className="align-top px-4 py-3">
                                  <span className={`rounded px-2 py-0.5 text-xs ring-1 ring-inset ${statusStyles[r.coverage.derivedStatus]}`}>
                                    {r.coverage.derivedStatus}
                                  </span>
                                </td>
                                <td rowSpan={rowSpan} className="align-top px-4 py-3 text-slate-400">
                                  {r.coverage.passCases}/{r.coverage.totalCases}
                                </td>
                              </>
                            )}
                            <td className="px-4 py-3">
                              <Link
                                href={`/projects/${projectKey}/testcases/${c.id}`}
                                className="text-slate-200 hover:text-primary"
                              >
                                <span className="text-xs text-slate-500">{c.key}</span>{" "}
                                {c.name}
                              </Link>
                              {c.folderPath && (
                                <p className="mt-0.5 text-[11px] text-slate-600">{c.folderPath}</p>
                              )}
                            </td>
                            {envColumns.map((e) => {
                              const cell = c.latestByEnv[e];
                              return (
                                <td key={e} className="px-4 py-3">
                                  {cell ? (
                                    <span
                                      className={`rounded px-2 py-0.5 text-xs font-medium ${caseStatusStyle(cell.status)}`}
                                      title={`${cell.executionKey} · ${new Date(cell.executedAt).toLocaleString()}`}
                                    >
                                      {cell.status}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-slate-600">—</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="px-4 py-3">
                              {c.bugs.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {c.bugs.map((b) => (
                                    <span
                                      key={b.id}
                                      title={b.summary}
                                      className="rounded bg-orange-900/30 px-1.5 py-0.5 text-[10px] font-medium text-orange-300"
                                    >
                                      {b.key}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-slate-600">—</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </>
                  );
                })}
                {(data?.rows ?? []).length === 0 && (
                  <tr>
                    <td colSpan={envColumns.length + 5} className="px-4 py-12 text-center text-slate-500">
                      No requirements found. Create one and link it to test cases to see coverage here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color = "slate",
}: {
  label: string;
  value: number;
  color?: "emerald" | "red" | "yellow" | "slate";
}) {
  const colorClass =
    color === "emerald"
      ? "text-emerald-400"
      : color === "red"
        ? "text-red-400"
        : color === "yellow"
          ? "text-yellow-400"
          : "text-white";
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${colorClass}`}>{value}</p>
    </div>
  );
}

function RequirementCell({
  r,
  projectKey,
}: {
  r: RequirementRow;
  projectKey: string | null;
}) {
  if (!r.id) {
    return (
      <div>
        <p className="font-medium italic text-slate-400">{r.title ?? "(unlinked)"}</p>
      </div>
    );
  }
  return (
    <div>
      <Link
        href={`/projects/${projectKey}/requirements/${r.id}`}
        className="font-medium text-slate-200 hover:text-primary"
      >
        <span className="text-xs text-slate-500">{r.key}</span>{" "}
        {r.title}
      </Link>
      {r.externalUrl && (
        <a
          href={r.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-0.5 flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          External
        </a>
      )}
    </div>
  );
}
