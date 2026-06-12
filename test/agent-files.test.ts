import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentFiles } from "../src/adapters.js";
import { detectRolesForRepo } from "../src/agents/detect-roles.js";
import type { RoleName } from "../src/agents/role-templates.js";

describe("agentFiles integration", () => {
  let repo: string;

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "vf-agent-files-"));
    mkdirSync(join(repo, "src"));
    writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "x", version: "0.0.0" }));
    writeFileSync(join(repo, "src", "cli.ts"), "// cli entry");
    writeFileSync(join(repo, "src", "server.ts"), "// web server");
    writeFileSync(join(repo, "README.md"), "# test");
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  test("detectRolesForRepo returns cli-engine, web-ui, doc-writer for a typical project", () => {
    const roles = detectRolesForRepo(repo);
    expect(roles).toContain("cli-engine");
    expect(roles).toContain("web-ui");
    expect(roles).toContain("doc-writer");
  });

  test("agentFiles emits 3 files per role (claude/codex/copilot)", () => {
    const profile = {
      name: "x",
      summary: "test",
      languages: ["TypeScript"],
      frameworks: [],
      buildCommand: "bun run build",
      testCommand: "bun test",
      lintCommand: "bun run lint",
      packageManager: "bun",
      hasCI: false,
      manifests: [],
      findings: [
        {
          component: "language",
          value: "TypeScript",
          evidence: ["package.json"],
          confidence: "high" as const,
        },
        {
          component: "runtime",
          value: "Bun",
          evidence: ["bun.lockb"],
          confidence: "high" as const,
        },
      ],
    };
    const roles: RoleName[] = ["cli-engine", "web-ui", "doc-writer"];
    const files = agentFiles(profile, roles, false);
    for (const role of roles) {
      expect(files[`.claude/agents/${role}.md`]).toBeDefined();
      expect(files[`.codex/agents/${role}.toml`]).toBeDefined();
      expect(files[`.github/agents/${role}.md`]).toBeDefined();
    }
  });

  test("Claude agent file is valid YAML frontmatter", () => {
    const profile = {
      name: "x",
      summary: "test",
      languages: ["TypeScript"],
      frameworks: [],
      buildCommand: "x",
      testCommand: "x",
      lintCommand: "x",
      packageManager: "bun",
      hasCI: false,
      manifests: [],
      findings: [],
    };
    const out = agentFiles(profile, ["doc-writer"], false)[".claude/agents/doc-writer.md"];
    expect(out).toBeDefined();
    // Valid frontmatter must have exactly 2 `---` fences at line start.
    const fences = [...(out ?? "").matchAll(/^---$/gm)];
    expect(fences.length).toBe(2);
  });

  test("Codex agent file has developer_instructions triple-string body", () => {
    const profile = {
      name: "x",
      summary: "test",
      languages: ["TypeScript"],
      frameworks: [],
      buildCommand: "x",
      testCommand: "x",
      lintCommand: "x",
      packageManager: "bun",
      hasCI: false,
      manifests: [],
      findings: [],
    };
    const out = agentFiles(profile, ["doc-writer"], false)[".codex/agents/doc-writer.toml"];
    if (!out) throw new Error("missing toml output");
    // Opening fence at line start.
    expect(out).toMatch(/^developer_instructions = """$/m);
    // Closing fence appears on its own line.
    expect(out).toMatch(/^"""$/m);
    // Body content is between the fences.
    const openerIdx = out.indexOf('developer_instructions = """');
    const closerIdx = out.indexOf('"""\nmodel = ');
    const body = out.slice(openerIdx, closerIdx);
    // Body contains the role name + role-specific content.
    expect(body).toContain("# doc-writer");
    expect(body.toLowerCase()).toContain("documentation");
  });
});
