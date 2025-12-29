import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { z } from "zod";

const addCasesSchema = z.object({
    testCaseIds: z.array(z.string()).min(1),
});

export const POST = withApiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "execution:edit"); // Assuming edit permission covers adding cases
    if (!auth.authorized) return auth.response;

    const executionId = params.id;
    const { searchParams } = new URL(req.url);
    const projectKey = searchParams.get("projectKey");

    const body = await req.json();
    const { testCaseIds } = addCasesSchema.parse(body);

    // Verify execution exists (by ID or Key)
    let execution = await prisma.testExecution.findUnique({
        where: { id: executionId },
    });

    if (!execution && projectKey) {
        const project = await prisma.project.findUnique({ where: { key: projectKey } });
        if (project) {
            execution = await prisma.testExecution.findUnique({
                where: {
                    projectId_key: {
                        projectId: project.id,
                        key: executionId
                    }
                }
            });
        }
    }

    if (!execution) {
        return NextResponse.json({ error: "Execution not found" }, { status: 404 });
    }

    // Use the actual UUID for subsequent queries
    const actualExecutionId = execution.id;

    // Filter out cases that are already part of this execution
    const existingResults = await prisma.testResult.findMany({
        where: {
            executionId: actualExecutionId,
            caseId: { in: testCaseIds },
        },
        select: { caseId: true },
    });

    const existingCaseIds = new Set(existingResults.map((r) => r.caseId));
    const newCaseIds = testCaseIds.filter((id) => !existingCaseIds.has(id));

    if (newCaseIds.length === 0) {
        return NextResponse.json({ message: "All selected cases are already in this execution" }, { status: 200 });
    }

    // Create results for new cases
    // We can use createMany if we don't need to return the created objects individually with IDs immediately,
    // but Prisma createMany is supported.
    await prisma.testResult.createMany({
        data: newCaseIds.map((caseId) => ({
            executionId: actualExecutionId,
            caseId,
            status: "SKIPPED", // Default status for added cases
        })),
    });

    return NextResponse.json({ message: `Added ${newCaseIds.length} cases to execution` }, { status: 201 });
});

const removeCasesSchema = z.object({
    testCaseIds: z.array(z.string()).min(1),
});

export const DELETE = withApiHandler(async (req: NextRequest, { params }: { params: { id: string } }) => {
    const auth = await requireAuth(req, "execution:edit");
    if (!auth.authorized) return auth.response;

    const executionId = params.id;
    const { searchParams } = new URL(req.url);
    const projectKey = searchParams.get("projectKey");

    const body = await req.json();
    const { testCaseIds } = removeCasesSchema.parse(body);

    // Verify execution exists (by ID or Key)
    let execution = await prisma.testExecution.findUnique({
        where: { id: executionId },
    });

    if (!execution && projectKey) {
        const project = await prisma.project.findUnique({ where: { key: projectKey } });
        if (project) {
            execution = await prisma.testExecution.findUnique({
                where: {
                    projectId_key: {
                        projectId: project.id,
                        key: executionId
                    }
                }
            });
        }
    }

    if (!execution) {
        return NextResponse.json({ error: "Execution not found" }, { status: 404 });
    }

    // Use the actual UUID for subsequent queries
    const actualExecutionId = execution.id;

    // Delete test results for the specified cases
    const deleteResult = await prisma.testResult.deleteMany({
        where: {
            executionId: actualExecutionId,
            caseId: { in: testCaseIds },
        },
    });

    return NextResponse.json({ message: `Removed ${deleteResult.count} cases from execution` }, { status: 200 });
});
