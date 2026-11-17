import bcrypt from "bcryptjs";
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
    update: vi.fn(),
  },
  verificationToken: {
    deleteMany: vi.fn(),
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

import { POST as forgotPasswordPost } from "@/app/api/auth/forgot-password/route";
import { POST as resetPasswordPost } from "@/app/api/auth/reset-password/route";
import { passwordResetRateLimiter } from "@/lib/rate-limit";

describe("Password reset flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    passwordResetRateLimiter.reset();
    process.env.EMAIL_SERVER = "smtp://localhost:1025";
    process.env.EMAIL_FROM = "TestSimply <noreply@testsimply.local>";
    process.env.NEXTAUTH_URL = "http://localhost:3000";
  });

  it("responds 200 even for unknown emails without sending mail", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const req = new NextRequest("http://localhost:3000/api/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "nobody@test.local" }),
    });
    const res = await forgotPasswordPost(req, {});
    expect(res.status).toBe(200);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("enforces passwordResetRateLimiter (4th request in hour -> 429)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    for (let i = 0; i < 3; i++) {
      const req = new NextRequest("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "a@test.local" }),
      });
      expect((await forgotPasswordPost(req, {})).status).toBe(200);
    }

    const req4 = new NextRequest("http://localhost:3000/api/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@test.local" }),
    });
    const res4 = await forgotPasswordPost(req4, {});
    expect(res4.status).toBe(429);
    expect(res4.headers.get("Retry-After")).toBeTruthy();
  });

  it("sends reset link, stores hashed 1h token, resets password, and invalidates reuse", async () => {
    const tokens: Array<{ identifier: string; token: string; expires: Date }> = [];
    const userRecord = { id: "u-1", email: "user@test.local", password: "old" };

    mockPrisma.user.findUnique.mockImplementation(async ({ where }: any) => {
      return where.email === userRecord.email ? userRecord : null;
    });
    mockPrisma.user.update.mockImplementation(async ({ data }: any) => {
      userRecord.password = data.password;
      return userRecord;
    });
    mockPrisma.verificationToken.deleteMany.mockResolvedValue({ count: 0 });
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

    const forgotReq = new NextRequest("http://localhost:3000/api/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "user@test.local" }),
    });
    expect((await forgotPasswordPost(forgotReq, {})).status).toBe(200);
    expect(sendMailMock).toHaveBeenCalledTimes(1);

    const mailText = String((sendMailMock.mock.calls[0] as any)[0].text);
    const match = mailText.match(/\/auth\/reset-password\?token=([^\s]+)/);
    expect(match).toBeTruthy();
    const rawToken = decodeURIComponent(match![1]);

    // DB stores hashed token, not plaintext, with ~1h expiry
    expect(tokens).toHaveLength(1);
    expect(tokens[0].token).not.toBe(rawToken);
    const ttlMs = tokens[0].expires.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(55 * 60 * 1000);
    expect(ttlMs).toBeLessThanOrEqual(60 * 60 * 1000 + 1000);

    // Weak password rejected with 400
    const weakReq = new NextRequest("http://localhost:3000/api/auth/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: rawToken, password: "weak" }),
    });
    expect((await resetPasswordPost(weakReq, {})).status).toBe(400);

    // Valid password succeeds and hashes with bcrypt cost 12
    const resetReq = new NextRequest("http://localhost:3000/api/auth/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: rawToken, password: "NewPassword123" }),
    });
    const resetRes = await resetPasswordPost(resetReq, {});
    expect(resetRes.status).toBe(200);
    expect(await bcrypt.compare("NewPassword123", userRecord.password)).toBe(true);
    expect(userRecord.password).toMatch(/^\$2[aby]\$12\$/);

    // Reusing the same token fails
    const reuseReq = new NextRequest("http://localhost:3000/api/auth/reset-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: rawToken, password: "AnotherPassword123" }),
    });
    expect((await resetPasswordPost(reuseReq, {})).status).toBe(400);
  });
});
