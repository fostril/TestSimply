import { NextRequest, NextResponse } from "next/server";
import { ExecutionStatus } from "@prisma/client";
import { requireAuth, withApiHandler, requireProjectAccessOrForbid } from "@/lib/api";
import { createCiClientForProject } from "@/lib/ci";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { generateEntityKey } from "@/lib/keys";

export const POST = withApiHandler(async (req: NextRequest) => {
    const auth = await requireAuth(req, "execution:run");
    if (!auth.authorized) return auth.response;

    const body = await req.json();
    const { projectId, planId, branch } = body as {
        projectId?: string;
        planId?: string;
        branch?: string;
    };

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
        select: { id: true, name: true, projectId: true },
    });
    if (!plan || plan.projectId !== access.id) {
        return NextResponse.json({ error: "Plan not found in this project" }, { status: 404 });
    }

    // 1. Get Project Settings
    const settings = await prisma.projectSetting.findUnique({
        where: { projectId: access.id },
    });

    if (!settings || !settings.ciProvider || !settings.ciUrl || !settings.ciToken) {
        return NextResponse.json({ error: "CI Provider not configured" }, { status: 400 });
    }

    if (settings.ciProvider === "GITHUB" && !settings.ciWorkflowId?.trim()) {
        return NextResponse.json({ error: "CI Workflow not configured for this project" }, { status: 400 });
    }

    // 2. Get CI Client
    let ciClient;
    try {
        ciClient = await createCiClientForProject(access.id);
    } catch (err) {
        return NextResponse.json({ error: (err as Error).message }, { status: 400 });
    }
    if (!ciClient) {
        return NextResponse.json({ error: "CI Provider not configured" }, { status: 400 });
    }

    // 3. Pre-create a tracked pending TestExecution so CI can report results
    //    back using `execKey` via /api/import/junit or /api/import/cucumber.
    const execKey = await generateEntityKey(prisma, access.id, access.key, "EXEC");
    const execution = await prisma.testExecution.create({
        data: {
            projectId: access.id,
            planId: plan.id,
            key: execKey,
            name: `CI: ${plan.name}`,
            status: ExecutionStatus.ACTIVE,
            startedAt: new Date(),
            createdById: auth.session.user?.id,
        },
    });

    // 4. Trigger Workflow
    const result = await ciClient.triggerWorkflow(
        settings.ciWorkflowId ?? "",
        {
            planId: plan.id,
            projectId: access.id,
            execKey: execution.key,
        },
        branch,
    );

    if (result.success) {
        if (result.workflowUrl) {
            await prisma.testExecution.update({
                where: { id: execution.id },
                data: { buildUrl: result.workflowUrl },
            });
        }
        await logAudit(auth.session.user?.id, "CI_TRIGGER", "TestPlan", plan.id, {
            workflowId: settings.ciWorkflowId,
            workflowUrl: result.workflowUrl,
            executionId: execution.id,
            executionKey: execution.key,
        }, access.id);
        return NextResponse.json({
            success: true,
            workflowUrl: result.workflowUrl,
            executionId: execution.id,
            executionKey: execution.key,
        });
    }

    // Clean up the pending execution record if triggering failed
    await prisma.testExecution.delete({ where: { id: execution.id } }).catch(() => undefined);
    return NextResponse.json({ error: result.message }, { status: 502 });
});
