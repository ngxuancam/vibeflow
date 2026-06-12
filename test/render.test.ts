import { describe, expect, test } from "bun:test";
import {
  agentFilePath,
  renderClaudeAgent,
  renderCodexAgent,
  renderCopilotAgent,
  renderForEngine,
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

  test("does not include Claude-only fields (tools list, permissionMode)", () => {
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

describe("renderForEngine + agentFilePath", () => {
  test("renderForEngine dispatches by engine and agentFilePath matches engine convention", () => {
    expect(renderForEngine("claude", SPEC)).toBe(renderClaudeAgent(SPEC));
    expect(renderForEngine("codex", SPEC)).toBe(renderCodexAgent(SPEC));
    expect(renderForEngine("copilot", SPEC)).toBe(renderCopilotAgent(SPEC));
    expect(agentFilePath("claude", "x")).toBe(".claude/agents/x.md");
    expect(agentFilePath("codex", "x")).toBe(".codex/agents/x.toml");
    expect(agentFilePath("copilot", "x")).toBe(".github/agents/x.md");
  });
});
