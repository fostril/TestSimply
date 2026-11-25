import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, assertProjectAccessForResource, resolveByIdOrKey } from "@/lib/api";
import { checkAndMarkFlaky } from "@/lib/flakiness";
import { apiLogger } from "@/lib/logger";
import { z } from "zod";

const casesSchema = z.object({
    testCaseIds: z.array(z.string()).min(1),
});

async function resolveExecution(idOrKey: string, projectKey: string | null) {
    return resolveByIdOrKey(
        (id) => prisma.testExecution.findUnique({ where: { id } }),
        (projectId, key) => prisma.testExecution.findUnique({ where: { projectId_key: { projectId, key } } }),
        idOrKey,
        projectKey,
    );
}

export const POST = withApiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "execution:manage");
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(req.url);
    const projectKey = searchParams.get("projectKey");

    const execution = await resolveExecution(params.id, projectKey);
    const denied = await assertProjectAccessForResource(
        auth.session.user.id,
        auth.session.user.role,
        execution,
    );
    if (denied) return denied;

    const body = await req.json();
    const { testCaseIds } = casesSchema.parse(body);

    // Ensure every referenced test case is active and belongs to the same project
    const validCases = await prisma.testCase.findMany({
        where: { id: { in: testCaseIds }, projectId: execution!.projectId, deletedAt: null },
        select: { id: true },
    });
    const validIds = new Set(validCases.map((c) => c.id));
    const scopedIds = testCaseIds.filter((id) => validIds.has(id));

    if (scopedIds.length === 0) {
        return NextResponse.json(
            { error: "No valid test cases in this project" },
            { status: 400 },
        );
    }

    const existingResults = await prisma.testResult.findMany({
        where: {
            executionId: execution!.id,
            caseId: { in: scopedIds },
        },
        select: { caseId: true },
    });

    const existingCaseIds = new Set(existingResults.map((r) => r.caseId));
    const newCaseIds = scopedIds.filter((id) => !existingCaseIds.has(id));

    if (newCaseIds.length === 0) {
        return NextResponse.json({ message: "All selected cases are already in this execution" }, { status: 200 });
    }

    await prisma.testResult.createMany({
        data: newCaseIds.map((caseId) => ({
            executionId: execution!.id,
            caseId,
            status: "SKIPPED",
        })),
    });

    return NextResponse.json({ message: `Added ${newCaseIds.length} cases to execution` }, { status: 201 });
});

export const DELETE = withApiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "execution:manage");
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(req.url);
    const projectKey = searchParams.get("projectKey");

    const execution = await resolveExecution(params.id, projectKey);
    const denied = await assertProjectAccessForResource(
        auth.session.user.id,
        auth.session.user.role,
        execution,
    );
    if (denied) return denied;

    const body = await req.json();
    const { testCaseIds } = casesSchema.parse(body);

    const deleteResult = await prisma.testResult.deleteMany({
        where: {
            executionId: execution!.id,
            caseId: { in: testCaseIds },
        },
    });

    for (const caseId of testCaseIds) {
        checkAndMarkFlaky(caseId).catch((err) => {
            apiLogger.warn({ err, caseId }, "Flakiness re-check failed after result removal");
        });
    }

    return NextResponse.json({ message: `Removed ${deleteResult.count} cases from execution` }, { status: 200 });
});
