/**
 * Engine-agnostic role specification.
 *
 * A `RoleSpec` describes one specialist role (e.g. "cli-engine") that can be
 * routed to by an engine (Claude Code / Codex / GitHub Copilot). Engine-
 * specific renderers (see `./render.ts`) consume the spec and emit each
 * engine's native format. Keeping the spec engine-agnostic means a single
 * source of truth is shared across all three engines.
 */

/** Tool intents the role needs. The renderer maps each intent to the
 * engine's native tool name (e.g. `read` → `Read` for Claude). */
export type ToolIntent = "read" | "write" | "edit" | "bash" | "grep" | "glob" | "web";

/** Supported model identifiers across engines. The renderer maps from
 * these canonical values to engine-specific strings (e.g. `sonnet` →
 * `gpt-5.4` for Codex). */
export type RoleModel =
  | "haiku"
  | "sonnet"
  | "opus"
  | "gpt-5.4"
  | "gpt-5.4-mini"
  | "gpt-5.3-codex-spark"
  | "gpt-5.4-codex";

/** Codex sandbox mode. Ignored by Claude/Copilot renderers. */
export type RoleSandbox = "read-only" | "workspace-write" | "danger-full-access";

/** A single engine-agnostic role spec. */
export interface RoleSpec {
  /** Kebab-case unique name (e.g. `cli-engine`). */
  name: string;
  /** Short routing trigger description — engines match user requests
   * against this string. Should be one sentence, non-empty. */
  description: string;
  /** Markdown system prompt body the role executes under. */
  body: string;
  /** Engine-agnostic tool intents the role needs. */
  tools: ToolIntent[];
  /** Model identifier; renderer maps to engine-specific form. */
  model: RoleModel;
  /** Codex sandbox mode. Other engines ignore this field. */
  sandbox?: RoleSandbox;
}
