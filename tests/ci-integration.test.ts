import dns from "dns";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

import { getServerSession } from "next-auth";
import { GitHubCiClient, GitLabCiClient, JenkinsCiClient } from "@/lib/ci";
import { POST as triggerCi } from "@/app/api/integrations/ci/trigger/route";
import { POST as testCiConnection } from "@/app/api/integrations/ci/test-connection/route";

describe("CI integration clients & trigger route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(dns.promises, "lookup").mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as any);
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

  afterEach(() => {
    vi.restoreAllMocks();
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

  it("retries GitHub workflow_dispatch without inputs on 422 Unexpected inputs and rejects traversal workflowId", async () => {
    const gh = new GitHubCiClient("https://github.com/acme/platform/actions", "ghp_123");
    await expect(gh.triggerWorkflow("../secret.yml")).rejects.toThrow(
      "Invalid workflow filename or ID",
    );

    const calls: Array<{ url: string; body: any }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://api.github.com/repos/acme/platform") {
        return new Response(JSON.stringify({ full_name: "acme/platform", default_branch: "trunk" }), { status: 200 });
      }
      if (url.endsWith("/actions/workflows/ci.yml/dispatches")) {
        const parsedBody = init?.body ? JSON.parse(String(init.body)) : {};
        calls.push({ url, body: parsedBody });
        if (parsedBody.inputs) {
          return new Response(JSON.stringify({ message: "Unexpected inputs provided" }), { status: 422 });
        }
        return new Response(null, { status: 204 });
      }
      return new Response("not found", { status: 404 });
    }) as any;

    try {
      const res = await gh.triggerWorkflow("ci.yml", { planId: "p1", execKey: "ALPHA_EXEC_1" });
      expect(res).toEqual({
        success: true,
        workflowUrl: "https://github.com/acme/platform/actions",
      });
      expect(calls).toHaveLength(2);
      expect(calls[0].body).toEqual({
        ref: "trunk",
        inputs: { planId: "p1", execKey: "ALPHA_EXEC_1" },
      });
      expect(calls[1].body).toEqual({ ref: "trunk" });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("supports Jenkins parameterized trigger with /build fallback and cleans up pending execution on CI failure", async () => {
    const jenkins = new JenkinsCiClient("https://jenkins.example.com", "ci-user:api-tok", "qa/regression");
    const hitUrls: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      hitUrls.push(url);
      if (url.includes("/buildWithParameters?")) {
        return new Response("Not parameterized", { status: 400 });
      }
      if (url.endsWith("/job/qa/job/regression/build")) {
        return new Response(null, {
          status: 201,
          headers: { location: "https://jenkins.example.com/queue/item/42/" },
        });
      }
      return new Response("error", { status: 500 });
    }) as any;

    try {
      const ok = await jenkins.triggerWorkflow("", { execKey: "ALPHA_EXEC_3" });
      expect(ok).toEqual({
        success: true,
        workflowUrl: "https://jenkins.example.com/queue/item/42/",
      });
      expect(hitUrls).toHaveLength(2);

      // Now simulate downstream CI failure during POST /api/integrations/ci/trigger
      mockPrisma.projectSetting.findUnique.mockResolvedValue({
        ciProvider: "JENKINS",
        ciUrl: "https://jenkins.example.com/job/qa",
        ciToken: "ci-user:api-tok",
        ciWorkflowId: null,
      });
      mockPrisma.testExecution.delete.mockResolvedValue({ id: "exec-3" });
      globalThis.fetch = vi.fn(async () => new Response("Jenkins offline", { status: 503 })) as any;

      const failReq = new NextRequest("http://localhost:3000/api/integrations/ci/trigger", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: "proj-1", planId: "plan-1" }),
      });
      const failRes = await triggerCi(failReq, {});
      expect(failRes.status).toBe(502);
      expect(mockPrisma.testExecution.delete).toHaveBeenCalledWith({ where: { id: "exec-3" } });

      // Test connection route
      globalThis.fetch = vi.fn(async () =>
        new Response(JSON.stringify({ fullDisplayName: "QA Folder" }), { status: 200 }),
      ) as any;
      const connReq = new NextRequest("http://localhost:3000/api/integrations/ci/test-connection", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: "proj-1" }),
      });
      const connRes = await testCiConnection(connReq, {});
      expect(connRes.status).toBe(200);
      expect(await connRes.json()).toEqual({
        success: true,
        message: "Connected to Jenkins: QA Folder",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
