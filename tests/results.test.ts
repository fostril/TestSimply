import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ExecutionStatus, Role, TestStatus } from "@prisma/client";
import { deriveOverallStatus } from "@/lib/runner-utils";

const mockPrisma: any = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  testExecution: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  testCase: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  bug: {
    findMany: vi.fn(),
  },
  testResult: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    groupBy: vi.fn(),
  },
  testCasePlan: {
    count: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { POST as recordResult } from "@/app/api/results/route";
import { GET as exportExecution } from "@/app/api/executions/[id]/export/route";

describe("Execution results & runner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "u-tester", name: "Tara", email: "tara@test.local", role: Role.TESTER },
    });
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1", key: "ALPHA" });
    mockPrisma.testExecution.findUnique.mockResolvedValue({
      id: "exec-1",
      projectId: "proj-1",
      finishedAt: null,
      planId: "plan-1",
      status: ExecutionStatus.ACTIVE,
    });
    mockPrisma.testCase.findUnique.mockResolvedValue({ projectId: "proj-1" });
    mockPrisma.testResult.findFirst.mockResolvedValue(null);
    mockPrisma.testResult.findMany.mockResolvedValue([]);
    mockPrisma.testCasePlan.count.mockResolvedValue(2);
    mockPrisma.testResult.groupBy.mockResolvedValue([{ caseId: "tc-1" }]);
    mockPrisma.testResult.create.mockImplementation(async ({ data }: any) => ({
      id: "res-1",
      ...data,
    }));
  });

  it("derives overall status from per-step statuses (FAIL > BLOCKED > PASS)", () => {
    expect(
      deriveOverallStatus([
        { stepIndex: 0, status: "PASS", actual: "", comments: "" },
        { stepIndex: 1, status: "PASS", actual: "", comments: "" },
      ]),
    ).toBe("PASS");

    expect(
      deriveOverallStatus([
        { stepIndex: 0, status: "PASS", actual: "", comments: "" },
        { stepIndex: 1, status: "BLOCKED", actual: "", comments: "" },
      ]),
    ).toBe("BLOCKED");

    expect(
      deriveOverallStatus([
        { stepIndex: 0, status: "BLOCKED", actual: "", comments: "" },
        { stepIndex: 1, status: "FAIL", actual: "500 error", comments: "" },
      ]),
    ).toBe("FAIL");

    expect(
      deriveOverallStatus([
        { stepIndex: 0, status: "PASS", actual: "", comments: "" },
        { stepIndex: 1, status: "NOT_RUN", actual: "", comments: "" },
      ]),
    ).toBeNull();
  });

  it("records FAIL result with per-step actual result and comments", async () => {
    const req = new NextRequest("http://localhost:3000/api/results", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        executionId: "exec-1",
        caseId: "tc-1",
        status: TestStatus.FAIL,
        stepsLog: [
          { stepIndex: 0, status: "PASS", actual: "Loaded" },
          { stepIndex: 1, status: "FAIL", actual: "HTTP 500", comments: "Server crash" },
        ],
      }),
    });

    const res = await recordResult(req, {});
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe(TestStatus.FAIL);
    expect(body.stepsLog[1].actual).toBe("HTTP 500");
  });

  it("links only bugs belonging to the same project", async () => {
    mockPrisma.bug.findMany.mockResolvedValue([{ id: "bug-same" }]);

    const req = new NextRequest("http://localhost:3000/api/results", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        executionId: "exec-1",
        caseId: "tc-1",
        status: TestStatus.FAIL,
        bugIds: ["bug-same", "bug-other-project"],
      }),
    });

    const res = await recordResult(req, {});
    expect(res.status).toBe(201);
    expect(mockPrisma.bug.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["bug-same", "bug-other-project"] }, projectId: "proj-1" },
      }),
    );
    expect(mockPrisma.testResult.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          bugs: { connect: [{ id: "bug-same" }] },
        }),
      }),
    );
  });

  it("auto-completes execution when all planned cases have results", async () => {
    mockPrisma.testCasePlan.count.mockResolvedValue(2);
    mockPrisma.testResult.groupBy.mockResolvedValue([{ caseId: "tc-1" }, { caseId: "tc-2" }]);

    const req = new NextRequest("http://localhost:3000/api/results", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        executionId: "exec-1",
        caseId: "tc-2",
        status: TestStatus.PASS,
      }),
    });

    const res = await recordResult(req, {});
    expect(res.status).toBe(201);
    expect(mockPrisma.testExecution.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "exec-1" },
        data: expect.objectContaining({
          status: ExecutionStatus.COMPLETED,
          finishedAt: expect.any(Date),
        }),
      }),
    );
    expect(mockPrisma.testResult.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          executionId: "exec-1",
          status: { not: TestStatus.SKIPPED },
        }),
      }),
    );
  });

  it("does not auto-complete execution when completed count < planned count (e.g. only 1 non-SKIPPED)", async () => {
    mockPrisma.testCasePlan.count.mockResolvedValue(2);
    mockPrisma.testResult.groupBy.mockResolvedValue([{ caseId: "tc-1" }]);

    const req = new NextRequest("http://localhost:3000/api/results", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        executionId: "exec-1",
        caseId: "tc-1",
        status: TestStatus.PASS,
      }),
    });

    const res = await recordResult(req, {});
    expect(res.status).toBe(201);
    expect(mockPrisma.testExecution.update).not.toHaveBeenCalled();
  });

  it("rejects recording results for soft-deleted test cases (400)", async () => {
    mockPrisma.testCase.findUnique.mockResolvedValue({
      id: "tc-deleted",
      projectId: "proj-1",
      deletedAt: new Date(),
    });

    const req = new NextRequest("http://localhost:3000/api/results", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        executionId: "exec-1",
        caseId: "tc-deleted",
        status: TestStatus.PASS,
      }),
    });

    const res = await recordResult(req, {});
    expect(res.status).toBe(400);
  });

  it("exports execution results as CSV", async () => {
    mockPrisma.testExecution.findUnique.mockResolvedValue({
      id: "exec-1",
      key: "ALPHA_EXEC_1",
      name: "Smoke Run",
      projectId: "proj-1",
      status: ExecutionStatus.COMPLETED,
      startedAt: new Date("2026-01-01T10:00:00Z"),
      finishedAt: new Date("2026-01-01T10:15:00Z"),
      project: { name: "Alpha" },
      environmentRelation: { name: "Staging" },
      plan: {
        cases: [
          { case: { id: "tc-1", key: "ALPHA_TC_1", name: "Login" } },
          { case: { id: "tc-2", key: "ALPHA_TC_2", name: "Logout" } },
        ],
      },
      results: [
        {
          caseId: "tc-1",
          status: TestStatus.FAIL,
          stepsLog: [{ note: "Failed on submit" }],
          bugs: [{ key: "ALPHA_BUG_1" }],
          testCase: { id: "tc-1", key: "ALPHA_TC_1", name: "Login" },
        },
      ],
    });

    const req = new NextRequest("http://localhost:3000/api/executions/exec-1/export");
    const res = await exportExecution(req, { params: { id: "exec-1" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");

    const csv = await res.text();
    expect(csv).toContain("ALPHA_TC_1,Login,FAIL,Failed on submit,ALPHA_BUG_1");
    expect(csv).toContain("ALPHA_TC_2,Logout,NOT_RUN,,");
    expect(csv).toContain("Total Cases,2");
  });
});
