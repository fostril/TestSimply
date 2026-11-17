import { NextRequest, NextResponse } from "next/server";
import { parseCsv } from "@/lib/csv";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, requireProjectAccessOrForbid } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { generateEntityKey } from "@/lib/keys";
import { validateUpload } from "@/lib/upload";

export const POST = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "testcase:create");
  if (!auth.authorized) return auth.response;
  const form = await req.formData();
  const rawFile = form.get("file");
  const projectId = form.get("projectId");

  if (typeof projectId !== "string") {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  const access = await requireProjectAccessOrForbid(
    auth.session.user.id,
    auth.session.user.role,
    projectId,
  );
  if (access instanceof NextResponse) return access;

  const validated = validateUpload(rawFile, "report");
  if (validated instanceof NextResponse) return validated;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { key: true },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const rows = parseCsv(await validated.text()).filter((row) => row.name?.trim());
  if (rows.length === 0) {
    return NextResponse.json({ error: "No valid test cases found in CSV" }, { status: 400 });
  }

  // Generate keys first so the atomic counter advances once per row, rather
  // than embedding Date.now() into keys (which is non-deterministic and ugly).
  const keys: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    keys.push(await generateEntityKey(prisma, projectId, project.key, "TC"));
  }

  const created = await prisma.$transaction(
    rows.map((row, index) =>
      prisma.testCase.create({
        data: {
          projectId,
          key: keys[index],
          name: row.name,
          description: row.description,
          preconditionsText: row.precondition,
          steps: row["steps.action"]
            ? row["steps.action"]?.split("|\n").map((action, idx) => ({
              action,
              expected: row["steps.expected"]?.split("|\n")[idx] ?? "",
            }))
            : [],
          expected: row.expected_result,
          tags: row.tags ? row.tags.split(",").map((tag) => tag.trim()) : [],
        },
      })
    )
  );
  await logAudit(
    auth.session.user.id,
    "IMPORT_CSV",
    "TestCase",
    projectId,
    { projectId, count: created.length },
    projectId,
  );

  return NextResponse.json(created, { status: 201 });
});
