import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";

const createIssueMock = vi.hoisted(() => vi.fn(async (key: string) => ({ id: "100", key: `${key}-42`, self: "https://jira.example/100" })));
const testConnectionMock = vi.hoisted(() => vi.fn(async () => ({ success: true, message: "Connected to Jira as Ada" })));

vi.mock("@/lib/jira", () => ({
  JiraClient: {
    forProject: vi.fn(async () => ({
      createIssue: createIssueMock,
      testConnection: testConnectionMock,
    })),
  },
}));

const mockPrisma: any = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(),
  },
  projectSetting: {
    findUnique: vi.fn(),
  },
  projectCounter: {
    upsert: vi.fn(),
  },
  bug: {
    create: vi.fn(),
  },
  testCase: {
    findUnique: vi.fn(),
  },
  testSet: {
    findUnique: vi.fn(),
  },
  testResult: {
    findUnique: vi.fn(),
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
import { POST } from "@/app/api/integrations/jira/create/route";
import { POST as testJiraConnection } from "@/app/api/integrations/jira/test-connection/route";

describe("POST /api/integrations/jira/create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "admin-1", name: "Ada", email: "ada@test.local", role: Role.ADMIN },
    });
    mockPrisma.project.findUnique.mockResolvedValue({ id: "proj-1", key: "ALPHA" });
    mockPrisma.projectCounter.upsert.mockResolvedValue({ count: 7 });
    mockPrisma.bug.create.mockImplementation(async ({ data }: any) => ({
      id: "bug-7",
      ...data,
    }));
  });

  it("uses configured jiraProjectKey from ProjectSetting and creates linked local Bug", async () => {
    mockPrisma.projectSetting.findUnique.mockResolvedValue({
      jiraProjectKey: "JIRAEXT",
      jiraUrl: "https://example.atlassian.net",
      jiraEmail: "ada@test.local",
      jiraApiToken: "enc-token",
    });
    mockPrisma.testCase.findUnique.mockResolvedValue({ projectId: "proj-1", deletedAt: null });

    const req = new NextRequest("http://localhost:3000/api/integrations/jira/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "proj-1",
        summary: "Login fails",
        description: "500 error",
        testCaseId: "tc-1",
      }),
    });

    const res = await POST(req, {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(createIssueMock).toHaveBeenCalledWith("JIRAEXT", "Login fails", "500 error", "Bug");
    expect(body.browseUrl).toBe("https://example.atlassian.net/browse/JIRAEXT-42");
    expect(body.localBug.key).toBe("ALPHA_BUG_7");
    expect(mockPrisma.bug.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          testCaseId: "tc-1",
          summary: "[JIRAEXT-42] Login fails",
        }),
      }),
    );
  });

  it("falls back to local project key when jiraProjectKey is unset", async () => {
    mockPrisma.projectSetting.findUnique.mockResolvedValue({ jiraProjectKey: null });

    const req = new NextRequest("http://localhost:3000/api/integrations/jira/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "proj-1",
        summary: "Login fails",
      }),
    });

    const res = await POST(req, {});
    expect(res.status).toBe(200);
    expect(createIssueMock).toHaveBeenCalledWith("ALPHA", "Login fails", "", "Bug");
  });

  it("tests Jira connection when configured (200)", async () => {
    mockPrisma.projectSetting.findUnique.mockResolvedValue({
      jiraUrl: "https://example.atlassian.net",
      jiraEmail: "ada@test.local",
      jiraApiToken: "enc-token",
      jiraProjectKey: "JIRAEXT",
    });

    const req = new NextRequest("http://localhost:3000/api/integrations/jira/test-connection", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "proj-1" }),
    });

    const res = await testJiraConnection(req, {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, message: "Connected to Jira as Ada" });
    expect(testConnectionMock).toHaveBeenCalledWith("JIRAEXT");
  });
});
