import { expect, test } from "@playwright/test";
import { waitForPage } from "./helpers";


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
