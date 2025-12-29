import { NextRequest, NextResponse } from "next/server";
import { requireAuth, withApiHandler } from "@/lib/api";
import { GitHubCiClient } from "@/lib/ci";
import { prisma } from "@/lib/prisma";

export const POST = withApiHandler(async (req: NextRequest) => {
    const auth = await requireAuth(req, "test_plan:run"); // Assuming this permission exists or similar
    if (!auth.authorized) return auth.response;

    const body = await req.json();
    const { projectId, planId } = body;

    if (!projectId || !planId) {
        return NextResponse.json({ error: "Missing projectId or planId" }, { status: 400 });
    }

    // 1. Get Project Settings to find the workflow ID
    const settings = await prisma.projectSetting.findUnique({
        where: { projectId },
    });

    if (!settings || !settings.ciWorkflowId) {
        return NextResponse.json({ error: "CI Workflow not configured for this project" }, { status: 400 });
    }

    // 2. Get CI Client
    const ciClient = await GitHubCiClient.forProject(projectId);
    if (!ciClient) {
        return NextResponse.json({ error: "CI Provider not configured" }, { status: 400 });
    }

    // 3. Trigger Workflow
    // We pass the planId as an input so the workflow knows what to run
    const result = await ciClient.triggerWorkflow(settings.ciWorkflowId, {
        planId: planId,
        projectId: projectId,
    });

    if (result.success) {
        return NextResponse.json({ success: true, workflowUrl: result.workflowUrl });
    } else {
        return NextResponse.json({ error: result.message }, { status: 502 });
    }
});
