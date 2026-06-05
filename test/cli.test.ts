import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalFiles, defaultContext, dispatchPrompt, engineFiles } from "../src/adapters.js";
import { init, units } from "../src/commands.js";
import { ENGINES, type WorkflowState, parseFlags, recomputeTotals } from "../src/core.js";
import { startServer } from "../src/server.js";

describe("core", () => {
  test("parseFlags splits positionals and flags", () => {
    const r = parseFlags(["show", "auth", "--engine", "claude", "--yes"]);
    expect(r.positionals).toEqual(["show", "auth"]);
    expect(r.flags).toEqual({ engine: "claude", yes: true });
  });

  test("recomputeTotals aggregates work units", () => {
    const s: WorkflowState = {
      task_id: "T",
      goal: "g",
      success_criteria: [],
      work_units: [
        {
          name: "a",
          status: "done",
          confidence: 1,
          gates: { build: "pass", lint: "pass", test: "pass", review: "pass" },
          resources: { agents: 1, tokens: 100, cost_usd: 0.5, wall_seconds: 10 },
        },
        {
          name: "b",
          status: "running",
          confidence: 1,
          gates: { build: "pass", lint: "pending", test: "pending", review: "pending" },
          resources: { agents: 1, tokens: 50, cost_usd: 0.25, wall_seconds: 5 },
        },
      ],
      totals: { units: 0, done: 0, tokens: 0, cost_usd: 0, wall_seconds: 0 },
    };
    recomputeTotals(s);
    expect(s.totals).toEqual({ units: 2, done: 1, tokens: 150, cost_usd: 0.75, wall_seconds: 15 });
  });
});

describe("adapters", () => {
  test("canonical files use the vibeflow/ directory", () => {
    const files = canonicalFiles(defaultContext());
    expect(Object.keys(files).every((k) => k.startsWith("vibeflow/"))).toBe(true);
    expect(files["vibeflow/WORKFLOW_POLICY.md"]).toContain("No verification, no completion");
  });

  test("each engine produces its canonical instruction file", () => {
    const ctx = defaultContext();
    expect(Object.keys(engineFiles("claude", ctx))).toContain("CLAUDE.md");
    expect(Object.keys(engineFiles("codex", ctx))).toContain("AGENTS.md");
    const copilot = engineFiles("copilot", ctx);
    expect(Object.keys(copilot)).toContain(".github/copilot-instructions.md");
  });

  test("dispatch prompt names the engine and requests a JSON summary", () => {
    const p = dispatchPrompt("codex", defaultContext(), ["auth"]);
    expect(p).toContain("→ codex");
    expect(p).toContain("JSON summary");
  });
});

describe("commands.init", () => {
  let dir: string;
  const origCwd = process.cwd();
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "vf-"));
    process.chdir(dir);
  });
  afterEach(() => {
    process.chdir(origCwd);
    rmSync(dir, { recursive: true, force: true });
  });

  test("init writes canonical context and a valid ledger", () => {
    const code = init({ engine: "claude" });
    expect(code).toBe(0);
    const state = JSON.parse(readFileSync(join(dir, "vibeflow/WORKFLOW_STATE.json"), "utf8"));
    expect(state.totals.units).toBe(0);
    expect(readFileSync(join(dir, "CLAUDE.md"), "utf8").length).toBeGreaterThan(0);
  });

  test("units status returns 0 on an initialized ledger", () => {
    init({});
    expect(units("status", [])).toBe(0);
    expect(units("resources", [])).toBe(0);
  });
});

describe("engines", () => {
  test("there are exactly three supported engines", () => {
    expect(ENGINES).toEqual(["claude", "codex", "copilot"]);
  });
});

describe("server", () => {
  test("serves the intake console and state endpoints on loopback", async () => {
    const { server, url } = await startServer(0);
    expect(url).toContain("127.0.0.1");
    const html = await fetch(url).then((r) => r.text());
    expect(html).toContain("VibeFlow");
    expect(html).toContain("new workflow"); // interactive intake wizard
    expect(html).toContain('id="intakeForm"');
    const state = await fetch(`${url}/state`);
    expect(state.status).toBe(200);
    server.close();
  });

  test("POST /api/init generates a workflow and rejects a missing CSRF token", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vf-srv-"));
    const orig = process.cwd();
    process.chdir(dir);
    try {
      const { server, url } = await startServer(0);
      const html = await fetch(url).then((r) => r.text());
      const token = (html.match(/name="csrf" content="([^"]+)"/) || [])[1];
      expect(token).toBeTruthy();

      const ok = await fetch(`${url}/api/init`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-vibeflow-token": token as string },
        body: JSON.stringify({ goal: "Ship dark mode", engines: ["claude"] }),
      });
      expect(ok.status).toBe(200);
      const body = (await ok.json()) as { state: WorkflowState; files: string[] };
      expect(body.state.goal).toBe("Ship dark mode");
      expect(body.files).toContain("vibeflow/WORKFLOW_STATE.json");

      const forbidden = await fetch(`${url}/api/init`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(forbidden.status).toBe(403);
      server.close();
    } finally {
      process.chdir(orig);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
