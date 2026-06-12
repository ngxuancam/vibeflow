import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateSkillDir, validateSkillRoots } from "../src/skills/validator";

let dirs: string[] = [];
function tmpSkill(name: string): string {
  const root = mkdtempSync(join(tmpdir(), "vf-skill-"));
  dirs.push(root);
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}
function writeSkill(dir: string, text: string): void {
  writeFileSync(join(dir, "SKILL.md"), text);
}
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

describe("validateSkillDir — Anthropic skill format", () => {
  test("accepts a minimal Anthropic-style skill", () => {
    const dir = tmpSkill("rust-debugging");
    writeSkill(
      dir,
      `---\nname: rust-debugging\ndescription: Debug Rust async/Tokio issues from logs, tests, and traces.\n---\n\n# Rust Debugging\n\nUse when investigating Rust runtime bugs.\n\n## Steps\n1. Reproduce.\n2. Inspect logs.\n3. Write regression test.\n`,
    );
    const result = validateSkillDir(dir);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("rejects missing SKILL.md", () => {
    const dir = tmpSkill("missing-skill");
    const result = validateSkillDir(dir);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("missing SKILL.md");
  });

  test("rejects missing description", () => {
    const dir = tmpSkill("bad-skill");
    writeSkill(dir, `---\nname: bad-skill\n---\n\n# Bad\n\nSome body text with enough content to pass body length.\n`);
    const result = validateSkillDir(dir);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("description"))).toBe(true);
  });

  test("rejects placeholder body", () => {
    const dir = tmpSkill("placeholder-skill");
    writeSkill(
      dir,
      `---\nname: placeholder-skill\ndescription: Placeholder test skill.\n---\n\nTODO\n`,
    );
    const result = validateSkillDir(dir);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("body"))).toBe(true);
  });

  test("warns when folder name differs from frontmatter name", () => {
    const dir = tmpSkill("folder-name");
    writeSkill(
      dir,
      `---\nname: frontmatter-name\ndescription: Test skill with mismatched folder name.\n---\n\n# Test\n\nEnough actionable content for this skill body to be valid.\n`,
    );
    const result = validateSkillDir(dir);
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.includes("folder"))).toBe(true);
  });

  test("warns on unsupported top-level child directory", () => {
    const dir = tmpSkill("extra-dir-skill");
    mkdirSync(join(dir, "random"));
    writeSkill(
      dir,
      `---\nname: extra-dir-skill\ndescription: Test skill with unsupported child directory.\n---\n\n# Test\n\nEnough actionable content for this skill body to be valid.\n`,
    );
    const result = validateSkillDir(dir);
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.includes("unsupported"))).toBe(true);
  });
});

describe("validateSkillRoots", () => {
  test("validates .vibeflow, .claude, and .kiro skill roots", () => {
    const repo = mkdtempSync(join(tmpdir(), "vf-repo-skills-"));
    dirs.push(repo);
    const skillDir = join(repo, ".vibeflow", "skills", "repo-skill");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      `---\nname: repo-skill\ndescription: Validate repo-level skill discovery.\n---\n\n# Repo Skill\n\nEnough actionable body content to validate this skill directory.\n`,
    );
    const result = validateSkillRoots(repo);
    expect(result.ok).toBe(true);
    expect(result.skills.map((s) => s.name)).toContain("repo-skill");
  });
});
