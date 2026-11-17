import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import {
  RateLimiter,
  defaultRateLimiter,
  authRateLimiter,
  type RateLimitStore,
  type RateLimitEntry,
} from "@/lib/rate-limit";

const mockPrisma: any = vi.hoisted(() => ({
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  verificationToken: {
    create: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

import { withApiHandler, getClientIp } from "@/lib/api";
import { POST as registerPost } from "@/app/api/auth/register/route";

describe("Rate limiting", () => {
  const originalTrustProxy = process.env.TRUSTED_PROXY;

  beforeEach(() => {
    vi.clearAllMocks();
    defaultRateLimiter.reset();
    authRateLimiter.reset();
    delete process.env.TRUSTED_PROXY;
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalTrustProxy === undefined) {
      delete process.env.TRUSTED_PROXY;
    } else {
      process.env.TRUSTED_PROXY = originalTrustProxy;
    }
  });

  it("returns 429 with Retry-After on the 101st API request", async () => {
    const handler = withApiHandler(async () => NextResponse.json({ ok: true }));

    for (let i = 0; i < 100; i++) {
      const req = new NextRequest("http://localhost:3000/api/health");
      const res = await handler(req, {});
      expect(res.status).toBe(200);
    }

    const req101 = new NextRequest("http://localhost:3000/api/health");
    const res101 = await handler(req101, {});
    expect(res101.status).toBe(429);
    expect(res101.headers.get("Retry-After")).toBeTruthy();
  });

  it("blocks the 11th registration attempt with 429 and ignores spoofed x-forwarded-for", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "existing" }); // fast 409

    for (let i = 0; i < 10; i++) {
      const req = new NextRequest("http://localhost:3000/api/auth/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // Spoofed rotating header must be ignored when TRUSTED_PROXY != true
          "x-forwarded-for": `203.0.113.${i}`,
        },
        body: JSON.stringify({
          name: "Test User",
          email: "existing@test.local",
          password: "Password123",
        }),
      });
      const res = await registerPost(req, {});
      expect(res.status).toBe(409);
    }

    const req11 = new NextRequest("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.99",
      },
      body: JSON.stringify({
        name: "Test User",
        email: "existing@test.local",
        password: "Password123",
      }),
    });
    const res11 = await registerPost(req11, {});
    expect(res11.status).toBe(429);
    expect(res11.headers.get("Retry-After")).toBeTruthy();
  });

  it("extracts rightmost IP from x-forwarded-for only when TRUSTED_PROXY=true", () => {
    const req = new NextRequest("http://localhost:3000/api/health", {
      headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" },
    });
    expect(getClientIp(req)).toBe("direct");

    process.env.TRUSTED_PROXY = "true";
    expect(getClientIp(req)).toBe("10.0.0.1");
  });

  it("resets limit after window expires and supports custom RateLimitStore", async () => {
    vi.useFakeTimers();
    const backing = new Map<string, RateLimitEntry>();
    const customStore: RateLimitStore = {
      get: (k) => backing.get(k),
      set: (k, v) => {
        backing.set(k, v);
      },
      cleanup: () => {},
    };

    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 1000, prefix: "t" }, customStore);

    expect((await limiter.checkAsync("ip1")).success).toBe(true);
    expect((await limiter.checkAsync("ip1")).success).toBe(true);
    expect((await limiter.checkAsync("ip1")).success).toBe(false);

    vi.advanceTimersByTime(1001);
    const afterReset = await limiter.checkAsync("ip1");
    expect(afterReset.success).toBe(true);
    expect(afterReset.remaining).toBe(1);
  });
});
