"use client";

import { useQuery } from "@tanstack/react-query";

interface RequirementRowProps {
    requirement: {
        id: string;
        externalUrl: string;
        type: string;
        createdAt: string;
    };
    projectId: string | null;
    onDelete: () => void;
}

export function RequirementRow({ requirement, projectId, onDelete }: RequirementRowProps) {
    const isJira = requirement.type === "Jira" || requirement.externalUrl.includes("atlassian.net");
    const issueKey = isJira ? requirement.externalUrl.split("/").pop() : null;

    const { data: jiraIssue } = useQuery({
        queryKey: ["jira", issueKey, projectId],
        enabled: !!projectId && !!issueKey && isJira,
        queryFn: async () => {
            const res = await fetch(`/api/integrations/jira/issue?projectId=${projectId}&key=${issueKey}`);
            if (!res.ok) return null;
            return res.json();
        },
        retry: false,
    });

    return (
        <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-3">
            <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                </div>
                <div>
                    <div className="flex items-center gap-2">
                        <a
                            href={requirement.externalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-blue-600 hover:underline"
                        >
                            {requirement.externalUrl}
                        </a>
                        {jiraIssue && (
                            <span
                                className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${
                                    jiraIssue.statusColor === "green" || jiraIssue.status === "Done"
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                        : jiraIssue.statusColor === "yellow" || jiraIssue.status === "In Progress"
                                            ? "border-blue-200 bg-blue-50 text-blue-700"
                                            : "border-slate-200 bg-slate-100 text-slate-700"
                                }`}
                            >
                                {jiraIssue.status}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span>Linked {new Date(requirement.createdAt).toLocaleDateString()}</span>
                        {jiraIssue && <span>• {jiraIssue.summary}</span>}
                    </div>
                </div>
            </div>
            <button onClick={onDelete} className="text-slate-400 hover:text-red-600">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
            </button>
        </div>
    );
}
