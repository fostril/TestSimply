import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { Prisma } from "@prisma/client";

export const GET = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "project:view");
  if (!auth.authorized) return auth.response;
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const whereClause = projectId
    ? Prisma.sql`WHERE e."projectId" = ${projectId} AND r."createdAt" > now() - interval '14 days'`
    : Prisma.sql`WHERE r."createdAt" > now() - interval '14 days'`;
  const trend = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT to_char(date_trunc('day', r."createdAt"), 'YYYY-MM-DD') as date,
           SUM(CASE WHEN r."status" = 'PASS' THEN 1 ELSE 0 END) as pass,
           SUM(CASE WHEN r."status" != 'PASS' THEN 1 ELSE 0 END) as fail
      FROM "TestResult" r
      INNER JOIN "TestExecution" e ON e."id" = r."executionId"
      ${whereClause}
  GROUP BY 1
  ORDER BY 1
  `);
  return NextResponse.json(trend);
});
