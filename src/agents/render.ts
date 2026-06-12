import type { RoleModel, RoleSpec, ToolIntent } from "./role.js";

/** Engine keys consumed by `renderForEngine` / `agentFilePath`. */
export type AgentEngine = "claude" | "codex" | "copilot";

/** Map from engine-agnostic `ToolIntent` to Claude Code's tool names. */
const CLAUDE_TOOL_MAP: Record<ToolIntent, string> = {
  read: "Read",
  write: "Write",
  edit: "Edit",
  bash: "Bash",
  grep: "Grep",
  glob: "Glob",
  web: "WebFetch",
};

/** Map from canonical role model identifiers to Codex model identifiers.
 * Claude-only values (`haiku`, `sonnet`, `opus`) map to the closest
 * Codex equivalent. Codex-specific identifiers pass through unchanged. */
const CODEX_MODEL_MAP: Record<string, string> = {
  haiku: "gpt-5.4-mini",
  sonnet: "gpt-5.4",
  opus: "gpt-5.4",
};

/** Strip Claude-only model aliases when rendering Codex TOML. Codex
 * identifiers are kept as-is. */
function codexModel(model: RoleModel): string {
  if (model.startsWith("gpt-")) return model;
  return CODEX_MODEL_MAP[model] ?? model;
}

/** Quote a TOML basic string. Disallows control chars and ensures
 * newlines/tabs are not used (basic strings must be a single line). For
 * multi-line content use `"""..."""` instead. */
function tomlQuote(s: string): string {
  if (/[\n\r\t\0\b\f\v]/.test(s)) {
    throw new Error("tomlQuote: use triple-string for multi-line content");
  }
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Quote a scalar string for YAML frontmatter. Wraps in double quotes only
 * when needed (value contains `:`, `#`, `&`, `*`, `!`, `>`, `<`, `-`, `[`, `]`,
 * `{`, `}`, or begins with `?`/`-`/`!`). Escapes embedded `"` and `\` per
 * the YAML 1.2 spec. */
function yamlQuote(s: string): string {
  const SAFE = /^[A-Za-z0-9_\-./][A-Za-z0-9_\-./\s]*$/;
  if (SAFE.test(s) && !/[\:#&*!<>{}\[\]?]/.test(s)) return s;
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Sanitize an agent name to a path-safe segment. Strips path traversal
 * sequences so the result can only ever be a single directory entry. */
export function safeAgentName(name: string): string {
  // Drop directory separators and parent references, then collapse.
  const stripped = name.replace(/[\\/]+/g, "").replace(/\.\.+/g, "");
  // If nothing left, fall back to a placeholder (caller can decide).
  return stripped || "_invalid";
}

/** Render a Claude Code agent file: Markdown + YAML frontmatter.
 * Path on disk: `.claude/agents/<name>.md`. */
export function renderClaudeAgent(spec: RoleSpec): string {
  const tools = spec.tools.map((t) => CLAUDE_TOOL_MAP[t]).join(", ");
  return [
    "---",
    `name: ${yamlQuote(spec.name)}`,
    `description: ${yamlQuote(spec.description)}`,
    `tools: ${tools}`,
    `model: ${spec.model}`,
    "permissionMode: default",
    "---",
    "",
    spec.body,
  ].join("\n");
}

/** Render a Codex agent file: TOML config. Path: `.codex/agents/<name>.toml`.
 * Body content goes inside a `developer_instructions = """..."""` block.
 * Per the TOML spec, inside a literal multi-line string `"""` terminates
 * the string early — escape any `"""` substring to `""\"`. Backslashes
 * are also escaped. We do the `"""` escape FIRST so we don't double-escape
 * the backslashes we just inserted. */
export function renderCodexAgent(spec: RoleSpec): string {
  const model = codexModel(spec.model);
  const sandbox = spec.sandbox ? `sandbox_mode = "${spec.sandbox}"\n` : "";
  // 1. Escape `"""` sequences first (TOML terminator).
  // 2. Then escape backslashes (don't touch the `\` we just inserted).
  const body = spec.body.replace(/"""/g, '""\\"').replace(/\\/g, "\\\\");
  return [
    `name = "${tomlQuote(spec.name)}"`,
    `description = "${tomlQuote(spec.description)}"`,
    `developer_instructions = """`,
    body,
    `"""`,
    `model = "${model}"`,
    sandbox,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Render a GitHub Copilot agent file: Markdown + YAML frontmatter, but
 * with `tools` as a YAML list (Copilot's schema differs from Claude's
 * comma-separated string). No `model` field — Copilot doesn't expose one.
 * Path: `.github/agents/<name>.md`. */
export function renderCopilotAgent(spec: RoleSpec): string {
  const toolsList = spec.tools.map((t) => `  - ${CLAUDE_TOOL_MAP[t]}`).join("\n");
  return [
    "---",
    `name: ${yamlQuote(spec.name)}`,
    `description: ${yamlQuote(spec.description)}`,
    "tools:",
    toolsList,
    "---",
    "",
    spec.body,
  ].join("\n");
}

/** Render the agent file body for a given engine. */
export function renderForEngine(engine: AgentEngine, spec: RoleSpec): string {
  switch (engine) {
    case "claude":
      return renderClaudeAgent(spec);
    case "codex":
      return renderCodexAgent(spec);
    case "copilot":
      return renderCopilotAgent(spec);
  }
}

/** The canonical path on disk for an agent file, per engine. */
export function agentFilePath(engine: AgentEngine, name: string): string {
  const safe = safeAgentName(name);
  switch (engine) {
    case "claude":
      return `.claude/agents/${safe}.md`;
    case "codex":
      return `.codex/agents/${safe}.toml`;
    case "copilot":
      return `.github/agents/${safe}.md`;
  }
}
