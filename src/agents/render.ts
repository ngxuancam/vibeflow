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
 * the YAML 1.2 spec.
 *
 * Defect (round-2 review): the old SAFE class included `\s` which matched
 * `\n`, so a description with a newline emitted broken YAML frontmatter.
 * The new code rejects any ASCII control char (\x00-\x1f) with a clear
 * error message. Caller (RoleSpec build) must pre-clean values.
 *
 * Exported for direct test coverage. */
export function yamlQuote(s: string): string {
  // No scalar in YAML 1.2 can contain a literal control char unquoted
  // (newlines, tabs, NUL, etc.). Refuse to emit broken frontmatter.
  // Biome rejects control chars in regex literals, so we use a string
  // comparison via a charCodeAt loop instead of a single regex.
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) < 0x20) {
      throw new Error(
        `yamlQuote: control char in value — caller must pre-clean (was: ${JSON.stringify(s.slice(0, 40))})`,
      );
    }
  }
  // Safe to emit unquoted: only letters, digits, _, -, ., /, and a single
  // space (no newlines, no colons, no special indicators).
  // The SAFE class deliberately excludes \s (whitespace includes \n).
  const SAFE = /^[A-Za-z0-9_\-./][A-Za-z0-9_\-./ ]*$/;
  const HAS_SPECIAL = /[:#&*!<>{}\[\]?,|`'%@]/;
  if (SAFE.test(s) && !HAS_SPECIAL.test(s)) return s;
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Sanitize an agent name to a path-safe segment. Strips path traversal
 * sequences (`.` segments that are path components, not name parts) and
 * directory separators. Preserves legit `.` characters within names like
 * "v1.0" or "role..v1". Returns `_invalid` for inputs that reduce to
 * nothing (single dot, parent references, empty). */
export function safeAgentName(name: string): string {
  if (name.length === 0) return "_invalid";
  // Replace path separators with a private sentinel we can later split on
  // without confusing the result with names that legitimately contain
  // underscores. The sentinel char NUL is not a valid filename char on
  // any supported OS so collision risk is zero.
  const SENTINEL = "\0";
  const segments = name
    .replace(/[\\/]+/g, SENTINEL)
    .split(SENTINEL)
    .map((s) => s.trim())
    .filter((s) => s !== "" && s !== "." && s !== "..")
    // Join with single underscore — preserves adjacent underscores in the
    // original (they remain as part of the joined segments).
    .join("_");
  if (segments.length === 0) return "_invalid";
  // Defence-in-depth: if the result happens to be exactly "_invalid" (a
  // legit-looking name that happens to match the placeholder), prefix
  // to disambiguate. Without this, a caller cannot tell whether
  // `safeAgentName("_invalid")` returned because the user supplied a
  // role literally named "_invalid" or because the input was invalid.
  if (segments === "_invalid") return "u_invalid";
  return segments;
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

/** The canonical path on disk for an agent file, per engine. Throws
 * when the supplied name reduces to `_invalid` (caller is expected to
 * filter out invalid role names from the registry or the user input
 * BEFORE calling this; silently writing to `_invalid.md` would mask
 * collisions and lose data on re-init). */
export function agentFilePath(engine: AgentEngine, name: string): string {
  const safe = safeAgentName(name);
  if (safe === "_invalid") {
    throw new Error(
      `agentFilePath: invalid name '${name}' sanitises to '_invalid' placeholder; fix the input`,
    );
  }
  switch (engine) {
    case "claude":
      return `.claude/agents/${safe}.md`;
    case "codex":
      return `.codex/agents/${safe}.toml`;
    case "copilot":
      return `.github/agents/${safe}.md`;
  }
}
