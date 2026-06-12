import { expect, test } from "@playwright/test";
import { waitForPage } from "./helpers";


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
