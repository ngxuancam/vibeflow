import { expect, test } from "@playwright/test";

async function waitForPage(page: import("@playwright/test").Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("#intake", { state: "attached" });
  await page.waitForTimeout(1200);
}

test.describe("Edge cases", () => {
  test("all sections render on empty state", async ({ page }) => {
    await page.goto("/");
    await waitForPage(page);
    await expect(page.locator("#intake")).toBeVisible();
    await expect(page.locator("#actionSec")).toBeVisible();
  });

  test("feedback log shows state information", async ({ page }) => {
    await page.goto("/");
    await waitForPage(page);
    await page.locator("#feedbackBtn").click();
    await page.waitForTimeout(400);
    const logContent = await page.locator("#feedbackLog").textContent();
    expect(logContent).toContain("timestamp:");
    expect(logContent).toContain("userAgent:");
  });
});
