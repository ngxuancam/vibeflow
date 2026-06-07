import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const VERSION = "0.1.0";

/** Canonical context directory (hidden dotdir; renamed from ai-workflow → vibeflow → .viteflow). */
export const CTX_DIR = ".viteflow";

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

export interface Attachment {
  name: string;
  size: number;
  type: string;
  skill: string;
}

export interface WorkflowState {
  task_id: string;
  goal: string;
  success_criteria: string[];
  work_units: WorkUnit[];
  totals: { units: number; done: number; tokens: number; cost_usd: number; wall_seconds: number };
  repo_path?: string;
  attachments?: Attachment[];
}

// --- Skills (Anthropic skill-creator standard: SKILL.md folder) ---
export type SkillStatus = "verified" | "unverified" | "experimental" | "draft" | "deprecated";

export interface SkillRequires {
  filesystem?: "read" | "write" | "none";
  network?: boolean;
  shell?: boolean;
}

export interface Skill {
  name: string;
  description: string;
  version?: string;
  status: SkillStatus;
  capabilities?: string[];
  triggers?: string[];
  requires?: SkillRequires;
  /** Absolute path to the skill folder. */
  dir: string;
  /** Absolute path to the skill's SKILL.md. */
  path: string;
}

export interface SkillMatch {
  skill: Skill;
  reason: string;
  score: number;
}

// --- Hooks: universal protocol shared by every engine adapter ---
export type HookEvent =
  | "pre-tool-use"
  | "post-tool-use"
  | "pre-write"
  | "post-write"
  | "pre-command"
  | "post-command"
  | "stop"
  | "skill-compliance"
  | "verify-result";

export type HookDecision = "allow" | "warn" | "require_approval" | "block";
export type RiskLevel = "none" | "low" | "medium" | "high" | "critical";

export interface HookInput {
  event: HookEvent;
  tool?: string;
  workspace?: string;
  command?: string;
  files?: string[];
  agent?: string;
  taskId?: string;
  /** Declared scope of the active work unit (glob-ish prefixes). */
  scope?: string[];
  /** Free-text intent of the action, used to keep risk scoring intent-aware. */
  intent?: string;
}

export interface HookResult {
  decision: HookDecision;
  risk: RiskLevel;
  reasons: string[];
}

// --- Orchestration: investigation + debate (confidence < 1 handling) ---
export interface InvestigationRound {
  round: number;
  question: string;
  findings: string[];
  confidence: number;
}

export interface DebatePosition {
  agent: string;
  claim: string;
  evidence: string[];
}

export interface DebateResult {
  question: string;
  positions: DebatePosition[];
  resolution: string;
  confidence: number;
  rejected: string[];
}

export function cwd(): string {
  return process.cwd();
}

/** Base directory for a workflow. Defaults to the current working directory. */
export function ctxPath(...parts: string[]): string {
  return join(cwd(), CTX_DIR, ...parts);
}

/** Resolve a path inside a given base repo's canonical context dir. */
export function ctxPathIn(base: string, ...parts: string[]): string {
  return join(base, CTX_DIR, ...parts);
}

export function statePath(base: string = cwd()): string {
  return ctxPathIn(base, "WORKFLOW_STATE.json");
}

export function readState(base: string = cwd()): WorkflowState | null {
  const p = statePath(base);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as WorkflowState;
  } catch {
    return null;
  }
}

export function writeState(base: string, state: WorkflowState): void {
  writeFileSafe(statePath(base), JSON.stringify(state, null, 2));
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
