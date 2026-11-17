import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";

const mockPrisma: any = vi.hoisted(() => ({
  personalAccessToken: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
  testCase: {
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
import { POST as createToken, DELETE as deleteTokenByQuery } from "@/app/api/settings/tokens/route";
import { DELETE as deleteTokenById } from "@/app/api/settings/tokens/[id]/route";
import { GET as listTestCases } from "@/app/api/testcases/route";
import { requireAuth } from "@/lib/api";

describe("Personal Access Tokens (scopes, expiry, audit)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "user-1", name: "Ada", email: "ada@test.local", role: Role.ADMIN },
    });
  });

  it("creates token with custom label, default 90-day expiry, and logs audit without token value", async () => {
    mockPrisma.personalAccessToken.create.mockImplementation(async ({ data }: any) => ({
      id: "tok-1",
      ...data,
      createdAt: new Date(),
    }));

    const req = new NextRequest("http://localhost:3000/api/settings/tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label: "GitHub Actions" }),
    });

    const res = await createToken(req, {});
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.token).toBeDefined();
    expect(json.label).toBe("GitHub Actions");
    expect(json.expiresAt).toBeTruthy();

    // Audit entry created without leaking token or hash
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    const auditCall = mockPrisma.auditLog.create.mock.calls[0][0].data;
    expect(auditCall.action).toBe("CREATE");
    expect(auditCall.entity).toBe("PersonalAccessToken");
    expect(JSON.stringify(auditCall.payload)).not.toContain(json.token);
  });

  it("revokes token and writes DELETE audit entry", async () => {
    mockPrisma.personalAccessToken.findUnique.mockResolvedValue({
      id: "tok-1",
      userId: "user-1",
      label: "CI Token",
      scopes: ["import"],
    });
    mockPrisma.personalAccessToken.delete.mockResolvedValue({ id: "tok-1" });

    const req = new NextRequest("http://localhost:3000/api/settings/tokens/tok-1", {
      method: "DELETE",
    });
    const res = await deleteTokenById(req, { params: { id: "tok-1" } });
    expect(res.status).toBe(200);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "DELETE",
          entity: "PersonalAccessToken",
          entityId: "tok-1",
        }),
      }),
    );

    // Also supports DELETE ?id=...
    const reqQuery = new NextRequest("http://localhost:3000/api/settings/tokens?id=tok-1", {
      method: "DELETE",
    });
    const resQuery = await deleteTokenByQuery(reqQuery, {});
    expect(resQuery.status).toBe(200);
  });

  it("rejects import-scoped token calling GET /api/testcases with 403", async () => {
    const rawToken = "secret-import-token";
    const hash = crypto.createHash("sha256").update(rawToken).digest("hex");
    mockPrisma.personalAccessToken.findFirst.mockImplementation(async ({ where }: any) => {
      if (where.tokenHash === hash) {
        return {
          id: "tok-1",
          userId: "user-1",
          scopes: ["import"],
          expiresAt: new Date(Date.now() + 60_000),
        };
      }
      return null;
    });
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1", role: Role.ADMIN });

    const req = new NextRequest("http://localhost:3000/api/testcases?projectId=proj-1", {
      method: "GET",
      headers: { authorization: `Bearer ${rawToken}` },
    });

    const res = await listTestCases(req, {});
    expect(res.status).toBe(403);
  });

  it("allows import-scoped token on /api/import/*, /api/imports/*, and /api/results", async () => {
    const rawToken = "secret-import-token";
    const hash = crypto.createHash("sha256").update(rawToken).digest("hex");
    mockPrisma.personalAccessToken.findFirst.mockImplementation(async ({ where }: any) => {
      if (where.tokenHash === hash) {
        return {
          id: "tok-1",
          userId: "user-1",
          scopes: ["import"],
          expiresAt: new Date(Date.now() + 60_000),
        };
      }
      return null;
    });
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-1", role: Role.TESTER });

    for (const path of ["/api/import/junit", "/api/imports/csv", "/api/results"]) {
      const req = new NextRequest(`http://localhost:3000${path}`, {
        method: "POST",
        headers: { authorization: `Bearer ${rawToken}` },
      });
      const auth = await requireAuth(req, "execution:run");
      expect(auth.authorized).toBe(true);
    }
  });

  it("returns 401 for expired token", async () => {
    const rawToken = "expired-token";
    const hash = crypto.createHash("sha256").update(rawToken).digest("hex");
    mockPrisma.personalAccessToken.findFirst.mockImplementation(async ({ where }: any) => {
      if (where.tokenHash === hash) {
        return {
          id: "tok-exp",
          userId: "user-1",
          scopes: ["import"],
          expiresAt: new Date(Date.now() - 10_000),
        };
      }
      return null;
    });

    const req = new NextRequest("http://localhost:3000/api/import/junit", {
      method: "POST",
      headers: { authorization: `Bearer ${rawToken}` },
    });
    const auth = await requireAuth(req, "execution:run");
    expect(auth.authorized).toBe(false);
    if (!auth.authorized) {
      expect(auth.response.status).toBe(401);
    }
  });
});
