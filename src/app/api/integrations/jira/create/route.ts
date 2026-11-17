import { NextRequest, NextResponse } from "next/server";
import { requireAuth, withApiHandler, requireProjectAccessOrForbid } from "@/lib/api";
import { JiraClient } from "@/lib/jira";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
    projectId: z.string(),
    summary: z.string().min(1, "Summary is required"),
    description: z.string().optional(),
    issueType: z.string().default("Bug"),
    projectKey: z.string().optional(),
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

    const jira = await JiraClient.forProject(parsed.projectId);
    if (!jira) {
        return NextResponse.json(
            { error: "Jira integration not configured for this project" },
            { status: 400 }
        );
    }

    const settings = await prisma.projectSetting.findUnique({
        where: { projectId: parsed.projectId },
        select: { jiraProjectKey: true },
    });

    let jiraProjectKey = parsed.projectKey?.trim() || settings?.jiraProjectKey?.trim() || undefined;
    if (!jiraProjectKey) {
        const project = await prisma.project.findUnique({
            where: { id: parsed.projectId },
            select: { key: true }
        });
        jiraProjectKey = project?.key;
    }

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
        return NextResponse.json(issue);
    } catch (error) {
        return NextResponse.json(
            { error: (error as Error).message },
            { status: 502 }
        );
    }
});
