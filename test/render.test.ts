import { describe, expect, test } from "bun:test";
import {
  agentFilePath,
  renderClaudeAgent,
  renderCodexAgent,
  renderCopilotAgent,
  renderForEngine,
  safeAgentName,
} from "../src/agents/render.js";
import type { RoleSpec } from "../src/agents/role.js";

const SPEC: RoleSpec = {
  name: "cli-engine",
  description: "CLI specialist. Use proactively for any CLI flag.",
  body: "# CLI Engine\n\nYou handle command-line work.",
  tools: ["read", "write", "edit", "bash", "grep", "glob"],
  model: "sonnet",
  sandbox: "workspace-write",
};

describe("renderClaudeAgent", () => {
  test("emits YAML frontmatter + markdown body", () => {
    const out = renderClaudeAgent(SPEC);
    expect(out).toMatch(/^---/);
    expect(out).toMatch(/^name:\s+cli-engine/m);
    expect(out).toMatch(/^description:\s+CLI specialist/m);
    expect(out).toMatch(/^tools:\s+Read,\s+Write/m);
    expect(out).toMatch(/^model:\s+sonnet/m);
    expect(out).toContain("# CLI Engine");
  });
});

describe("renderCodexAgent", () => {
  test("emits TOML with name/description/developer_instructions", () => {
    const out = renderCodexAgent(SPEC);
    expect(out).toMatch(/^name = "cli-engine"/m);
    expect(out).toMatch(/^description = "CLI specialist/m);
    expect(out).toMatch(/^developer_instructions = """/m);
    expect(out).toMatch(/sandbox_mode = "workspace-write"/);
    expect(out).toMatch(/model = "gpt-5.4"/);
  });

  test("does not include Claude-only fields (tools list)", () => {
    const out = renderCodexAgent(SPEC);
    expect(out).not.toContain("tools = ");
    expect(out).not.toContain("permissionMode");
  });
});

describe("renderCopilotAgent", () => {
  test("emits Markdown + YAML frontmatter (different from Claude)", () => {
    const out = renderCopilotAgent(SPEC);
    expect(out).toMatch(/^---/);
    expect(out).toMatch(/^name:\s+cli-engine/m);
    expect(out).toMatch(/^description:\s+CLI specialist/m);
    expect(out).not.toMatch(/^model:\s+sonnet/m);
    expect(out).toContain("# CLI Engine");
  });
});

describe("escaping", () => {
  const tricky: RoleSpec = {
    name: "cli",
    description: 'CLI: a "dangerous" thing. With colon, hash #, and ---',
    body: 'Contains a triple: """ in the body, and backslash \\ here.',
    tools: ["read"],
    model: "sonnet",
  };
  test("claude YAML quoting escapes `:` and `#` so frontmatter is valid", () => {
    const out = renderClaudeAgent(tricky);
    // The first `---` must be the closing fence, not inside the description.
    const fences = [...out.matchAll(/^---$/gm)];
    expect(fences.length).toBe(2);
    // The description must be wrapped in quotes.
    expect(out).toMatch(/^description: "CLI: a \\"dangerous\\" thing/m);
  });
  test("codex TOML escapes triple-quote so multi-line body doesn't terminate early", () => {
    const out = renderCodexAgent(tricky);
    // We must end up with exactly 2 literal `"""` sequences (opener + final
    // closer). The body's embedded `"""` is escaped to `""\"` so it no
    // longer matches the 3-quote pattern.
    const fences = out.match(/"""/g);
    expect(fences).not.toBeNull();
    if (!fences) return;
    expect(fences.length).toBe(2);
    // The body is still in the file, after the opener and before the closer.
    const openerIdx = out.indexOf('developer_instructions = """');
    const closerIdx = out.lastIndexOf('"""');
    const body = out.slice(openerIdx, closerIdx);
    expect(body).toContain("Contains a triple");
    expect(body).toContain("\\\\");
  });
  test("codex TOML escapes newlines in name/description (basic string)", () => {
    const bad: RoleSpec = { ...SPEC, description: "line1\nline2" };
    expect(() => renderCodexAgent(bad)).toThrow();
  });
  test("safeAgentName strips path traversal", () => {
    expect(safeAgentName("../etc/passwd")).not.toContain("/");
    expect(safeAgentName("a/b\\c")).toBe("abc");
    expect(safeAgentName("cli-engine")).toBe("cli-engine");
  });
  test("agentFilePath sanitizes the name (no traversal)", () => {
    expect(agentFilePath("claude", "../etc/passwd")).toBe(".claude/agents/etcpasswd.md");
  });
});
