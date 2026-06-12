import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { validateSkillDir } from "./validator.js";

const CANONICAL = join(".vibeflow", "skills");
const MIRRORS = [join(".claude", "skills"), join(".agents", "skills"), join(".github", "skills")];

export type SyncMode = "pointer" | "full";

export interface SyncSkillOptions {
  mode?: SyncMode;
}

export interface SkillSyncResult {
  ok: boolean;
  mode: SyncMode;
  synced: string[];
  errors: string[];
  warnings: string[];
}

function skillNames(repo: string): string[] {
  const base = join(repo, CANONICAL);
  if (!existsSync(base)) return [];
  return readdirSync(base).filter((n) => {
    try {
      return statSync(join(base, n)).isDirectory();
    } catch {
      return false;
    }
  });
}

function pointerBody(name: string, mode: SyncMode): string {
  return [
    "---",
    `name: ${name}`,
    "description: See canonical SKILL.md for full details.",
    "---",
    "",
    `# ${name}`,
    "",
    "Canonical skill lives at:",
    "",
    "`.vibeflow/skills/${name}/SKILL.md`",
    "",
    "Before using this skill:",
    `1. Read canonical SKILL.md`,
    `2. Read linked files under .vibeflow/skills/${name}/references/ (if present)`,
    `3. Run scripts from .vibeflow/skills/${name}/scripts/ (if present) only when instructed`,
    "",
    "Sync mode: " + mode,
    "",
  ].join("\n");
}

function syncOne(name: string, repo: string, mode: SyncMode): string[] {
  const synced: string[] = [];
  const src = join(repo, CANONICAL, name);
  for (const mirror of MIRRORS) {
    const dst = join(repo, mirror, name);
    mkdirSync(join(repo, mirror), { recursive: true });
    rmSync(dst, { recursive: true, force: true });
    mkdirSync(dst, { recursive: true });
    if (mode === "pointer") {
      writeFileSync(dst, "SKILL.md", pointerBody(name, mode));
    } else {
      cpSync(src, dst, { recursive: true });
    }
    synced.push(relative(repo, dst));
  }
  return synced;
}

function writeFileSync(file: string, _name: string, body: string): void {
  // alias to avoid pulling fs writeFileSync at top — keeps import surface tight
  // but local import works too. Use the regular path:
  // (this is a placeholder; the real write happens below)
  void file;
  void _name;
  void body;
}

import { writeFileSync as fsWriteFileSync } from "node:fs";
function writePointer(dstDir: string, name: string, mode: SyncMode): void {
  fsWriteFileSync(join(dstDir, "SKILL.md"), pointerBody(name, mode));
}

export function syncSkillMirrors(
  repo: string,
  opts: SyncSkillOptions = {},
): SkillSyncResult {
  const mode: SyncMode = opts.mode ?? "pointer";
  const synced: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const name of skillNames(repo)) {
    const src = join(repo, CANONICAL, name);
    const validation = validateSkillDir(src);
    if (!validation.ok) {
      errors.push(
        ...validation.errors.map((e) => `${CANONICAL}/${name}: ${e}`),
      );
      continue;
    }
    warnings.push(...validation.warnings.map((w) => `${CANONICAL}/${name}: ${w}`));
    try {
      for (const mirror of MIRRORS) {
        const dst = join(repo, mirror, name);
        mkdirSync(join(repo, mirror), { recursive: true });
        rmSync(dst, { recursive: true, force: true });
        mkdirSync(dst, { recursive: true });
        if (mode === "pointer") {
          writePointer(dst, name, mode);
        } else {
          cpSync(src, dst, { recursive: true });
        }
        synced.push(relative(repo, dst));
      }
    } catch (err) {
      errors.push(`${name}: ${(err as Error).message}`);
    }
  }
  return { ok: errors.length === 0, mode, synced, errors, warnings };
}

export function verifySkillSync(repo: string): SkillSyncResult {
  const errors: string[] = [];
  const synced: string[] = [];
  for (const name of skillNames(repo)) {
    for (const mirror of MIRRORS) {
      const dst = join(repo, mirror, name, "SKILL.md");
      if (!existsSync(dst)) {
        errors.push(`${mirror}/${name}/SKILL.md missing`);
      } else {
        synced.push(`${mirror}/${name}`);
      }
    }
  }
  return { ok: errors.length === 0, mode: "pointer", synced, errors, warnings: [] };
}
