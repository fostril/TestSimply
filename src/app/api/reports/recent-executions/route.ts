import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, requireProjectAccessOrForbid } from "@/lib/api";
import { Role } from "@prisma/client";

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
    whereClause = { projectId };
  } else if (auth.session.user.role !== Role.ADMIN) {
    // Restrict to projects the user is a member/lead of.
    const accessibleProjects = await prisma.project.findMany({
      where: {
        OR: [
          { members: { some: { id: auth.session.user.id } } },
          { leads: { some: { id: auth.session.user.id } } },
        ],
      },
      select: { id: true },
    });
    whereClause = { projectId: { in: accessibleProjects.map((p) => p.id) } };
  }

  const executions = await prisma.testExecution.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { results: true },
  });

  const data = executions.map((execution) => {
    const total = execution.results.length || 1;
    const pass = execution.results.filter((r) => r.status === "PASS").length;
    return {
      id: execution.id,
      key: execution.key,
      name: execution.name,
      status: execution.finishedAt ? "Completed" : "In progress",
      passRate: Math.round((pass / total) * 100),
    };
  });
  return NextResponse.json(data);
});
