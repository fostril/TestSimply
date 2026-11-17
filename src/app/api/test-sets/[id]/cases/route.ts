import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, assertProjectAccessForResource, resolveByIdOrKey } from "@/lib/api";
import { z } from "zod";

const manageCasesSchema = z.object({
    caseIds: z.array(z.string()),
});

async function resolveTestSet(idOrKey: string, projectKey: string | null) {
    return resolveByIdOrKey(
        (id) => prisma.testSet.findUnique({ where: { id } }),
        (projectId, key) => prisma.testSet.findUnique({ where: { projectId_key: { projectId, key } } }),
        idOrKey,
        projectKey,
    );
}

async function filterCasesToProject(caseIds: string[], projectId: string) {
    const rows = await prisma.testCase.findMany({
        where: { id: { in: caseIds }, projectId, deletedAt: null },
        select: { id: true },
    });
    return rows.map((r) => r.id);
}

export const POST = withApiHandler(
    async (req: NextRequest, { params }: { params: { id: string } }) => {
        const auth = await requireAuth(req, "testset:manage");
        if (!auth.authorized) return auth.response;

        const { searchParams } = new URL(req.url);
        const projectKey = searchParams.get("projectKey");

        const testSet = await resolveTestSet(params.id, projectKey);
        const denied = await assertProjectAccessForResource(
            auth.session.user.id,
            auth.session.user.role,
            testSet,
        );
        if (denied) return denied;

        const body = await req.json();
        const parsed = manageCasesSchema.parse(body);

        // Only link cases that belong to the same project
        const scopedIds = await filterCasesToProject(parsed.caseIds, testSet!.projectId);

        try {
            const updated = await prisma.testSet.update({
                where: { id: testSet!.id },
                data: { cases: { connect: scopedIds.map((id) => ({ id })) } },
                include: { cases: { where: { deletedAt: null } } },
            });

            await prisma.bug.updateMany({
                where: {
                    testCaseId: { in: scopedIds },
                    testSetId: null,
                    projectId: testSet!.projectId,
                },
                data: { testSetId: testSet!.id },
            });

            return NextResponse.json(updated);
        } catch (error: unknown) {
            if ((error as { code?: string })?.code === "P2025") {
                return NextResponse.json({ error: "Test Set or Test Cases not found" }, { status: 404 });
            }
            throw error;
        }
    }
);

export const DELETE = withApiHandler(
    async (req: NextRequest, { params }: { params: { id: string } }) => {
        const auth = await requireAuth(req, "testset:manage");
        if (!auth.authorized) return auth.response;

        const { searchParams } = new URL(req.url);
        const projectKey = searchParams.get("projectKey");

        const testSet = await resolveTestSet(params.id, projectKey);
        const denied = await assertProjectAccessForResource(
            auth.session.user.id,
            auth.session.user.role,
            testSet,
        );
        if (denied) return denied;

        const body = await req.json();
        const parsed = manageCasesSchema.parse(body);
        const scopedIds = await filterCasesToProject(parsed.caseIds, testSet!.projectId);

        try {
            const updated = await prisma.testSet.update({
                where: { id: testSet!.id },
                data: { cases: { disconnect: scopedIds.map((id) => ({ id })) } },
                include: { cases: { where: { deletedAt: null } } },
            });
            return NextResponse.json(updated);
        } catch (error: unknown) {
            if ((error as { code?: string })?.code === "P2025") {
                return NextResponse.json({ error: "Test Set or Test Cases not found" }, { status: 404 });
            }
            throw error;
        }
    }
);
