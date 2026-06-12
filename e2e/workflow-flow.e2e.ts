import { expect, test } from "@playwright/test";

async function waitForPage(page: import("@playwright/test").Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("#intake", { state: "attached" });
  await page.waitForTimeout(1200);
}

test.describe("Workflow generation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForPage(page);
  });

  test("dispatch button exists and is disabled initially", async ({ page }) => {
    await expect(page.locator("#wfDispatchBtn")).toBeDisabled();
  });

  test("generate button exists", async ({ page }) => {
    await expect(page.locator("#intakeSubmit")).toBeAttached();
  });

  test("check engines button triggers readiness check", async ({ page }) => {
    await page.locator("#checkEnginesBtn").click();
    await page.waitForTimeout(3000);
    await expect(page.locator("#engineStatus")).toBeAttached();
  });
});
