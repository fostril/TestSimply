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

    // Fetch all native Requirements plus all RequirementLinks (including legacy
    // external-URL-only links) so uncovered requirements with 0 linked test
    // cases also appear in the Requirement Coverage report.
    const [requirements, links] = await Promise.all([
        prisma.requirement.findMany({
            where: { projectId: access.id },
            orderBy: { key: "asc" },
        }),
        prisma.requirementLink.findMany({
            where: {
                projectId: access.id,
                testCase: {
                    deletedAt: null,
                },
            },
            include: {
                requirement: true,
                testCase: {
                    include: {
                        results: {
                            where: { status: { not: "SKIPPED" } },
                            orderBy: { createdAt: "desc" },
                            take: 1,
                        },
                    },
                },
            },
        }),
    ]);

    const map = new Map<string, {
        id: string | null;
        url: string;
        key: string | null;
        title: string | null;
        type: string;
        totalCases: number;
        passCases: number;
        failCases: number;
        blockedCases: number;
        cases: Array<{ id: string; key: string; status: string | null }>;
    }>();

    for (const req of requirements) {
        map.set(req.id, {
            id: req.id,
            url: req.externalUrl ?? "",
            key: req.key,
            title: req.title,
            type: "Requirement",
            totalCases: 0,
            passCases: 0,
            failCases: 0,
            blockedCases: 0,
            cases: [],
        });
    }

    for (const link of links) {
        // Prefer the Requirement row; fall back to the legacy externalUrl.
        const groupKey = link.requirement?.id ?? link.externalUrl ?? "unlinked";
        const groupUrl = link.requirement?.externalUrl ?? link.externalUrl ?? "";

        const entry = map.get(groupKey) ?? {
            id: link.requirement?.id ?? null,
            url: groupUrl,
            key: link.requirement?.key ?? null,
            title: link.requirement?.title ?? null,
            type: link.type,
            totalCases: 0,
            passCases: 0,
            failCases: 0,
            blockedCases: 0,
            cases: [],
        };

        const latestResult = link.testCase.results[0];
        const status = latestResult?.status ?? null;

        entry.totalCases++;
        if (status === "PASS") entry.passCases++;
        if (status === "FAIL") entry.failCases++;
        if (status === "BLOCKED") entry.blockedCases++;

        entry.cases.push({
            id: link.testCase.id,
            key: link.testCase.key,
            status,
        });

        map.set(groupKey, entry);
    }

    const report = Array.from(map.values()).map((req) => {
        let status = "NOT_RUN";
        if (req.failCases > 0) status = "NOK";
        else if (req.totalCases > 0 && req.passCases === req.totalCases) status = "OK";
        else if (req.passCases > 0 || req.blockedCases > 0) status = "WIP";

        return { ...req, status };
    });

    return NextResponse.json(report);
});
