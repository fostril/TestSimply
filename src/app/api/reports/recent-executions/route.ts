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

  let whereClause: { projectId?: string | { in: string[] } } = {};
  if (projectId) {
    const access = await requireProjectAccessOrForbid(
      auth.session.user.id,
      auth.session.user.role,
      projectId,
    );
    if (access instanceof NextResponse) return access;
    whereClause = { projectId: access.id };
  } else {
    const accessibleIds = await getAccessibleProjectIds(
      auth.session.user.id,
      auth.session.user.role,
    );
    if (accessibleIds) {
      whereClause = { projectId: { in: accessibleIds } };
    }
  }

  const executions = await prisma.testExecution.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      results: {
        where: {
          testCase: { deletedAt: null },
          status: { not: TestStatus.SKIPPED },
        },
        select: { status: true },
      },
    },
  });

  const data = executions.map((execution) => {
    const total = execution.results.length;
    const pass = execution.results.filter((r) => r.status === TestStatus.PASS).length;
    const status =
      execution.status === ExecutionStatus.COMPLETED
        ? "Completed"
        : execution.status === ExecutionStatus.BLOCKED
          ? "Blocked"
          : "In progress";
    return {
      id: execution.id,
      key: execution.key,
      name: execution.name,
      status,
      passRate: total === 0 ? 0 : Math.round((pass / total) * 100),
    };
  });
  return NextResponse.json(data);
});
