import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api";
import { importCucumber } from "@/lib/importers/cucumber";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, "execution:manage");
  if (!auth.authorized) return auth.response;

  const body = await req.json();
  const { searchParams } = new URL(req.url);
  const projectKey = searchParams.get("projectKey");
  const execKey = searchParams.get("execKey");
  const autoCreate = searchParams.get("autoCreateCases") === "true";
  const createExecutionIfMissing = searchParams.get("createExecutionIfMissing") === "true";

  if (!projectKey) {
    return NextResponse.json({ error: "projectKey required" }, { status: 400 });
  }
  const project = await prisma.project.findUnique({ where: { key: projectKey } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  let execution = execKey
    ? await prisma.testExecution.findFirst({ where: { projectId: project.id, key: execKey } })
    : null;

  if (!execution && createExecutionIfMissing) {
    execution = await prisma.testExecution.create({
      data: {
        projectId: project.id,
        key: execKey ?? `CI-${Date.now()}`,
        name: `CI Execution ${new Date().toISOString()}`
      }
    });
  }

  if (!execution) return NextResponse.json({ error: "Execution not found" }, { status: 404 });

  await importCucumber(body, {
    projectId: project.id,
    executionId: execution.id,
    autoCreateCases: autoCreate
  });

  return NextResponse.json({ ok: true });
}
