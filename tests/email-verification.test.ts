import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

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
  },
  auditLog: {
    create: vi.fn(),
  },
  $transaction: vi.fn(async (ops: any[]) => Promise.all(ops)),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

import { POST as registerPost } from "@/app/api/auth/register/route";
import { GET as verifyGet } from "@/app/api/auth/verify-email/route";
import { authRateLimiter } from "@/lib/rate-limit";

describe("Email verification & mailer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authRateLimiter.reset();
    process.env.EMAIL_SERVER = "smtp://localhost:1025";
    process.env.EMAIL_FROM = "TestSimply <noreply@testsimply.local>";
    process.env.NEXTAUTH_URL = "http://localhost:3000";
  });

  it("sends verification email on registration and verifies account via link", async () => {
    const tokens: Array<{ identifier: string; token: string; expires: Date }> = [];
    let userRecord: any = null;

    mockPrisma.user.findUnique.mockImplementation(async ({ where }: any) => {
      if (userRecord && where.email === userRecord.email) return userRecord;
      return null;
    });
    mockPrisma.user.create.mockImplementation(async ({ data }: any) => {
      userRecord = { id: "u-1", ...data, emailVerified: null };
      return userRecord;
    });
    mockPrisma.user.update.mockImplementation(async ({ data }: any) => {
      userRecord = { ...userRecord, ...data };
      return userRecord;
    });
    mockPrisma.verificationToken.create.mockImplementation(async ({ data }: any) => {
      tokens.push(data);
      return data;
    });
    mockPrisma.verificationToken.findUnique.mockImplementation(async ({ where }: any) => {
      return tokens.find((t) => t.token === where.token) ?? null;
    });
    mockPrisma.verificationToken.delete.mockImplementation(async ({ where }: any) => {
      const idx = tokens.findIndex((t) => t.token === where.token);
      if (idx >= 0) tokens.splice(idx, 1);
      return {};
    });

    const regReq = new NextRequest("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Alice",
        email: "alice@test.local",
        password: "Password123",
      }),
    });
    const regRes = await registerPost(regReq, {});
    expect(regRes.status).toBe(201);
    expect(sendMailMock).toHaveBeenCalledTimes(1);

    const sentMail = (sendMailMock.mock.calls[0] as any)[0];
    expect(sentMail.to).toBe("alice@test.local");
    const match = String(sentMail.text).match(/https?:\/\/[^\s]+\/api\/auth\/verify-email\?token=([^\s]+)/);
    expect(match).toBeTruthy();

    // Stored token in DB must be hashed, not the raw token in the email
    expect(tokens[0].token).not.toBe(decodeURIComponent(match![1]));

    const verifyReq = new NextRequest(match![0], {
      headers: { accept: "application/json" },
    });
    const verifyRes = await verifyGet(verifyReq, {});
    expect(verifyRes.status).toBe(200);
    expect(userRecord.emailVerified).toBeInstanceOf(Date);
    expect(tokens).toHaveLength(0);
  });
});
