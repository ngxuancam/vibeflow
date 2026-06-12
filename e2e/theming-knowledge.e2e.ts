import { expect, test } from "@playwright/test";

async function waitForPage(page: import("@playwright/test").Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("#intake", { state: "attached" });
  await page.waitForTimeout(1200);
}

test.describe("Theming", () => {
  test("theme persists across tabs via localStorage", async ({ page, context }) => {
    await page.goto("/");
    await waitForPage(page);
    await page.locator("#themeToggle").click();
    await page.waitForTimeout(400);
    await expect(page.locator("html")).toHaveClass(/dark-mode/);

    const page2 = await context.newPage();
    await page2.goto("/");
    await waitForPage(page2);
    await expect(page2.locator("html")).toHaveClass(/dark-mode/);
    await page2.close();
  });
});
