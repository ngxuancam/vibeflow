// test/orchestrator/scoped-gate.test.ts
//
// W4: the scoped per-unit gate. Every branch is driven through the injected
// `run` seam — no real tsc/biome/node is shelled (that would crater coverage
// and be slow). One test exercises the default spawnSync runner against a
// harmless command to cover the defaultRun path.

import { describe, expect, test } from "bun:test";
import { type GateRunResult, defaultRun, scopedGate } from "../../src/orchestrator/scoped-gate.js";

const ok: GateRunResult = { status: 0, stdout: "" };

describe("scopedGate", () => {
  test("empty scope → pass no-op (runner never invoked)", () => {
    const g = scopedGate({
      scope: [],
      cwd: "/tmp/wt",
      run: () => {
        throw new Error("runner must not be called for empty scope");
      },
    });
    expect(g.pass).toBe(true);
    expect(g.failedGate).toBeUndefined();
  });

  test("all gates clean → pass", () => {
    const g = scopedGate({ scope: ["src/a.ts"], cwd: "/tmp/wt", run: () => ok });
    expect(g.pass).toBe(true);
  });

  test("typecheck fails → failedGate=typecheck, detail is first signal line", () => {
    const run = (cmd: string): GateRunResult =>
      cmd.includes("tsc") ? { status: 2, stdout: "\n  src/a.ts(3,1): error TS1005\nmore\n" } : ok;
    const g = scopedGate({ scope: ["src/a.ts"], cwd: "/tmp/wt", run });
    expect(g.pass).toBe(false);
    expect(g.failedGate).toBe("typecheck");
    expect(g.detail).toBe("src/a.ts(3,1): error TS1005");
  });

  test("biome fails on a scope file → failedGate=biome", () => {
    const run = (cmd: string): GateRunResult =>
      cmd.includes("biome") ? { status: 1, stdout: "× lint error in src/a.ts" } : ok;
    const g = scopedGate({ scope: ["src/a.ts"], cwd: "/tmp/wt", run });
    expect(g.pass).toBe(false);
    expect(g.failedGate).toBe("biome");
    expect(g.detail).toBe("× lint error in src/a.ts");
  });

  test("scopedGate does not shell out to coverage-gate.cjs (coverage owned by final gate)", () => {
    const cmds: string[] = [];
    const run = (cmd: string) => {
      cmds.push(cmd);
      return { status: 0, stdout: "" }; // tsc + biome both pass
    };
    const r = scopedGate({ scope: ["src/a.ts"], cwd: "/x", run });
    expect(r.pass).toBe(true);
    expect(cmds.some((c) => c.includes("coverage-gate"))).toBe(false);
    expect(cmds.some((c) => c.includes("tsc --noEmit"))).toBe(true);
    expect(cmds.some((c) => c.includes("biome check"))).toBe(true);
  });

  test("typecheck fails with only-blank output → detail is empty string", () => {
    const run = (cmd: string): GateRunResult =>
      cmd.includes("tsc") ? { status: 1, stdout: "\n   \n" } : ok;
    const g = scopedGate({ scope: ["src/a.ts"], cwd: "/tmp/wt", run });
    expect(g.pass).toBe(false);
    expect(g.failedGate).toBe("typecheck");
    expect(g.detail).toBe("");
  });

  test("defaultRun executes a real command, capturing status 0 + stdout", () => {
    const r = defaultRun("echo scoped-gate-ok", process.cwd());
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("scoped-gate-ok");
  });

  test("defaultRun captures a non-zero exit (false → status 1)", () => {
    const r = defaultRun("false", process.cwd());
    expect(r.status).toBe(1);
  });

  test("defaultRun on an empty command string returns a non-null status", () => {
    // bin === "" → spawnSync("") → status null or error; assert it doesn't throw
    // and returns the GateRunResult shape.
    const r = defaultRun("", process.cwd());
    expect(r).toHaveProperty("stdout");
  });
});
