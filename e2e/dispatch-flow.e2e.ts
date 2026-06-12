import { expect, test } from "@playwright/test";
import { waitForPage } from "./helpers";


test.describe("Dispatch button", () => {
  test("dispatch button is disabled before generating", async ({ page }) => {
    await page.goto("/");
    await waitForPage(page);
    await expect(page.locator("#wfDispatchBtn")).toBeDisabled();
  });
});
