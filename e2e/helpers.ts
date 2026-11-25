import fs from "fs";
import os from "os";
import path from "path";
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

export const SEEDED_USERS = {
  ADMIN: { email: "ada.admin@testsimply.local", password: "ChangeMe123!" },
  LEAD: { email: "liam.lead@testsimply.local", password: "ChangeMe123!" },
  TESTER: { email: "tara.tester@testsimply.local", password: "ChangeMe123!" },
  VIEWER: { email: "vera.viewer@testsimply.local", password: "ChangeMe123!" },
} as const;

export type SeededRole = keyof typeof SEEDED_USERS;

const STATE_TTL_MS = 120_000;

async function acquireLock(lockDir: string, timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      fs.mkdirSync(lockDir);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  throw new Error(`Timed out waiting for lock: ${lockDir}`);
}

/**
 * Reuse an authenticated storageState per role across Playwright workers and
 * browser projects so tests stay fast and well below the NextAuth 10/min
 * credential login rate limit.
 */
export async function newAuthenticatedContext(
  browser: Browser,
  role: SeededRole,
): Promise<BrowserContext> {
  const creds = SEEDED_USERS[role];
  const statePath = path.join(os.tmpdir(), `testsimply-e2e-${role.toLowerCase()}.json`);
  const lockDir = `${statePath}.lock`;

  await acquireLock(lockDir);
  try {
    const isFresh =
      fs.existsSync(statePath) &&
      Date.now() - fs.statSync(statePath).mtimeMs < STATE_TTL_MS;

    if (!isFresh) {
      const setupCtx = await browser.newContext();
      const page = await setupCtx.newPage();
      await signInThroughUi(page, creds.email, creds.password);
      await setupCtx.storageState({ path: statePath });
      await setupCtx.close();
    }
  } finally {
    fs.rmSync(lockDir, { recursive: true, force: true });
  }

  return browser.newContext({ storageState: statePath });
}

export async function signInThroughUi(
  page: Page,
  email: string,
  password: string,
) {
  await page.goto("/auth/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/(projects\/|$)/, { timeout: 20_000 });
}

export function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export async function waitForProjectHydrated(page: Page, projectKey: string) {
  await expect(page.locator(`a[href="/projects/${projectKey}/testcases"]`)).toBeVisible({
    timeout: 15_000,
  });
}
