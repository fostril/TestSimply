import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, assertProjectAccessForResource } from "@/lib/api";
import { z } from "zod";

const casesSchema = z.object({
    testCaseIds: z.array(z.string()).min(1),
});

async function resolveExecution(idOrKey: string, projectKey: string | null) {
    const byId = await prisma.testExecution.findUnique({ where: { id: idOrKey } });
    if (byId) return byId;

    if (projectKey) {
        const project = await prisma.project.findUnique({ where: { key: projectKey } });
        if (project) {
            const byKey = await prisma.testExecution.findUnique({
                where: { projectId_key: { projectId: project.id, key: idOrKey } },
            });
            if (byKey) return byKey;
        }
    }
    return null;
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

    // Ensure every referenced test case belongs to the same project as the
    // execution; prevents cross-project linking via crafted IDs.
    const validCases = await prisma.testCase.findMany({
        where: { id: { in: testCaseIds }, projectId: execution!.projectId },
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

    return NextResponse.json({ message: `Removed ${deleteResult.count} cases from execution` }, { status: 200 });
});
