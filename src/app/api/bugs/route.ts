import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, requireProjectAccessOrForbid, parsePagination, paginatedJson } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { z } from "zod";
import { Priority } from "@prisma/client";

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

    if (projectId) {
        const access = await requireProjectAccessOrForbid(auth.session.user.id, auth.session.user.role, projectId);
        if (access instanceof NextResponse) return access;
    }

    const pagination = parsePagination(searchParams);

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

    const [bugs, total] = await Promise.all([
        prisma.bug.findMany({
            where: whereClause,
            orderBy: { createdAt: "desc" },
            skip: pagination.skip,
            take: pagination.limit,
        }),
        prisma.bug.count({ where: whereClause }),
    ]);

    return paginatedJson(bugs, total, pagination);
});

export const POST = withApiHandler(async (req: NextRequest) => {
    const auth = await requireAuth(req, "bug:manage");
    if (!auth.authorized) return auth.response;

    const parsed = createSchema.parse(await req.json());

    const access = await requireProjectAccessOrForbid(auth.session.user.id, auth.session.user.role, parsed.projectId);
    if (access instanceof NextResponse) return access;

    const project = await prisma.project.findUnique({
        where: { id: parsed.projectId },
        select: { key: true },
    });

    if (!project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const generatedKey = await generateEntityKey(prisma, parsed.projectId, project.key, "BUG");

    // Verify test case / test set (if provided) belong to this project
    if (parsed.testCaseId) {
        const tc = await prisma.testCase.findUnique({
            where: { id: parsed.testCaseId },
            select: { projectId: true },
        });
        if (!tc || tc.projectId !== parsed.projectId) {
            return NextResponse.json({ error: "Invalid testCaseId" }, { status: 400 });
        }
    }
    if (parsed.testSetId) {
        const ts = await prisma.testSet.findUnique({
            where: { id: parsed.testSetId },
            select: { projectId: true },
        });
        if (!ts || ts.projectId !== parsed.projectId) {
            return NextResponse.json({ error: "Invalid testSetId" }, { status: 400 });
        }
    }

    let testSetId = parsed.testSetId;

    if (!testSetId && parsed.testCaseId) {
        const testCase = await prisma.testCase.findUnique({
            where: { id: parsed.testCaseId },
            include: { testSets: { where: { projectId: parsed.projectId }, take: 1 } },
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

    await logAudit(auth.session.user?.id, "CREATE", "Bug", bug.id, {
        key: bug.key,
        summary: bug.summary,
    }, parsed.projectId);

    return NextResponse.json(bug, { status: 201 });
});
