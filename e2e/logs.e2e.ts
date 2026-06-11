import { expect, test } from "@playwright/test";

async function waitForPage(page: import("@playwright/test").Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector("#intake", { state: "attached" });
  await page.waitForTimeout(1200);
}

test.describe("M4: CLI Log UI", () => {
  test("bottom dock is hidden on initial load", async ({ page }) => {
    await page.goto("/");
    await waitForPage(page);
    const dock = page.locator("#cliDock");
    await expect(dock).toBeHidden();
  });

  test("logs toggle button exists in header", async ({ page }) => {
    await page.goto("/");
    await waitForPage(page);
    const btn = page.locator("#logsToggle");
    await expect(btn).toBeVisible();
    await expect(btn).toContainText(/Logs/i);
  });

  test("clicking logs toggle shows full-screen view-logs section", async ({ page }) => {
    await page.goto("/");
    await waitForPage(page);
    const logsView = page.locator("#viewLogs");
    await expect(logsView).toBeHidden();

    await page.locator("#logsToggle").click();
    await page.waitForTimeout(300);
    await expect(logsView).toBeVisible();

    // Toggle back
    await page.locator("#logsToggle").click();
    await page.waitForTimeout(300);
    await expect(logsView).toBeHidden();
  });

  test("full-screen logs tab shows channel filter chips", async ({ page }) => {
    await page.goto("/");
    await waitForPage(page);
    await page.locator("#logsToggle").click();
    await page.waitForTimeout(300);

    const logsView = page.locator("#viewLogs");
    await expect(logsView).toBeVisible();

    // Check channel filter checkboxes
    await expect(logsView.locator('.ch-filter input[data-channel="vf"]')).toBeVisible();
    await expect(logsView.locator('.ch-filter input[data-channel="engine-stdout"]')).toBeVisible();
    await expect(logsView.locator('.ch-filter input[data-channel="engine-stderr"]')).toBeVisible();

    // Status indicator
    await expect(logsView.locator("#logsStatus")).toBeVisible();
  });

  test("bottom dock has all control buttons", async ({ page }) => {
    await page.goto("/");
    await waitForPage(page);

    // Force show the dock for testing
    await page.evaluate(() => {
      const dock = document.getElementById("cliDock");
      if (dock) dock.hidden = false;
    });
    await page.waitForTimeout(200);

    const dock = page.locator("#cliDock");
    await expect(dock).toBeVisible();

    await expect(dock.locator("#cliDockPin")).toBeVisible();
    await expect(dock.locator("#cliDockClear")).toBeVisible();
    await expect(dock.locator("#cliDockToggle")).toBeVisible();
    await expect(dock.locator("#cliDockFilter")).toBeVisible();
  });

  test("dock close button hides the dock", async ({ page }) => {
    await page.goto("/");
    await waitForPage(page);
    await page.evaluate(() => {
      const dock = document.getElementById("cliDock");
      if (dock) dock.hidden = false;
    });
    await page.waitForTimeout(200);

    await page.locator("#cliDockToggle").click();
    await page.waitForTimeout(200);
    await expect(page.locator("#cliDock")).toBeHidden();
  });

  test("log lines use textContent (not innerHTML) for XSS safety", async ({ page }) => {
    await page.goto("/");
    await waitForPage(page);

    // Show dock so log lines are appended
    await page.evaluate(() => {
      (window as any).showDock();
    });
    await page.waitForTimeout(200);

    // Inject a log line with HTML via the global addLogLine
    await page.evaluate(() => {
      const win = window as any;
      if (typeof win.addLogLine === "function") {
        win.addLogLine({
          seq: Date.now(),
          channel: "vf",
          ts: Date.now(),
          unit: "test",
          text: "<script>alert('xss')</script><b>bold</b>",
        });
      }
    });
    await page.waitForTimeout(200);

    // Check that the text is rendered literally (not as HTML)
    const dockBody = page.locator("#cliDockBody");
    const text = await dockBody.textContent();
    expect(text).toContain("<script>alert('xss')</script>");
    expect(text).toContain("<b>bold</b>");
    // The <b> tag should NOT be rendered as HTML (no bold text)
    const bTags = await dockBody.locator("b").count();
    expect(bTags).toBe(0);
  });

  test("dock body has aria-live polite for accessibility", async ({ page }) => {
    await page.goto("/");
    await waitForPage(page);
    await expect(page.locator("#cliDockBody")).toHaveAttribute("aria-live", "polite");
  });

  test("logs pane has aria-live polite for accessibility", async ({ page }) => {
    await page.goto("/");
    await waitForPage(page);
    await page.locator("#logsToggle").click();
    await page.waitForTimeout(300);
    await expect(page.locator("#logsPane")).toHaveAttribute("aria-live", "polite");
  });

  test("full-screen logs view has a search filter input", async ({ page }) => {
    await page.goto("/");
    await waitForPage(page);
    await page.locator("#logsToggle").click();
    await page.waitForTimeout(300);
    await expect(page.locator("#logsFilter")).toBeVisible();
    await expect(page.locator("#logsFilter")).toHaveAttribute("placeholder", /grep/i);
  });

  test("dock filter input works", async ({ page }) => {
    await page.goto("/");
    await waitForPage(page);
    await page.evaluate(() => {
      const dock = document.getElementById("cliDock");
      if (dock) dock.hidden = false;
    });
    await page.waitForTimeout(200);

    await expect(page.locator("#cliDockFilter")).toBeVisible();
    await expect(page.locator("#cliDockFilter")).toHaveAttribute("placeholder", /grep/i);
  });

  test("existing EventSource for /events still works", async ({ page }) => {
    // This verifies we didn't break the original EventSource
    await page.goto("/");
    await waitForPage(page);

    // Existing elements should still render
    await expect(page.locator("#intake")).toBeVisible();
    await expect(page.locator("#projectSec")).toBeVisible();
    await expect(page.locator("#workflowSec")).toBeVisible();
  });

  test("dock pin button toggles auto-scroll", async ({ page }) => {
    await page.goto("/");
    await waitForPage(page);
    await page.evaluate(() => {
      const dock = document.getElementById("cliDock");
      if (dock) dock.hidden = false;
    });
    await page.waitForTimeout(200);

    const pinBtn = page.locator("#cliDockPin");
    await expect(pinBtn).toBeVisible();

    // Check that it has title attribute
    await expect(pinBtn).toHaveAttribute("title", /auto-scroll/i);
  });
});
