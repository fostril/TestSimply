import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";

const unlinkMock = vi.hoisted(() => vi.fn(async () => undefined));
const statMock = vi.hoisted(() => vi.fn(async () => ({ size: 16 })));
const readFileMock = vi.hoisted(() => vi.fn(async () => Buffer.from("<xml>test</xml>")));

vi.mock("fs/promises", () => ({
  unlink: unlinkMock,
  stat: statMock,
  readFile: readFileMock,
  writeFile: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
}));

const mockPrisma: any = vi.hoisted(() => ({
  project: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  projectCounter: {
    upsert: vi.fn(),
  },
  precondition: {
    findMany: vi.fn(),
    count: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  environment: {
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
  },
  testFolder: {
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  testCase: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  testPlan: {
    findUnique: vi.fn(),
  },
  testCasePlan: {
    createMany: vi.fn(),
  },
  attachment: {
    findUnique: vi.fn(),
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
import { POST as createPrecondition } from "@/app/api/preconditions/route";
import {
  PATCH as updatePrecondition,
  DELETE as deletePrecondition,
} from "@/app/api/preconditions/[id]/route";
import {
  POST as linkPrecondition,
  DELETE as unlinkPrecondition,
} from "@/app/api/testcases/[id]/preconditions/route";
import { POST as createEnvironment } from "@/app/api/environments/route";
import { POST as createFolder } from "@/app/api/folders/route";
import { DELETE as deleteFolder } from "@/app/api/folders/[id]/route";
import { POST as addCasesToPlan } from "@/app/api/testplans/[id]/cases/add/route";
import {
  GET as getAttachment,
  DELETE as deleteAttachment,
} from "@/app/api/attachments/[id]/route";
import { POST as postAttachment } from "@/app/api/attachments/route";
import { paginatedJson } from "@/lib/api";
import { fetchPaginated } from "@/lib/pagination";

describe("Inline entity creation, attachment security & pagination helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "lead-1", name: "Liam", email: "liam@test.local", role: Role.LEAD },
    });
    mockPrisma.project.findUnique.mockResolvedValue({ id: "proj-1", key: "ALPHA" });
    mockPrisma.project.findFirst.mockResolvedValue({ id: "proj-1", key: "ALPHA" });
    mockPrisma.projectCounter.upsert.mockResolvedValue({ count: 1 });
  });

  it("creates, updates, links/unlinks preconditions and blocks TESTER from deleting preconditions", async () => {
    mockPrisma.precondition.create.mockImplementation(async ({ data }: any) => ({
      id: "pre-1",
      ...data,
    }));

    const createReq = new NextRequest("http://localhost:3000/api/preconditions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "proj-1",
        name: "Logged-in Admin",
        description: "Admin session is active",
      }),
    });
    const createRes = await createPrecondition(createReq, {});
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.key).toBe("ALPHA_PRECON_1");
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);

    // Link precondition to a test case in the same project
    mockPrisma.testCase.findUnique.mockResolvedValue({
      id: "tc-1",
      projectId: "proj-1",
      deletedAt: null,
    });
    mockPrisma.precondition.findUnique.mockResolvedValue({
      id: "pre-1",
      projectId: "proj-1",
      name: "Logged-in Admin",
    });
    mockPrisma.testCase.update.mockResolvedValue({
      id: "tc-1",
      preconditions: [{ id: "pre-1" }],
    });

    const linkReq = new NextRequest("http://localhost:3000/api/testcases/tc-1/preconditions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preconditionId: "pre-1" }),
    });
    const linkRes = await linkPrecondition(linkReq, { params: { id: "tc-1" } });
    expect(linkRes.status).toBe(200);

    const unlinkReq = new NextRequest("http://localhost:3000/api/testcases/tc-1/preconditions", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preconditionId: "pre-1" }),
    });
    const unlinkRes = await unlinkPrecondition(unlinkReq, { params: { id: "tc-1" } });
    expect(unlinkRes.status).toBe(200);

    // Update precondition
    mockPrisma.precondition.update.mockResolvedValue({
      id: "pre-1",
      projectId: "proj-1",
      name: "Updated Precondition",
    });
    const patchReq = new NextRequest("http://localhost:3000/api/preconditions/pre-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Updated Precondition" }),
    });
    expect((await updatePrecondition(patchReq, { params: { id: "pre-1" } })).status).toBe(200);

    // TESTER cannot delete preconditions (requires testcase:delete)
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "tester-1", name: "Tara", email: "tara@test.local", role: Role.TESTER },
    });
    const forbiddenDel = await deletePrecondition(
      new NextRequest("http://localhost:3000/api/preconditions/pre-1", { method: "DELETE" }),
      { params: { id: "pre-1" } },
    );
    expect(forbiddenDel.status).toBe(403);
  });

  it("creates environments for LEAD/ADMIN and rejects TESTER with 403", async () => {
    mockPrisma.environment.create.mockImplementation(async ({ data }: any) => ({
      id: "env-1",
      ...data,
    }));

    const leadReq = new NextRequest("http://localhost:3000/api/environments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "proj-1",
        name: "Staging",
        url: "https://staging.example.com",
      }),
    });
    const leadRes = await createEnvironment(leadReq, {});
    expect(leadRes.status).toBe(201);
    const created = await leadRes.json();
    expect(created.key).toBe("ALPHA_ENV_1");
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);

    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "tester-1", name: "Tara", email: "tara@test.local", role: Role.TESTER },
    });
    const testerReq = new NextRequest("http://localhost:3000/api/environments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "proj-1", name: "QA" }),
    });
    expect((await createEnvironment(testerReq, {})).status).toBe(403);
  });

  it("creates folders, rejects duplicate paths with 409, and adds scoped cases to a test plan", async () => {
    mockPrisma.testFolder.findUnique.mockResolvedValueOnce(null);
    mockPrisma.testFolder.create.mockImplementation(async ({ data }: any) => ({
      id: "fold-1",
      ...data,
    }));

    const createReq = new NextRequest("http://localhost:3000/api/folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: "proj-1", name: "Checkout" }),
    });
    const createRes = await createFolder(createReq, {});
    expect(createRes.status).toBe(201);
    expect((await createRes.json()).path).toBe("/checkout");

    // Duplicate path returns 409
    mockPrisma.testFolder.findUnique.mockResolvedValueOnce({ id: "fold-1", path: "/checkout" });
    const dupRes = await createFolder(
      new NextRequest("http://localhost:3000/api/folders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId: "proj-1", name: "Checkout" }),
      }),
      {},
    );
    expect(dupRes.status).toBe(409);

    // Delete folder logs audit
    mockPrisma.testFolder.findUnique.mockResolvedValueOnce({
      id: "fold-1",
      projectId: "proj-1",
      path: "/Checkout",
    });
    mockPrisma.testFolder.delete.mockResolvedValue({ id: "fold-1" });
    const delRes = await deleteFolder(
      new NextRequest("http://localhost:3000/api/folders/fold-1", { method: "DELETE" }),
      { params: { id: "fold-1" } },
    );
    expect(delRes.status).toBe(200);

    // Add individual cases to a Test Plan (POST /api/testplans/[id]/cases/add)
    mockPrisma.testPlan.findUnique.mockResolvedValue({ id: "plan-1", projectId: "proj-1" });
    mockPrisma.testCase.findMany.mockResolvedValue([{ id: "tc-1" }, { id: "tc-2" }]);
    mockPrisma.testCasePlan.createMany.mockResolvedValue({ count: 2 });

    const addPlanRes = await addCasesToPlan(
      new NextRequest("http://localhost:3000/api/testplans/plan-1/cases/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseIds: ["tc-1", "tc-2", "tc-other-project"] }),
      }),
      { params: { id: "plan-1" } },
    );
    expect(addPlanRes.status).toBe(200);
    expect(await addPlanRes.json()).toEqual({ count: 2 });
    expect(mockPrisma.testCasePlan.createMany).toHaveBeenCalledWith({
      data: [
        { planId: "plan-1", caseId: "tc-1" },
        { planId: "plan-1", caseId: "tc-2" },
      ],
      skipDuplicates: true,
    });
  });

  it("serves non-image attachments with attachment Content-Disposition + CSP sandbox and unlinks on DELETE", async () => {
    mockPrisma.testCase.findUnique.mockResolvedValue({ id: "tc-1", projectId: "proj-1", deletedAt: null });

    // XML attachment must be forced to Content-Disposition: attachment
    mockPrisma.attachment.findUnique.mockResolvedValueOnce({
      id: "att-xml",
      fileName: "report.xml",
      contentType: "application/xml",
      size: 16,
      storageKey: "uuid-report.xml",
      url: "/api/attachments/att-xml",
      testCaseId: "tc-1",
      executionId: null,
      testResultId: null,
    });

    const xmlRes = await getAttachment(
      new NextRequest("http://localhost:3000/api/attachments/att-xml"),
      { params: { id: "att-xml" } },
    );
    expect(xmlRes.status).toBe(200);
    expect(xmlRes.headers.get("Content-Disposition")).toContain("attachment;");
    expect(xmlRes.headers.get("Content-Security-Policy")).toBe("default-src 'none'; sandbox");
    expect(xmlRes.headers.get("X-Content-Type-Options")).toBe("nosniff");

    // PNG attachment is allowed inline
    mockPrisma.attachment.findUnique.mockResolvedValueOnce({
      id: "att-png",
      fileName: "screen.png",
      contentType: "image/png",
      size: 16,
      storageKey: "uuid-screen.png",
      url: "/api/attachments/att-png",
      testCaseId: "tc-1",
      executionId: null,
      testResultId: null,
    });
    const pngRes = await getAttachment(
      new NextRequest("http://localhost:3000/api/attachments/att-png"),
      { params: { id: "att-png" } },
    );
    expect(pngRes.status).toBe(200);
    expect(pngRes.headers.get("Content-Disposition")).toContain("inline;");

    // DELETE unlinks file from disk and logs audit
    mockPrisma.attachment.findUnique.mockResolvedValueOnce({
      id: "att-xml",
      fileName: "report.xml",
      storageKey: "uuid-report.xml",
      url: "/api/attachments/att-xml",
      testCaseId: "tc-1",
      executionId: null,
      testResultId: null,
    });
    mockPrisma.attachment.delete.mockResolvedValue({ id: "att-xml" });

    const delRes = await deleteAttachment(
      new NextRequest("http://localhost:3000/api/attachments/att-xml", { method: "DELETE" }),
      { params: { id: "att-xml" } },
    );
    expect(delRes.status).toBe(200);
    expect(unlinkMock).toHaveBeenCalledTimes(1);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);

    // JSON metadata branch in POST /api/attachments requires projectId or linked entity
    const missingProjRes = await postAttachment(
      new NextRequest("http://localhost:3000/api/attachments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fileName: "shot.png", contentType: "image/png" }),
      }),
      {},
    );
    expect(missingProjRes.status).toBe(400);
  });

  it("parses pagination headers in fetchPaginated from paginatedJson responses", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () =>
      paginatedJson([{ id: "1" }, { id: "2" }], 125, { page: 2, limit: 50, skip: 50 }),
    ) as any;

    try {
      const result = await fetchPaginated<{ id: string }>("/api/testcases?page=2&limit=50");
      expect(result).toEqual({
        items: [{ id: "1" }, { id: "2" }],
        total: 125,
        page: 2,
        limit: 50,
        totalPages: 3,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
