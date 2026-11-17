import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, requireProjectAccessOrForbid } from "@/lib/api";
import { importJUnit, JUnitParseError, parseJUnitXml } from "@/lib/importers/junit";
import { validateUpload } from "@/lib/upload";

export const POST = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "execution:run");
  if (!auth.authorized) return auth.response;

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
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const access = await requireProjectAccessOrForbid(
    auth.session.user.id,
    auth.session.user.role,
    project.id,
  );
  if (access instanceof NextResponse) return access;

  // Validate uploaded file and parse XML BEFORE creating or updating any execution
  const form = await req.formData();
  const rawFile = form.get("report");
  const validated = validateUpload(rawFile, "report");
  if (validated instanceof NextResponse) return validated;

  const xml = await validated.text();
  let parsedCases;
  try {
    parsedCases = await parseJUnitXml(xml);
  } catch (err) {
    if (err instanceof JUnitParseError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }

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

  if (!execution) {
    return NextResponse.json({ error: "Execution not found" }, { status: 404 });
  }

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

  await importJUnit(parsedCases, {
    projectId: project.id,
    executionId: execution.id,
    autoCreateCases: autoCreate
  });

  return NextResponse.json({ ok: true });
});
