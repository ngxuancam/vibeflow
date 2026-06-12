import { expect, test } from "@playwright/test";

async function waitForPage(page: import("@playwright/test").Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("#intake", { state: "attached" });
  await page.waitForTimeout(1200);
}

test.describe("Intake elements", () => {
  test("detect repo button exists", async ({ page }) => {
    await page.goto("/");
    await waitForPage(page);
    await expect(page.locator("#detectBtn")).toBeAttached();
  });

  test("check engines button exists", async ({ page }) => {
    await page.goto("/");
    await waitForPage(page);
    await expect(page.locator("#checkEnginesBtn")).toBeAttached();
  });
});
