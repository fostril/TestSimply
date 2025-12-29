import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import Papa from "papaparse";
import { z } from "zod";

const importSchema = z.object({
    projectId: z.string(),
    csvData: z.string(),
});

export const POST = withApiHandler(async (req: NextRequest) => {
    const auth = await requireAuth(req, "testcase:create");
    if (!auth.authorized) return auth.response;

    const body = await req.json();
    const parsed = importSchema.parse(body);
    const { projectId, csvData } = parsed;

    const parseResult = Papa.parse(csvData, {
        header: true,
        skipEmptyLines: true,
    });

    if (parseResult.errors.length > 0) {
        return NextResponse.json(
            { error: "Failed to parse CSV", details: parseResult.errors },
            { status: 400 }
        );
    }

    const rows = parseResult.data as any[];
    const createdCases = [];
    const errors = [];

    // Get the highest current key number to generate new keys
    const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { key: true },
    });

    if (!project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    // Find the last test case key number
    // This is a bit naive for concurrent usage but sufficient for now
    // A better approach would be a sequence or atomic increment
    const lastCase = await prisma.testCase.findFirst({
        where: { projectId },
        orderBy: { createdAt: "desc" }, // This might not be accurate for key generation if keys are not strictly chronological
        select: { key: true },
    });

    let nextNum = 1;
    if (lastCase) {
        const match = lastCase.key.match(/-(\d+)$/);
        if (match) {
            nextNum = parseInt(match[1], 10) + 1;
        }
    }

    for (const [index, row] of rows.entries()) {
        const name = row.title || row.name || row.Title || row.Name;
        if (!name) {
            errors.push(`Row ${index + 1}: Missing 'title' or 'name'`);
            continue;
        }

        const description = row.description || row.Description;
        const priority = (row.priority || row.Priority || "MEDIUM").toUpperCase();
        const status = row.status || row.Status || "Draft";
        const preconditions = row.preconditions || row.Preconditions;

        // Simple step parsing: if 'steps' column exists, try to use it. 
        // If it's not JSON, just make it a single step.
        let steps = [];
        const stepsRaw = row.steps || row.Steps;
        if (stepsRaw) {
            try {
                steps = JSON.parse(stepsRaw);
            } catch (e) {
                // Treat as a single text step
                steps = [{ action: stepsRaw, expected: row.expected || row.Expected || "" }];
            }
        }

        const key = `${project.key}-${nextNum++}`;

        try {
            const testCase = await prisma.testCase.create({
                data: {
                    projectId,
                    key,
                    name,
                    description,
                    priority: ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(priority) ? priority : "MEDIUM",
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
