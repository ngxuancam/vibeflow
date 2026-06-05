import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const VERSION = "0.1.0";

/** Canonical context directory (renamed from ai-workflow → vibeflow). */
export const CTX_DIR = "vibeflow";

export type Engine = "claude" | "codex" | "copilot";
export const ENGINES: Engine[] = ["claude", "codex", "copilot"];

export type GateState = "pass" | "fail" | "running" | "pending";

export interface WorkUnit {
  name: string;
  status: "pending" | "running" | "verifying" | "done" | "blocked";
  confidence: number;
  owner_agent?: string;
  skills_used?: string[];
  scope?: string[];
  gates: Record<"build" | "lint" | "test" | "review", GateState>;
  resources: { agents: number; tokens: number; cost_usd: number; wall_seconds: number };
  evidence?: string[];
}

export interface WorkflowState {
  task_id: string;
  goal: string;
  success_criteria: string[];
  work_units: WorkUnit[];
  totals: { units: number; done: number; tokens: number; cost_usd: number; wall_seconds: number };
}

export function cwd(): string {
  return process.cwd();
}

export function ctxPath(...parts: string[]): string {
  return join(cwd(), CTX_DIR, ...parts);
}

export function statePath(): string {
  return ctxPath("WORKFLOW_STATE.json");
}

export function readState(): WorkflowState | null {
  const p = statePath();
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as WorkflowState;
  } catch {
    return null;
  }
}

export function writeFileSafe(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content.endsWith("\n") ? content : `${content}\n`);
}

export function recomputeTotals(s: WorkflowState): WorkflowState {
  s.totals = {
    units: s.work_units.length,
    done: s.work_units.filter((u) => u.status === "done").length,
    tokens: s.work_units.reduce((a, u) => a + u.resources.tokens, 0),
    cost_usd: Number(s.work_units.reduce((a, u) => a + u.resources.cost_usd, 0).toFixed(4)),
    wall_seconds: s.work_units.reduce((a, u) => a + u.resources.wall_seconds, 0),
  };
  return s;
}

/** Detect whether a command exists on PATH. */
export function hasCommand(cmd: string): boolean {
  const probe = process.platform === "win32" ? "where" : "command";
  const args = process.platform === "win32" ? [cmd] : ["-v", cmd];
  const r = spawnSync(probe, args, { stdio: "ignore", shell: process.platform === "win32" });
  return r.status === 0;
}

export function isGitRepo(): boolean {
  return existsSync(join(cwd(), ".git")) || existsSync(resolve(cwd(), ".git"));
}

// --- tiny ANSI helpers (no dependency) ---
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code: number) => (s: string) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
export const c = {
  bold: wrap(1),
  dim: wrap(2),
  red: wrap(31),
  green: wrap(32),
  yellow: wrap(33),
  blue: wrap(34),
  cyan: wrap(36),
};

export function parseFlags(args: string[]): {
  positionals: string[];
  flags: Record<string, string | boolean>;
} {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i] as string;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("-")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags };
}
