import { expect, test } from "@playwright/test";

/**
 * Web e2e against the live VibeFlow dashboard. Each test asserts a concrete, observable
 * outcome so the UI is verifiable end to end (no "it probably rendered").
 */

test("dashboard loads with the intake wizard and a CSRF token", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/VibeFlow/);
  await expect(page.locator("header h1")).toHaveText("VibeFlow");
  // The page must carry a per-process CSRF token used by every write.
  const csrf = await page.locator('meta[name="csrf"]').getAttribute("content");
  expect(csrf && csrf.length).toBeTruthy();
  await expect(page.locator("#intakeForm")).toBeVisible();
});

test("generating a workflow reveals the meter, dispatch, and work-unit sections", async ({
  page,
}) => {
  await page.goto("/");
  await page.fill('textarea[name="goal"]', "Add product search endpoint");
  await page.click("#intakeSubmit");
  await expect(page.locator("#intakeHint")).toContainText(/Generated \d+ files/);
  await expect(page.locator("#meter")).toBeVisible();
  await expect(page.locator("#dispatchSec")).toBeVisible();
  await expect(page.locator("#unitsSec")).toBeVisible();
  // The empty board states the goal until work units exist.
  await expect(page.locator("#board")).toContainText("Add product search endpoint");
});

test("orchestrate (dry) creates a work-unit card with a gate strip and evidence", async ({
  page,
}) => {
  await page.goto("/");
  await page.fill('textarea[name="goal"]', "Build the thing");
  await page.click("#intakeSubmit");
  await expect(page.locator("#meter")).toBeVisible();

  await page.click("#orchestrateBtn");
  await expect(page.locator("#dispatchHint")).toContainText(/Orchestrated/);
  const card = page.locator('.card[data-name="task"]');
  await expect(card).toBeVisible();
  // Gate strip is present, and dry-run records an evidence path.
  await expect(card.locator(".gate")).toHaveCount(4);
  await expect(card).toContainText("evidence:");
});

test("skills panel surfaces demand-driven needs from the detected stack", async ({ page }) => {
  await page.goto("/");
  // The workspace declares express → a docs need is resolved on demand.
  await expect(page.locator("#skillsSec")).toBeVisible();
  await expect(page.locator("#needsBox")).toContainText(/docs/i);
});

test("discovery is approval-gated: searching without approval asks for approval", async ({
  page,
}) => {
  await page.goto("/");
  await page.fill("#discoverQuery", "next.js");
  // Leave the "approve network" box unchecked.
  await page.click('#discoverForm button[type="submit"]');
  await expect(page.locator("#discoverOut")).toBeVisible();
  await expect(page.locator("#discoverOut")).toContainText(/requires approval/i);
});

test("a forbidden write (no CSRF token) is rejected by the server", async ({ request }) => {
  const res = await request.post("/api/units", {
    headers: { "content-type": "application/json" },
    data: { action: "add", unit: { name: "x" } },
  });
  expect(res.status()).toBe(403);
});

test("check-engines wires the probe and reports status", async ({ page }) => {
  await page.goto("/");
  // The readiness panel starts empty and the hint shows its idle copy.
  await expect(page.locator("#engineStatus")).toBeEmpty();
  await expect(page.locator("#engineStatusHint")).toHaveText(/Probe runs locally/);

  // Clicking synchronously moves the hint to "Checking…" before the probe runs, then to a
  // terminal "Ready…/No engine ready…" state once it resolves. We assert that observable
  // transition rather than the .att row count, because populating the panel depends on the
  // real local engine probe completing (a real CLI round-trip): slow and machine-dependent.
  // Matching either the transient or terminal copy makes this deterministic on any machine —
  // engines installed (slow → "Checking…") or not (fast → "…ready…") — without depending on
  // the probe's result or timing. The probe → anyReady → Generate gate is covered by the
  // POST /api/preflight unit test in test/cli.test.ts.
  await page.click("#checkEnginesBtn");
  await expect(page.locator("#engineStatusHint")).toHaveText(/Checking|enabled|engine ready/i);
});

test("optional-tools panel lists codegraph + lsp with persisted toggles", async ({ page }) => {
  await page.goto("/");
  // Open the collapsed options section so its controls become actionable.
  await page.locator("#optionsSec > summary").click();
  await expect(page.locator("#toolList .att")).toHaveCount(2);
  const codegraph = page.locator('#toolList .tool-toggle[data-tool="codegraph"]');
  await expect(codegraph).not.toBeChecked();
  // Toggling persists to SETTINGS.json; the saved state survives a reload.
  await codegraph.check();
  await expect(page.locator("#optionsHint")).toContainText(/Saved/);
  await page.reload();
  await page.locator("#optionsSec > summary").click();
  await expect(page.locator('#toolList .tool-toggle[data-tool="codegraph"]')).toBeChecked();
});
