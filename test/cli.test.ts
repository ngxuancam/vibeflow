import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalFiles, defaultContext, dispatchPrompt, engineFiles } from "../src/adapters.js";
import {
  applyIntake,
  detectRepo,
  init,
  mutateUnits,
  resolveRepo,
  skillForFile,
  units,
} from "../src/commands.js";
import {
  ENGINES,
  type WorkflowState,
  parseFlags,
  readState,
  recomputeTotals,
} from "../src/core.js";
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

describe("commands.repo", () => {
  test("skillForFile maps extensions to reader skills", () => {
    expect(skillForFile("BRD.docx")).toBe("docx-reader");
    expect(skillForFile("data.xlsx")).toBe("xlsx-reader");
    expect(skillForFile("notes.md")).toBe("markdown-reader");
    expect(skillForFile("diagram.png")).toBe("image-ocr");
    expect(skillForFile("weird.unknownext")).toBe("generic-file-reader");
  });

  test("resolveRepo falls back to cwd for invalid paths", () => {
    expect(resolveRepo("/no/such/dir/anywhere")).toBe(process.cwd());
  });

  test("detectRepo reports engine markers present in a repo", () => {
    const dir = mkdtempSync(join(tmpdir(), "vf-det-"));
    try {
      const prev = process.cwd();
      process.chdir(dir);
      applyIntake({ engines: ["claude", "copilot"] }, { useAi: false, base: dir });
      process.chdir(prev);
      const det = detectRepo(dir);
      expect(det.engines.claude).toBe(true); // CLAUDE.md written
      expect(det.engines.copilot).toBe(true); // .github/copilot-instructions.md written
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("commands.units CRUD", () => {
  test("add, update, then delete a work unit and recompute totals", () => {
    const dir = mkdtempSync(join(tmpdir(), "vf-crud-"));
    try {
      applyIntake({ goal: "g", engines: ["claude"] }, { useAi: false, base: dir });

      let s = mutateUnits(dir, "add", { name: "auth", status: "running", confidence: 0.5 });
      expect(s?.work_units.length).toBe(1);
      expect(s?.totals.units).toBe(1);

      // duplicate name rejected
      expect(mutateUnits(dir, "add", { name: "auth" })).toBeNull();

      s = mutateUnits(dir, "update", { name: "auth", status: "done" });
      expect(s?.work_units[0]?.status).toBe("done");
      expect(s?.totals.done).toBe(1);

      s = mutateUnits(dir, "delete", { name: "auth" });
      expect(s?.work_units.length).toBe(0);

      // deleting a missing unit returns null
      expect(mutateUnits(dir, "delete", { name: "ghost" })).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("server write endpoints", () => {
  const tokenOf = (html: string) =>
    (html.match(/name="csrf" content="([^"]+)"/) || [])[1] as string;

  test("detect, units CRUD, and guarded uploads with filename sanitization", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vf-ep-"));
    const orig = process.cwd();
    process.chdir(dir);
    try {
      const { server, url } = await startServer(0);
      const token = tokenOf(await fetch(url).then((r) => r.text()));
      const hdr = { "content-type": "application/json", "x-vibeflow-token": token };

      // detect points the active repo at dir
      const det = await fetch(`${url}/api/detect`, {
        method: "POST",
        headers: hdr,
        body: JSON.stringify({ path: dir }),
      });
      expect(det.status).toBe(200);
      expect(((await det.json()) as { repo: string }).repo).toBe(dir);

      // init then add a unit via /api/units
      await fetch(`${url}/api/init`, {
        method: "POST",
        headers: hdr,
        body: JSON.stringify({ goal: "g", engines: ["claude"] }),
      });
      const add = await fetch(`${url}/api/units`, {
        method: "POST",
        headers: hdr,
        body: JSON.stringify({ action: "add", unit: { name: "u1", status: "running" } }),
      });
      expect(add.status).toBe(200);
      expect(((await add.json()) as { state: WorkflowState }).state.work_units.length).toBe(1);

      // upload a file (raw body) then confirm it landed and a skill was mapped
      const up = await fetch(`${url}/api/upload?name=spec.md`, {
        method: "POST",
        headers: { "x-vibeflow-token": token },
        body: "# hello",
      });
      expect(up.status).toBe(200);
      const upJson = (await up.json()) as { attachment: { skill: string } };
      expect(upJson.attachment.skill).toBe("markdown-reader");
      expect(existsSync(join(dir, "vibeflow", "attachments", "spec.md"))).toBe(true);

      // path-traversal filename is neutralized to its basename — it cannot escape the
      // attachments dir (saved as escape.txt INSIDE attachments, never at the repo root)
      const evil = await fetch(`${url}/api/upload?name=${encodeURIComponent("../escape.txt")}`, {
        method: "POST",
        headers: { "x-vibeflow-token": token },
        body: "x",
      });
      expect(evil.status).toBe(200);
      expect(existsSync(join(dir, "escape.txt"))).toBe(false); // did NOT escape
      expect(existsSync(join(dir, "vibeflow", "attachments", "escape.txt"))).toBe(true);

      // a separator/dotfile-only name is rejected outright
      const bad = await fetch(`${url}/api/upload?name=${encodeURIComponent("../../")}`, {
        method: "POST",
        headers: { "x-vibeflow-token": token },
        body: "x",
      });
      expect(bad.status).toBe(400);

      // upload without token is forbidden
      const noTok = await fetch(`${url}/api/upload?name=x.md`, { method: "POST", body: "x" });
      expect(noTok.status).toBe(403);

      // attachments mirrored into the saved ledger
      expect(readState(dir)?.attachments?.some((a) => a.name === "spec.md")).toBe(true);

      server.close();
    } finally {
      process.chdir(orig);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
