import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Role } from "@prisma/client";

const mockPrisma: any = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
  },
  project: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
  },
  verificationToken: {
    deleteMany: vi.fn(),
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
import { GET as getJiraIssue } from "@/app/api/integrations/jira/issue/route";
import { POST as nextAuthPost } from "@/app/api/auth/[...nextauth]/route";
import { POST as forgotPasswordPost } from "@/app/api/auth/forgot-password/route";
import { authOptions } from "@/lib/auth";
import { validateUpload } from "@/lib/upload";
import { authRateLimiter, passwordResetRateLimiter } from "@/lib/rate-limit";

describe("Security hardening checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authRateLimiter.reset();
    passwordResetRateLimiter.reset();
    (getServerSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      user: { id: "u-1", name: "Ada", email: "ada@test.local", role: Role.ADMIN },
    });
    mockPrisma.project.findUnique.mockResolvedValue({ id: "proj-1", key: "ALPHA" });
  });

  it("rejects path traversal and malformed Jira issue keys with 400", async () => {
    for (const badKey of ["../../users", "PROJ-1/comments", "PROJ-1?x=y", "123-45"]) {
      const req = new NextRequest(
        `http://localhost:3000/api/integrations/jira/issue?projectId=proj-1&key=${encodeURIComponent(badKey)}`,
      );
      const res = await getJiraIssue(req, {});
      expect(res.status).toBe(400);
    }
  });

  it("rejects file uploads with empty MIME type (415)", () => {
    const file = new File(["<svg onload=alert(1)/>"], "payload.xml", { type: "" });
    const res = validateUpload(file, "attachment");
    expect(res).toHaveProperty("status", 415);
  });

  it("revokes JWT session when user is deleted from DB", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const token = await authOptions.callbacks.jwt({
      token: { id: "deleted-user", role: Role.ADMIN, roleRefreshedAt: 0 } as any,
      trigger: "update",
    });
    expect((token as any).revoked).toBe(true);
    expect((token as any).id).toBeUndefined();

    const session = await authOptions.callbacks.session({
      session: { user: { name: "Ghost" }, expires: "" } as any,
      token,
    });
    expect(session.user).toBeUndefined();
  });

  it("blocks Google OAuth signIn when email_verified is false", async () => {
    const allowed = await authOptions.callbacks.signIn({
      account: { provider: "google" } as any,
      profile: { email: "user@company.com", email_verified: false } as any,
    });
    expect(allowed).toBe(false);
  });

  it("rate limits credentials login callbacks (11th attempt -> 429)", async () => {
    for (let i = 0; i < 10; i++) {
      const req = new NextRequest("http://localhost:3000/api/auth/callback/credentials", {
        method: "POST",
      });
      const res = await nextAuthPost(req, { params: { nextauth: ["callback", "credentials"] } });
      expect(res.status).toBe(200);
    }

    const req11 = new NextRequest("http://localhost:3000/api/auth/callback/credentials", {
      method: "POST",
    });
    const res11 = await nextAuthPost(req11, { params: { nextauth: ["callback", "credentials"] } });
    expect(res11.status).toBe(429);
    expect(res11.headers.get("Retry-After")).toBeTruthy();
  });

  it("partitions password reset rate-limit buckets per email when TRUSTED_PROXY is unset", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    for (let i = 0; i < 3; i++) {
      const req = new NextRequest("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "alice@test.local" }),
      });
      expect((await forgotPasswordPost(req, {})).status).toBe(200);
    }

    const blockedAlice = new NextRequest("http://localhost:3000/api/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "alice@test.local" }),
    });
    expect((await forgotPasswordPost(blockedAlice, {})).status).toBe(429);

    const okBob = new NextRequest("http://localhost:3000/api/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "bob@test.local" }),
    });
    expect((await forgotPasswordPost(okBob, {})).status).toBe(200);
  });
});
