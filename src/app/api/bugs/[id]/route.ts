import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { z } from "zod";
import { Priority } from "@prisma/client";

const updateSchema = z.object({
    summary: z.string().optional(),
    description: z.string().optional(),
    priority: z.nativeEnum(Priority).optional(),
    status: z.string().optional(),
    testSetId: z.string().nullable().optional(),
});

export const GET = withApiHandler(
    async (req: NextRequest, { params }: { params: { id: string } }) => {
        const auth = await requireAuth(req, "project:view");
        if (!auth.authorized) return auth.response;

        const { searchParams } = new URL(req.url);
        const projectKey = searchParams.get("projectKey");

        let bug = await prisma.bug.findUnique({
            where: { id: params.id },
            include: { testCase: true, testSet: true }
        });

        if (!bug && projectKey) {
            const project = await prisma.project.findUnique({ where: { key: projectKey } });
            if (project) {
                bug = await prisma.bug.findUnique({
                    where: {
                        projectId_key: {
                            projectId: project.id,
                            key: params.id
                        }
                    },
                    include: { testCase: true, testSet: true }
                });
            }
        } else if (bug) {
            // Re-fetch with include if found by ID
            bug = await prisma.bug.findUnique({
                where: { id: params.id },
                include: { testCase: true, testSet: true }
            });
        }

        if (!bug) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json(bug);
    }
);

export const PATCH = withApiHandler(
    async (req: NextRequest, { params }: { params: { id: string } }) => {
        const auth = await requireAuth(req, "bug:update");
        if (!auth.authorized) return auth.response;

        const body = await req.json();
        const parsed = updateSchema.parse(body);

        const bug = await prisma.bug.update({
            where: { id: params.id },
            data: parsed,
        });

        return NextResponse.json(bug);
    }
);

export const DELETE = withApiHandler(
    async (req: NextRequest, { params }: { params: { id: string } }) => {
        const auth = await requireAuth(req, "bug:delete");
        if (!auth.authorized) return auth.response;

        await prisma.bug.delete({
            where: { id: params.id },
        });

        return NextResponse.json({ ok: true });
    }
);
