import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, requireProjectAccessOrForbid } from "@/lib/api";

export const GET = withApiHandler(async (req: NextRequest) => {
    const auth = await requireAuth(req, "project:view");
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
        return NextResponse.json({ error: "Project ID is required" }, { status: 400 });
    }

    const access = await requireProjectAccessOrForbid(
        auth.session.user.id,
        auth.session.user.role,
        projectId,
    );
    if (access instanceof NextResponse) return access;

    // Fetch all requirement links with their test cases, attached Requirement
    // (if any) and latest results. Links now group by Requirement when one
    // exists, falling back to externalUrl for legacy rows.
    const links = await prisma.requirementLink.findMany({
        where: {
            projectId,
            testCase: {
                deletedAt: null,
            },
        },
        include: {
            requirement: true,
            testCase: {
                include: {
                    results: {
                        orderBy: { createdAt: "desc" },
                        take: 1,
                    },
                },
            },
        },
    });

    const map = new Map<string, {
        url: string;
        key: string | null;
        title: string | null;
        type: string;
        totalCases: number;
        passCases: number;
        failCases: number;
        cases: Array<{ key: string; status: string | null }>;
    }>();

    for (const link of links) {
        // Prefer the Requirement row; fall back to the legacy externalUrl.
        const groupKey = link.requirement?.id ?? link.externalUrl ?? "unlinked";
        const groupUrl = link.requirement?.externalUrl ?? link.externalUrl ?? "";

        const entry = map.get(groupKey) ?? {
            url: groupUrl,
            key: link.requirement?.key ?? null,
            title: link.requirement?.title ?? null,
            type: link.type,
            totalCases: 0,
            passCases: 0,
            failCases: 0,
            cases: [],
        };

        const latestResult = link.testCase.results[0];
        const status = latestResult?.status ?? null;

        entry.totalCases++;
        if (status === "PASS") entry.passCases++;
        if (status === "FAIL") entry.failCases++;

        entry.cases.push({
            key: link.testCase.key,
            status,
        });

        map.set(groupKey, entry);
    }

    const report = Array.from(map.values()).map((req) => {
        let status = "NOT RUN";
        if (req.totalCases > 0) {
            if (req.failCases > 0) status = "NOK";
            else if (req.passCases === req.totalCases) status = "OK";
            else if (req.passCases > 0) status = "NOK"; // Partial pass is still NOK if not all pass? Or maybe "WIP"? Let's stick to NOK if any fail or incomplete.
            // Actually, if pass + fail < total, it means some are not run.
            // Let's simplify:
            // OK = All passed.
            // NOK = Any failed.
            // NOT RUN = No results.
            // MIXED = Some passed, some not run, no fails.
        }

        // Refined Status Logic
        if (req.failCases > 0) status = "NOK";
        else if (req.passCases === req.totalCases && req.totalCases > 0) status = "OK";
        else if (req.passCases > 0) status = "OK"; // If no fails and at least one pass, let's call it OK for now, or maybe "PASSING".

        return { ...req, status };
    });

    return NextResponse.json(report);
});
