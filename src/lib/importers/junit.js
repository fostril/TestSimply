const { prisma: defaultClient } = require("../prisma.js");
const { TestStatus } = require("@prisma/client");

const attributePattern = /([\w:-]+)="([^"]*)"/g;

const parseAttributes = (source) => {
  const attributes = {};
  let match;
  while ((match = attributePattern.exec(source))) {
    attributes[match[1]] = match[2];
  }
  return attributes;
};

const parseTestCases = (suiteXml) => {
  const cases = [];
  const casePattern = /<testcase([^>]*)>([\s\S]*?)<\/testcase>/g;
  const selfClosingPattern = /<testcase([^>]*)\/>/g;
  let match;

  while ((match = casePattern.exec(suiteXml))) {
    const attrs = parseAttributes(match[1]);
    const body = match[2];
    const failureMatch = body.match(/<(failure|error)[^>]*>([\s\S]*?)<\/\1>/);
    const skippedMatch = body.match(/<skipped\b[^>]*\/>/);
    cases.push({
      name: attrs.name ?? "",
      classname: attrs.classname,
      time: attrs.time ? Number(attrs.time) * 1000 : undefined,
      status: failureMatch ? "failure" : skippedMatch ? "skipped" : "pass",
      failureMessage: failureMatch ? failureMatch[2].trim() : undefined
    });
  }

  while ((match = selfClosingPattern.exec(suiteXml))) {
    const attrs = parseAttributes(match[1]);
    cases.push({
      name: attrs.name ?? "",
      classname: attrs.classname,
      time: attrs.time ? Number(attrs.time) * 1000 : undefined,
      status: "pass"
    });
  }

  return cases;
};

const flattenCases = (xml) => {
  const aggregated = [];
  const suitePattern = /<testsuite([^>]*)>([\s\S]*?)<\/testsuite>/g;
  let match;
  let foundSuite = false;

  while ((match = suitePattern.exec(xml))) {
    foundSuite = true;
    const attrs = parseAttributes(match[1]);
    const suiteCases = parseTestCases(match[2]);
    suiteCases.forEach((testcase) => {
      aggregated.push({
        ...testcase,
        classname: testcase.classname ?? attrs.name,
        time:
          testcase.time ?? (attrs.time ? Number(attrs.time) * 1000 : undefined)
      });
    });
  }

  if (!foundSuite) {
    return parseTestCases(xml);
  }

  return aggregated;
};

const mapStatus = (status) => {
  if (!status) return TestStatus.PASS;
  const normalized = status.toLowerCase();
  if (normalized === "skipped" || normalized === "pending") {
    return TestStatus.SKIPPED;
  }
  if (normalized === "failure" || normalized === "failed" || normalized === "error") {
    return TestStatus.FAIL;
  }
  return TestStatus.PASS;
};

const importJUnit = async (xml, options, client = defaultClient) => {
  const cases = flattenCases(xml);

  for (const result of cases) {
    const caseKey = result.name;
    let testCase = await client.testCase.findFirst({
      where: {
        projectId: options.projectId,
        OR: [{ key: caseKey }, { name: caseKey }]
      }
    });
    if (!testCase && options.autoCreateCases) {
      testCase = await client.testCase.create({
        data: {
          projectId: options.projectId,
          key: caseKey,
          name: caseKey,
          steps: [],
          status: "Imported",
          tags: ["imported"],
          component: result.classname
        }
      });
    }
    if (!testCase) continue;
    await client.testResult.create({
      data: {
        executionId: options.executionId,
        caseId: testCase.id,
        status: mapStatus(result.status),
        durationMs: result.time ? Math.round(result.time) : null,
        errorMessage: result.failureMessage ?? null,
        stepsLog: null
      }
    });
  }
};

module.exports = { importJUnit };
