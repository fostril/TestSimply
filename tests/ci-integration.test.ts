import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { ExecutionStatus, Role } from "@prisma/client";

const mockPrisma: any = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(),
  },
  testPlan: {
    findUnique: vi.fn(),
  },
  projectSetting: {
    findUnique: vi.fn(),
  },
  projectCounter: {
    upsert: vi.fn(),
  },
  testExecution: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
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

vi.mock("@/lib/ssrf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ssrf")>();
  return {
    ...actual,
    assertSafeExternalUrl: vi.fn(async () => undefined),
  };
});

import { getServerSession } from "next-auth";
import { GitHubCiClient, GitLabCiClient, JenkinsCiClient } from "@/lib/ci";
import { POST as triggerCi } from "@/app/api/integrations/ci/trigger/route";

describe("CI integration clients & trigger route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "admin-1", name: "Ada", email: "ada@test.local", role: Role.ADMIN },
    });
    mockPrisma.project.findUnique.mockResolvedValue({ id: "proj-1", key: "ALPHA" });
    mockPrisma.testPlan.findUnique.mockResolvedValue({ id: "plan-1", name: "Regression", projectId: "proj-1" });
    mockPrisma.projectCounter.upsert.mockResolvedValue({ count: 3 });
    mockPrisma.testExecution.create.mockImplementation(async ({ data }: any) => ({
      id: "exec-3",
      ...data,
    }));
  });

  it("parses GitHub repo URLs including .git and rejects bare api.github.com", () => {
    expect(() => new GitHubCiClient("https://api.github.com", "tok")).toThrow();
    const client = new GitHubCiClient("https://github.com/acme/web-tests.git", "tok");
    expect(client).toBeInstanceOf(GitHubCiClient);

    const gitlab = new GitLabCiClient("https://gitlab.example.com/group/sub/project.git", "glpat-123");
    expect(gitlab).toBeInstanceOf(GitLabCiClient);

    const jenkins = new JenkinsCiClient("https://ci.example.com", "alice:token123", "qa/nightly");
    expect(jenkins).toBeInstanceOf(JenkinsCiClient);
  });

  it("creates tracked execution with execKey when triggering CI and rolls back on failure", async () => {
    mockPrisma.projectSetting.findUnique.mockResolvedValue({
      ciProvider: "GITLAB",
      ciUrl: "https://gitlab.example.com/qa/suite",
      ciToken: "glpat-plain-dev",
      ciWorkflowId: "nightly",
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/v4/projects/qa%2Fsuite")) {
        return new Response(JSON.stringify({ default_branch: "develop" }), { status: 200 });
      }
      if (url.endsWith("/api/v4/projects/qa%2Fsuite/pipeline")) {
        return new Response(JSON.stringify({ web_url: "https://gitlab.example.com/qa/suite/-/pipelines/99" }), { status: 201 });
      }
      return new Response("not found", { status: 404 });
    }) as any;

    try {
      const req = new NextRequest("http://localhost:3000/api/integrations/ci/trigger", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: "proj-1", planId: "plan-1" }),
      });

      const res = await triggerCi(req, {});
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toEqual({
        success: true,
        workflowUrl: "https://gitlab.example.com/qa/suite/-/pipelines/99",
        executionId: "exec-3",
        executionKey: "ALPHA_EXEC_3",
      });
      expect(mockPrisma.testExecution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            key: "ALPHA_EXEC_3",
            planId: "plan-1",
            status: ExecutionStatus.ACTIVE,
          }),
        }),
      );
      expect(mockPrisma.testExecution.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "exec-3" },
          data: { buildUrl: "https://gitlab.example.com/qa/suite/-/pipelines/99" },
        }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
