"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState } from "react";

type AuditLog = {
    id: string;
    action: string;
    entity: string;
    entityId: string;
    payload: any;
    createdAt: string;
    user: {
        id: string;
        name: string;
        email: string;
    } | null;
};

export function AuditLogsPage() {
    const [entityFilter, setEntityFilter] = useState<string>("");

    const { data: logs, isLoading } = useQuery<AuditLog[]>({
        queryKey: ["audit-logs", entityFilter],
        queryFn: async () => {
            const params = new URLSearchParams();
            if (entityFilter) params.set("entity", entityFilter);

            const res = await fetch(`/api/audit-logs?${params.toString()}`);
            if (!res.ok) throw new Error("Failed to fetch audit logs");
            return res.json();
        },
    });

    return (
        <div className="mx-auto max-w-6xl px-6 py-6">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-slate-900">Audit Logs</h1>
                    <p className="mt-1 text-sm text-slate-600">Track changes and activity across the system.</p>
                </div>
                <div className="flex gap-2">
                    <select
                        value={entityFilter}
                        onChange={(e) => setEntityFilter(e.target.value)}
                        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-blue-600 focus:outline-none"
                    >
                        <option value="">All Entities</option>
                        <option value="TestCase">Test Case</option>
                        <option value="TestPlan">Test Plan</option>
                        <option value="TestExecution">Test Execution</option>
                        <option value="User">User</option>
                        <option value="PersonalAccessToken">Personal Access Token</option>
                    </select>
                </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase text-slate-500">
                        <tr>
                            <th className="px-6 py-3">Time</th>
                            <th className="px-6 py-3">User</th>
                            <th className="px-6 py-3">Action</th>
                            <th className="px-6 py-3">Entity</th>
                            <th className="px-6 py-3">Details</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {isLoading ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                                    Loading logs...
                                </td>
                            </tr>
                        ) : logs?.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                                    No audit logs found.
                                </td>
                            </tr>
                        ) : (
                            logs?.map((log) => (
                                <tr key={log.id} className="hover:bg-slate-50">
                                    <td className="whitespace-nowrap px-6 py-3 text-slate-600">
                                        {format(new Date(log.createdAt), "MMM d, yyyy HH:mm:ss")}
                                    </td>
                                    <td className="px-6 py-3 font-medium text-slate-900">
                                        {log.user ? (
                                            <div className="flex flex-col">
                                                <span>{log.user.name}</span>
                                                <span className="text-xs font-normal text-slate-500">{log.user.email}</span>
                                            </div>
                                        ) : (
                                            <span className="italic text-slate-400">System / Unknown</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-3">
                                        <span
                                            className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${
                                                log.action.includes("CREATE")
                                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                                    : log.action.includes("UPDATE")
                                                        ? "border-blue-200 bg-blue-50 text-blue-700"
                                                        : log.action.includes("DELETE")
                                                            ? "border-red-200 bg-red-50 text-red-700"
                                                            : "border-slate-200 bg-slate-100 text-slate-700"
                                            }`}
                                        >
                                            {log.action}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3">
                                        <div className="flex flex-col">
                                            <span className="font-medium text-slate-900">{log.entity}</span>
                                            <span className="font-mono text-xs text-slate-500">{log.entityId.substring(0, 8)}...</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-3">
                                        <details className="group">
                                            <summary className="cursor-pointer text-xs font-medium text-blue-600 hover:underline">View Payload</summary>
                                            <pre className="mt-2 max-w-xs overflow-auto rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                                                {JSON.stringify(log.payload, null, 2)}
                                            </pre>
                                        </details>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
