// src/orchestrator/scoped-gate.ts
//
// W4: a per-unit gate that runs typecheck + scoped biome for
// just ONE work unit's declared file scope — instead of the whole-repo
// `bun run check`. The full check still runs ONCE at the end of orchestration
// as the integration signal; this scoped gate is the fast per-unit belt-and-
// braces so a unit isn't graded green on a self-report alone, and isn't failed
// by an UNRELATED file another parallel unit touched.
//
// The command runner is injected (`run`) so tests drive every branch without
// shelling out real `tsc`/`biome`/`node` (which would crater coverage and be
// slow + non-deterministic). This is the inject-seam pattern, NOT mock.module.

import { spawnSync } from "node:child_process";

/** The result shape of one command invocation the gate consumes. */
export interface GateRunResult {
  status: number | null;
  stdout: string;
}

/** Injectable command runner. `cmd` is the full command string (e.g.
 *  "bunx biome check src/a.ts"); `cwd` is the directory to run it in
 *  (the unit's worktree under W1 isolation, or the repo root otherwise). */
export type GateRunner = (cmd: string, cwd: string) => GateRunResult;

/** Which gate failed, for a precise, actionable message. */
// NB: scopedGate no longer emits "coverage" — the final `bun run check` owns coverage. Kept in the union for back-compat.
export type FailedGate = "typecheck" | "biome" | "coverage";

export interface ScopedGateInput {
  /** The unit's declared file scope (paths relative to cwd). */
  scope: readonly string[];
  /** Directory to run the gates in. */
  cwd: string;
  /** Injectable runner. Defaults to a real spawnSync-backed runner. */
  run?: GateRunner;
}

export interface ScopedGateResult {
  pass: boolean;
  /** Set only when pass === false. */
  failedGate?: FailedGate;
  /** Human-readable detail (the failing command's first error line). */
  detail?: string;
}

/** Default runner: spawnSync the command string, capture stdout+stderr.
 *  Exported for direct unit testing (so the seam's own logic is covered
 *  without driving the whole scopedGate pipeline through real tools). */
export function defaultRun(cmd: string, cwd: string): GateRunResult {
  const parts = cmd.split(" ").filter((s) => s.length > 0);
  const bin = parts[0] ?? "";
  // Guard an empty command — spawnSync("") throws ENOENT; surface it as a
  // non-zero status instead so the gate treats it as a failure, not a crash.
  if (bin.length === 0) return { status: 1, stdout: "" };
  const args = parts.slice(1);
  const r = spawnSync(bin, args, { cwd, encoding: "utf8" });
  const stdout =
    (typeof r.stdout === "string" ? r.stdout : "") + (typeof r.stderr === "string" ? r.stderr : "");
  return { status: r.status, stdout };
}

/** Extract the first meaningful line of output for the failure detail. */
function firstSignal(stdout: string): string {
  for (const line of stdout.split("\n")) {
    const t = line.trim();
    if (t.length > 0) return t;
  }
  return "";
}

/**
 * Run the scoped gate for one unit. Order: typecheck (whole-project — a
 * scope-only typecheck can't see cross-file types) → biome (scoped to the
 * unit's files). The first failing gate short-circuits.
 *
 * An empty scope is a pass no-op (nothing to gate).
 */
export function scopedGate(input: ScopedGateInput): ScopedGateResult {
  const { scope, cwd } = input;
  const run = input.run ?? defaultRun;

  // Nothing to gate.
  if (scope.length === 0) return { pass: true };

  // 1. Typecheck — whole project (cross-file types). This is the one
  //    non-scoped check the unit still runs.
  const tc = run("bunx tsc --noEmit", cwd);
  if (tc.status !== 0) {
    return { pass: false, failedGate: "typecheck", detail: firstSignal(tc.stdout) };
  }

  // 2. Biome — scoped to the unit's files only.
  const biome = run(`bunx biome check ${scope.join(" ")}`, cwd);
  if (biome.status !== 0) {
    return { pass: false, failedGate: "biome", detail: firstSignal(biome.stdout) };
  }

  return { pass: true };
}

/** The function type of {@link scopedGate}. Single source of truth for the gate
 *  parameter on {@link makeDispatcher} — imported by dispatch-runtime via the
 *  _shared barrel so W-A's inline type moves to the gate's own module. */
export type ScopedGateFn = typeof scopedGate;
