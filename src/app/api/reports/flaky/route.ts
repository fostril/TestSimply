import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  withApiHandler,
  requireProjectAccessOrForbid,
} from "@/lib/api";
import { analyzeFlakiness, FLAKY_WINDOW } from "@/lib/flakiness";

export const GET = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "project:view");
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const access = await requireProjectAccessOrForbid(
    auth.session.user.id,
    auth.session.user.role,
    projectId,
  );
  if (access instanceof NextResponse) return access;

  const cases = await prisma.testCase.findMany({
    where: {
      projectId: access.id,
      deletedAt: null,
      isFlaky: true,
    },
    orderBy: [{ flakyDetectedAt: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      key: true,
      name: true,
      priority: true,
      type: true,
      component: true,
      isAutomated: true,
      isFlaky: true,
      flakyDetectedAt: true,
      results: {
        where: { status: { not: "SKIPPED" } },
        orderBy: { createdAt: "desc" },
        take: FLAKY_WINDOW,
        select: {
          id: true,
          status: true,
          createdAt: true,
          execution: {
            select: {
              id: true,
              key: true,
              name: true,
            },
          },
        },
      },
    },
  });

  const items = cases.map((tc) => {
    const statuses = tc.results.map((r) => r.status);
    const analysis = analyzeFlakiness(statuses);
    return {
      id: tc.id,
      key: tc.key,
      name: tc.name,
      priority: tc.priority,
      type: tc.type,
      component: tc.component,
      isAutomated: tc.isAutomated,
      flakyDetectedAt: tc.flakyDetectedAt,
      flips: analysis.flips,
      runCount: analysis.runCount,
      passCount: analysis.passCount,
      failCount: analysis.failCount,
      blockedCount: analysis.blockedCount,
      failRate: analysis.failRate,
      // Chronological order (oldest -> newest) for visual timeline display
      recentRuns: [...tc.results].reverse().map((r) => ({
        id: r.id,
        status: r.status,
        createdAt: r.createdAt,
        executionKey: r.execution?.key ?? null,
        executionId: r.execution?.id ?? null,
      })),
    };
  });

  return NextResponse.json(items);
});
