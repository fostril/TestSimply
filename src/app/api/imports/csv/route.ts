import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, requireProjectAccessOrForbid } from "@/lib/api";
import { generateEntityKey } from "@/lib/keys";
import { validateBodySize } from "@/lib/upload";
import Papa from "papaparse";
import { z } from "zod";
import type { Priority } from "@prisma/client";

const importSchema = z.object({
    projectId: z.string(),
    csvData: z.string(),
});

type Row = Record<string, string>;

export const POST = withApiHandler(async (req: NextRequest) => {
    const auth = await requireAuth(req, "testcase:create");
    if (!auth.authorized) return auth.response;

    const sizeCheck = validateBodySize(req);
    if (sizeCheck) return sizeCheck;

    const body = await req.json();
    const parsed = importSchema.parse(body);
    const { projectId, csvData } = parsed;

    const access = await requireProjectAccessOrForbid(
        auth.session.user.id,
        auth.session.user.role,
        projectId,
    );
    if (access instanceof NextResponse) return access;

    const parseResult = Papa.parse<Row>(csvData, {
        header: true,
        skipEmptyLines: true,
    });

    if (parseResult.errors.length > 0) {
        return NextResponse.json(
            { error: "Failed to parse CSV", details: parseResult.errors },
            { status: 400 },
        );
    }

    const rows = parseResult.data;
    const createdCases = [];
    const errors: string[] = [];

    const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { key: true },
    });

    if (!project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    for (const [index, row] of rows.entries()) {
        const name = row.title || row.name || row.Title || row.Name;
        if (!name) {
            errors.push(`Row ${index + 1}: Missing 'title' or 'name'`);
            continue;
        }

        const description = row.description || row.Description;
        const rawPriority = (row.priority || row.Priority || "MEDIUM").toUpperCase();
        const status = row.status || row.Status || "Draft";
        const preconditions = row.preconditions || row.Preconditions;

        let steps: { action: string; expected: string }[] = [];
        const stepsRaw = row.steps || row.Steps;
        if (stepsRaw) {
            try {
                steps = JSON.parse(stepsRaw);
            } catch {
                steps = [{ action: stepsRaw, expected: row.expected || row.Expected || "" }];
            }
        }

        // Use the shared atomic counter so imports don't collide with manual
        // creation or with each other.
        const key = await generateEntityKey(prisma, projectId, project.key, "TC");

        const priority: Priority = (["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const).includes(
            rawPriority as Priority,
        )
            ? (rawPriority as Priority)
            : "MEDIUM";

        try {
            const testCase = await prisma.testCase.create({
                data: {
                    projectId,
                    key,
                    name,
                    description,
                    priority,
                    status,
                    preconditionsText: preconditions,
                    steps: steps.length > 0 ? steps : [],
                    ownerId: auth.session.user?.id,
                },
            });
            createdCases.push(testCase);
        } catch (e) {
            errors.push(`Row ${index + 1}: Failed to create case - ${(e as Error).message}`);
        }
    }

    return NextResponse.json({
        count: createdCases.length,
        errors,
        total: rows.length,
    });
});
