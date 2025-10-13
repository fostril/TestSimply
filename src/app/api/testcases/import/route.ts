import { NextRequest, NextResponse } from "next/server";
import { parseCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, "testcase:create");
  if (!auth.authorized) return auth.response;
  const form = await req.formData();
  const file = form.get("file");
  const projectId = form.get("projectId");
  if (typeof projectId !== "string") {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  const rows = parseCsv(await file.text());
  const created = await prisma.$transaction(
    rows.map((row, index) =>
      prisma.testCase.create({
        data: {
          projectId,
          key: `${projectId}-CSV-${index + 1}-${Date.now()}`,
          name: row.name,
          description: row.description,
          preconditions: row.precondition,
          steps: row["steps.action"]
            ? row["steps.action"]?.split("|\n").map((action, idx) => ({
                action,
                expected: row["steps.expected"]?.split("|\n")[idx] ?? ""
              }))
            : [],
          expected: row.expected_result,
          tags: row.tags ? row.tags.split(",").map((tag) => tag.trim()) : []
        }
      })
    )
  );
  return NextResponse.json(created, { status: 201 });
}
