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
        <div className="px-8 py-6">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Audit Logs</h1>
                    <p className="text-sm text-muted-foreground">Track changes and activity across the system.</p>
                </div>
                <div className="flex gap-2">
                    <select
                        value={entityFilter}
                        onChange={(e) => setEntityFilter(e.target.value)}
                        className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 focus:border-primary focus:outline-none"
                    >
                        <option value="">All Entities</option>
                        <option value="TestCase">Test Case</option>
                        <option value="TestPlan">Test Plan</option>
                        <option value="TestExecution">Test Execution</option>
                    </select>
                </div>
            </div>

            <div className="rounded-xl border border-border bg-card/40 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-muted/50 text-xs uppercase font-medium text-muted-foreground">
                        <tr>
                            <th className="px-6 py-4">Time</th>
                            <th className="px-6 py-4">User</th>
                            <th className="px-6 py-4">Action</th>
                            <th className="px-6 py-4">Entity</th>
                            <th className="px-6 py-4">Details</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {isLoading ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                                    Loading logs...
                                </td>
                            </tr>
                        ) : logs?.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                                    No audit logs found.
                                </td>
                            </tr>
                        ) : (
                            logs?.map((log) => (
                                <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                                    <td className="px-6 py-4 text-muted-foreground whitespace-nowrap">
                                        {format(new Date(log.createdAt), "MMM d, yyyy HH:mm:ss")}
                                    </td>
                                    <td className="px-6 py-4 font-medium text-foreground">
                                        {log.user ? (
                                            <div className="flex flex-col">
                                                <span>{log.user.name}</span>
                                                <span className="text-xs text-muted-foreground">{log.user.email}</span>
                                            </div>
                                        ) : (
                                            <span className="text-muted-foreground italic">System / Unknown</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span
                                            className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${log.action === "CREATE"
                                                    ? "bg-green-400/10 text-green-400 ring-green-400/20"
                                                    : log.action === "UPDATE"
                                                        ? "bg-blue-400/10 text-blue-400 ring-blue-400/20"
                                                        : log.action === "DELETE"
                                                            ? "bg-red-400/10 text-red-400 ring-red-400/20"
                                                            : "bg-slate-400/10 text-slate-400 ring-slate-400/20"
                                                }`}
                                        >
                                            {log.action}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="font-medium text-slate-300">{log.entity}</span>
                                            <span className="text-xs text-muted-foreground font-mono">{log.entityId.substring(0, 8)}...</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <details className="group">
                                            <summary className="cursor-pointer text-xs text-primary hover:underline">View Payload</summary>
                                            <pre className="mt-2 max-w-xs overflow-auto rounded bg-slate-950 p-2 text-xs text-slate-400">
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
