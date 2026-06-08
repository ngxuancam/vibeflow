import type { HookDecision, HookInput, HookResult, RiskLevel } from "../core.js";
import { scoreRisk } from "./risk.js";

/** Map a risk level to a guardrail decision (HOOKS_AND_GUARDRAILS.md vocabulary). */
function decisionFor(risk: RiskLevel): HookDecision {
  switch (risk) {
    case "critical":
      return "block";
    case "high":
      return "require_approval";
    case "medium":
      return "warn";
    default:
      return "allow";
  }
}

/** Env getter seam so the kill-switch is testable without mutating process.env. */
export type EnvGetter = () => NodeJS.ProcessEnv;

/** Values of VIBEFLOW_HOOKS that explicitly disable the hook-decision layer. */
const HOOKS_OFF_VALUES = new Set(["off", "0"]);

/**
 * Kill-switch check (item 4). FAIL SAFE: hooks are disabled ONLY when VIBEFLOW_HOOKS is the
 * explicit string `off` or `0`. Unset — or ANY unknown/garbage value — keeps hooks ON, so a
 * typo or injected junk can never silently fail open. This gates the hook-DECISION layer only;
 * the git pre-commit hook stays fail-closed independently (adapters.gitPreCommit), so disabling
 * here never bypasses that path.
 */
export function hooksDisabled(env: NodeJS.ProcessEnv): boolean {
  const raw = env.VIBEFLOW_HOOKS;
  return typeof raw === "string" && HOOKS_OFF_VALUES.has(raw.trim().toLowerCase());
}

/** A neutral allow result used when the kill-switch turns the hook-decision layer off. */
function disabledResult(): HookResult {
  return { decision: "allow", risk: "none", reasons: ["hooks disabled via VIBEFLOW_HOOKS"] };
}

/**
 * Evaluate a hook event into a decision. Pure: same input → same result, so it is
 * safe to run from any engine adapter or the git pre-commit hook. The kill-switch (item 4)
 * is consulted first via an injectable env getter (defaults to process.env).
 */
export function evaluateHook(input: HookInput, getEnv: EnvGetter = () => process.env): HookResult {
  if (hooksDisabled(getEnv())) return disabledResult();
  const { risk, reasons } = scoreRisk(input);
  return { decision: decisionFor(risk), risk, reasons };
}

const HOOK_EVENTS = [
  "pre-tool-use",
  "post-tool-use",
  "pre-write",
  "post-write",
  "pre-command",
  "post-command",
  "stop",
  "skill-compliance",
  "verify-result",
] as const;

/**
 * Map Claude Code's native `hook_event_name` to our internal HookEvent vocabulary.
 * Unknown-but-real Claude events fall through to "pre-tool-use" so a live tool gate
 * still gets evaluated (and yields allow for a benign action) rather than being rejected.
 */
function mapClaudeEvent(name: string): HookInput["event"] {
  switch (name) {
    case "PreToolUse":
      return "pre-tool-use";
    case "PostToolUse":
      return "post-tool-use";
    case "Stop":
    case "SubagentStop":
      return "stop";
    default:
      // A real Claude event we don't model explicitly: treat as a recognized no-op gate.
      return "pre-tool-use";
  }
}

/**
 * Parse Claude Code's native PreToolUse/PostToolUse/Stop stdin payload, which has NO
 * `event` field. Shape: {hook_event_name, tool_name, tool_input:{command|file_path|files}}.
 * Returns null if this isn't a Claude-native payload (so the caller can fail open distinctly).
 */
function parseClaudeNative(obj: Record<string, unknown>): HookInput | null {
  const eventName = obj.hook_event_name;
  if (typeof eventName !== "string") return null;
  const asStr = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
  const toolInput = (obj.tool_input ?? {}) as Record<string, unknown>;
  const filePath = typeof toolInput.file_path === "string" ? [toolInput.file_path] : undefined;
  const fileList = Array.isArray(toolInput.files) ? toolInput.files.map(String) : undefined;
  const files = filePath || fileList ? [...(filePath ?? []), ...(fileList ?? [])] : undefined;
  return {
    event: mapClaudeEvent(eventName),
    tool: asStr(obj.tool_name),
    workspace: asStr(obj.workspace ?? obj.cwd),
    command: asStr(toolInput.command),
    files,
  };
}

/**
 * Parse a raw hook payload (from stdin) into a validated HookInput, or null.
 * Tries the legacy `{event,...}` shape first (back-compat: git pre-commit + tests),
 * then falls back to Claude Code's native `{hook_event_name, tool_name, tool_input}` shape.
 */
export function parseHookInput(raw: string): HookInput | null {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  const event = obj.event;
  if (typeof event === "string" && HOOK_EVENTS.includes(event as HookInput["event"])) {
    const asStr = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
    const asStrArr = (v: unknown): string[] | undefined =>
      Array.isArray(v) ? v.map(String) : undefined;
    return {
      event: event as HookInput["event"],
      tool: asStr(obj.tool),
      workspace: asStr(obj.workspace),
      command: asStr(obj.command),
      files: asStrArr(obj.files),
      agent: asStr(obj.agent),
      taskId: asStr(obj.taskId),
      scope: asStrArr(obj.scope),
      intent: asStr(obj.intent),
    };
  }
  // No usable legacy `event` field — try Claude Code's native payload shape.
  return parseClaudeNative(obj);
}

/**
 * Exit code convention for the hook CLI. Claude Code only treats exit code 2 as a veto
 * (exit 1 is non-blocking and the action proceeds), so BOTH `block` and
 * `require_approval` must exit 2 — otherwise the approval gate silently fails open.
 * allow/warn proceed (exit 0).
 */
export function exitCodeFor(decision: HookDecision): number {
  if (decision === "block" || decision === "require_approval") return 2;
  return 0;
}

/**
 * Present a decision for the active event. For Claude PreToolUse events we emit the
 * documented structured JSON ("ask" path) so require_approval surfaces an approval
 * prompt; in every case the exit code blocks (2) on require_approval/block.
 */
export function presentDecision(
  result: HookResult,
  input: HookInput,
): { json: string; exitCode: number } {
  const exitCode = exitCodeFor(result.decision);
  if (input.event === "pre-tool-use" && result.decision === "require_approval") {
    const json = JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: result.reasons.join("; "),
      },
    });
    return { json, exitCode };
  }
  return { json: JSON.stringify(result), exitCode };
}
