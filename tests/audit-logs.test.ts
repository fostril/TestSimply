import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";

const mockPrisma: any = vi.hoisted(() => ({
  project: {
    findMany: vi.fn(),
  },
  auditLog: {
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
  },
  user: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { GET as getAuditLogs } from "@/app/api/audit-logs/route";
import { PATCH as updateUserRole } from "@/app/api/users/route";
import { PATCH as updateMembership } from "@/app/api/users/[id]/assigned-projects/route";

describe("Audit logs scoping & completeness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("restricts LEAD to only audit logs of projects they lead", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "lead-1", name: "Liam", email: "liam@test.local", role: Role.LEAD },
    });

    mockPrisma.project.findMany.mockResolvedValue([{ id: "proj-A" }]);
    const logsInDb = [
      { id: "l1", entity: "TestCase", entityId: "tc-1", action: "CREATE", userId: "lead-1", projectId: "proj-A", payload: {}, createdAt: new Date() },
      { id: "l2", entity: "TestCase", entityId: "tc-2", action: "CREATE", userId: "other", projectId: "proj-B", payload: {}, createdAt: new Date() },
    ];
    mockPrisma.auditLog.findMany.mockImplementation(async ({ where }: any) => {
      const allowed = where?.projectId?.in as string[] | undefined;
      if (allowed) {
        return logsInDb.filter((l) => l.projectId && allowed.includes(l.projectId));
      }
      return logsInDb;
    });
    mockPrisma.auditLog.count.mockResolvedValue(1);
    mockPrisma.user.findMany.mockResolvedValue([{ id: "lead-1", name: "Liam", email: "liam@test.local" }]);

    const req = new NextRequest("http://localhost:3000/api/audit-logs");
    const res = await getAuditLogs(req, {});
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].projectId).toBe("proj-A");

    // Explicit query for project B is forbidden for LEAD of project A
    const reqB = new NextRequest("http://localhost:3000/api/audit-logs?projectId=proj-B");
    const resB = await getAuditLogs(reqB, {});
    expect(resB.status).toBe(403);
  });

  it("allows ADMIN to view all audit logs across projects", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "admin-1", name: "Ada", email: "ada@test.local", role: Role.ADMIN },
    });
    mockPrisma.auditLog.findMany.mockResolvedValue([
      { id: "l1", entity: "TestCase", entityId: "tc-1", action: "CREATE", userId: "u1", projectId: "proj-A", payload: {}, createdAt: new Date() },
      { id: "l2", entity: "User", entityId: "u2", action: "UPDATE_ROLE", userId: "admin-1", projectId: null, payload: {}, createdAt: new Date() },
    ]);
    mockPrisma.auditLog.count.mockResolvedValue(2);
    mockPrisma.user.findMany.mockResolvedValue([]);

    const req = new NextRequest("http://localhost:3000/api/audit-logs");
    const res = await getAuditLogs(req, {});
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(2);
  });

  it("writes audit log when changing a user's role or project membership", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "admin-1", name: "Ada", email: "ada@test.local", role: Role.ADMIN },
    });
    mockPrisma.user.update.mockResolvedValue({
      id: "user-2",
      name: "Tara",
      email: "tara@test.local",
      role: Role.LEAD,
      assignedProjects: [{ id: "proj-A", key: "ALPHA", name: "Alpha" }],
    });
    mockPrisma.user.findUnique.mockResolvedValue({ id: "user-2", role: Role.TESTER });

    const roleReq = new NextRequest("http://localhost:3000/api/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "user-2", role: Role.LEAD }),
    });
    const roleRes = await updateUserRole(roleReq, {});
    expect(roleRes.status).toBe(200);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "UPDATE_ROLE",
          entity: "User",
          entityId: "user-2",
        }),
      }),
    );

    const memReq = new NextRequest("http://localhost:3000/api/users/user-2/assigned-projects", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectIds: ["proj-A"] }),
    });
    const memRes = await updateMembership(memReq, { params: { id: "user-2" } });
    expect(memRes.status).toBe(200);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "UPDATE_MEMBERSHIP",
          entity: "User",
          entityId: "user-2",
        }),
      }),
    );
  });
});
