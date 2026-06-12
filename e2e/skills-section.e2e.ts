import { expect, test } from "@playwright/test";

async function waitForPage(page: import("@playwright/test").Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("#intake", { state: "attached" });
  await page.waitForTimeout(1200);
}

test.describe("Skills section", () => {
  test("skills box exists in page structure", async ({ page }) => {
    await page.goto("/");
    await waitForPage(page);
    await expect(page.locator("#skillsBox")).toBeAttached();
  });

  test("needs box exists in page structure", async ({ page }) => {
    await page.goto("/");
    await waitForPage(page);
    await expect(page.locator("#needsBox")).toBeAttached();
  });
});
