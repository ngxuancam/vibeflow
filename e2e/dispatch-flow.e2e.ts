import { expect, test } from "@playwright/test";

async function waitForPage(page: import("@playwright/test").Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("#intake", { state: "attached" });
  await page.waitForTimeout(1200);
}

test.describe("Dispatch button", () => {
  test("dispatch button is disabled before generating", async ({ page }) => {
    await page.goto("/");
    await waitForPage(page);
    await expect(page.locator("#wfDispatchBtn")).toBeDisabled();
  });
});
