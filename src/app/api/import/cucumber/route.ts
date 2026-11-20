import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, withApiHandler, requireProjectAccessOrForbid } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { importCucumber } from "@/lib/importers/cucumber";
import { finalizeImportExecution, resolveOrCreateImportExecution } from "@/lib/importers/shared";
import { validateBodySize } from "@/lib/upload";

export const POST = withApiHandler(async (req: NextRequest) => {
  const auth = await requireAuth(req, "execution:run");
  if (!auth.authorized) return auth.response;

  const sizeCheck = validateBodySize(req);
  if (sizeCheck) return sizeCheck;

  const body = await req.json();
  if (!Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid payload: expected an array of features" }, { status: 400 });
  }
  const { searchParams } = new URL(req.url);
  const projectKey = searchParams.get("projectKey");
  const execKey = searchParams.get("execKey");
  const autoCreate = searchParams.get("autoCreateCases") === "true";
  const createExecutionIfMissing = searchParams.get("createExecutionIfMissing") === "true";
  const completeExecution = searchParams.get("complete") !== "false";
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

  const access = await requireProjectAccessOrForbid(
    auth.session.user.id,
    auth.session.user.role,
    project.id,
  );
  if (access instanceof NextResponse) return access;

  const execution = await resolveOrCreateImportExecution(prisma, {
    project: { id: project.id, key: project.key },
    execKey,
    createExecutionIfMissing,
    environment,
    buildUrl,
    commitSha,
    revision,
    labels,
  });

  if (!execution) return NextResponse.json({ error: "Execution not found" }, { status: 404 });

  await importCucumber(body, {
    projectId: project.id,
    executionId: execution.id,
    autoCreateCases: autoCreate
  });

  await finalizeImportExecution(prisma, execution.id, completeExecution);

  await logAudit(
    auth.session.user.id,
    "IMPORT_CUCUMBER",
    "TestExecution",
    execution.id,
    { projectId: project.id, executionKey: execution.key, features: body.length },
    project.id,
  );

  return NextResponse.json({ ok: true });
});
