import { NextRequest, NextResponse } from "next/server";
import { requireAuth, withApiHandler, requireProjectAccessOrForbid } from "@/lib/api";
import { JiraClient } from "@/lib/jira";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { generateEntityKey } from "@/lib/keys";
import { logAudit } from "@/lib/audit";

const createSchema = z.object({
    projectId: z.string(),
    summary: z.string().min(1, "Summary is required"),
    description: z.string().optional(),
    issueType: z.string().default("Bug"),
    projectKey: z.string().optional(),
    testCaseId: z.string().optional(),
    testSetId: z.string().optional(),
    testResultId: z.string().optional(),
    createLocalBug: z.boolean().optional().default(true),
});

export const POST = withApiHandler(async (req: NextRequest) => {
    const auth = await requireAuth(req, "bug:manage");
    if (!auth.authorized) return auth.response;

    const body = await req.json();
    const parsed = createSchema.parse(body);

    const access = await requireProjectAccessOrForbid(
        auth.session.user.id,
        auth.session.user.role,
        parsed.projectId,
    );
    if (access instanceof NextResponse) return access;

    const resolvedProjectId = access.id;

    // Validate optional local linkage targets belong to this project
    if (parsed.testCaseId) {
        const tc = await prisma.testCase.findUnique({
            where: { id: parsed.testCaseId },
            select: { projectId: true, deletedAt: true },
        });
        if (!tc || tc.deletedAt || tc.projectId !== resolvedProjectId) {
            return NextResponse.json({ error: "Invalid testCaseId" }, { status: 400 });
        }
    }
    if (parsed.testSetId) {
        const ts = await prisma.testSet.findUnique({
            where: { id: parsed.testSetId },
            select: { projectId: true },
        });
        if (!ts || ts.projectId !== resolvedProjectId) {
            return NextResponse.json({ error: "Invalid testSetId" }, { status: 400 });
        }
    }
    if (parsed.testResultId) {
        const tr = await prisma.testResult.findUnique({
            where: { id: parsed.testResultId },
            select: { execution: { select: { projectId: true } } },
        });
        if (!tr || tr.execution.projectId !== resolvedProjectId) {
            return NextResponse.json({ error: "Invalid testResultId" }, { status: 400 });
        }
    }

    const jira = await JiraClient.forProject(resolvedProjectId);
    if (!jira) {
        return NextResponse.json(
            { error: "Jira integration not configured for this project" },
            { status: 400 }
        );
    }

    const settings = await prisma.projectSetting.findUnique({
        where: { projectId: resolvedProjectId },
        select: { jiraProjectKey: true, jiraUrl: true },
    });

    const project = await prisma.project.findUnique({
        where: { id: resolvedProjectId },
        select: { key: true },
    });

    const jiraProjectKey =
        parsed.projectKey?.trim() ||
        settings?.jiraProjectKey?.trim() ||
        project?.key ||
        access.key;

    if (!jiraProjectKey) {
        return NextResponse.json({ error: "Could not determine Jira Project Key" }, { status: 400 });
    }

    try {
        const issue = await jira.createIssue(
            jiraProjectKey,
            parsed.summary,
            parsed.description || "",
            parsed.issueType
        );

        const browseUrl = settings?.jiraUrl
            ? `${settings.jiraUrl.replace(/\/+$/, "")}/browse/${issue.key}`
            : null;

        let localBug: unknown = null;
        if (parsed.createLocalBug && typeof prisma.bug?.create === "function") {
            const localKeyPrefix = project?.key || access.key;
            const localBugKey = await generateEntityKey(
                prisma,
                resolvedProjectId,
                localKeyPrefix,
                "BUG",
            );
            const jiraHeader = browseUrl
                ? `Jira Issue: ${issue.key} (${browseUrl})`
                : `Jira Issue: ${issue.key}`;
            const localDescription = parsed.description
                ? `${jiraHeader}\n\n${parsed.description}`
                : jiraHeader;

            localBug = await prisma.bug.create({
                data: {
                    projectId: resolvedProjectId,
                    key: localBugKey,
                    summary: `[${issue.key}] ${parsed.summary}`,
                    description: localDescription,
                    priority: "MEDIUM",
                    status: "OPEN",
                    testCaseId: parsed.testCaseId || undefined,
                    testSetId: parsed.testSetId || undefined,
                    testResults: parsed.testResultId
                        ? { connect: [{ id: parsed.testResultId }] }
                        : undefined,
                },
            });

            await logAudit(
                auth.session.user?.id,
                "CREATE",
                "Bug",
                (localBug as { id: string }).id,
                {
                    key: localBugKey,
                    jiraKey: issue.key,
                    browseUrl,
                    testCaseId: parsed.testCaseId,
                },
                resolvedProjectId,
            );
        }

        return NextResponse.json({
            ...issue,
            browseUrl,
            localBug,
        });
    } catch (error) {
        return NextResponse.json(
            { error: (error as Error).message },
            { status: 502 }
        );
    }
});
