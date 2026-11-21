"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/lib/hooks/use-permissions";

interface RequirementRowProps {
    requirement: {
        id: string;
        externalUrl?: string | null;
        type: string;
        createdAt: string;
        requirementId?: string | null;
        requirement?: {
            id: string;
            key: string;
            title: string;
            status: string;
            externalIssueKey?: string | null;
            externalUrl?: string | null;
        } | null;
    };
    projectId: string | null;
    projectKey?: string | null;
    onDelete: () => void;
}

function extractJiraIssueKey(url: string | null, fallbackIssueKey?: string | null): string | null {
    if (fallbackIssueKey?.trim()) {
        return fallbackIssueKey.trim();
    }
    if (!url) return null;
    try {
        const pathname = new URL(url).pathname;
        const browseMatch = pathname.match(/\/browse\/([A-Za-z][A-Za-z0-9_]*-\d+)/i);
        if (browseMatch?.[1]) return browseMatch[1];
        const parts = pathname.split("/").filter(Boolean);
        return parts.pop() || null;
    } catch {
        const clean = url.split(/[?#]/)[0];
        const parts = clean.split("/").filter(Boolean);
        return parts.pop() || null;
    }
}

export function RequirementRow({ requirement, projectId, projectKey, onDelete }: RequirementRowProps) {
    const { can } = usePermissions();
    const canUnlink = can("testcase:update");
    const externalUrl = requirement.externalUrl ?? requirement.requirement?.externalUrl ?? null;
    const isJira = Boolean(
        requirement.requirement?.externalIssueKey ||
            (externalUrl && (requirement.type === "Jira" || externalUrl.includes("atlassian.net"))),
    );
    const issueKey = isJira
        ? extractJiraIssueKey(externalUrl, requirement.requirement?.externalIssueKey)
        : null;

    const { data: jiraIssue } = useQuery({
        queryKey: ["jira", issueKey, projectId],
        enabled: !!projectId && !!issueKey && isJira,
        queryFn: async () => {
            const res = await fetch(
                `/api/integrations/jira/issue?projectId=${projectId}&key=${encodeURIComponent(issueKey!)}`,
            );
            if (!res.ok) return null;
            return res.json();
        },
        retry: false,
    });

    const nativeReq = requirement.requirement;
    const reqHref =
        nativeReq && projectKey
            ? `/projects/${projectKey}/requirements/${requirement.requirementId ?? nativeReq.id}`
            : null;

    return (
        <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-3">
            <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                </div>
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        {nativeReq ? (
                            reqHref ? (
                                <Link
                                    href={reqHref}
                                    className="truncate text-sm font-medium text-blue-600 hover:underline"
                                >
                                    <span className="font-mono text-xs">{nativeReq.key}</span> {nativeReq.title}
                                </Link>
                            ) : (
                                <span className="truncate text-sm font-medium text-slate-900">
                                    <span className="font-mono text-xs">{nativeReq.key}</span> {nativeReq.title}
                                </span>
                            )
                        ) : externalUrl ? (
                            <a
                                href={externalUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="truncate text-sm font-medium text-blue-600 hover:underline"
                            >
                                {externalUrl}
                            </a>
                        ) : (
                            <span className="text-sm font-medium text-slate-700">Linked Requirement</span>
                        )}
                        {nativeReq?.status && (
                            <span className="inline-flex items-center rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                                {nativeReq.status}
                            </span>
                        )}
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
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span>Linked {new Date(requirement.createdAt).toLocaleDateString()}</span>
                        {nativeReq && externalUrl && (
                            <a
                                href={externalUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="truncate text-blue-600 hover:underline"
                            >
                                • External link
                            </a>
                        )}
                        {jiraIssue && <span>• {jiraIssue.summary}</span>}
                    </div>
                </div>
            </div>
            {canUnlink && (
                <button onClick={onDelete} className="ml-2 shrink-0 text-slate-400 hover:text-red-600" title="Unlink requirement">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>
            )}
        </div>
    );
}
