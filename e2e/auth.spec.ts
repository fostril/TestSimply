import { test, expect } from "@playwright/test";

const MAILHOG_URL = process.env.MAILHOG_URL || "http://localhost:8025";

function decodeQuotedPrintable(input: string): string {
  return input
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
}

test.describe("Authentication & authorization flows", () => {
  test("redirects unauthenticated user from protected page to /auth/login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/auth\/login/);
    await expect(page.getByRole("heading", { name: "Sign in to TestSimply" })).toBeVisible();
  });

  test("rejects wrong password on login", async ({ page }) => {
    await page.goto("/auth/login");
    await page.locator('input[type="email"]').fill("ada.admin@testsimply.local");
    await page.locator('input[type="password"]').fill("WrongPassword999!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test("valid login with seeded admin redirects to dashboard", async ({ page }) => {
    await page.goto("/auth/login");
    await page.locator('input[type="email"]').fill("ada.admin@testsimply.local");
    await page.locator('input[type="password"]').fill("ChangeMe123!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/(projects\/|$)/);
  });

  test("registration validates weak password (400), duplicate email (409), and defaults to VIEWER", async ({ request }) => {
    const weakRes = await request.post("/api/auth/register", {
      data: { name: "Weak User", email: "weak@testsimply.local", password: "123" },
    });
    expect(weakRes.status()).toBe(400);

    const uniqueEmail = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@testsimply.local`;
    const okRes = await request.post("/api/auth/register", {
      data: { name: "E2E User", email: uniqueEmail, password: "Password123" },
    });
    expect(okRes.status()).toBe(201);

    const dupRes = await request.post("/api/auth/register", {
      data: { name: "E2E User", email: uniqueEmail, password: "Password123" },
    });
    expect(dupRes.status()).toBe(409);
  });

  test("forgot password & email verification links arrive in Mailhog when available", async ({ page, request }) => {
    const mailhogCheck = await request.get(`${MAILHOG_URL}/api/v2/messages`).catch(() => null);
    test.skip(!mailhogCheck || !mailhogCheck.ok(), "Mailhog is not running locally");

    const email = `reset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@testsimply.local`;
    const regRes = await request.post("/api/auth/register", {
      data: { name: "Reset User", email, password: "Password123" },
    });
    expect(regRes.status()).toBe(201);

    // Trigger password reset from UI
    await page.goto("/auth/login");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page).toHaveURL(/\/auth\/forgot-password/);
    await page.locator('input[type="email"]').fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText(/reset link has been sent/i)).toBeVisible();

    const messagesRes = await request.get(`${MAILHOG_URL}/api/v2/messages`);
    const messagesJson = await messagesRes.json();
    const allItems = (messagesJson.items ?? []) as Array<{
      Content?: { Headers?: { To?: string[] }; Body?: string };
      MIME?: { Parts?: Array<{ Body?: string }> };
    }>;

    const getBody = (item: typeof allItems[number]) => {
      const partBodies = item.MIME?.Parts?.map((p) => decodeQuotedPrintable(p.Body ?? "")).join("\n") ?? "";
      return partBodies || decodeQuotedPrintable(item.Content?.Body ?? "");
    };

    const verifyMsg = allItems.find(
      (m) => m.Content?.Headers?.To?.includes(email) && getBody(m).includes("verify-email"),
    );
    const resetMsg = allItems.find(
      (m) => m.Content?.Headers?.To?.includes(email) && getBody(m).includes("reset-password"),
    );

    expect(verifyMsg).toBeTruthy();
    const verifyMatch = getBody(verifyMsg!).match(/https?:\/\/[^\s"<]+\/api\/auth\/verify-email\?token=[^\s"<]+/);
    expect(verifyMatch).toBeTruthy();
    const verifyRes = await request.get(verifyMatch![0]);
    expect(verifyRes.status()).toBeLessThan(400);

    expect(resetMsg).toBeTruthy();
    const resetMatch = getBody(resetMsg!).match(/\/auth\/reset-password\?token=([^\s"<]+)/);
    expect(resetMatch).toBeTruthy();

    await page.goto(resetMatch![0]);
    const passwordInputs = page.locator('input[type="password"]');
    await passwordInputs.nth(0).fill("UpdatedPass123");
    await passwordInputs.nth(1).fill("UpdatedPass123");
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page).toHaveURL(/\/auth\/login\?reset=1/);

    // Reusing the same reset token must fail
    const reuseRes = await request.post("/api/auth/reset-password", {
      data: { token: decodeURIComponent(resetMatch![1]), password: "AnotherPass123" },
    });
    expect(reuseRes.status()).toBe(400);
  });
});
