import { test, expect } from "@playwright/test";
import { newAuthenticatedContext, uniqueId, waitForProjectHydrated } from "./helpers";

test.describe("Test cases, plans, manual execution & bug unlinking", () => {
  test("creates test case with inline precondition and folder, edits it, and persists changes", async ({
    browser,
  }) => {
    test.setTimeout(60_000);
    const context = await newAuthenticatedContext(browser, "ADMIN");
    const page = await context.newPage();

    const uid = uniqueId("case");
    const caseName = `Checkout ${uid}`;
    const folderName = `Folder-${uid}`;
    const preName = `Admin session ${uid}`;

    try {
      await page.goto("/projects/ALPHA/testcases/new");
      await waitForProjectHydrated(page, "ALPHA");
      await expect(page.getByRole("heading", { name: "New Test Case" })).toBeVisible();

      await page.locator("#name").fill(caseName);
      await page.locator("#description").fill("Verifies checkout submission end-to-end.");
      await page.locator("#preconditions").fill("User is authenticated and cart has 1 item.");
      await page.getByLabel("Save as reusable precondition in project").check();
      await page
        .getByPlaceholder("Precondition name (e.g. Logged-in Admin User)")
        .fill(preName);

      // Create an inline folder right from the test case form
      await page.getByRole("button", { name: /New Folder/i }).click();
      await page.getByPlaceholder("New folder name...").fill(folderName);
      await page.getByRole("button", { name: "Add", exact: true }).click();
      await expect(page.locator("#folderId option", { hasText: folderName.toLowerCase() })).toBeAttached();

      // Add 2 manual steps
      await page.locator('textarea[name="steps.0.action"]').fill("Open checkout page");
      await page.locator('textarea[name="steps.0.expected"]').fill("Order summary renders");
      await page.getByRole("button", { name: "+ Add step" }).click();
      await page.locator('textarea[name="steps.1.action"]').fill("Click Place Order");
      await page.locator('textarea[name="steps.1.expected"]').fill("Confirmation is shown");

      await page.getByRole("button", { name: "Create case" }).click();
      await expect(page).toHaveURL(/\/projects\/ALPHA\/testcases$/, { timeout: 20_000 });

      // Search for the created case and open its detail page
      await page.getByPlaceholder("Search by key or name...").fill(caseName);
      await page.getByText(caseName).first().click();
      await expect(page.getByRole("heading", { name: caseName })).toBeVisible();
      await expect(page.getByText(preName)).toBeVisible();
      await expect(page.getByText("Open checkout page")).toBeVisible();
      await expect(page.getByText("Click Place Order")).toBeVisible();

      // Edit test case status & description and verify reload persistence
      await page.getByRole("button", { name: "Edit Case" }).click();
      await page.locator("#status").selectOption("Approved");
      await page.locator("#description").fill("Updated checkout description.");
      await page.getByRole("button", { name: "Save Changes" }).click();
      await expect(page.getByText("Updated checkout description.")).toBeVisible();

      await page.reload();
      await expect(page.getByText("Updated checkout description.")).toBeVisible();
      await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("creates plan, runs manual execution with step results, links/unlinks bug, and exports CSV", async ({
    browser,
  }) => {
    test.setTimeout(90_000);
    const context = await newAuthenticatedContext(browser, "ADMIN");
    const page = await context.newPage();

    const uid = uniqueId("flow");
    const caseName = `Runner Case ${uid}`;
    const planName = `Plan ${uid}`;
    const bugSummary = `Broken payment ${uid}`;

    try {
      // Create a 2-step test case via API so this test focuses on Plan -> Execution -> Runner -> Bug Unlink
      const projectRes = await context.request.get("/api/projects/ALPHA");
      expect(projectRes.ok()).toBe(true);
      const project = await projectRes.json();

      const tcRes = await context.request.post("/api/testcases", {
        data: {
          projectId: project.id,
          name: caseName,
          type: "MANUAL",
          steps: [
            { action: "Navigate to cart", expected: "Cart renders" },
            { action: "Submit payment", expected: "Payment succeeds" },
          ],
        },
      });
      expect(tcRes.status()).toBe(201);
      const createdCase = await tcRes.json();

      // Create Test Plan in UI
      await page.goto("/projects/ALPHA/testplans/new");
      await waitForProjectHydrated(page, "ALPHA");
      await expect(page.getByRole("heading", { name: "New Test Plan" })).toBeVisible();
      await page.locator("#name").fill(planName);
      await page.getByText(createdCase.key, { exact: false }).first().click();
      await page.getByRole("button", { name: "Create plan" }).click();
      await expect(page).toHaveURL(/\/projects\/ALPHA\/testplans$/, { timeout: 20_000 });

      // Open Plan -> Start Execution -> Create execution
      await page.getByText(planName).first().click();
      await expect(page.getByRole("heading", { name: planName })).toBeVisible();
      await page.getByRole("link", { name: "Start Execution" }).click();
      await expect(page).toHaveURL(/\/projects\/ALPHA\/executions\/new\?planId=/);
      await expect(page.locator("#name")).not.toHaveValue("");
      await page.getByRole("button", { name: "Create execution" }).click();
      await expect(page).toHaveURL(/\/projects\/ALPHA\/executions\/ALPHA_EXEC_/, {
        timeout: 20_000,
      });

      const executionUrl = page.url();
      const execKey = executionUrl.split("/").pop()!;

      // Mark Step 1 Pass, Step 2 Fail and save derived FAIL
      await expect(page.getByRole("heading", { name: caseName })).toBeVisible();
      const passButtons = page.getByRole("button", { name: "Pass", exact: true });
      const failButtons = page.getByRole("button", { name: "Fail", exact: true });
      // Button index 0 is overall Pass/Fail header; step buttons follow inside the ordered list
      await passButtons.nth(1).click();
      await failButtons.nth(2).click();
      await page.getByPlaceholder("Actual result").nth(1).fill("502 Bad Gateway");
      await page.getByRole("button", { name: /Save Derived:.*FAIL/i }).click();
      await expect(page.getByText("FAIL", { exact: true }).first()).toBeVisible();

      // Create Local Bug directly from Manual Runner (links Bug.testCaseId = createdCase.id)
      await page.getByRole("button", { name: "+ Create Local Bug" }).click();
      await expect(page.getByRole("heading", { name: "Create Local Bug" })).toBeVisible();
      const bugModal = page.locator("div.fixed").filter({ hasText: "Create Local Bug" });
      await bugModal.locator("input").first().fill(bugSummary);
      await bugModal.getByRole("button", { name: "Create Bug" }).click();
      await expect(bugModal).toBeHidden();

      // Verify CSV report export contains the execution key and case failure
      const csvRes = await context.request.get(`/api/executions/${execKey}/export?projectKey=ALPHA`);
      expect(csvRes.status()).toBe(200);
      expect(csvRes.headers()["content-type"]).toContain("text/csv");
      const csvText = await csvRes.text();
      expect(csvText).toContain(createdCase.key);
      expect(csvText).toContain("FAIL");

      // Navigate to the Test Case detail page and unlink the bug cleanly
      await page.goto(`/projects/ALPHA/testcases/${createdCase.id}`);
      await expect(page.getByText(bugSummary)).toBeVisible();
      await page.locator(`button[title="Unlink bug from test case"]`).first().click({ force: true });
      await expect(page.getByText(bugSummary)).toBeHidden();

      await page.reload();
      await expect(page.getByText(bugSummary)).toBeHidden();
    } finally {
      await context.close();
    }
  });
});
