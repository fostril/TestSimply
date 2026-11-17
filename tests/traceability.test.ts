import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Role, TestStatus } from "@prisma/client";

const mockPrisma: any = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(),
  },
  testPlan: {
    findUnique: vi.fn(),
  },
  requirement: {
    findMany: vi.fn(),
  },
  testCase: {
    findMany: vi.fn(),
  },
  testResult: {
    findMany: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { GET } from "@/app/api/reports/traceability/route";

const makeTestCase = (id: string, key: string, deletedAt: Date | null = null) => ({
  id,
  key,
  name: `Case ${key}`,
  type: "MANUAL",
  priority: "MEDIUM",
  deletedAt,
  folder: { path: "/auth" },
  tags: [],
  bugs: [],
});

describe("GET /api/reports/traceability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "admin-1", name: "Ada", email: "ada@test.local", role: Role.ADMIN },
    });
    mockPrisma.project.findUnique.mockResolvedValue({ id: "proj-1", key: "ALPHA" });
    mockPrisma.testCase.findMany.mockResolvedValue([]);
  });

  it("computes matrix shape and OK / NOK / WIP / NOT_RUN derived statuses", async () => {
    const tcOk = makeTestCase("tc-ok", "TC-1");
    const tcNok = makeTestCase("tc-nok", "TC-2");
    const tcPass = makeTestCase("tc-pass", "TC-3");
    const tcUnrun = makeTestCase("tc-unrun", "TC-4");

    mockPrisma.requirement.findMany.mockResolvedValue([
      {
        id: "r-ok",
        key: "REQ-1",
        title: "All pass",
        externalUrl: null,
        status: "OPEN",
        links: [{ testCaseId: tcOk.id, testCase: tcOk }],
      },
      {
        id: "r-nok",
        key: "REQ-2",
        title: "One fail",
        externalUrl: null,
        status: "OPEN",
        links: [{ testCaseId: tcNok.id, testCase: tcNok }],
      },
      {
        id: "r-wip",
        key: "REQ-3",
        title: "Partial pass",
        externalUrl: null,
        status: "OPEN",
        links: [
          { testCaseId: tcPass.id, testCase: tcPass },
          { testCaseId: tcUnrun.id, testCase: tcUnrun },
        ],
      },
      {
        id: "r-notrun",
        key: "REQ-4",
        title: "No runs",
        externalUrl: null,
        status: "OPEN",
        links: [{ testCaseId: tcUnrun.id, testCase: tcUnrun }],
      },
    ]);

    mockPrisma.testResult.findMany.mockResolvedValue([
      {
        caseId: "tc-ok",
        status: TestStatus.PASS,
        createdAt: new Date("2026-01-02T00:00:00Z"),
        execution: { key: "EX-1", environmentId: "env-1", projectId: "proj-1" },
      },
      {
        caseId: "tc-nok",
        status: TestStatus.FAIL,
        createdAt: new Date("2026-01-02T00:00:00Z"),
        execution: { key: "EX-1", environmentId: "env-1", projectId: "proj-1" },
      },
      {
        caseId: "tc-pass",
        status: TestStatus.PASS,
        createdAt: new Date("2026-01-02T00:00:00Z"),
        execution: { key: "EX-1", environmentId: "env-1", projectId: "proj-1" },
      },
    ]);

    const req = new NextRequest("http://localhost:3000/api/reports/traceability?projectId=proj-1");
    const res = await GET(req, {});
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.summary).toEqual({
      totalRequirements: 4,
      ok: 1,
      nok: 1,
      wip: 1,
      notRun: 1,
    });
    expect(body.rows.map((r: any) => [r.key, r.coverage.derivedStatus])).toEqual([
      ["REQ-1", "OK"],
      ["REQ-2", "NOK"],
      ["REQ-3", "WIP"],
      ["REQ-4", "NOT_RUN"],
    ]);
  });

  it("applies planId and environmentId filters and includes unlinked cases when includeUnlinked=1", async () => {
    mockPrisma.testPlan.findUnique.mockResolvedValue({
      projectId: "proj-1",
      cases: [{ caseId: "tc-1" }, { caseId: "tc-unlinked" }],
    });
    const tc1 = makeTestCase("tc-1", "TC-1");
    const tc2 = makeTestCase("tc-2", "TC-2");
    mockPrisma.requirement.findMany.mockResolvedValue([
      {
        id: "r-1",
        key: "REQ-1",
        title: "Req 1",
        externalUrl: null,
        status: "OPEN",
        links: [
          { testCaseId: "tc-1", testCase: tc1 },
          { testCaseId: "tc-2", testCase: tc2 },
        ],
      },
    ]);
    mockPrisma.testCase.findMany.mockResolvedValue([makeTestCase("tc-unlinked", "TC-U")]);
    mockPrisma.testResult.findMany.mockResolvedValue([
      {
        caseId: "tc-1",
        status: TestStatus.PASS,
        createdAt: new Date(),
        execution: { key: "EX-1", environmentId: "env-prod", projectId: "proj-1" },
      },
    ]);

    const req = new NextRequest(
      "http://localhost:3000/api/reports/traceability?projectId=proj-1&planId=plan-1&environmentId=env-prod&includeUnlinked=1",
    );
    const res = await GET(req, {});
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.rows).toHaveLength(2);
    expect(body.rows[0].cases.map((c: any) => c.id)).toEqual(["tc-1"]);
    expect(body.rows[1].id).toBeNull();
    expect(body.rows[1].title).toBe("(no requirement)");
    expect(body.rows[1].cases.map((c: any) => c.id)).toEqual(["tc-unlinked"]);
    expect(mockPrisma.testResult.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          execution: { environmentId: "env-prod" },
        }),
      }),
    );
  });

  it("excludes soft-deleted test cases via links filter", async () => {
    mockPrisma.requirement.findMany.mockResolvedValue([]);
    const req = new NextRequest("http://localhost:3000/api/reports/traceability?projectId=proj-1");
    const res = await GET(req, {});
    expect(res.status).toBe(200);

    expect(mockPrisma.requirement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          links: expect.objectContaining({
            where: { testCase: { deletedAt: null } },
          }),
        }),
      }),
    );
  });
});
