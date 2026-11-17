import { beforeEach, describe, expect, it, vi } from "vitest";
import { TestStatus } from "@prisma/client";
import { checkAndMarkFlaky } from "@/lib/flakiness";
import { importJUnit } from "@/lib/importers/junit";
import { importCucumber } from "@/lib/importers/cucumber";

function createFlakinessClient() {
  const results: Array<{ id: string; executionId: string; caseId: string; status: TestStatus; createdAt: Date }> = [];
  const testCase = {
    id: "case-1",
    projectId: "proj-1",
    key: "ALPHA_TC_1",
    name: "Flaky login",
    isFlaky: false,
    flakyDetectedAt: null as Date | null,
  };

  const client: any = {
    project: {
      findUnique: vi.fn(async () => ({ id: "proj-1", key: "ALPHA" })),
    },
    testCase: {
      findFirst: vi.fn(async () => testCase),
      update: vi.fn(async ({ data }: any) => {
        Object.assign(testCase, data);
        return testCase;
      }),
    },
    testResult: {
      findFirst: vi.fn(async ({ where }: any) => {
        return results.find((r) => r.executionId === where.executionId && r.caseId === where.caseId) ?? null;
      }),
      findMany: vi.fn(async ({ where }: any) => {
        return [...results]
          .filter((r) => r.caseId === where.caseId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      }),
      create: vi.fn(async ({ data }: any) => {
        const row = {
          id: `res-${results.length + 1}`,
          ...data,
          createdAt: new Date(Date.now() + results.length * 1000),
        };
        results.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = results.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
    $transaction: vi.fn(async (fn: (tx: any) => Promise<any>) => fn(client)),
  };

  return { client, results, testCase };
}

describe("flakiness detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not mark case flaky with fewer than 3 results", async () => {
    const { client, results, testCase } = createFlakinessClient();
    results.push(
      { id: "1", executionId: "e1", caseId: "case-1", status: TestStatus.PASS, createdAt: new Date(1000) },
      { id: "2", executionId: "e2", caseId: "case-1", status: TestStatus.FAIL, createdAt: new Date(2000) },
    );

    await checkAndMarkFlaky("case-1", client);
    expect(testCase.isFlaky).toBe(false);
    expect(client.testCase.update).not.toHaveBeenCalled();
  });

  it("marks case flaky on alternating PASS/FAIL/PASS/FAIL", async () => {
    const { client, results, testCase } = createFlakinessClient();
    results.push(
      { id: "1", executionId: "e1", caseId: "case-1", status: TestStatus.PASS, createdAt: new Date(1000) },
      { id: "2", executionId: "e2", caseId: "case-1", status: TestStatus.FAIL, createdAt: new Date(2000) },
      { id: "3", executionId: "e3", caseId: "case-1", status: TestStatus.PASS, createdAt: new Date(3000) },
      { id: "4", executionId: "e4", caseId: "case-1", status: TestStatus.FAIL, createdAt: new Date(4000) },
    );

    await checkAndMarkFlaky("case-1", client);
    expect(testCase.isFlaky).toBe(true);
    expect(testCase.flakyDetectedAt).toBeInstanceOf(Date);
  });

  it("does not mark stable case flaky", async () => {
    const { client, results, testCase } = createFlakinessClient();
    results.push(
      { id: "1", executionId: "e1", caseId: "case-1", status: TestStatus.PASS, createdAt: new Date(1000) },
      { id: "2", executionId: "e2", caseId: "case-1", status: TestStatus.PASS, createdAt: new Date(2000) },
      { id: "3", executionId: "e3", caseId: "case-1", status: TestStatus.PASS, createdAt: new Date(3000) },
      { id: "4", executionId: "e4", caseId: "case-1", status: TestStatus.PASS, createdAt: new Date(4000) },
    );

    await checkAndMarkFlaky("case-1", client);
    expect(testCase.isFlaky).toBe(false);
  });

  it("triggers flakiness detection after JUnit and Cucumber imports", async () => {
    const { client, testCase } = createFlakinessClient();
    const passXml = `<testsuite><testcase name="ALPHA_TC_1"/></testsuite>`;
    const failXml = `<testsuite><testcase name="ALPHA_TC_1"><failure>err</failure></testcase></testsuite>`;

    await importJUnit(passXml, { projectId: "proj-1", executionId: "exec-1" }, client);
    await importJUnit(failXml, { projectId: "proj-1", executionId: "exec-2" }, client);
    await importCucumber(
      [
        {
          name: "Suite",
          elements: [
            { name: "ALPHA_TC_1", steps: [{ name: "step", result: { status: "passed" } }] },
          ],
        },
      ],
      { projectId: "proj-1", executionId: "exec-3" },
      client,
    );

    await vi.waitFor(() => {
      expect(testCase.isFlaky).toBe(true);
      expect(testCase.flakyDetectedAt).toBeInstanceOf(Date);
    });
  });
});
