import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  withApiHandler,
  requireProjectAccessOrForbid,
  getAccessibleProjectIds,
} from "@/lib/api";
import { Prisma } from "@prisma/client";

function buildEmptyTrend() {
  const result = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    result.push({ date: dateStr, pass: 0, fail: 0 });
  }
  return result;
}

export const GET = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "project:view");
  if (!auth.authorized) return auth.response;
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  let scopedProjectIds: string[] | null = null;
  if (projectId) {
    const access = await requireProjectAccessOrForbid(
      auth.session.user.id,
      auth.session.user.role,
      projectId,
    );
    if (access instanceof NextResponse) return access;
    scopedProjectIds = [access.id];
  } else {
    scopedProjectIds = await getAccessibleProjectIds(
      auth.session.user.id,
      auth.session.user.role,
    );
    if (scopedProjectIds && scopedProjectIds.length === 0) {
      return NextResponse.json(buildEmptyTrend());
    }
  }

  const projectCondition = scopedProjectIds
    ? Prisma.sql`AND e."projectId" IN (${Prisma.join(scopedProjectIds)})`
    : Prisma.sql``;

  const trend = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT to_char(date_trunc('day', r."createdAt"), 'YYYY-MM-DD') as date,
           SUM(CASE WHEN r."status" = 'PASS' THEN 1 ELSE 0 END) as pass,
           SUM(CASE WHEN r."status" = 'FAIL' THEN 1 ELSE 0 END) as fail
      FROM "TestResult" r
      INNER JOIN "TestExecution" e ON e."id" = r."executionId"
      INNER JOIN "TestCase" tc ON tc."id" = r."caseId"
     WHERE r."createdAt" > now() - interval '14 days'
       AND tc."deletedAt" IS NULL
       ${projectCondition}
  GROUP BY 1
  ORDER BY 1
  `);

  const trendMap = new Map(trend.map((row) => [row.date, { pass: Number(row.pass), fail: Number(row.fail) }]));

  const result = buildEmptyTrend().map((entry) =>
    trendMap.has(entry.date)
      ? { date: entry.date, ...trendMap.get(entry.date)! }
      : entry,
  );

  return NextResponse.json(result);
});
