import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";

const mockPrisma: any = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  testCase: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  testPlan: {
    create: vi.fn(),
  },
  projectCounter: {
    upsert: vi.fn(),
  },
  user: {
    update: vi.fn(),
  },
  personalAccessToken: {
    findFirst: vi.fn(),
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
import { can, roleMatrix } from "@/lib/rbac";
import { POST as createTestCase } from "@/app/api/testcases/route";
import { POST as createTestPlan } from "@/app/api/testplans/route";
import { POST as createProject } from "@/app/api/projects/route";
import { PATCH as updateUserRole } from "@/app/api/users/route";
import { GET as getTestCase } from "@/app/api/testcases/[id]/route";
import { POST as bulkTestCases } from "@/app/api/testcases/bulk/route";

describe("RBAC & access isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.project.findUnique.mockResolvedValue({ id: "proj-1", key: "ALPHA" });
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1", key: "ALPHA" });
    mockPrisma.projectCounter.upsert.mockResolvedValue({ count: 1 });
  });

  it("forbids VIEWER from creating a test case (403)", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "u-viewer", name: "Vera", email: "vera@test.local", role: Role.VIEWER },
    });

    const req = new NextRequest("http://localhost:3000/api/testcases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "proj-1", key: "ALPHA_TC_1", name: "Test 1" }),
    });
    const res = await createTestCase(req, {});
    expect(res.status).toBe(403);
  });

  it("forbids TESTER from managing test plans (403)", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "u-tester", name: "Tara", email: "tara@test.local", role: Role.TESTER },
    });

    const req = new NextRequest("http://localhost:3000/api/testplans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "proj-1", name: "Plan 1" }),
    });
    const res = await createTestPlan(req, {});
    expect(res.status).toBe(403);
  });

  it("allows LEAD to create a project (201) and forbids TESTER (403)", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "u-lead", name: "Liam", email: "liam@test.local", role: Role.LEAD },
    });
    mockPrisma.project.create.mockResolvedValue({
      id: "proj-new",
      key: "NEWP",
      name: "New Project",
    });

    const leadReq = new NextRequest("http://localhost:3000/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "NEWP", name: "New Project" }),
    });
    const leadRes = await createProject(leadReq, {});
    expect(leadRes.status).toBe(201);
    expect(mockPrisma.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          leads: { connect: [{ id: "u-lead" }] },
        }),
      })
    );

    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "u-tester", name: "Tara", email: "tara@test.local", role: Role.TESTER },
    });
    const testerReq = new NextRequest("http://localhost:3000/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "NEWP2", name: "New Project 2" }),
    });
    const testerRes = await createProject(testerReq, {});
    expect(testerRes.status).toBe(403);
  });

  it("allows ADMIN to change another user's role (200)", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "u-admin", name: "Ada", email: "ada@test.local", role: Role.ADMIN },
    });
    mockPrisma.user.update.mockResolvedValue({
      id: "u-tester",
      name: "Tara",
      email: "tara@test.local",
      role: Role.LEAD,
    });

    const req = new NextRequest("http://localhost:3000/api/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "u-tester", role: Role.LEAD }),
    });
    const res = await updateUserRole(req, {});
    expect(res.status).toBe(200);
    expect((await res.json()).role).toBe(Role.LEAD);
  });

  it("blocks non-member from accessing another project's resources (403/404)", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "u-outsider", name: "Outsider", email: "out@test.local", role: Role.TESTER },
    });
    mockPrisma.project.findFirst.mockResolvedValue(null); // not member or lead
    mockPrisma.testCase.findUnique.mockResolvedValue({ id: "tc-1", projectId: "proj-secret" });

    const reqCreate = new NextRequest("http://localhost:3000/api/testcases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "proj-secret", key: "SEC_1", name: "Probe" }),
    });
    expect((await createTestCase(reqCreate, {})).status).toBe(403);

    const reqGet = new NextRequest("http://localhost:3000/api/testcases/tc-1");
    expect((await getTestCase(reqGet, { params: { id: "tc-1" } })).status).toBe(404);
  });

  it("blocks unauthenticated requests (401)", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/testcases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "proj-1", key: "K", name: "N" }),
    });
    const res = await createTestCase(req, {});
    expect(res.status).toBe(401);
  });

  it("rejects invalid Bearer token with 401", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    mockPrisma.personalAccessToken.findFirst.mockResolvedValue(null);

    const req = new NextRequest("http://localhost:3000/api/testcases", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer invalid-token-xyz",
      },
      body: JSON.stringify({ projectId: "proj-1", key: "K", name: "N" }),
    });
    const res = await createTestCase(req, {});
    expect(res.status).toBe(401);
  });

  it("forbids TESTER from bulk-deleting test cases (403)", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "u-tester", name: "Tara", email: "tara@test.local", role: Role.TESTER },
    });

    const req = new NextRequest("http://localhost:3000/api/testcases/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ids: ["tc-1"], action: "delete" }),
    });
    const res = await bulkTestCases(req, {});
    expect(res.status).toBe(403);
  });

  it("enforces roleMatrix permissions via can() for ADMIN, LEAD, TESTER, and VIEWER", () => {
    expect(can(null, "project:view")).toBe(false);
    expect(can(undefined, "project:view")).toBe(false);

    // ADMIN has every permission including project:delete and user:manage
    expect(can(Role.ADMIN, "project:create")).toBe(true);
    expect(can(Role.ADMIN, "project:delete")).toBe(true);
    expect(can(Role.ADMIN, "user:manage")).toBe(true);
    expect(roleMatrix[Role.ADMIN]).toContain("settings:manage");

    // LEAD can create/update projects and manage plans/executions, but cannot delete projects or manage users
    expect(can(Role.LEAD, "project:create")).toBe(true);
    expect(can(Role.LEAD, "project:update")).toBe(true);
    expect(can(Role.LEAD, "testplan:manage")).toBe(true);
    expect(can(Role.LEAD, "execution:manage")).toBe(true);
    expect(can(Role.LEAD, "testcase:delete")).toBe(true);
    expect(can(Role.LEAD, "project:delete")).toBe(false);
    expect(can(Role.LEAD, "user:manage")).toBe(false);

    // TESTER can create/update test cases, manage test sets, run executions, and manage bugs,
    // but cannot create/update/delete projects, delete test cases, or manage plans/executions
    expect(can(Role.TESTER, "testcase:create")).toBe(true);
    expect(can(Role.TESTER, "testcase:update")).toBe(true);
    expect(can(Role.TESTER, "testset:manage")).toBe(true);
    expect(can(Role.TESTER, "execution:run")).toBe(true);
    expect(can(Role.TESTER, "bug:manage")).toBe(true);
    expect(can(Role.TESTER, "project:create")).toBe(false);
    expect(can(Role.TESTER, "project:update")).toBe(false);
    expect(can(Role.TESTER, "project:delete")).toBe(false);
    expect(can(Role.TESTER, "testcase:delete")).toBe(false);
    expect(can(Role.TESTER, "testplan:manage")).toBe(false);
    expect(can(Role.TESTER, "execution:manage")).toBe(false);

    // VIEWER is read-only
    expect(can(Role.VIEWER, "project:view")).toBe(true);
    expect(can(Role.VIEWER, "testcase:create")).toBe(false);
    expect(can(Role.VIEWER, "execution:run")).toBe(false);
    expect(can(Role.VIEWER, "bug:manage")).toBe(false);
  });
});
