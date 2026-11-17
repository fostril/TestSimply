import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
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
    create: vi.fn(),
    update: vi.fn(),
  },
  verificationToken: {
    create: vi.fn(),
    findUnique: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
  $transaction: vi.fn(async (ops: any[]) => Promise.all(ops)),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

import { authOptions } from "@/lib/auth";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { GET as verifyGet } from "@/app/api/auth/verify-email/route";
import { authRateLimiter } from "@/lib/rate-limit";

describe("Authentication & registration", () => {
  const origRequireVerify = process.env.REQUIRE_EMAIL_VERIFICATION;

  beforeEach(() => {
    vi.clearAllMocks();
    authRateLimiter.reset();
    delete process.env.REQUIRE_EMAIL_VERIFICATION;
    process.env.EMAIL_SERVER = "smtp://localhost:1025";
    process.env.NEXTAUTH_URL = "http://localhost:3000";
  });

  afterEach(() => {
    if (origRequireVerify === undefined) {
      delete process.env.REQUIRE_EMAIL_VERIFICATION;
    } else {
      process.env.REQUIRE_EMAIL_VERIFICATION = origRequireVerify;
    }
  });

  const getAuthorize = () => {
    const provider = authOptions.providers.find((p: any) => p.id === "credentials") as any;
    return provider.options.authorize as (creds: { email?: string; password?: string }) => Promise<any>;
  };

  it("authenticates valid credentials and rejects wrong password", async () => {
    const hash = await bcrypt.hash("ChangeMe123!", 10);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u-1",
      name: "Ada",
      email: "ada@test.local",
      password: hash,
      role: Role.ADMIN,
      emailVerified: new Date(),
    });

    const authorize = getAuthorize();
    const ok = await authorize({ email: "ada@test.local", password: "ChangeMe123!" });
    expect(ok).toMatchObject({ id: "u-1", email: "ada@test.local", role: Role.ADMIN });

    const bad = await authorize({ email: "ada@test.local", password: "WrongPassword!" });
    expect(bad).toBeNull();
  });

  it("blocks unverified login when REQUIRE_EMAIL_VERIFICATION=true until verified", async () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = "true";
    const hash = await bcrypt.hash("Password123", 10);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u-2",
      name: "Bob",
      email: "bob@test.local",
      password: hash,
      role: Role.VIEWER,
      emailVerified: null,
    });

    const authorize = getAuthorize();
    await expect(authorize({ email: "bob@test.local", password: "Password123" })).rejects.toThrow(
      "EMAIL_NOT_VERIFIED",
    );

    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u-2",
      name: "Bob",
      email: "bob@test.local",
      password: hash,
      role: Role.VIEWER,
      emailVerified: new Date(),
    });
    const verified = await authorize({ email: "bob@test.local", password: "Password123" });
    expect(verified).toMatchObject({ id: "u-2", role: Role.VIEWER });
  });

  it("rejects weak password (400), duplicate email (409), and creates new user without elevated role", async () => {
    const weakReq = new NextRequest("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Bob", email: "bob@test.local", password: "short" }),
    });
    expect((await registerPost(weakReq, {})).status).toBe(400);

    mockPrisma.user.findUnique.mockResolvedValueOnce({ id: "existing" });
    const dupReq = new NextRequest("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Bob", email: "dup@test.local", password: "Password123" }),
    });
    expect((await registerPost(dupReq, {})).status).toBe(409);

    mockPrisma.user.findUnique.mockResolvedValueOnce(null);
    mockPrisma.user.create.mockImplementation(async ({ data }: any) => ({
      id: "u-new",
      role: Role.VIEWER,
      ...data,
    }));
    const okReq = new NextRequest("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Bob", email: "bob@test.local", password: "Password123" }),
    });
    const okRes = await registerPost(okReq, {});
    expect(okRes.status).toBe(201);
    // Role is not escalated on create (defaults to Prisma @default(VIEWER))
    const createCall = mockPrisma.user.create.mock.calls[0][0].data;
    expect(createCall.role).toBeUndefined();
  });

  it("rejects invalid verification token on /api/auth/verify-email", async () => {
    mockPrisma.verificationToken.findUnique.mockResolvedValue(null);
    const req = new NextRequest("http://localhost:3000/api/auth/verify-email?token=bad", {
      headers: { accept: "application/json" },
    });
    expect((await verifyGet(req, {})).status).toBe(400);
  });
});
