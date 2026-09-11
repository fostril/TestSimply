import { test, expect } from "@playwright/test";

test("login page renders", async ({ page }) => {
  await page.goto("/auth/login");
  await expect(page.getByRole("heading", { name: "Sign in to TestSimply" })).toBeVisible();
});
