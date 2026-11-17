import { NextRequest, NextResponse } from "next/server";
import { requireAuth, withApiHandler, requireProjectAccessOrForbid } from "@/lib/api";
import { GitHubCiClient } from "@/lib/ci";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export const POST = withApiHandler(async (req: NextRequest) => {
    const auth = await requireAuth(req, "execution:run");
    if (!auth.authorized) return auth.response;

    const body = await req.json();
    const { projectId, planId } = body as { projectId?: string; planId?: string };

    if (!projectId || !planId) {
        return NextResponse.json({ error: "Missing projectId or planId" }, { status: 400 });
    }

    const access = await requireProjectAccessOrForbid(
        auth.session.user.id,
        auth.session.user.role,
        projectId,
    );
    if (access instanceof NextResponse) return access;

    // Verify the plan belongs to the same project
    const plan = await prisma.testPlan.findUnique({
        where: { id: planId },
        select: { projectId: true },
    });
    if (!plan || plan.projectId !== projectId) {
        return NextResponse.json({ error: "Plan not found in this project" }, { status: 404 });
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
        await logAudit(auth.session.user?.id, "CI_TRIGGER", "TestPlan", planId, {
            workflowId: settings.ciWorkflowId,
            workflowUrl: result.workflowUrl,
        }, projectId);
        return NextResponse.json({ success: true, workflowUrl: result.workflowUrl });
    } else {
        return NextResponse.json({ error: result.message }, { status: 502 });
    }
});
