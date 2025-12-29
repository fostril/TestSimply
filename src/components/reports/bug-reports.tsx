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
        }
    });

    if (isLoading) {
        return <div className="text-slate-400">Loading bug reports...</div>;
    }

    const { topTestCases, topTestSets } = data || { topTestCases: [], topTestSets: [] };

    return (
        <div className="grid gap-8 md:grid-cols-2">
            {/* Top Test Cases */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
                <div className="bg-slate-900 px-6 py-4 border-b border-slate-800">
                    <h3 className="font-semibold text-white">Top 10 Test Cases with Most Bugs</h3>
                </div>
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-900/50 text-xs uppercase text-slate-500">
                        <tr>
                            <th className="px-6 py-3 font-medium">Key</th>
                            <th className="px-6 py-3 font-medium">Name</th>
                            <th className="px-6 py-3 font-medium text-right">Bugs</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {topTestCases.length === 0 ? (
                            <tr>
                                <td colSpan={3} className="px-6 py-8 text-center text-slate-500">
                                    No bugs linked to test cases yet.
                                </td>
                            </tr>
                        ) : (
                            topTestCases.map((item: any) => (
                                <tr key={item.id} className="hover:bg-slate-800/50">
                                    <td className="px-6 py-3 font-medium text-slate-300">
                                        <a href={`/projects/${projectKey}/testcases/${item.id}`} className="hover:text-brand hover:underline">
                                            {item.key}
                                        </a>
                                    </td>
                                    <td className="px-6 py-3 text-slate-400 truncate max-w-[200px]" title={item.name}>
                                        {item.name}
                                    </td>
                                    <td className="px-6 py-3 text-right font-bold text-red-400">
                                        {item.bugCount}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Top Test Sets */}
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 overflow-hidden">
                <div className="bg-slate-900 px-6 py-4 border-b border-slate-800">
                    <h3 className="font-semibold text-white">Top 10 Test Sets with Most Bugs</h3>
                </div>
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-900/50 text-xs uppercase text-slate-500">
                        <tr>
                            <th className="px-6 py-3 font-medium">Key</th>
                            <th className="px-6 py-3 font-medium">Name</th>
                            <th className="px-6 py-3 font-medium text-right">Bugs</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {topTestSets.length === 0 ? (
                            <tr>
                                <td colSpan={3} className="px-6 py-8 text-center text-slate-500">
                                    No bugs linked to test sets yet.
                                </td>
                            </tr>
                        ) : (
                            topTestSets.map((item: any) => (
                                <tr key={item.id} className="hover:bg-slate-800/50">
                                    <td className="px-6 py-3 font-medium text-slate-300">
                                        <a href={`/projects/${projectKey}/test-sets/${item.id}`} className="hover:text-brand hover:underline">
                                            {item.key}
                                        </a>
                                    </td>
                                    <td className="px-6 py-3 text-slate-400 truncate max-w-[200px]" title={item.name}>
                                        {item.name}
                                    </td>
                                    <td className="px-6 py-3 text-right font-bold text-red-400">
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
