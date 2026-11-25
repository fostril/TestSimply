import { test, expect } from "@playwright/test";
import { newAuthenticatedContext, uniqueId, waitForProjectHydrated } from "./helpers";

test.describe("RBAC UI gating, Settings, Tokens & SSRF guards", () => {
  test("hides mutation controls and restricts project creation for VIEWER role", async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const context = await newAuthenticatedContext(browser, "VIEWER");
    const page = await context.newPage();

    try {
      await page.goto("/projects/ALPHA/testcases");
      await expect(page.getByRole("heading", { name: "Test Cases" })).toBeVisible();
      await expect(page.getByRole("link", { name: "New Test Case" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Import CSV" })).toHaveCount(0);

      // Sidebar should hide project Settings and Admin for VIEWER
      await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);

      await page.goto("/projects/ALPHA/executions");
      await expect(page.getByRole("heading", { name: "Executions" })).toBeVisible();
      await expect(page.getByRole("link", { name: "New Execution" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Import Results" })).toHaveCount(0);

      await page.goto("/projects/ALPHA/bugs");
      await expect(page.getByRole("heading", { name: "Bugs" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Report Bug" })).toHaveCount(0);

      // Direct navigation to /projects/new shows insufficient permissions instead of submit form
      await page.goto("/projects/new");
      await expect(page.getByRole("heading", { name: "Insufficient Permissions" })).toBeVisible();

      // API also enforces RBAC
      const createRes = await context.request.post("/api/projects", {
        data: { key: "NOPE", name: "Unauthorized Project" },
      });
      expect(createRes.status()).toBe(403);
    } finally {
      await context.close();
    }
  });

  test("enforces ADMIN tokens lifecycle, profile view, user management, and SSRF validation in settings", async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const context = await newAuthenticatedContext(browser, "ADMIN");
    const page = await context.newPage();
    const tokenLabel = uniqueId("ci-token");

    try {
      // Profile page
      await page.goto("/settings/profile");
      await expect(page.getByRole("heading", { name: "Profile & Security" })).toBeVisible();
      await expect(page.getByText("ada.admin@testsimply.local")).toBeVisible();
      await expect(page.getByText("ADMIN", { exact: true }).first()).toBeVisible();

      // Personal Access Token create + revoke
      await page.goto("/settings/tokens");
      await expect(
        page.getByRole("heading", { name: "Personal Access Tokens", level: 1 }),
      ).toBeVisible();
      await page.getByPlaceholder("CI Token").fill(tokenLabel);
      await page.getByRole("button", { name: "Generate token" }).click();
      await expect(page.getByText("Token generated")).toBeVisible();
      const tokenRow = page.locator("li", { hasText: tokenLabel });
      await expect(tokenRow).toBeVisible();
      await tokenRow.getByRole("button", { name: "Revoke" }).click();
      await expect(page.locator("li", { hasText: tokenLabel })).toHaveCount(0);

      // Admin User Management view
      await page.goto("/settings/users");
      await expect(page.getByText("tara.tester@testsimply.local")).toBeVisible();
      await expect(page.getByText("vera.viewer@testsimply.local")).toBeVisible();

      // Project Settings SSRF protection rejects private/loopback integration URLs
      await page.goto("/projects/ALPHA/settings");
      await waitForProjectHydrated(page, "ALPHA");
      await expect(page.getByRole("heading", { name: "Project Settings" })).toBeVisible();
      await page.locator("#jiraUrl").fill("http://127.0.0.1:8080");
      const jiraSection = page.locator("div.rounded-lg", { hasText: "Jira Integration" });
      const settingsSavePromise = page.waitForResponse(
        (res) => res.url().includes("/api/projects/settings") && res.request().method() === "PATCH",
      );
      await jiraSection.getByRole("button", { name: "Save Changes" }).click();
      const settingsRes = await settingsSavePromise;
      expect(settingsRes.status()).toBe(400);
      await expect(page.getByText(/Update failed/i).first()).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
