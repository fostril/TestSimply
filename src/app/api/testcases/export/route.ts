import { NextRequest, NextResponse } from "next/server";
import { exportCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";

export const GET = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "project:view");
  if (!auth.authorized) return auth.response;
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }
  const cases = await prisma.testCase.findMany({ where: { projectId } });
  const csv = exportCsv(
    cases.map((testCase) => ({
      name: testCase.name,
      description: testCase.description ?? "",
      precondition: testCase.preconditions ?? "",
      "steps.action": Array.isArray(testCase.steps)
        ? (testCase.steps as any[]).map((s) => s.action).join("|\n")
        : "",
      "steps.expected": Array.isArray(testCase.steps)
        ? (testCase.steps as any[]).map((s) => s.expected ?? "").join("|\n")
        : "",
      expected_result: testCase.expected ?? "",
      tags: testCase.tags.join(",")
    }))
  );
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=testcases.csv"
    }
  });
});
