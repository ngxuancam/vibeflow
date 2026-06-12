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

/** Render a Claude Code agent file: Markdown + YAML frontmatter.
 * Path on disk: `.claude/agents/<name>.md`. */
export function renderClaudeAgent(spec: RoleSpec): string {
  const tools = spec.tools.map((t) => CLAUDE_TOOL_MAP[t]).join(", ");
  return [
    "---",
    `name: ${spec.name}`,
    `description: ${spec.description}`,
    `tools: ${tools}`,
    `model: ${spec.model}`,
    "permissionMode: default",
    "---",
    "",
    spec.body,
  ].join("\n");
}

/** Render a Codex agent file: TOML config. Path: `.codex/agents/<name>.toml`.
 * Body content goes inside a `developer_instructions = """..."""` block;
 * `"\"` and `"""` are escaped so user markdown survives the round-trip. */
export function renderCodexAgent(spec: RoleSpec): string {
  const model = codexModel(spec.model);
  const sandbox = spec.sandbox ? `sandbox_mode = "${spec.sandbox}"\n` : "";
  // Triple-quote string: must escape literal `"""` and backslashes per TOML.
  const body = spec.body.replace(/\\/g, "\\\\").replace(/"""/g, '\\"\\"\\"');
  return [
    `name = "${spec.name}"`,
    `description = "${spec.description.replace(/"/g, '\\"')}"`,
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
    `name: ${spec.name}`,
    `description: ${spec.description}`,
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
  switch (engine) {
    case "claude":
      return `.claude/agents/${name}.md`;
    case "codex":
      return `.codex/agents/${name}.toml`;
    case "copilot":
      return `.github/agents/${name}.md`;
  }
}
