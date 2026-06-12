import { describe, expect, test } from "bun:test";
import { agentFiles } from "../src/adapters.js";
import type { ProjectProfile } from "../src/scanner.js";

const PROFILE: ProjectProfile = {
  name: "demo",
  languages: ["TypeScript"],
  frameworks: ["React"],
  hasCI: false,
  manifests: ["package.json"],
  findings: [],
};

describe("agentFiles", () => {
  test("renders 3 files per role (claude/codex/copilot) at engine-specific paths", () => {
    const roles = ["cli-engine", "web-ui"] as const;
    const files = agentFiles(PROFILE, [...roles], false);
    // 2 roles × 3 engines = 6 files
    expect(Object.keys(files)).toHaveLength(6);
    expect(files[".claude/agents/cli-engine.md"]).toContain("name: cli-engine");
    expect(files[".codex/agents/cli-engine.toml"]).toContain('name = "cli-engine"');
    expect(files[".github/agents/cli-engine.md"]).toContain("name: cli-engine");
    expect(files[".claude/agents/web-ui.md"]).toBeDefined();
    expect(files[".codex/agents/web-ui.toml"]).toBeDefined();
    expect(files[".github/agents/web-ui.md"]).toBeDefined();
  });

  test("omits roles that have no spec (unknown role name)", () => {
    // Cast bypasses RoleName literal type — the point is that `agentFiles`
    // is robust to unknown role names (returns 3 files, not 6).
    const files = agentFiles(
      PROFILE,
      ["cli-engine", "not-a-real-role"] as unknown as Parameters<typeof agentFiles>[1],
      false,
    );
    expect(files[".claude/agents/cli-engine.md"]).toBeDefined();
    expect(files[".claude/agents/not-a-real-role.md"]).toBeUndefined();
    expect(Object.keys(files)).toHaveLength(3);
  });
});
