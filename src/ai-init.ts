import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  buildInstructionsBody,
  dirListing,
  instructionFilesForEngines,
  listContextFiles,
  renderSlimPrompt,
} from "./ai-init/prompt.js";
import { __setRunDeps } from "./ai-init/run.js";
import { AI_CONTEXT_DIR, INSTRUCTIONS_FILE } from "./ai-init/types.js";
import { __setWorkflowDeps } from "./ai-init/workflow.js";
import type { Engine } from "./core.js";
import { CTX_DIR } from "./core.js";
import type { ProjectProfile } from "./scanner.js";
import { renderFindingsTable } from "./scanner.js";

function writeContextFiles(
  base: string,
  profile: ProjectProfile,
  engines?: string[],
  ctx7Auth?: boolean,
): string[] {
  const ctxDir = join(base, AI_CONTEXT_DIR);
  let canWrite = true;
  try {
    mkdirSync(ctxDir, { recursive: true });
  } catch {
    canWrite = false;
  }
  const written: string[] = [];
  if (!canWrite) return written;

  for (const f of instructionFilesForEngines(engines)) {
    const src = join(base, f);
    const dst = join(ctxDir, f);
    try {
      if (existsSync(src)) {
        mkdirSync(dirname(dst), { recursive: true });
        writeFileSync(dst, readFileSync(src, "utf8"));
        written.push(`${AI_CONTEXT_DIR}/${f}`);
      }
    } catch {
      /* best effort */
    }
  }

  const ctxPath = join(base, CTX_DIR, "PROJECT_CONTEXT.md");
  if (existsSync(ctxPath)) {
    try {
      writeFileSync(join(ctxDir, "PROJECT_CONTEXT.md"), readFileSync(ctxPath, "utf8"));
      written.push(`${AI_CONTEXT_DIR}/PROJECT_CONTEXT.md`);
    } catch {
      /* best effort */
    }
  }

  try {
    writeFileSync(join(ctxDir, "project-profile.json"), JSON.stringify(profile, null, 2));
    written.push(`${AI_CONTEXT_DIR}/project-profile.json`);
  } catch {
    /* best effort */
  }

  try {
    writeFileSync(join(ctxDir, "directory-listing.txt"), dirListing(base));
    written.push(`${AI_CONTEXT_DIR}/directory-listing.txt`);
  } catch {
    /* best effort */
  }

  const findSkillsResults = existsSync(join(ctxDir, "find-skills-results.md"));
  try {
    writeFileSync(
      join(ctxDir, INSTRUCTIONS_FILE),
      buildInstructionsBody(engines, ctx7Auth, findSkillsResults),
    );
    written.push(`${AI_CONTEXT_DIR}/${INSTRUCTIONS_FILE}`);
  } catch {
    /* best effort */
  }

  // ⚠️ CRITICAL: this import.meta.url read MUST stay depth-1.
  // ./skills/ resolves from both src/ai-init.ts AND dist/cli.js (both depth 1).
  // Moving this to src/ai-init/X.ts (depth 2) breaks the bundled path (#294).
  for (const ref of ["ANTHROPIC_SKILL_STANDARD.md", "SKILL_TAXONOMY.md"]) {
    try {
      const srcPath = new URL(`./skills/${ref}`, import.meta.url);
      const dstPath = join(ctxDir, ref);
      const text = readFileSync(srcPath, "utf8");
      writeFileSync(dstPath, text);
      written.push(`${AI_CONTEXT_DIR}/${ref}`);
    } catch {
      /* best effort */
    }
  }

  if (profile.findings?.length) {
    try {
      const evidenceTable = renderFindingsTable(profile.findings);
      writeFileSync(join(ctxDir, "stack-evidence.md"), evidenceTable);
      written.push(`${AI_CONTEXT_DIR}/stack-evidence.md`);
    } catch {
      /* best effort */
    }
  }

  return written;
}

export function buildAiInitPrompt(profile: ProjectProfile, base: string, engine?: Engine): string {
  const contextFiles = listContextFiles(base, profile, engine);
  const prompt = renderSlimPrompt(profile, base, contextFiles);
  writeContextFiles(base, profile, engine ? [engine] : undefined);
  return prompt;
}

// Wire DI: the path-sensitive writeContextFiles stays here (depth 1).
// Sub-modules receive it through these setters so they never import
// from the facade (avoids circular imports).
__setRunDeps(writeContextFiles);
__setWorkflowDeps(writeContextFiles);

/** Exposed for tests that need to restore the DI wiring after deliberately
 *  clearing it to exercise the "dependency not wired" guard. */
export { writeContextFiles as __writeContextFilesForTest };

// Re-export the full public surface (importers unchanged)
export {
  AI_CONTEXT_DIR,
  AI_INIT_TIMEOUT_MS,
  AUTOPILOT_MAX_RETRIES,
  CONTEXT_FALLBACK_ENGINE,
  INSTRUCTIONS_FILE,
  INSTRUCTION_FILES_BY_ENGINE,
  PERMISSION_DENIED_RE,
  UNAVAILABLE_RE,
} from "./ai-init/types.js";
export type {
  AiInitOpts,
  AiInitResult,
  AiInitWorkflowOpts,
  AiInitWorkflowResult,
} from "./ai-init/types.js";
export {
  buildInstructionsBody,
  dirListing,
  instructionFilesFor,
  instructionFilesForEngines,
  listContextFiles,
  renderSlimPrompt,
  selectBestEngine,
} from "./ai-init/prompt.js";
export { defaultAiInitDispatcher } from "./ai-init/dispatch.js";
export { __setRunDeps, runAiInit } from "./ai-init/run.js";
export { __setWorkflowDeps, runAiInitWorkflow, scheduleAiInitWaves } from "./ai-init/workflow.js";
