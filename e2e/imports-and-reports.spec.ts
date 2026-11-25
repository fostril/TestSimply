import { test, expect } from "@playwright/test";
import { newAuthenticatedContext, uniqueId, waitForProjectHydrated } from "./helpers";

test.describe("Imports (JUnit, Cucumber, CSV), Flaky Detection & Reports", () => {
  test("imports JUnit XML and Cucumber JSON through UI and triggers Flaky Test Detection", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const context = await newAuthenticatedContext(browser, "ADMIN");
    const page = await context.newPage();

    const uid = uniqueId("flaky");
    const flakyCaseName = `Auto Flaky ${uid}`;

    const passXml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="FlakySuite" tests="1">
  <testcase classname="e2e" name="${flakyCaseName}" time="0.25" />
</testsuite>`;

    const cucumberFailJson = JSON.stringify([
      {
        name: "FlakyFeature",
        elements: [
          {
            name: flakyCaseName,
            steps: [
              {
                name: "When payment runs",
                result: { status: "failed", error_message: "Intermittent timeout", duration: 100000000 },
              },
            ],
          },
        ],
      },
    ]);

    try {
      await page.goto("/projects/ALPHA/executions");
      await waitForProjectHydrated(page, "ALPHA");
      await expect(page.getByRole("heading", { name: "Executions" })).toBeVisible();

      // Run 1: Import JUnit XML -> PASS
      await page.getByRole("button", { name: "Import Results" }).click();
      await expect(page.getByRole("heading", { name: "Import Test Results" })).toBeVisible();
      let modal = page.locator("div.fixed").filter({ hasText: "Import Test Results" });
      await modal.locator('input[type="file"]').setInputFiles({
        name: "run1.xml",
        mimeType: "text/xml",
        buffer: Buffer.from(passXml, "utf8"),
      });
      await modal.getByRole("button", { name: "Import Report" }).click();
      await expect(modal).toBeHidden({ timeout: 15_000 });

      // Run 2: Import Cucumber JSON -> FAIL
      await page.getByRole("button", { name: "Import Results" }).click();
      modal = page.locator("div.fixed").filter({ hasText: "Import Test Results" });
      await modal.getByRole("button", { name: "Cucumber JSON" }).click();
      await modal.locator('input[type="file"]').setInputFiles({
        name: "run2.json",
        mimeType: "application/json",
        buffer: Buffer.from(cucumberFailJson, "utf8"),
      });
      await modal.getByRole("button", { name: "Import Report" }).click();
      await expect(modal).toBeHidden({ timeout: 15_000 });

      // Run 3: Import JUnit XML -> PASS (now PASS -> FAIL -> PASS = 2 status flips)
      await page.getByRole("button", { name: "Import Results" }).click();
      modal = page.locator("div.fixed").filter({ hasText: "Import Test Results" });
      await modal.locator('input[type="file"]').setInputFiles({
        name: "run3.xml",
        mimeType: "text/xml",
        buffer: Buffer.from(passXml, "utf8"),
      });
      await modal.getByRole("button", { name: "Import Report" }).click();
      await expect(modal).toBeHidden({ timeout: 15_000 });

      // Open Reports -> Flaky Tests tab and verify detection + Clear Flaky
      await page.goto("/projects/ALPHA/reports?tab=flaky");
      await waitForProjectHydrated(page, "ALPHA");
      await expect(page.getByRole("heading", { name: "Flaky Test Detection" })).toBeVisible();
      const row = page.locator("tr", { hasText: flakyCaseName });
      await expect(async () => {
        await page.reload();
        await expect(row).toBeVisible({ timeout: 3_000 });
      }).toPass({ intervals: [1_000, 2_000], timeout: 20_000 });
      await expect(row.getByText(/2 flips/)).toBeVisible();

      await row.getByRole("button", { name: "Clear Flaky" }).click();
      await expect(page.locator("tr", { hasText: flakyCaseName })).toBeHidden({ timeout: 15_000 });
    } finally {
      await context.close();
    }
  });

  test("imports test cases from CSV and loads Coverage, Traceability & Bug reports", async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const context = await newAuthenticatedContext(browser, "ADMIN");
    const page = await context.newPage();

    const uid = uniqueId("csv");
    const csvCaseName = `CSV Case ${uid}`;
    const csvPayload = [
      "name,description,precondition,steps.action,steps.expected,expected_result,tags",
      `"${csvCaseName}","Imported via E2E","Account exists","Open form | Submit","Form shows | Saved","Success","e2e,csv"`,
    ].join("\n");

    try {
      await page.goto("/projects/ALPHA/testcases");
      await waitForProjectHydrated(page, "ALPHA");
      await expect(page.getByRole("heading", { name: "Test Cases" })).toBeVisible();

      await page.getByRole("button", { name: "Import CSV" }).click();
      const csvModal = page.locator("div.fixed").filter({ hasText: "Import Test Cases" });
      await expect(csvModal).toBeVisible();
      await csvModal.locator('input[type="file"]').setInputFiles({
        name: "cases.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(csvPayload, "utf8"),
      });
      await csvModal.getByRole("button", { name: "Import Cases" }).click();
      await expect(csvModal.getByText("1 cases imported")).toBeVisible({ timeout: 15_000 });
      await csvModal.getByRole("button", { name: "Close" }).click();

      await page.getByPlaceholder("Search by key or name...").fill(csvCaseName);
      await expect(page.getByText(csvCaseName).first()).toBeVisible();

      // Verify CSV export endpoint returns sanitized CSV containing the newly imported case
      const projectRes = await context.request.get("/api/projects/ALPHA");
      const project = await projectRes.json();
      const exportRes = await context.request.get(`/api/testcases/export?projectId=${project.id}`);
      expect(exportRes.status()).toBe(200);
      expect(await exportRes.text()).toContain(csvCaseName);

      // Verify Requirement Coverage, Traceability Matrix, and Bug Reports tabs render cleanly
      await page.goto("/projects/ALPHA/reports");
      await page.getByRole("button", { name: "Requirement Coverage" }).click();
      await expect(page.getByRole("heading", { name: "Requirement Coverage" })).toBeVisible();

      await page.getByRole("button", { name: "Traceability Matrix" }).click();
      await expect(page.getByRole("heading", { name: "Traceability Matrix" })).toBeVisible();
      await page.getByLabel("Include unlinked tests").check();
      await expect(page.getByRole("button", { name: "Export CSV" })).toBeEnabled();

      await page.getByRole("button", { name: "Bug Reports" }).click();
      await expect(page.getByRole("heading", { name: "Bug Reports" })).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
