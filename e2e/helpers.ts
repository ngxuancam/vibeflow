import type { Page } from "@playwright/test";

export async function waitForPage(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("#intake", { state: "attached" });
  await page.waitForTimeout(1200);
}
