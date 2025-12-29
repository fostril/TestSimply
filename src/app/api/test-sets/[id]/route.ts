import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { z } from "zod";

const updateSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
});

export const GET = withApiHandler(
    async (req: NextRequest, { params }: { params: { id: string } }) => {
        const auth = await requireAuth(req, "project:view");
        if (!auth.authorized) return auth.response;

        const { searchParams } = new URL(req.url);
        const projectKey = searchParams.get("projectKey");

        let testSet = await prisma.testSet.findUnique({
            where: { id: params.id },
            include: {
                cases: {
                    where: { deletedAt: null },
                    orderBy: { key: "asc" },
                },
            },
        });

        if (!testSet && projectKey) {
            const project = await prisma.project.findUnique({ where: { key: projectKey } });
            if (project) {
                testSet = await prisma.testSet.findUnique({
                    where: {
                        projectId_key: {
                            projectId: project.id,
                            key: params.id
                        }
                    },
                    include: {
                        cases: {
                            where: { deletedAt: null },
                            orderBy: { key: "asc" },
                        },
                    },
                });
            }
        }

        if (!testSet) {
            return NextResponse.json({ error: "Test Set not found" }, { status: 404 });
        }

        return NextResponse.json(testSet);
    }
);

export const PATCH = withApiHandler(
    async (req: NextRequest, { params }: { params: { id: string } }) => {
        const auth = await requireAuth(req, "testset:edit");
        if (!auth.authorized) return auth.response;

        const body = await req.json();
        const parsed = updateSchema.parse(body);

        const testSet = await prisma.testSet.update({
            where: { id: params.id },
            data: parsed,
        });

        return NextResponse.json(testSet);
    }
);

export const DELETE = withApiHandler(
    async (req: NextRequest, { params }: { params: { id: string } }) => {
        const auth = await requireAuth(req, "testset:delete");
        if (!auth.authorized) return auth.response;

        await prisma.testSet.delete({
            where: { id: params.id },
        });

        return NextResponse.json({ ok: true });
    }
);
