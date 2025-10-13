import { XMLParser } from "fast-xml-parser";
import { prisma } from "@/lib/prisma";
import { TestStatus } from "@prisma/client";

type ImportOptions = {
  projectId: string;
  executionId: string;
  autoCreateCases?: boolean;
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

const normalizeArray = <T>(value: T | T[] | undefined): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const mapStatus = (status?: string): TestStatus => {
  if (!status) return TestStatus.PASS;
  if (["skipped", "pending"].includes(status)) return TestStatus.SKIPPED;
  if (["failure", "failed", "error"].includes(status)) return TestStatus.FAIL;
  return TestStatus.PASS;
};

type ParsedCase = {
  name: string;
  classname?: string;
  time?: number;
  status?: string;
  failureMessage?: string;
};

const flattenCases = (report: any): ParsedCase[] => {
  if (!report) return [];
  const suites = normalizeArray(report.testsuite ?? report.testsuites?.testsuite ?? []);
  const cases: ParsedCase[] = [];
  for (const suite of suites) {
    const suiteCases = normalizeArray(suite.testcase);
    for (const testcase of suiteCases) {
      const failure = testcase.failure ?? testcase.error;
      const skipped = testcase.skipped ? "skipped" : undefined;
      cases.push({
        name: testcase.name,
        classname: testcase.classname ?? suite.name,
        time: Number(testcase.time ?? suite.time ?? 0) * 1000,
        status: failure ? "failure" : skipped ?? "pass",
        failureMessage: failure?.["#text"] ?? failure?.message ?? undefined
      });
    }
  }
  return cases;
};

export const importJUnit = async (xml: string, options: ImportOptions) => {
  const parsed = parser.parse(xml);
  const cases = flattenCases(parsed.testsuite ?? parsed.testsuites);

  for (const result of cases) {
    const caseKey = result.name;
    let testCase = await prisma.testCase.findFirst({
      where: {
        projectId: options.projectId,
        OR: [{ key: caseKey }, { name: caseKey }]
      }
    });
    if (!testCase && options.autoCreateCases) {
      testCase = await prisma.testCase.create({
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
    await prisma.testResult.create({
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
