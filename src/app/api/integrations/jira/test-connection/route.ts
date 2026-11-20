import { NextRequest, NextResponse } from "next/server";
import { requireAuth, withApiHandler, requireProjectAccessOrForbid } from "@/lib/api";
import { JiraClient } from "@/lib/jira";
import { prisma } from "@/lib/prisma";

export const POST = withApiHandler(async (req: NextRequest) => {
    const auth = await requireAuth(req, "settings:manage");
    if (!auth.authorized) return auth.response;

    const body = await req.json();
    const { projectId } = body as { projectId?: string };

    if (!projectId) {
        return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }

    const access = await requireProjectAccessOrForbid(
        auth.session.user.id,
        auth.session.user.role,
        projectId,
    );
    if (access instanceof NextResponse) return access;

    const settings = await prisma.projectSetting.findUnique({
        where: { projectId: access.id },
        select: {
            jiraUrl: true,
            jiraEmail: true,
            jiraApiToken: true,
            jiraProjectKey: true,
        },
    });

    if (!settings || !settings.jiraUrl || !settings.jiraEmail || !settings.jiraApiToken) {
        return NextResponse.json({
            success: false,
            message: "Jira is not configured. Please save your Jira URL, email, and API token first.",
        });
    }

    let jira: JiraClient | null = null;
    try {
        jira = await JiraClient.forProject(access.id);
    } catch (err) {
        return NextResponse.json({
            success: false,
            message: (err as Error).message,
        });
    }

    if (!jira) {
        return NextResponse.json({
            success: false,
            message: "Failed to initialize Jira client.",
        });
    }

    const result = await jira.testConnection(settings.jiraProjectKey);
    return NextResponse.json(result);
});
