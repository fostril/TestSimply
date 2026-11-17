import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Role, TestStatus } from "@prisma/client";

const mockPrisma: any = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
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
import { POST } from "@/app/api/import/junit/route";

function makeJUnitRequest(
  query: string,
  file?: { content: string | Uint8Array; name: string; type: string },
  headers: Record<string, string> = {},
) {
  const form = new FormData();
  if (file) {
    const blob = new Blob([file.content as BlobPart], { type: file.type });
    form.append("report", blob, file.name);
  }
  return new NextRequest(`http://localhost:3000/api/import/junit${query}`, {
    method: "POST",
    body: form,
    headers,
  });
}

describe("POST /api/import/junit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "user-1", name: "Ada", email: "ada@test.local", role: Role.ADMIN },
    });
    mockPrisma.project.findUnique.mockResolvedValue({ id: "proj-1", key: "ALPHA" });
    mockPrisma.testExecution.findFirst.mockResolvedValue(null);
    mockPrisma.testExecution.create.mockResolvedValue({ id: "exec-1", projectId: "proj-1", key: "CI-1" });
    mockPrisma.testCase.findFirst.mockResolvedValue({ id: "case-1", projectId: "proj-1", key: "ALPHA_TC_1" });
    mockPrisma.testResult.findFirst.mockResolvedValue(null);
    mockPrisma.testResult.findMany.mockResolvedValue([]);
    mockPrisma.testResult.create.mockResolvedValue({ id: "res-1" });
    mockPrisma.projectCounter.upsert.mockResolvedValue({ count: 1 });
  });

  it("imports valid JUnit XML and creates execution and results (200)", async () => {
    const xml = `<?xml version="1.0"?><testsuites><testsuite name="auth"><testcase name="ALPHA_TC_1" time="0.5"/></testsuite></testsuites>`;
    const req = makeJUnitRequest(
      "?projectKey=ALPHA&createExecutionIfMissing=true",
      { content: xml, name: "junit.xml", type: "application/xml" },
    );

    const res = await POST(req, {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockPrisma.testExecution.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.testResult.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          executionId: "exec-1",
          caseId: "case-1",
          status: TestStatus.PASS,
          durationMs: 500,
        }),
      }),
    );
  });

  it("rejects garbage text with 400 and creates no execution", async () => {
    const req = makeJUnitRequest(
      "?projectKey=ALPHA&createExecutionIfMissing=true",
      { content: "not xml at all {{{", name: "bad.xml", type: "application/xml" },
    );

    const res = await POST(req, {});
    expect(res.status).toBe(400);
    expect(mockPrisma.testExecution.create).not.toHaveBeenCalled();
    expect(mockPrisma.testResult.create).not.toHaveBeenCalled();
  });

  it("rejects valid XML with zero testcases with 400 and creates no execution", async () => {
    const xml = `<?xml version="1.0"?><testsuite name="empty"></testsuite>`;
    const req = makeJUnitRequest(
      "?projectKey=ALPHA&createExecutionIfMissing=true",
      { content: xml, name: "empty.xml", type: "application/xml" },
    );

    const res = await POST(req, {});
    expect(res.status).toBe(400);
    expect(mockPrisma.testExecution.create).not.toHaveBeenCalled();
  });

  it("returns 401 when bearer token is invalid", async () => {
    mockPrisma.personalAccessToken.findFirst.mockResolvedValue(null);
    const req = makeJUnitRequest(
      "?projectKey=ALPHA",
      { content: `<testsuite><testcase name="t1"/></testsuite>`, name: "r.xml", type: "application/xml" },
      { authorization: "Bearer invalid-token" },
    );

    const res = await POST(req, {});
    expect(res.status).toBe(401);
  });

  it("returns 400 when projectKey is missing", async () => {
    const req = makeJUnitRequest(
      "",
      { content: `<testsuite><testcase name="t1"/></testsuite>`, name: "r.xml", type: "application/xml" },
    );
    const res = await POST(req, {});
    expect(res.status).toBe(400);
  });

  it("returns 413 when file exceeds 10 MB", async () => {
    const huge = new Uint8Array(10 * 1024 * 1024 + 1);
    const req = makeJUnitRequest(
      "?projectKey=ALPHA",
      { content: huge, name: "huge.xml", type: "application/xml" },
    );
    const res = await POST(req, {});
    expect(res.status).toBe(413);
    expect(mockPrisma.testExecution.create).not.toHaveBeenCalled();
  });

  it("returns 415 when MIME type is disallowed", async () => {
    const req = makeJUnitRequest(
      "?projectKey=ALPHA",
      { content: `<testsuite><testcase name="t1"/></testsuite>`, name: "r.exe", type: "application/x-msdownload" },
    );
    const res = await POST(req, {});
    expect(res.status).toBe(415);
    expect(mockPrisma.testExecution.create).not.toHaveBeenCalled();
  });

  it("auto-creates missing test cases when autoCreateCases=true", async () => {
    mockPrisma.testCase.findFirst.mockResolvedValue(null);
    mockPrisma.testCase.create.mockResolvedValue({ id: "new-case", projectId: "proj-1", key: "ALPHA_TC_1" });
    const xml = `<testsuite name="SuiteA"><testcase name="Auto created test" time="0.2"><failure message="boom">trace</failure></testcase></testsuite>`;
    const req = makeJUnitRequest(
      "?projectKey=ALPHA&createExecutionIfMissing=true&autoCreateCases=true",
      { content: xml, name: "junit.xml", type: "text/xml" },
    );
    const res = await POST(req, {});
    expect(res.status).toBe(200);
    expect(mockPrisma.testCase.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.testResult.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          caseId: "new-case",
          status: TestStatus.FAIL,
          errorMessage: "trace",
        }),
      }),
    );
  });
});
