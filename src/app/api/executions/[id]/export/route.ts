import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";

export const GET = withApiHandler(
    async (req: NextRequest, { params }: { params: { id: string } }) => {
        const auth = await requireAuth(req, "project:view");
        if (!auth.authorized) return auth.response;

        const { searchParams } = new URL(req.url);
        const projectKey = searchParams.get("projectKey");

        // Find execution by ID or key
        let execution = await prisma.testExecution.findUnique({
            where: { id: params.id },
            include: {
                results: { include: { testCase: true, bugs: true } },
                plan: { include: { cases: { include: { case: true } } } },
                project: true,
                environmentRelation: true,
            }
        });

        if (!execution && projectKey) {
            const project = await prisma.project.findUnique({ where: { key: projectKey } });
            if (project) {
                execution = await prisma.testExecution.findUnique({
                    where: {
                        projectId_key: {
                            projectId: project.id,
                            key: params.id
                        }
                    },
                    include: {
                        results: { include: { testCase: true, bugs: true } },
                        plan: { include: { cases: { include: { case: true } } } },
                        project: true,
                        environmentRelation: true,
                    }
                });
            }
        }

        if (!execution) {
            return NextResponse.json({ error: "Execution not found" }, { status: 404 });
        }

        // Build CSV content
        const lines: string[] = [];

        // Header metadata
        lines.push(`Execution Report: ${execution.name}`);
        lines.push(`Key: ${execution.key}`);
        lines.push(`Project: ${execution.project?.name || "N/A"}`);
        lines.push(`Environment: ${execution.environmentRelation?.name || "N/A"}`);
        lines.push(`Status: ${execution.status}`);
        lines.push(`Started: ${execution.startedAt ? new Date(execution.startedAt).toISOString() : "N/A"}`);
        lines.push(`Finished: ${execution.finishedAt ? new Date(execution.finishedAt).toISOString() : "N/A"}`);
        lines.push("");

        // Results header
        lines.push("Test Case Key,Test Case Name,Status,Notes,Linked Bugs");

        // Get all test cases (from plan or results)
        const planCases = execution.plan?.cases?.map((c: any) => c.case) || [];
        const resultCases = execution.results.map((r: any) => r.testCase);

        // Create a map of results by case ID
        const resultsByCaseId = new Map<string, any>();
        for (const result of execution.results) {
            resultsByCaseId.set(result.caseId, result);
        }

        // If we have plan cases, iterate over them. Otherwise use result cases.
        const cases = planCases.length > 0 ? planCases : resultCases;

        for (const testCase of cases) {
            const result = resultsByCaseId.get(testCase.id);
            const status = result?.status || "NOT_RUN";
            const notes = result?.stepsLog?.map((s: any) => s.note || "").filter(Boolean).join("; ") || "";
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

        // Summary
        const totalCases = cases.length;
        const passed = execution.results.filter((r: any) => r.status === "PASS").length;
        const failed = execution.results.filter((r: any) => r.status === "FAIL").length;
        const blocked = execution.results.filter((r: any) => r.status === "BLOCKED").length;
        const notRun = totalCases - passed - failed - blocked;

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
