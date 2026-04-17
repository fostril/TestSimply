const { prisma: defaultClient } = require("../prisma.js");
const { TestStatus } = require("@prisma/client");
const { generateEntityKey } = require("../keys.js");

const mapStatus = (status) => {
  if (!status) return TestStatus.PASS;
  const normalized = String(status).toLowerCase();
  if (normalized === "skipped" || normalized === "pending") {
    return TestStatus.SKIPPED;
  }
  if (normalized === "failed" || normalized === "undefined") {
    return TestStatus.FAIL;
  }
  return TestStatus.PASS;
};

const cleanString = (value) => {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!str || str === "undefined" || str === "null") return null;
  return str;
};

const importCucumber = async (json, options, client = defaultClient) => {
  // Lazily fetch the project prefix — only needed when we have to mint keys
  // for auto-created test cases. Tests often skip this, so keep it lazy.
  let projectPromise = null;
  const getProject = () => {
    if (!projectPromise) {
      projectPromise = client.project
        .findUnique({
          where: { id: options.projectId },
          select: { key: true },
        })
        .then((p) => {
          if (!p) throw new Error(`Project ${options.projectId} not found`);
          return p;
        });
    }
    return projectPromise;
  };

  for (const feature of json) {
    for (const scenario of feature.elements ?? []) {
      const tagKeys = (scenario.tags ?? [])
        .map((tag) => cleanString(tag?.name))
        .filter(Boolean);

      const tagDerivedKey = tagKeys.find((tag) => tag.startsWith("@"));
      const providedKey = tagDerivedKey ? tagDerivedKey.replace(/^@/, "") : null;
      const scenarioName = cleanString(scenario?.name);

      // If no name and no tag-derived key, skip — nothing meaningful to
      // attach the result to.
      if (!scenarioName && !providedKey) {
        continue;
      }

      const orFilters = [];
      if (providedKey) orFilters.push({ key: providedKey });
      if (scenarioName) orFilters.push({ name: scenarioName });

      let testCase = await client.testCase.findFirst({
        where: {
          projectId: options.projectId,
          OR: orFilters,
        },
      });

      if (!testCase && options.autoCreateCases) {
        const project = await getProject();
        const newKey = providedKey
          ? providedKey
          : await generateEntityKey(client, options.projectId, project.key, "TC");

        testCase = await client.testCase.create({
          data: {
            projectId: options.projectId,
            key: newKey,
            name: scenarioName || newKey,
            steps: (scenario.steps ?? [])
              .map((step) => ({
                action: cleanString(step?.name) || "",
                expected: "",
              }))
              .filter((step) => step.action.length > 0),
            status: "Imported",
            tags: tagKeys.map((tag) => tag.replace(/^@/, "")),
            component: cleanString(feature?.name) || null,
          },
        });
      }
      if (!testCase) continue;

      const stepsLog = (scenario.steps ?? []).map((step) => ({
        name: cleanString(step?.name) || "",
        status: mapStatus(step?.result?.status),
        error: cleanString(step?.result?.error_message),
      }));

      const duration = (scenario.steps ?? []).reduce(
        (sum, step) => sum + (step?.result?.duration ?? 0),
        0,
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
          stepsLog,
        },
      });
    }
  }
};

module.exports = { importCucumber };
