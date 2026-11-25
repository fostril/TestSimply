"use client";

import { Fragment, useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useProjectStore } from "@/lib/stores/project-store";
import { Download, ExternalLink } from "lucide-react";
import { escapeCsvCell } from "@/lib/csv";

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
  OK: "border-emerald-200 bg-emerald-50 text-emerald-700",
  NOK: "border-red-200 bg-red-50 text-red-700",
  WIP: "border-amber-200 bg-amber-50 text-amber-700",
  NOT_RUN: "border-slate-200 bg-slate-100 text-slate-700",
};

const caseStatusStyle = (status: string | undefined) => {
  if (!status) return "border-slate-200 bg-slate-100 text-slate-600";
  if (status === "PASS") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "FAIL") return "border-red-200 bg-red-50 text-red-700";
  if (status === "BLOCKED") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-100 text-slate-600";
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

  const envNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const env of environments ?? []) {
      if (env?.id && env?.name) {
        map.set(env.id, env.name);
      }
    }
    return map;
  }, [environments]);

  const envLabel = useCallback(
    (envKey: string) => (envKey === "-" ? "(no env)" : envNameById.get(envKey) ?? envKey),
    [envNameById],
  );

  // Flatten env columns — every env that appears in at least one row.
  const envColumns = useMemo(() => {
    const set = new Set<string>();
    for (const r of data?.rows ?? []) {
      for (const c of r.cases) {
        Object.keys(c.latestByEnv).forEach((e) => set.add(e));
      }
    }
    return Array.from(set).sort((a, b) => envLabel(a).localeCompare(envLabel(b)));
  }, [data, envLabel]);

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
      ...envColumns.map((e) => `Env:${envLabel(e)}`),
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
          .map((v) => escapeCsvCell((v ?? "").toString()))
          .join(",");
        rows.push(row);
      }
      if (r.cases.length === 0) {
        rows.push(
          [r.key ?? "", r.title ?? "", r.coverage.derivedStatus, "0", "0", "0", "0", "0", "", "", "", ""]
            .map((v) => escapeCsvCell((v ?? "").toString()))
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
    return <div className="p-8 text-sm text-slate-500">Select a project to view traceability.</div>;
  }

  return (
    <div className="mx-auto max-w-6xl p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Traceability Matrix</h1>
        <button
          onClick={exportCsv}
          disabled={!data}
          className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select
          value={planId}
          onChange={(e) => setPlanId(e.target.value)}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
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
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600/20"
        >
          <option value="">All environments</option>
          {(environments ?? []).map((e: { id: string; name: string }) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={includeUnlinked}
            onChange={(e) => setIncludeUnlinked(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
          />
          Include unlinked tests
        </label>
      </div>

      {isLoading ? (
        <div className="mt-6 text-sm text-slate-500">Loading…</div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 md:grid-cols-5">
            <SummaryCard label="Requirements" value={data?.summary.totalRequirements ?? 0} />
            <SummaryCard label="OK" value={data?.summary.ok ?? 0} color="emerald" />
            <SummaryCard label="NOK" value={data?.summary.nok ?? 0} color="red" />
            <SummaryCard label="WIP" value={data?.summary.wip ?? 0} color="yellow" />
            <SummaryCard label="Not run" value={data?.summary.notRun ?? 0} color="slate" />
          </div>

          <div className="mt-6 overflow-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Requirement</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Tests</th>
                  <th className="px-4 py-3">Case</th>
                  {envColumns.map((e) => (
                    <th key={e} className="px-4 py-3">
                      {envLabel(e)}
                    </th>
                  ))}
                  <th className="px-4 py-3">Bugs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(data?.rows ?? []).map((r) => {
                  const rowSpan = Math.max(1, r.cases.length);
                  return (
                    <Fragment key={r.id ?? "unlinked"}>
                      {r.cases.length === 0 ? (
                        <tr key={`${r.id ?? "none"}-empty`} className="text-slate-500">
                          <td className="px-4 py-3">
                            <RequirementCell r={r} projectKey={projectKey ?? null} />
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded border px-2 py-0.5 text-xs font-medium ${statusStyles[r.coverage.derivedStatus]}`}>
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
                          <tr key={`${r.id ?? "none"}-${c.id}`} className="hover:bg-slate-50">
                            {i === 0 && (
                              <>
                                <td rowSpan={rowSpan} className="px-4 py-3 align-top">
                                  <RequirementCell r={r} projectKey={projectKey ?? null} />
                                </td>
                                <td rowSpan={rowSpan} className="px-4 py-3 align-top">
                                  <span className={`rounded border px-2 py-0.5 text-xs font-medium ${statusStyles[r.coverage.derivedStatus]}`}>
                                    {r.coverage.derivedStatus}
                                  </span>
                                </td>
                                <td rowSpan={rowSpan} className="px-4 py-3 align-top text-slate-600">
                                  {r.coverage.passCases}/{r.coverage.totalCases}
                                </td>
                              </>
                            )}
                            <td className="px-4 py-3">
                              <Link
                                href={`/projects/${projectKey}/testcases/${c.id}`}
                                className="text-slate-900 hover:text-blue-600"
                              >
                                <span className="font-mono text-xs text-slate-500">{c.key}</span>{" "}
                                {c.name}
                              </Link>
                              {c.folderPath && (
                                <p className="mt-0.5 text-[11px] text-slate-500">{c.folderPath}</p>
                              )}
                            </td>
                            {envColumns.map((e) => {
                              const cell = c.latestByEnv[e];
                              return (
                                <td key={e} className="px-4 py-3">
                                  {cell ? (
                                    <span
                                      className={`rounded border px-2 py-0.5 text-xs font-medium ${caseStatusStyle(cell.status)}`}
                                      title={`${cell.executionKey} · ${new Date(cell.executedAt).toLocaleString()}`}
                                    >
                                      {cell.status}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-slate-400">—</span>
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
                                      className="rounded border border-orange-200 bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-700"
                                    >
                                      {b.key}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </Fragment>
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
      ? "text-emerald-600"
      : color === "red"
        ? "text-red-600"
        : color === "yellow"
          ? "text-amber-600"
          : "text-slate-900";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${colorClass}`}>{value}</p>
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
        <p className="font-medium italic text-slate-500">{r.title ?? "(unlinked)"}</p>
      </div>
    );
  }
  return (
    <div>
      <Link
        href={`/projects/${projectKey}/requirements/${r.id}`}
        className="font-medium text-slate-900 hover:text-blue-600"
      >
        <span className="font-mono text-xs text-slate-500">{r.key}</span>{" "}
        {r.title}
      </Link>
      {r.externalUrl && (
        <a
          href={r.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-0.5 flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          External
        </a>
      )}
    </div>
  );
}
