import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { Prisma } from "@prisma/client";

export const GET = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "project:view");
  if (!auth.authorized) return auth.response;
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const projectFilter = projectId ? Prisma.sql`AND e."projectId" = ${projectId}` : Prisma.sql``;

  const [passCount, totalCount, activeExecutions, flakyCases] = await Promise.all([
    prisma.testResult.count({
      where: {
        status: "PASS",
        createdAt: { gte: since },
        execution: projectId ? { projectId } : undefined
      }
    }),
    prisma.testResult.count({
      where: {
        createdAt: { gte: since },
        execution: projectId ? { projectId } : undefined
      }
    }),
    prisma.testExecution.count({
      where: {
        finishedAt: null,
        projectId: projectId ?? undefined
      }
    }),
    prisma.$queryRaw<{ count: number }[]>(Prisma.sql`
      SELECT COUNT(*) as count
        FROM (
          SELECT r."caseId",
                 SUM(CASE WHEN r."status" = 'FAIL' THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0) as fail_ratio
            FROM "TestResult" r
            INNER JOIN "TestExecution" e ON e."id" = r."executionId"
           WHERE r."createdAt" >= ${since}
             ${projectFilter}
        GROUP BY r."caseId"
          HAVING SUM(CASE WHEN r."status" = 'FAIL' THEN 1 ELSE 0 END)::float / NULLIF(COUNT(*), 0) >= 0.3
        ) as sub
    `)
  ]);

  const passRate = totalCount === 0 ? 0 : Math.round((passCount / totalCount) * 100);
  const flakyCount = Number(flakyCases[0]?.count ?? 0);

  return NextResponse.json({
    passRate,
    activeExecutions,
    flakyCount
  });
});
