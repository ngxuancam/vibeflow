import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { CTX_DIR, ENGINES, type Engine } from "../core.js";
import type { EngineReadiness } from "../preflight.js";
import type { ProjectProfile } from "../scanner.js";
import {
  AI_CONTEXT_DIR,
  CONTEXT_FALLBACK_ENGINE,
  INSTRUCTIONS_FILE,
  INSTRUCTION_FILES_BY_ENGINE,
} from "./types.js";

function instructionFilesFor(engine?: Engine): readonly string[] {
  return engine
    ? INSTRUCTION_FILES_BY_ENGINE[engine]
    : INSTRUCTION_FILES_BY_ENGINE[CONTEXT_FALLBACK_ENGINE];
}

function instructionFilesForEngines(engines?: string[]): readonly string[] {
  const selected = engines?.filter((e): e is Engine => (ENGINES as readonly string[]).includes(e));
  return selected?.length
    ? [...new Set(selected.flatMap((e) => INSTRUCTION_FILES_BY_ENGINE[e]))]
    : INSTRUCTION_FILES_BY_ENGINE[CONTEXT_FALLBACK_ENGINE];
}

export function selectBestEngine(readiness: EngineReadiness[]): Engine | null {
  const ready = new Set(readiness.filter((r) => r.level === "ready").map((r) => r.engine));
  for (const e of ENGINES) {
    if (ready.has(e)) return e;
  }
  const fallback = new Set(
    readiness
      .filter((r) => r.level === "probe-failed" || r.level === "no-auth")
      .map((r) => r.engine),
  );
  for (const e of ENGINES) {
    if (fallback.has(e)) return e;
  }
  return null;
}
export function dirListing(base: string, maxDepth = 2): string {
  const skip = new Set([
    ".git",
    "node_modules",
    "dist",
    "build",
    CTX_DIR,
    ".kiro",
    "__pycache__",
    ".gradle",
    "target",
  ]);
  const lines: string[] = [];
  const walk = (dir: string, depth: number, prefix: string) => {
    if (depth > maxDepth) return;
    // readdirSync on a subdir we just descended into should not
    // throw — but we still guard the statSync call below for
    // broken symlinks (ENOENT) which is a real failure mode.
    const entries = readdirSync(dir);
    for (const entry of entries.slice(0, 60)) {
      if (skip.has(entry)) continue;
      const full = join(dir, entry);
      let isDir = false;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      const marker = isDir ? "/" : "";
      lines.push(`${prefix}${entry}${marker}`);
      if (isDir && depth < maxDepth) {
        walk(full, depth + 1, `${prefix}  `);
      }
    }
    if (entries.length > 60) lines.push(`${prefix}... (${entries.length - 60} more entries)`);
  };
  walk(base, 0, "  ");
  return lines.join("\n");
}

/** Write full file contents to the ai-context temp dir so the AI can read them directly.
 *
 * If `mkdirSync` fails (e.g. permission denied, read-only fs), all subsequent
 * writes are skipped — no orphaned files, no inner writeFileSync errors.
 */

export function listContextFiles(base: string, profile: ProjectProfile, engine?: Engine): string[] {
  const written: string[] = [];
  for (const f of instructionFilesFor(engine)) {
    if (existsSync(join(base, f))) written.push(`${AI_CONTEXT_DIR}/${f}`);
  }
  if (existsSync(join(base, CTX_DIR, "PROJECT_CONTEXT.md"))) {
    written.push(`${AI_CONTEXT_DIR}/PROJECT_CONTEXT.md`);
  }
  written.push(`${AI_CONTEXT_DIR}/project-profile.json`);
  written.push(`${AI_CONTEXT_DIR}/directory-listing.txt`);
  written.push(`${AI_CONTEXT_DIR}/${INSTRUCTIONS_FILE}`);
  written.push(`${AI_CONTEXT_DIR}/ANTHROPIC_SKILL_STANDARD.md`);
  written.push(`${AI_CONTEXT_DIR}/SKILL_TAXONOMY.md`);
  if (profile.findings?.length) written.push(`${AI_CONTEXT_DIR}/stack-evidence.md`);
  return written;
}

/** Render the slim prompt body (no disk I/O, no I/O at all). The
 *  engine is told to use its Read tool to pull the bulky task body
 *  from INSTRUCTIONS.md on disk. Exported for unit-test isolation
 *  (so tests can assert prompt structure without going through
 *  runAiInit or writeContextFiles). */
export function renderSlimPrompt(
  profile: ProjectProfile,
  base: string,
  contextFiles: string[],
): string {
  const langList = profile.languages.length ? profile.languages.join(", ") : "unknown";
  const fwList = profile.frameworks.length ? profile.frameworks.join(", ") : "none detected";
  const pkgMgr = profile.packageManager ?? "unknown";
  const build = profile.buildCommand ?? "(not found)";
  const test = profile.testCommand ?? "(not found)";
  const lint = profile.lintCommand ?? "(not found)";
  const hasCI = profile.hasCI ? "yes" : "no";
  const summary = profile.summary ?? "(no README summary)";
  const manifests = profile.manifests.length ? profile.manifests.join(", ") : "none";

  // Put INSTRUCTIONS.md first in the file list so the engine reads it
  // before project-specific data.
  const reordered = [
    `${AI_CONTEXT_DIR}/${INSTRUCTIONS_FILE}`,
    ...contextFiles.filter((f) => f !== `${AI_CONTEXT_DIR}/${INSTRUCTIONS_FILE}`),
  ];
  const contextFileList = reordered.map((f) => `- \`${f}\``).join("\n");

  return [
    "## VibeFlow AI-Powered Project Initialization",
    "",
    "You are an AI agent performing project initialization for VibeFlow (`vf init`).",
    "Your working directory IS the project root. Use your Read/Edit tools to act on the files listed below.",
    "",
    "## Workflow (RAG pattern)",
    `1. Read \`${AI_CONTEXT_DIR}/${INSTRUCTIONS_FILE}\` FIRST — it contains the full task list, confidence gate, and output format.`,
    `2. Read every other file under \`${AI_CONTEXT_DIR}/\` listed below.`,
    "3. Follow the tasks in INSTRUCTIONS.md end-to-end.",
    "",
    "## Project Detection (summary)",
    `- Name: ${profile.name}`,
    `- Summary: ${summary}`,
    `- Languages: ${langList}`,
    `- Frameworks: ${fwList}`,
    `- Package manager: ${pkgMgr}`,
    `- Build: ${build}`,
    `- Test: ${test}`,
    `- Lint: ${lint}`,
    `- CI: ${hasCI}`,
    `- Manifests: ${manifests}`,
    "",
    "## Context Files (read in this order)",
    "Full content of each is on disk — read with your Read tool, do not guess from this summary:",
    "",
    contextFileList,
    "",
    "For existing instruction files (CLAUDE.md, AGENTS.md, etc.), prefer the",
    "copy under `.vibeflow/ai-context/` (exact state at init time) unless",
    "the task says otherwise.",
  ].join("\n");
}

import { buildInstructionsBody } from "./body.js";

export { buildInstructionsBody, instructionFilesFor, instructionFilesForEngines };
