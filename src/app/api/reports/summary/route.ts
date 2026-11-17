import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireAuth,
  withApiHandler,
  requireProjectAccessOrForbid,
  getAccessibleProjectIds,
} from "@/lib/api";
import { ExecutionStatus, TestStatus } from "@prisma/client";

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
      return NextResponse.json({
        passRate: 0,
        activeExecutions: 0,
        flakyCount: 0,
      });
    }
  }

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const projectWhere = scopedProjectIds
    ? { projectId: { in: scopedProjectIds } }
    : {};

  const [passCount, totalCount, activeExecutions, flakyCount] = await Promise.all([
    prisma.testResult.count({
      where: {
        status: TestStatus.PASS,
        createdAt: { gte: since },
        testCase: { deletedAt: null },
        execution: projectWhere,
      },
    }),
    prisma.testResult.count({
      where: {
        status: { not: TestStatus.SKIPPED },
        createdAt: { gte: since },
        testCase: { deletedAt: null },
        execution: projectWhere,
      },
    }),
    prisma.testExecution.count({
      where: {
        status: ExecutionStatus.ACTIVE,
        ...projectWhere,
      },
    }),
    prisma.testCase.count({
      where: {
        isFlaky: true,
        deletedAt: null,
        ...projectWhere,
      },
    }),
  ]);

  const passRate = totalCount === 0 ? 0 : Math.round((passCount / totalCount) * 100);

  return NextResponse.json({
    passRate,
    activeExecutions,
    flakyCount,
  });
});
