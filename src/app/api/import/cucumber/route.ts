import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler } from "@/lib/api";
import { importCucumber } from "@/lib/importers/cucumber";

export const POST = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "execution:manage");
  if (!auth.authorized) return auth.response;

  const body = await req.json();
  const { searchParams } = new URL(req.url);
  const projectKey = searchParams.get("projectKey");
  const execKey = searchParams.get("execKey");
  const autoCreate = searchParams.get("autoCreateCases") === "true";
  const createExecutionIfMissing = searchParams.get("createExecutionIfMissing") === "true";
  const environment = searchParams.get("environment");
  const buildUrl = searchParams.get("buildUrl");
  const commitSha = searchParams.get("commitSha");
  const revision = searchParams.get("revision");
  const labelsParam = searchParams.get("labels");
  const labels = labelsParam ? labelsParam.split(",").map((label) => label.trim()).filter(Boolean) : undefined;

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
        name: `CI Execution ${new Date().toISOString()}`,
        environment: environment ?? undefined,
        buildUrl: buildUrl ?? undefined,
        commitSha: commitSha ?? undefined,
        revision: revision ?? undefined,
        labels: labels ?? []
      }
    });
  }

  if (!execution) return NextResponse.json({ error: "Execution not found" }, { status: 404 });

  if (environment || buildUrl || commitSha || revision || labels) {
    execution = await prisma.testExecution.update({
      where: { id: execution.id },
      data: {
        environment: environment ?? undefined,
        buildUrl: buildUrl ?? undefined,
        commitSha: commitSha ?? undefined,
        revision: revision ?? undefined,
        labels: labels ?? execution.labels
      }
    });
  }

  await importCucumber(body, {
    projectId: project.id,
    executionId: execution.id,
    autoCreateCases: autoCreate
  });

  return NextResponse.json({ ok: true });
});
