import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { z } from "zod";
import { Priority, Prisma } from "@prisma/client";

import { generateEntityKey } from "@/lib/keys";

const createSchema = z.object({
    projectId: z.string().min(1),
    key: z.string().optional(),
    summary: z.string().min(1),
    description: z.string().optional(),
    priority: z.nativeEnum(Priority).optional(),
    status: z.string().optional(),
    testCaseId: z.string().optional(),
    testSetId: z.string().optional(),
});

export const GET = withApiHandler(async (req: NextRequest) => {
    const auth = await requireAuth(req, "project:view");
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    const search = searchParams.get("search");

    const whereClause: any = {};
    if (projectId) {
        whereClause.projectId = projectId;
    }
    if (search) {
        whereClause.OR = [
            { key: { contains: search, mode: "insensitive" } },
            { summary: { contains: search, mode: "insensitive" } },
        ];
    }

    const bugs = await prisma.bug.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" },
        take: 50, // Limit results for performance
    });

    return NextResponse.json(bugs);
});

export const POST = withApiHandler(async (req: NextRequest) => {
    const auth = await requireAuth(req, "bug:create");
    if (!auth.authorized) return auth.response;

    const parsed = createSchema.parse(await req.json());

    const project = await prisma.project.findUnique({
        where: { id: parsed.projectId },
        select: { key: true },
    });

    if (!project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const generatedKey = await generateEntityKey(prisma, parsed.projectId, project.key, "BUG");

    let testSetId = parsed.testSetId;

    // Auto-link to Test Set if not provided but Test Case is linked
    if (!testSetId && parsed.testCaseId) {
        const testCase = await prisma.testCase.findUnique({
            where: { id: parsed.testCaseId },
            include: { testSets: { take: 1 } }
        });

        if (testCase?.testSets.length) {
            testSetId = testCase.testSets[0].id;
        }
    }

    const bugData: any = {
        projectId: parsed.projectId,
        key: generatedKey,
        summary: parsed.summary,
        description: parsed.description,
        priority: parsed.priority ?? Priority.MEDIUM,
        status: parsed.status ?? "OPEN",
        testCaseId: parsed.testCaseId,
        testSetId: testSetId,
    };

    const bug = await prisma.bug.create({
        data: bugData,
    });

    return NextResponse.json(bug, { status: 201 });
});
