import { describe, expect, it } from "vitest";
import { TestStatus } from "@prisma/client";
import { importJUnit } from "../src/lib/importers/junit";
import { importCucumber } from "../src/lib/importers/cucumber";

type PrismaMock = {
  testCase: {
    findFirst: (args: unknown) => Promise<any>;
    create: (args: any) => Promise<any>;
  };
  testResult: {
    create: (args: any) => Promise<any>;
  };
};

type CallTracker = {
  testCase: { findFirst: any[]; create: any[] };
  testResult: { create: any[] };
};

const createPrismaMock = (): { mock: PrismaMock; calls: CallTracker } => {
  const calls: CallTracker = {
    testCase: { findFirst: [], create: [] },
    testResult: { create: [] }
  };

  const mock: PrismaMock = {
    testCase: {
      findFirst: async (args) => {
        calls.testCase.findFirst.push(args);
        return null;
      },
      create: async (args) => {
        calls.testCase.create.push(args);
        return { id: "case", ...args.data };
      }
    },
    testResult: {
      create: async (args) => {
        calls.testResult.create.push(args);
        return args;
      }
    }
  };

  return { mock, calls };
};

describe("importers", () => {
  it("parses junit report", async () => {
    const { mock, calls } = createPrismaMock();
    mock.testCase.findFirst = async () => ({ id: "case", projectId: "proj" });
    const xml = `<?xml version="1.0"?><testsuite name="suite"><testcase name="TC-1" time="1" /></testsuite>`;
    await importJUnit(xml, { projectId: "proj", executionId: "exec" }, mock as any);
    expect(calls.testResult.create).toHaveLength(1);
    expect(calls.testResult.create[0].data.status).toEqual(TestStatus.PASS);
  });

  it("parses cucumber report", async () => {
    const { mock, calls } = createPrismaMock();
    mock.testCase.findFirst = async () => ({ id: "case", projectId: "proj" });
    await importCucumber(
      [
        {
          name: "Login",
          elements: [
            {
              name: "TC-1",
              steps: [
                { name: "Given", result: { status: "passed" } },
                { name: "When", result: { status: "failed", error_message: "boom" } }
              ]
            }
          ]
        }
      ],
      { projectId: "proj", executionId: "exec" },
      mock as any
    );
    expect(calls.testResult.create).toHaveLength(1);
    expect(calls.testResult.create[0].data.status).toEqual(TestStatus.FAIL);
  });
});
