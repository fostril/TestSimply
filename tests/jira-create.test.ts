import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";

const createIssueMock = vi.hoisted(() => vi.fn(async (key: string) => ({ id: "100", key: `${key}-42`, self: "https://jira.example/100" })));

vi.mock("@/lib/jira", () => ({
  JiraClient: {
    forProject: vi.fn(async () => ({
      createIssue: createIssueMock,
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
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { POST } from "@/app/api/integrations/jira/create/route";

describe("POST /api/integrations/jira/create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "admin-1", name: "Ada", email: "ada@test.local", role: Role.ADMIN },
    });
    mockPrisma.project.findUnique.mockResolvedValue({ id: "proj-1", key: "ALPHA" });
  });

  it("uses configured jiraProjectKey from ProjectSetting instead of local project key", async () => {
    mockPrisma.projectSetting.findUnique.mockResolvedValue({ jiraProjectKey: "JIRAEXT" });

    const req = new NextRequest("http://localhost:3000/api/integrations/jira/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "proj-1",
        summary: "Login fails",
        description: "500 error",
      }),
    });

    const res = await POST(req, {});
    expect(res.status).toBe(200);
    expect(createIssueMock).toHaveBeenCalledWith("JIRAEXT", "Login fails", "500 error", "Bug");
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
});
