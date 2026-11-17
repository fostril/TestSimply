import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Role, TestStatus } from "@prisma/client";

const mockPrisma: any = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(),
  },
  testExecution: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  testCase: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  testResult: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  projectCounter: {
    upsert: vi.fn(),
  },
  personalAccessToken: {
    findFirst: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
  $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockPrisma)),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { POST } from "@/app/api/import/cucumber/route";

function makeCucumberRequest(query: string, body: unknown) {
  return new NextRequest(`http://localhost:3000/api/import/cucumber${query}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/import/cucumber", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "user-1", name: "Ada", email: "ada@test.local", role: Role.ADMIN },
    });
    mockPrisma.project.findUnique.mockResolvedValue({ id: "proj-1", key: "ALPHA" });
    mockPrisma.testExecution.findFirst.mockResolvedValue({ id: "exec-1", projectId: "proj-1", key: "CI-1" });
    mockPrisma.testCase.findFirst.mockResolvedValue({ id: "case-1", projectId: "proj-1", key: "ALPHA_TC_1" });
    mockPrisma.testResult.findFirst.mockResolvedValue(null);
    mockPrisma.testResult.findMany.mockResolvedValue([]);
    mockPrisma.testResult.create.mockResolvedValue({ id: "res-1" });
    mockPrisma.projectCounter.upsert.mockResolvedValue({ count: 1 });
  });

  it("extracts key from @KEY tag when matching test case", async () => {
    const req = makeCucumberRequest("?projectKey=ALPHA&execKey=CI-1", [
      {
        name: "Auth",
        elements: [
          {
            name: "Login works",
            tags: [{ name: "@ALPHA_TC_1" }],
            steps: [{ name: "Given user", result: { status: "passed", duration: 2_000_000 } }],
          },
        ],
      },
    ]);

    const res = await POST(req, {});
    expect(res.status).toBe(200);
    expect(mockPrisma.testCase.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ key: "ALPHA_TC_1" }, { name: "Login works" }]),
        }),
      }),
    );
    expect(mockPrisma.testResult.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: TestStatus.PASS }),
      }),
    );
  });

  it("returns 400 when body is not an array", async () => {
    const req = makeCucumberRequest("?projectKey=ALPHA&execKey=CI-1", { not: "an-array" });
    const res = await POST(req, {});
    expect(res.status).toBe(400);
  });

  it("marks scenario FAIL when any step fails", async () => {
    const req = makeCucumberRequest("?projectKey=ALPHA&execKey=CI-1", [
      {
        name: "Auth",
        elements: [
          {
            name: "ALPHA_TC_1",
            steps: [
              { name: "Step 1", result: { status: "passed" } },
              { name: "Step 2", result: { status: "failed", error_message: "boom" } },
              { name: "Step 3", result: { status: "skipped" } },
            ],
          },
        ],
      },
    ]);

    const res = await POST(req, {});
    expect(res.status).toBe(200);
    expect(mockPrisma.testResult.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TestStatus.FAIL,
          errorMessage: "boom",
        }),
      }),
    );
  });

  it("marks scenario SKIPPED when all steps are skipped or pending", async () => {
    const req = makeCucumberRequest("?projectKey=ALPHA&execKey=CI-1", [
      {
        name: "Auth",
        elements: [
          {
            name: "ALPHA_TC_1",
            steps: [
              { name: "Step 1", result: { status: "skipped" } },
              { name: "Step 2", result: { status: "pending" } },
            ],
          },
        ],
      },
    ]);

    const res = await POST(req, {});
    expect(res.status).toBe(200);
    expect(mockPrisma.testResult.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: TestStatus.SKIPPED }),
      }),
    );
  });

  it("gives BLOCKED precedence over SKIPPED and PASS", async () => {
    const req = makeCucumberRequest("?projectKey=ALPHA&execKey=CI-1", [
      {
        name: "Auth",
        elements: [
          {
            name: "ALPHA_TC_1",
            steps: [
              { name: "Step 1", result: { status: "passed" } },
              { name: "Step 2", result: { status: "blocked" } },
              { name: "Step 3", result: { status: "skipped" } },
            ],
          },
        ],
      },
    ]);

    const res = await POST(req, {});
    expect(res.status).toBe(200);
    expect(mockPrisma.testResult.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: TestStatus.BLOCKED }),
      }),
    );
  });
});
