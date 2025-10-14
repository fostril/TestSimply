const { prisma: defaultClient } = require("../prisma.js");
const { TestStatus } = require("@prisma/client");

const mapStatus = (status) => {
  if (!status) return TestStatus.PASS;
  const normalized = status.toLowerCase();
  if (normalized === "skipped" || normalized === "pending") {
    return TestStatus.SKIPPED;
  }
  if (normalized === "failed" || normalized === "undefined") {
    return TestStatus.FAIL;
  }
  return TestStatus.PASS;
};

const importCucumber = async (json, options, client = defaultClient) => {
  for (const feature of json) {
    for (const scenario of feature.elements ?? []) {
      const tagKeys = (scenario.tags ?? [])
        .map((tag) => tag?.name)
        .filter((name) => Boolean(name));
      const keyFromTag = tagKeys.find((tag) => tag?.startsWith("@"));
      const caseKey = keyFromTag ? keyFromTag.replace(/^@/, "") : scenario.name;
      let testCase = await client.testCase.findFirst({
        where: {
          projectId: options.projectId,
          OR: [{ key: caseKey }, { name: scenario.name }]
        }
      });
      if (!testCase && options.autoCreateCases) {
        testCase = await client.testCase.create({
          data: {
            projectId: options.projectId,
            key: caseKey,
            name: scenario.name,
            steps: (scenario.steps ?? []).map((step) => ({
              action: step.name,
              expected: ""
            })),
            status: "Imported",
            tags: tagKeys.map((tag) => tag.replace(/^@/, "")),
            component: feature.name
          }
        });
      }
      if (!testCase) continue;

      const stepsLog = (scenario.steps ?? []).map((step) => ({
        name: step.name,
        status: mapStatus(step.result?.status),
        error: step.result?.error_message ?? null
      }));

      const duration = (scenario.steps ?? []).reduce(
        (sum, step) => sum + (step.result?.duration ?? 0),
        0
      );

      await client.testResult.create({
        data: {
          executionId: options.executionId,
          caseId: testCase.id,
          status: stepsLog.some((step) => step.status === TestStatus.FAIL)
            ? TestStatus.FAIL
            : TestStatus.PASS,
          durationMs: duration ? Math.round(duration / 1_000_000) : null,
          errorMessage:
            stepsLog.find((step) => step.status === TestStatus.FAIL)?.error ?? null,
          stepsLog
        }
      });
    }
  }
};

module.exports = { importCucumber };
