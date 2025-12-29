import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { z } from "zod";

const manageCasesSchema = z.object({
    caseIds: z.array(z.string()),
});

export const POST = withApiHandler(
    async (req: NextRequest, { params }: { params: { id: string } }) => {
        const auth = await requireAuth(req, "testset:edit");
        if (!auth.authorized) return auth.response;

        const { searchParams } = new URL(req.url);
        const projectKey = searchParams.get("projectKey");

        const body = await req.json();
        const parsed = manageCasesSchema.parse(body);

        let whereClause: any = { id: params.id };

        if (projectKey) {
            const project = await prisma.project.findUnique({ where: { key: projectKey } });
            if (project) {
                whereClause = {
                    projectId_key: {
                        projectId: project.id,
                        key: params.id
                    }
                };
            }
        }

        try {
            const testSet = await prisma.testSet.update({
                where: whereClause,
                data: {
                    cases: {
                        connect: parsed.caseIds.map((id) => ({ id })),
                    },
                },
                include: {
                    cases: true,
                },
            });

            // Retroactively link existing bugs that don't have a Test Set
            await prisma.bug.updateMany({
                where: {
                    testCaseId: { in: parsed.caseIds },
                    testSetId: null,
                } as any,
                data: {
                    testSetId: testSet.id,
                } as any,
            });

            return NextResponse.json(testSet);
        } catch (error: any) {
            if (error.code === 'P2025') {
                return NextResponse.json({ error: "Test Set or Test Cases not found" }, { status: 404 });
            }
            throw error;
        }
    }
);

export const DELETE = withApiHandler(
    async (req: NextRequest, { params }: { params: { id: string } }) => {
        const auth = await requireAuth(req, "testset:edit");
        if (!auth.authorized) return auth.response;

        const { searchParams } = new URL(req.url);
        const projectKey = searchParams.get("projectKey");

        const body = await req.json();
        const parsed = manageCasesSchema.parse(body);

        let whereClause: any = { id: params.id };

        if (projectKey) {
            const project = await prisma.project.findUnique({ where: { key: projectKey } });
            if (project) {
                whereClause = {
                    projectId_key: {
                        projectId: project.id,
                        key: params.id
                    }
                };
            }
        }

        try {
            const testSet = await prisma.testSet.update({
                where: whereClause,
                data: {
                    cases: {
                        disconnect: parsed.caseIds.map((id) => ({ id })),
                    },
                },
                include: {
                    cases: true,
                },
            });
            return NextResponse.json(testSet);
        } catch (error: any) {
            if (error.code === 'P2025') {
                return NextResponse.json({ error: "Test Set or Test Cases not found" }, { status: 404 });
            }
            throw error;
        }
    }
);
