import { isAbsolute, resolve } from "node:path";
import type { HookInput, RiskLevel } from "../core.js";

/** Other destructive/irreversible command patterns — critical risk. */
const DANGEROUS_COMMAND = [
  /\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f|branch\s+-D)\b/,
  /\b(drop\s+(database|table)|truncate\s+table)\b/i,
  /\b(mkfs|dd\s+if=|:\(\)\s*\{)/,
  /\bchmod\s+-R\s+777\b/,
  /\bcurl\b.*\|\s*(sh|bash)\b/,
  /\bsudo\b/,
];

/** Package-install commands — medium risk (supply-chain, side effects). */
const INSTALL_COMMAND = [
  /\b(npm|pnpm|yarn|bun)\s+(install|add|i)\b/,
  /\bpip\s+install\b/,
  /\b(go\s+get|cargo\s+add|gem\s+install)\b/,
];

/** Highly sensitive secrets — reading or writing these is critical (block). */
const SECRET_CRITICAL = [/(^|[\s/])\.env(\.[\w-]+)?($|[\s/])/, /\bid_rsa\b/, /\bid_ed25519\b/];

/** Other secret-ish material — high risk (require approval). */
const SECRET_HIGH = [/\.pem\b/, /(^|\/)\.ssh\//, /\bsecrets?\b/i, /\bcredentials?\b/i];

/** Paths that should never be edited without explicit approval (file-based events). */
const PROTECTED_PATH = [
  /(^|\/)\.env(\.|$)/,
  /(^|\/)\.git\//,
  /(^|\/)(id_rsa|id_ed25519|.*\.pem)$/,
  /(^|\/)\.ssh\//,
  /(^|\/)secrets?\b/i,
  /(^|\/)credentials?\b/i,
];

const RISK_ORDER: RiskLevel[] = ["none", "low", "medium", "high", "critical"];

function anyMatch(patterns: RegExp[], value: string): boolean {
  return patterns.some((re) => re.test(value));
}

/** Split a shell command into whitespace-separated tokens. */
function tokenize(cmd: string): string[] {
  return cmd.trim().split(/\s+/).filter(Boolean);
}

/** Basename of a program token (`/bin/rm` → `rm`). */
function programName(token: string | undefined): string {
  if (!token) return "";
  const parts = token.split("/");
  return parts[parts.length - 1] ?? "";
}

/** True when an `rm` invocation deletes recursively (the dangerous mode). */
function isRecursiveRm(tokens: string[]): boolean {
  if (programName(tokens[0]) !== "rm") return false;
  return tokens.slice(1).some((t) => {
    if (t === "--recursive") return true;
    // short flag cluster containing r or R, e.g. -r, -R, -rf, -fr, -Rf
    return /^-[a-z]*[rR][a-z]*$/i.test(t);
  });
}

type ForceKind = "none" | "force" | "lease";

/** Classify a `git push` force flag: hard force (critical) vs --force-with-lease (safer). */
function gitPushForce(tokens: string[]): ForceKind {
  if (programName(tokens[0]) !== "git" || tokens[1] !== "push") return "none";
  const rest = tokens.slice(2);
  if (rest.some((t) => t === "--force-with-lease")) return "lease";
  if (rest.some((t) => t === "-f" || t === "--force" || /^-[a-z]*f[a-z]*$/i.test(t)))
    return "force";
  return "none";
}

/** Path-like argument tokens (skip flags and plain words like subcommands). */
function pathArgs(tokens: string[]): string[] {
  return tokens
    .slice(1)
    .filter((t) => !t.startsWith("-") && (t.includes("/") || t.startsWith("~") || isAbsolute(t)));
}

/** True when a path argument resolves outside the workspace root. */
function escapesWorkspace(path: string, workspace: string): boolean {
  if (path.startsWith("~")) return true;
  const target = resolve(workspace, path);
  const root = resolve(workspace);
  return target !== root && !target.startsWith(`${root}/`);
}

/**
 * Score the risk of a hook event from its command, files, and declared scope.
 * Diff/scope/intent-aware to keep false positives low (HOOKS_AND_GUARDRAILS.md).
 */
export function scoreRisk(input: HookInput): { risk: RiskLevel; reasons: string[] } {
  const reasons: string[] = [];
  let risk: RiskLevel = "none";
  const bump = (level: RiskLevel) => {
    if (RISK_ORDER.indexOf(level) > RISK_ORDER.indexOf(risk)) risk = level;
  };

  scoreCommand(input, bump, reasons);
  scoreFiles(input, bump, reasons);

  if (reasons.length === 0) reasons.push("no risk signals detected");
  return { risk, reasons };
}

/** Risk signals from the command string (destructive ops, secrets, workspace escape). */
function scoreCommand(input: HookInput, bump: (l: RiskLevel) => void, reasons: string[]): void {
  const cmd = input.command ?? "";
  if (!cmd) return;
  const tokens = tokenize(cmd);

  if (isRecursiveRm(tokens) || anyMatch(DANGEROUS_COMMAND, cmd)) {
    bump("critical");
    reasons.push(`destructive command: ${cmd.slice(0, 80)}`);
  }
  const force = gitPushForce(tokens);
  if (force === "force") {
    bump("critical");
    reasons.push("force push overwrites remote history");
  } else if (force === "lease") {
    bump("high");
    reasons.push("force-with-lease push needs approval");
  }

  if (anyMatch(SECRET_CRITICAL, cmd)) {
    bump("critical");
    reasons.push("command reads/writes a sensitive secret");
  } else if (anyMatch(SECRET_HIGH, cmd)) {
    bump("high");
    reasons.push("command touches secret material");
  }

  if (input.workspace) {
    const escaped = pathArgs(tokens).filter((p) => escapesWorkspace(p, input.workspace as string));
    if (escaped.length) {
      bump("high");
      reasons.push(`command escapes workspace: ${escaped.join(", ")}`);
    }
  }

  if (anyMatch(INSTALL_COMMAND, cmd)) {
    bump("medium");
    reasons.push("package install has side effects");
  } else {
    bump("low");
  }
}

/** Risk signals from file targets (protected paths, scope/workspace escape). */
function scoreFiles(input: HookInput, bump: (l: RiskLevel) => void, reasons: string[]): void {
  const files = input.files ?? [];

  const protectedHits = files.filter((f) => anyMatch(PROTECTED_PATH, f));
  if (protectedHits.length) {
    bump("high");
    reasons.push(`touches protected path(s): ${protectedHits.join(", ")}`);
  }

  const escaped = outOfScope(files, input.scope);
  if (escaped.length) {
    bump("high");
    reasons.push(`out of declared scope: ${escaped.join(", ")}`);
  }

  if (input.workspace) {
    const outside = files.filter((f) => escapesWorkspace(f, input.workspace as string));
    if (outside.length) {
      bump("high");
      reasons.push(`write escapes workspace: ${outside.join(", ")}`);
    }
  }
}

/** Files lying outside every declared scope prefix of the work unit. */
function outOfScope(files: string[], scope?: string[]): string[] {
  if (!scope || !scope.length) return [];
  const prefixes = scope.map((s) => s.replace(/\*+$/, "").replace(/\/$/, ""));
  return files.filter((f) => !prefixes.some((p) => p === "" || f.startsWith(p)));
}
