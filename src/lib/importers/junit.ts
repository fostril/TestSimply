import type { PrismaClient } from "@prisma/client";
import { TestStatus } from "@prisma/client";
import { parseStringPromise } from "xml2js";
import { prisma as defaultClient } from "@/lib/prisma";
import { generateEntityKey } from "@/lib/keys";

export type ImportOptions = {
  projectId: string;
  executionId: string;
  autoCreateCases?: boolean;
};

export type ParsedJUnitCase = {
  name: string;
  classname?: string;
  time?: number;
  status: string;
  failureMessage?: string;
};

export class JUnitParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JUnitParseError";
  }
}

type XmlNode = {
  $?: Record<string, string>;
  _?: string;
  testsuite?: XmlNode[];
  testcase?: XmlNode[];
  failure?: Array<XmlNode | string>;
  error?: Array<XmlNode | string>;
  skipped?: Array<XmlNode | string>;
};

const parseTimeMs = (raw?: string): number | undefined => {
  if (raw === undefined || raw === "") return undefined;
  const num = Number(raw);
  return Number.isFinite(num) ? num * 1000 : undefined;
};

const extractFailureMessage = (node: XmlNode | string): string | undefined => {
  if (typeof node === "string") {
    const trimmed = node.trim();
    return trimmed || undefined;
  }
  const body = typeof node._ === "string" ? node._.trim() : "";
  if (body) return body;
  const attrMsg = node.$?.message?.trim() || node.$?.type?.trim();
  return attrMsg || undefined;
};

const collectFromSuite = (
  suite: XmlNode,
  cases: ParsedJUnitCase[],
  inheritedSuiteName?: string,
  inheritedTimeMs?: number,
) => {
  const attrs = suite.$ ?? {};
  const suiteName = attrs.name ?? inheritedSuiteName;
  const suiteTimeMs = parseTimeMs(attrs.time) ?? inheritedTimeMs;

  for (const tc of suite.testcase ?? []) {
    const tcAttrs = tc.$ ?? {};
    const name = (tcAttrs.name ?? "").trim();
    if (!name) continue;

    const failureNode = tc.failure?.[0] ?? tc.error?.[0];
    const skippedNode = tc.skipped?.[0];

    let status = "pass";
    let failureMessage: string | undefined;
    if (failureNode !== undefined) {
      status = "failure";
      failureMessage = extractFailureMessage(failureNode);
    } else if (skippedNode !== undefined) {
      status = "skipped";
    }

    cases.push({
      name,
      classname: tcAttrs.classname ?? suiteName,
      time: parseTimeMs(tcAttrs.time) ?? suiteTimeMs,
      status,
      failureMessage,
    });
  }

  for (const nested of suite.testsuite ?? []) {
    collectFromSuite(nested, cases, suiteName, suiteTimeMs);
  }
};

export const parseJUnitXml = async (xml: string): Promise<ParsedJUnitCase[]> => {
  if (!xml || !xml.trim()) {
    throw new JUnitParseError("JUnit XML report is empty");
  }

  let parsed: Record<string, XmlNode>;
  try {
    parsed = (await parseStringPromise(xml, {
      explicitArray: true,
      explicitCharkey: true,
    })) as Record<string, XmlNode>;
  } catch {
    throw new JUnitParseError("Malformed JUnit XML report");
  }

  if (!parsed || (!parsed.testsuites && !parsed.testsuite)) {
    throw new JUnitParseError(
      "Invalid JUnit XML: root element must be <testsuites> or <testsuite>",
    );
  }

  const cases: ParsedJUnitCase[] = [];
  if (parsed.testsuites) {
    collectFromSuite(parsed.testsuites, cases);
  } else if (parsed.testsuite) {
    collectFromSuite(parsed.testsuite, cases);
  }

  if (cases.length === 0) {
    throw new JUnitParseError("JUnit XML report contains no test cases");
  }

  return cases;
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
  xmlOrCases: string | ParsedJUnitCase[],
  options: ImportOptions,
  client: PrismaClient = defaultClient,
) => {
  const cases =
    typeof xmlOrCases === "string" ? await parseJUnitXml(xmlOrCases) : xmlOrCases;

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
