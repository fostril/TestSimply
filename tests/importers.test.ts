import { describe, expect, it, vi, beforeEach } from "vitest";
import { importJUnit } from "@/lib/importers/junit";
import { importCucumber } from "@/lib/importers/cucumber";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => {
  const createMock = vi.fn();
  const testCaseFindFirst = vi.fn();
  return {
    prisma: {
      testCase: { findFirst: testCaseFindFirst, create: createMock },
      testResult: { create: vi.fn() }
    }
  };
});

describe("importers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses junit report", async () => {
    const xml = `<?xml version="1.0"?><testsuite name="suite"><testcase name="TC-1" time="1" /></testsuite>`;
    (prisma.testCase.findFirst as any).mockResolvedValue({ id: "case", projectId: "proj" });
    await importJUnit(xml, { projectId: "proj", executionId: "exec" });
    expect(prisma.testResult.create).toHaveBeenCalled();
  });

  it("parses cucumber report", async () => {
    (prisma.testCase.findFirst as any).mockResolvedValue({ id: "case", projectId: "proj" });
    await importCucumber(
      [
        {
          name: "Login",
          elements: [
            {
              name: "TC-1",
              steps: [
                { name: "Given", result: { status: "passed" } },
                { name: "When", result: { status: "failed" } }
              ]
            }
          ]
        }
      ] as any,
      { projectId: "proj", executionId: "exec" }
    );
    expect(prisma.testResult.create).toHaveBeenCalled();
  });
});
