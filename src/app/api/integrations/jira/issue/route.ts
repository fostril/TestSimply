import { NextRequest, NextResponse } from "next/server";
import { requireAuth, withApiHandler, requireProjectAccessOrForbid } from "@/lib/api";
import { JiraClient } from "@/lib/jira";

export const GET = withApiHandler(async (req: NextRequest) => {
    const auth = await requireAuth(req, "project:view");
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const key = searchParams.get("key");

    if (!projectId || !key) {
        return NextResponse.json({ error: "Missing projectId or key" }, { status: 400 });
    }

    const access = await requireProjectAccessOrForbid(
        auth.session.user.id,
        auth.session.user.role,
        projectId,
    );
    if (access instanceof NextResponse) return access;

    const jira = await JiraClient.forProject(projectId);
    if (!jira) {
        return NextResponse.json(
            { error: "Jira integration not configured for this project" },
            { status: 400 }
        );
    }

    try {
        const issue = await jira.getIssue(key);
        if (!issue) {
            return NextResponse.json({ error: "Issue not found" }, { status: 404 });
        }
        return NextResponse.json(issue);
    } catch (error) {
        return NextResponse.json(
            { error: (error as Error).message },
            { status: 502 }
        );
    }
});
