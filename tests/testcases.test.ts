import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Role, TestType } from "@prisma/client";

const mockPrisma: any = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  testCase: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  testFolder: {
    findUnique: vi.fn(),
  },
  projectCounter: {
    upsert: vi.fn(),
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
import { POST as createTestCase } from "@/app/api/testcases/route";
import { DELETE as deleteTestCase } from "@/app/api/testcases/[id]/route";
import { POST as bulkTestCases } from "@/app/api/testcases/bulk/route";

describe("Test cases API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "u-lead", name: "Liam", email: "liam@test.local", role: Role.LEAD },
    });
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1", key: "ALPHA" });
    mockPrisma.project.findUnique.mockResolvedValue({ id: "proj-1", key: "ALPHA" });
    mockPrisma.projectCounter.upsert.mockResolvedValue({ count: 1 });
    mockPrisma.testCase.create.mockImplementation(async ({ data }: any) => ({
      id: "tc-1",
      ...data,
    }));
  });

  it("creates a MANUAL test case with 3 steps", async () => {
    const steps = [
      { action: "Open login", expected: "Form shown" },
      { action: "Enter credentials", expected: "Fields filled" },
      { action: "Submit", expected: "Dashboard opens" },
    ];

    const req = new NextRequest("http://localhost:3000/api/testcases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "proj-1",
        key: "ALPHA_TC_1",
        name: "Manual login test",
        type: TestType.MANUAL,
        steps,
      }),
    });

    const res = await createTestCase(req, {});
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.type).toBe(TestType.MANUAL);
    expect(body.steps).toHaveLength(3);
  });

  it("creates a CUCUMBER test case", async () => {
    const req = new NextRequest("http://localhost:3000/api/testcases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "proj-1",
        key: "ALPHA_TC_2",
        name: "BDD login",
        type: TestType.CUCUMBER,
        gherkin: "Feature: Auth\n  Scenario: Valid login\n    Given user exists",
      }),
    });

    const res = await createTestCase(req, {});
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.type).toBe(TestType.CUCUMBER);
    expect(body.gherkin).toContain("Feature: Auth");
  });

  it("creates a GENERIC automated test case", async () => {
    const req = new NextRequest("http://localhost:3000/api/testcases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "proj-1",
        key: "ALPHA_TC_3",
        name: "Playwright smoke",
        type: TestType.GENERIC,
        genericDefinition: "e2e/smoke.spec.ts",
        isAutomated: true,
      }),
    });

    const res = await createTestCase(req, {});
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.type).toBe(TestType.GENERIC);
    expect(body.genericDefinition).toBe("e2e/smoke.spec.ts");
  });

  it("rejects empty test case name with 400", async () => {
    const req = new NextRequest("http://localhost:3000/api/testcases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "proj-1",
        key: "ALPHA_TC_4",
        name: "",
      }),
    });

    const res = await createTestCase(req, {});
    expect(res.status).toBe(400);
  });

  it("soft-deletes for LEAD (200) and forbids TESTER (403)", async () => {
    mockPrisma.testCase.findUnique.mockResolvedValue({ id: "tc-1", projectId: "proj-1" });
    mockPrisma.testCase.update.mockResolvedValue({ id: "tc-1", deletedAt: new Date() });

    const reqLead = new NextRequest("http://localhost:3000/api/testcases/tc-1", {
      method: "DELETE",
    });
    const resLead = await deleteTestCase(reqLead, { params: { id: "tc-1" } });
    expect(resLead.status).toBe(200);
    expect(mockPrisma.testCase.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "tc-1" },
        data: { deletedAt: expect.any(Date) },
      }),
    );

    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "u-tester", name: "Tara", email: "tara@test.local", role: Role.TESTER },
    });
    const reqTester = new NextRequest("http://localhost:3000/api/testcases/tc-1", {
      method: "DELETE",
    });
    const resTester = await deleteTestCase(reqTester, { params: { id: "tc-1" } });
    expect(resTester.status).toBe(403);
  });

  it("creates a test case without key (UI flow) and assigns folderId", async () => {
    mockPrisma.testFolder.findUnique.mockResolvedValue({ projectId: "proj-1" });

    const req = new NextRequest("http://localhost:3000/api/testcases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "proj-1",
        name: "Created from UI",
        folderId: "folder-1",
        steps: [{ action: "Open app" }],
      }),
    });

    const res = await createTestCase(req, {});
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.folderId).toBe("folder-1");
  });

  it("bulk moves test cases to a folder (200) and rejects cross-project folderId (400)", async () => {
    mockPrisma.testCase.findMany.mockResolvedValue([
      { id: "tc-1", projectId: "proj-1" },
      { id: "tc-2", projectId: "proj-1" },
    ]);
    mockPrisma.testCase.updateMany.mockResolvedValue({ count: 2 });
    mockPrisma.testFolder.findUnique.mockResolvedValue({ projectId: "proj-1" });

    const okReq = new NextRequest("http://localhost:3000/api/testcases/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ids: ["tc-1", "tc-2"],
        action: "update",
        data: { folderId: "folder-1" },
      }),
    });
    const okRes = await bulkTestCases(okReq, {});
    expect(okRes.status).toBe(200);
    expect(mockPrisma.testCase.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["tc-1", "tc-2"] } },
        data: expect.objectContaining({ folderId: "folder-1" }),
      }),
    );

    mockPrisma.testFolder.findUnique.mockResolvedValue({ projectId: "proj-other" });
    const badReq = new NextRequest("http://localhost:3000/api/testcases/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ids: ["tc-1"],
        action: "update",
        data: { folderId: "folder-other" },
      }),
    });
    const badRes = await bulkTestCases(badReq, {});
    expect(badRes.status).toBe(400);
  });
});
