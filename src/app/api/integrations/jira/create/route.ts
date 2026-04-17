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

    // We need the Jira Project Key. 
    // Ideally, this should be stored in settings, but for now we might assume it matches the TestSimply project key 
    // OR we can try to fetch it from settings if we add a field for "Jira Project Key".
    // For now, let's assume the user provides it or we default to the TestSimply project key (which might not match).
    // Let's check if we have a Jira Project Key in settings.

    const settings = await prisma.projectSetting.findUnique({
        where: { projectId: parsed.projectId },
    });

    // If we don't have a specific Jira Project Key setting, we'll try to use the TestSimply project key
    // But often they differ. Let's assume for this MVP that the user might need to configure it.
    // However, the `JiraClient` doesn't expose project key config.
    // Let's rely on the client sending it, or fallback to the local project key.

    let jiraProjectKey = parsed.projectKey;
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
