import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";

const sendMailMock = vi.hoisted(() => vi.fn(async () => ({ messageId: "m1" })));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: sendMailMock,
    })),
  },
}));

const mockPrisma: any = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  verificationToken: {
    deleteMany: vi.fn(),
    create: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("next-auth", async () => {
  return {
    default: vi.fn(() => async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    getServerSession: vi.fn(),
  };
});

import { getServerSession } from "next-auth";
import { POST as createUserPost } from "@/app/api/users/route";
import { DELETE as deleteUserDelete } from "@/app/api/users/[id]/route";
import { GET as getProfileGet, PATCH as updateProfilePatch } from "@/app/api/users/me/route";
import { POST as changePasswordPost } from "@/app/api/auth/change-password/route";
import { POST as resendVerificationPost } from "@/app/api/auth/resend-verification/route";
import { authRateLimiter } from "@/lib/rate-limit";

describe("User lifecycle & self-service settings API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authRateLimiter.reset();
    process.env.EMAIL_SERVER = "smtp://localhost:1025";
    process.env.EMAIL_FROM = "TestSimply <noreply@testsimply.local>";
    process.env.NEXTAUTH_URL = "http://localhost:3000";

    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "admin-1", name: "Admin", email: "admin@test.local", role: Role.ADMIN },
    });
  });

  it("allows admins to create users and rejects non-admins or duplicate emails", async () => {
    mockPrisma.user.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === "admin-1") return { id: "admin-1", role: Role.ADMIN };
      if (where.email === "existing@test.local") return { id: "u-existing", email: "existing@test.local" };
      return null;
    });
    mockPrisma.user.create.mockImplementation(async ({ data }: any) => ({
      id: "u-new",
      name: data.name,
      email: data.email,
      role: data.role,
      image: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      leadProjects: [],
      assignedProjects: [],
    }));

    const okReq = new NextRequest("http://localhost:3000/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "QA Tester",
        email: "QA.Tester@Test.Local ",
        password: "Str0ng!Password#2026",
        role: "TESTER",
      }),
    });
    const okRes = await createUserPost(okReq, {});
    expect(okRes.status).toBe(201);
    const created = await okRes.json();
    expect(created.email).toBe("qa.tester@test.local");
    expect(mockPrisma.user.create).toHaveBeenCalledTimes(1);
    const createdData = mockPrisma.user.create.mock.calls[0][0].data;
    expect(createdData.emailVerified).toBeInstanceOf(Date);
    expect(await bcrypt.compare("Str0ng!Password#2026", createdData.password)).toBe(true);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);

    const dupReq = new NextRequest("http://localhost:3000/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Dup User",
        email: "existing@test.local",
        password: "Str0ng!Password#2026",
        role: "VIEWER",
      }),
    });
    const dupRes = await createUserPost(dupReq, {});
    expect(dupRes.status).toBe(409);

    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "tester-1", name: "Tester", email: "tester@test.local", role: Role.TESTER },
    });
    mockPrisma.user.findUnique.mockResolvedValue({ id: "tester-1", role: Role.TESTER });

    const forbiddenReq = new NextRequest("http://localhost:3000/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Blocked",
        email: "blocked@test.local",
        password: "Str0ng!Password#2026",
        role: "VIEWER",
      }),
    });
    const forbiddenRes = await createUserPost(forbiddenReq, {});
    expect(forbiddenRes.status).toBe(403);
  });

  it("allows admins to delete another user and blocks self-deletion", async () => {
    mockPrisma.user.findUnique.mockImplementation(async ({ where }: any) => {
      if (where.id === "admin-1") return { id: "admin-1", role: Role.ADMIN };
      if (where.id === "u-target") return { id: "u-target", email: "target@test.local", role: Role.TESTER };
      return null;
    });
    mockPrisma.user.delete.mockResolvedValue({ id: "u-target" });

    const selfReq = new NextRequest("http://localhost:3000/api/users/admin-1", { method: "DELETE" });
    const selfRes = await deleteUserDelete(selfReq, { params: { id: "admin-1" } });
    expect(selfRes.status).toBe(400);
    expect(mockPrisma.user.delete).not.toHaveBeenCalled();

    const delReq = new NextRequest("http://localhost:3000/api/users/u-target", { method: "DELETE" });
    const delRes = await deleteUserDelete(delReq, { params: { id: "u-target" } });
    expect(delRes.status).toBe(200);
    expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: "u-target" } });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("reads and updates the current user profile safely", async () => {
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "u-1", name: "Alice", email: "alice@test.local", role: Role.TESTER },
    });

    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u-1",
      name: "Alice",
      email: "alice@test.local",
      role: Role.TESTER,
      emailVerified: null,
      image: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      password: "hashed-password",
    });
    mockPrisma.user.update.mockResolvedValue({
      id: "u-1",
      name: "Alice Updated",
      email: "alice@test.local",
      role: Role.TESTER,
      emailVerified: null,
      image: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });

    const getRes = await getProfileGet(new NextRequest("http://localhost:3000/api/users/me"), {});
    expect(getRes.status).toBe(200);
    const profile = await getRes.json();
    expect(profile.hasPassword).toBe(true);
    expect(profile.password).toBeUndefined();

    const patchRes = await updateProfilePatch(
      new NextRequest("http://localhost:3000/api/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Alice Updated" }),
      }),
      {},
    );
    expect(patchRes.status).toBe(200);
    const updated = await patchRes.json();
    expect(updated.name).toBe("Alice Updated");
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("verifies current password before updating to new password hash", async () => {
    const oldHash = await bcrypt.hash("OldSecret!1234", 10);
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "u-1", name: "Alice", email: "alice@test.local", role: Role.TESTER },
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u-1",
      role: Role.TESTER,
      email: "alice@test.local",
      password: oldHash,
    });
    mockPrisma.user.update.mockResolvedValue({ id: "u-1" });

    const wrongRes = await changePasswordPost(
      new NextRequest("http://localhost:3000/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: "WrongPassword!999",
          newPassword: "NewSecret!56789",
        }),
      }),
      {},
    );
    expect(wrongRes.status).toBe(400);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();

    const okRes = await changePasswordPost(
      new NextRequest("http://localhost:3000/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: "OldSecret!1234",
          newPassword: "NewSecret!56789",
        }),
      }),
      {},
    );
    expect(okRes.status).toBe(200);
    const updatedPassword = mockPrisma.user.update.mock.calls[0][0].data.password;
    expect(await bcrypt.compare("NewSecret!56789", updatedPassword)).toBe(true);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("resends verification emails with hashed token and applies rate limit", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u-unverified",
      email: "unverified@test.local",
      password: "hash",
      emailVerified: null,
    });

    const req = new NextRequest("http://localhost:3000/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "unverified@test.local" }),
    });
    const res = await resendVerificationPost(req, {});
    expect(res.status).toBe(200);
    expect(mockPrisma.verificationToken.deleteMany).toHaveBeenCalledWith({
      where: { identifier: "unverified@test.local" },
    });
    expect(mockPrisma.verificationToken.create).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledTimes(1);

    let limitedStatus = 200;
    for (let i = 0; i < 12; i++) {
      const r = await resendVerificationPost(
        new NextRequest("http://localhost:3000/api/auth/resend-verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "unverified@test.local" }),
        }),
        {},
      );
      limitedStatus = r.status;
    }
    expect(limitedStatus).toBe(429);
  });
});
