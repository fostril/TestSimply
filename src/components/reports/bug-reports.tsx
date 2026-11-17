"use client";

import { useQuery } from "@tanstack/react-query";
import { useProjectStore } from "@/lib/stores/project-store";

export function BugReports() {
    const { projectId, projectKey } = useProjectStore();

    const { data, isLoading } = useQuery({
        queryKey: ["reports", "bugs", projectId],
        enabled: !!projectId,
        queryFn: async () => {
            const res = await fetch(`/api/reports/bugs?projectId=${projectId}`);
            if (!res.ok) throw new Error("Failed to load bug reports");
            return res.json();
        },
    });

    if (isLoading) {
        return <div className="text-sm text-slate-500">Loading bug reports...</div>;
    }

    const { topTestCases, topTestSets } = data || { topTestCases: [], topTestSets: [] };

    return (
        <div className="grid gap-6 md:grid-cols-2">
            {/* Top Test Cases */}
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
                    <h3 className="text-sm font-semibold text-slate-900">Top 10 Test Cases with Most Bugs</h3>
                </div>
                <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50/50 text-xs uppercase text-slate-500">
                        <tr>
                            <th className="px-5 py-2.5 font-medium">Key</th>
                            <th className="px-5 py-2.5 font-medium">Name</th>
                            <th className="px-5 py-2.5 text-right font-medium">Bugs</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {topTestCases.length === 0 ? (
                            <tr>
                                <td colSpan={3} className="px-5 py-8 text-center text-slate-500">
                                    No bugs linked to test cases yet.
                                </td>
                            </tr>
                        ) : (
                            topTestCases.map((item: any) => (
                                <tr key={item.id} className="hover:bg-slate-50">
                                    <td className="px-5 py-2.5 font-medium text-slate-900">
                                        <a href={`/projects/${projectKey}/testcases/${item.id}`} className="text-blue-600 hover:underline">
                                            {item.key}
                                        </a>
                                    </td>
                                    <td className="max-w-[200px] truncate px-5 py-2.5 text-slate-600" title={item.name}>
                                        {item.name}
                                    </td>
                                    <td className="px-5 py-2.5 text-right font-semibold text-red-600">
                                        {item.bugCount}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Top Test Sets */}
            <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
                    <h3 className="text-sm font-semibold text-slate-900">Top 10 Test Sets with Most Bugs</h3>
                </div>
                <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50/50 text-xs uppercase text-slate-500">
                        <tr>
                            <th className="px-5 py-2.5 font-medium">Key</th>
                            <th className="px-5 py-2.5 font-medium">Name</th>
                            <th className="px-5 py-2.5 text-right font-medium">Bugs</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                        {topTestSets.length === 0 ? (
                            <tr>
                                <td colSpan={3} className="px-5 py-8 text-center text-slate-500">
                                    No bugs linked to test sets yet.
                                </td>
                            </tr>
                        ) : (
                            topTestSets.map((item: any) => (
                                <tr key={item.id} className="hover:bg-slate-50">
                                    <td className="px-5 py-2.5 font-medium text-slate-900">
                                        <a href={`/projects/${projectKey}/test-sets/${item.id}`} className="text-blue-600 hover:underline">
                                            {item.key}
                                        </a>
                                    </td>
                                    <td className="max-w-[200px] truncate px-5 py-2.5 text-slate-600" title={item.name}>
                                        {item.name}
                                    </td>
                                    <td className="px-5 py-2.5 text-right font-semibold text-red-600">
                                        {item.bugCount}
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
