import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, assertProjectAccessForResource, resolveByIdOrKey } from "@/lib/api";

export const GET = withApiHandler(
    async (req: NextRequest, { params }: { params: { id: string } }) => {
        const auth = await requireAuth(req, "project:view");
        if (!auth.authorized) return auth.response;

        const { searchParams } = new URL(req.url);
        const projectKey = searchParams.get("projectKey");

        const exportInclude = {
            results: {
                where: { testCase: { deletedAt: null } },
                include: { testCase: true, bugs: true },
            },
            plan: {
                include: {
                    cases: {
                        where: { case: { deletedAt: null } },
                        include: { case: true },
                        orderBy: { order: "asc" as const },
                    },
                },
            },
            project: true,
            environmentRelation: true,
        };

        const execution = await resolveByIdOrKey<any>(
            (id) =>
                prisma.testExecution.findUnique({
                    where: { id },
                    include: exportInclude,
                }),
            (projectId, key) =>
                prisma.testExecution.findUnique({
                    where: { projectId_key: { projectId, key } },
                    include: exportInclude,
                }),
            params.id,
            projectKey,
        );

        const denied = await assertProjectAccessForResource(
            auth.session.user.id,
            auth.session.user.role,
            execution,
        );
        if (denied) return denied;
        if (!execution) {
            return NextResponse.json({ error: "Not found" }, { status: 404 });
        }

        const lines: string[] = [];

        // Header metadata
        lines.push(`Execution Report: ${execution.name}`);
        lines.push(`Key: ${execution.key}`);
        lines.push(`Project: ${execution.project?.name || "N/A"}`);
        lines.push(`Environment: ${execution.environmentRelation?.name || execution.environment || "N/A"}`);
        lines.push(`Status: ${execution.status}`);
        lines.push(`Started: ${execution.startedAt ? new Date(execution.startedAt).toISOString() : "N/A"}`);
        lines.push(`Finished: ${execution.finishedAt ? new Date(execution.finishedAt).toISOString() : "N/A"}`);
        lines.push("");

        // Results header
        lines.push("Test Case Key,Test Case Name,Status,Notes,Linked Bugs");

        // Merge planned cases and any extra result cases (e.g. ad-hoc additions), excluding deleted cases
        const planCases = (execution.plan?.cases?.map((c: any) => c.case) || []).filter(
            (c: any) => c && !c.deletedAt,
        );
        const resultCases = (execution.results || [])
            .map((r: any) => r.testCase)
            .filter((c: any) => c && !c.deletedAt);

        const seenCaseIds = new Set<string>();
        const cases: any[] = [];
        for (const c of [...planCases, ...resultCases]) {
            if (!seenCaseIds.has(c.id)) {
                seenCaseIds.add(c.id);
                cases.push(c);
            }
        }

        // Create a map of results by case ID
        const resultsByCaseId = new Map<string, any>();
        for (const result of execution.results) {
            resultsByCaseId.set(result.caseId, result);
        }

        for (const testCase of cases) {
            const result = resultsByCaseId.get(testCase.id);
            const status = result?.status || "NOT_RUN";
            const notes = Array.isArray(result?.stepsLog)
                ? result.stepsLog
                    .map((s: any) => s?.note || s?.notes || s?.comments || "")
                    .filter(Boolean)
                    .join("; ")
                : "";
            const bugs = result?.bugs?.map((b: any) => b.key).join(", ") || "";

            // Escape CSV fields
            const escapeCsv = (field: string) => {
                if (field.includes(",") || field.includes('"') || field.includes("\n")) {
                    return `"${field.replace(/"/g, '""')}"`;
                }
                return field;
            };

            lines.push([
                escapeCsv(testCase.key),
                escapeCsv(testCase.name),
                status,
                escapeCsv(notes),
                escapeCsv(bugs)
            ].join(","));
        }

        // Summary computed strictly across the exported `cases` list
        const totalCases = cases.length;
        let passed = 0;
        let failed = 0;
        let blocked = 0;
        let skipped = 0;
        for (const c of cases) {
            const st = resultsByCaseId.get(c.id)?.status;
            if (st === "PASS") passed++;
            else if (st === "FAIL") failed++;
            else if (st === "BLOCKED") blocked++;
            else if (st === "SKIPPED") skipped++;
        }
        const notRun = Math.max(0, totalCases - passed - failed - blocked - skipped);

        lines.push("");
        lines.push("Summary");
        lines.push(`Total Cases,${totalCases}`);
        lines.push(`Passed,${passed}`);
        lines.push(`Failed,${failed}`);
        lines.push(`Blocked,${blocked}`);
        lines.push(`Not Run,${notRun}`);

        const csv = lines.join("\n");

        return new NextResponse(csv, {
            headers: {
                "Content-Type": "text/csv",
                "Content-Disposition": `attachment; filename="${execution.key}-results.csv"`,
            },
        });
    }
);
