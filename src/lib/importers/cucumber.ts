import { prisma } from "@/lib/prisma";
import { TestStatus } from "@prisma/client";

type CucumberStep = {
  name: string;
  result: {
    status: string;
    duration?: number;
    error_message?: string;
  };
  embeddings?: { mime_type: string; data: string }[];
};

type CucumberScenario = {
  name: string;
  steps: CucumberStep[];
  tags?: { name: string }[];
};

type CucumberFeature = {
  name: string;
  elements: CucumberScenario[];
  tags?: { name: string }[];
};

type ImportOptions = {
  projectId: string;
  executionId: string;
  autoCreateCases?: boolean;
};

const mapStatus = (status?: string): TestStatus => {
  if (!status) return TestStatus.PASS;
  if (status === "skipped" || status === "pending") return TestStatus.SKIPPED;
  if (status === "failed" || status === "undefined") return TestStatus.FAIL;
  return TestStatus.PASS;
};

export const importCucumber = async (
  json: CucumberFeature[],
  options: ImportOptions
): Promise<void> => {
  for (const feature of json) {
    for (const scenario of feature.elements ?? []) {
      const tagKeys = scenario.tags
        ?.map((tag) => tag.name)
        .filter((name): name is string => Boolean(name)) ?? [];
      const keyFromTag = tagKeys.find((tag) => tag.startsWith("@"));
      const caseKey = keyFromTag ? keyFromTag.replace(/^@/, "") : scenario.name;
      let testCase = await prisma.testCase.findFirst({
        where: {
          projectId: options.projectId,
          OR: [{ key: caseKey }, { name: scenario.name }]
        }
      });
      if (!testCase && options.autoCreateCases) {
        testCase = await prisma.testCase.create({
          data: {
            projectId: options.projectId,
            key: caseKey,
            name: scenario.name,
            steps: scenario.steps.map((step) => ({ action: step.name, expected: "" })),
            status: "Imported",
            tags: tagKeys.map((tag) => tag.replace(/^@/, "")),
            component: feature.name
          }
        });
      }
      if (!testCase) continue;

      const stepsLog = scenario.steps.map((step) => ({
        name: step.name,
        status: mapStatus(step.result?.status),
        error: step.result?.error_message ?? null
      }));
      const duration = scenario.steps.reduce((sum, step) => sum + (step.result?.duration ?? 0), 0);

      await prisma.testResult.create({
        data: {
          executionId: options.executionId,
          caseId: testCase.id,
          status: stepsLog.some((step) => step.status === TestStatus.FAIL)
            ? TestStatus.FAIL
            : TestStatus.PASS,
          durationMs: duration ? Math.round(duration / 1_000_000) : null,
          errorMessage: stepsLog.find((step) => step.status === TestStatus.FAIL)?.error ?? null,
          stepsLog
        }
      });
    }
  }
};
