import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectRolesForRepo } from "../src/agents/detect-roles.js";
import type { ProjectProfile } from "../src/scanner.js";

function blankProfile(): ProjectProfile {
  return {
    name: "x",
    languages: [],
    frameworks: [],
    hasCI: false,
    manifests: [],
    findings: [],
  };
}

function withRepo(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "vf-detect-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function touch(repo: string, rel: string, isDir = false): void {
  const full = join(repo, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  if (isDir) mkdirSync(full, { recursive: true });
  else writeFileSync(full, "");
}

describe("detectRolesForRepo", () => {
  test("detects cli-engine when src/cli.ts is present", () => {
    withRepo((dir) => {
      touch(dir, "src/cli.ts");
      const roles = detectRolesForRepo(dir);
      expect(roles).toContain("cli-engine");
    });
  });

  test("detects web-ui when src/server.ts + React framework are present", () => {
    withRepo((dir) => {
      touch(dir, "src/server.ts");
      const profile: ProjectProfile = {
        ...blankProfile(),
        frameworks: ["React", "Next.js"],
      };
      const roles = detectRolesForRepo(dir, profile);
      expect(roles).toContain("web-ui");
    });
  });

  test("detects skill-author when .vibeflow/skills/ is present", () => {
    withRepo((dir) => {
      touch(dir, ".vibeflow/skills", true);
      const roles = detectRolesForRepo(dir);
      expect(roles).toContain("skill-author");
    });
  });

  test("detects preflight-engine when src/preflight.ts is present", () => {
    withRepo((dir) => {
      touch(dir, "src/preflight.ts");
      const roles = detectRolesForRepo(dir);
      expect(roles).toContain("preflight-engine");
    });
  });

  test("detects dispatch-runner when src/orchestrator/ is present", () => {
    withRepo((dir) => {
      touch(dir, "src/orchestrator", true);
      const roles = detectRolesForRepo(dir);
      expect(roles).toContain("dispatch-runner");
    });
  });

  test("detects doc-writer when README.md is present (or docs/)", () => {
    withRepo((dir) => {
      touch(dir, "README.md");
      const roles = detectRolesForRepo(dir);
      expect(roles).toContain("doc-writer");
    });
  });

  test("empty repo returns empty array (no signals match)", () => {
    withRepo((dir) => {
      const roles = detectRolesForRepo(dir);
      expect(roles).toEqual([]);
    });
  });
});
