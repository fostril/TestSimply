import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";

export const GET = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "project:view");
  if (!auth.authorized) return auth.response;
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const executions = await prisma.testExecution.findMany({
    where: projectId ? { projectId } : undefined,
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { results: true }
  });
  const data = executions.map((execution) => {
    const total = execution.results.length || 1;
    const pass = execution.results.filter((r) => r.status === "PASS").length;
    return {
      id: execution.id,
      key: execution.key,
      name: execution.name,
      status: execution.finishedAt ? "Completed" : "In progress",
      passRate: Math.round((pass / total) * 100)
    };
  });
  return NextResponse.json(data);
});
