import type { PrismaClient } from "@prisma/client";
import { TestStatus } from "@prisma/client";
import { prisma as defaultClient } from "@/lib/prisma";
import { generateEntityKey } from "@/lib/keys";

export type ImportOptions = {
  projectId: string;
  executionId: string;
  autoCreateCases?: boolean;
};

type ParsedCase = {
  name: string;
  classname?: string;
  time?: number;
  status: string;
  failureMessage?: string;
};

const attributePattern = /([\w:-]+)="([^"]*)"/g;

const parseAttributes = (source: string) => {
  const attributes: Record<string, string> = {};
  let match: RegExpExecArray | null;
  while ((match = attributePattern.exec(source))) {
    attributes[match[1]] = match[2];
  }
  return attributes;
};

const parseTestCases = (suiteXml: string): ParsedCase[] => {
  const cases: ParsedCase[] = [];
  const casePattern = /<testcase([^>]*)>([\s\S]*?)<\/testcase>/g;
  const selfClosingPattern = /<testcase([^>]*)\/>/g;
  let match: RegExpExecArray | null;

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
      failureMessage: failureMatch ? failureMatch[2].trim() : undefined,
    });
  }

  while ((match = selfClosingPattern.exec(suiteXml))) {
    const attrs = parseAttributes(match[1]);
    cases.push({
      name: attrs.name ?? "",
      classname: attrs.classname,
      time: attrs.time ? Number(attrs.time) * 1000 : undefined,
      status: "pass",
    });
  }

  return cases;
};

const flattenCases = (xml: string): ParsedCase[] => {
  const aggregated: ParsedCase[] = [];
  const suitePattern = /<testsuite([^>]*)>([\s\S]*?)<\/testsuite>/g;
  let match: RegExpExecArray | null;
  let foundSuite = false;

  while ((match = suitePattern.exec(xml))) {
    foundSuite = true;
    const attrs = parseAttributes(match[1]);
    const suiteCases = parseTestCases(match[2]);
    suiteCases.forEach((testcase) => {
      aggregated.push({
        ...testcase,
        classname: testcase.classname ?? attrs.name,
        time: testcase.time ?? (attrs.time ? Number(attrs.time) * 1000 : undefined),
      });
    });
  }

  if (!foundSuite) {
    return parseTestCases(xml);
  }

  return aggregated;
};

const mapStatus = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized === "skipped" || normalized === "pending") {
    return TestStatus.SKIPPED;
  }
  if (normalized === "failure" || normalized === "failed" || normalized === "error") {
    return TestStatus.FAIL;
  }
  return TestStatus.PASS;
};

export const importJUnit = async (
  xml: string,
  options: ImportOptions,
  client: PrismaClient = defaultClient,
) => {
  const cases = flattenCases(xml);

  let projectPromise: Promise<{ key: string }> | null = null;
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

  for (const result of cases) {
    const name = (result.name ?? "").trim();
    if (!name) continue;

    let testCase = await client.testCase.findFirst({
      where: {
        projectId: options.projectId,
        OR: [{ key: name }, { name }],
      },
    });
    if (!testCase && options.autoCreateCases) {
      const project = await getProject();
      const generatedKey = await generateEntityKey(client, options.projectId, project.key, "TC");
      testCase = await client.testCase.create({
        data: {
          projectId: options.projectId,
          key: generatedKey,
          name,
          steps: [],
          status: "Imported",
          tags: ["imported"],
          component: result.classname || null,
        },
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
        stepsLog: undefined,
      },
    });
  }
};
