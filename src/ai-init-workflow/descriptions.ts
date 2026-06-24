/**
 * AI-init workflow description/acceptance text builders and data maps.
 *
 * Internal helpers used by builders.ts and the facade.
 * Imports types/consts from ./types.js — does NOT import from the facade.
 */

import type { RoleName } from "../agents/role-templates.js";
import { ENGINES, type Engine } from "../core.js";
import type { ProjectProfile } from "../scanner.js";
import type { AiInitAdapterName, AiInitIntake } from "./types.js";
import { ADAPTER_OWNER, ENGINE_INSTRUCTION_SCOPE, INIT_DEFAULT_ENGINE } from "./types.js";
export function selectedInstructionScope(intake: AiInitIntake): string[] {
  const selected = (intake.engines ?? []).filter((engine): engine is Engine =>
    (ENGINES as readonly string[]).includes(engine),
  );
  if (selected.length === 0) return ENGINE_INSTRUCTION_SCOPE[INIT_DEFAULT_ENGINE];
  return [...new Set(selected.flatMap((engine) => ENGINE_INSTRUCTION_SCOPE[engine]))];
}

export function instructionDescription(scope: string[]): string {
  const files = scope.join(", ");
  return [
    `Update only these instruction file(s): ${files}.`,
    "Do not create or modify instruction files for engines outside this scope.",
    "Edit only inside the `vibeflow:start`/`vibeflow:end` markers; preserve all human content outside markers.",
    "",
    "=== CONTENT RULE: concise summary + reference, NO full project info ===",
    "The `ai-init-context-updater` adapter writes the FULL project context to `.vibeflow/PROJECT_CONTEXT.md`.",
    "AI engines read that file at dispatch time. Do NOT duplicate its content here.",
    "",
    "In the instruction file, write THIS ONLY:",
    "1. **Build/test/lint commands** (1-2 lines each, exact commands from package.json/build.gradle)",
    "2. **Short project summary** (1 paragraph: what, stack, key modules)",
    '3. **Reference** to `.vibeflow/PROJECT_CONTEXT.md`: "Read this file for the full project context."',
    "4. **Key gotchas** (only if non-obvious, 1-2 max)",
    "",
    "Everything else (code conventions, architecture details, module structure) lives ONLY in",
    "`.vibeflow/PROJECT_CONTEXT.md`.",
  ].join(" ");
}

export function instructionAcceptance(scope: string[]): string {
  return `instruction file scope (${scope.join(", ")}) carries a fresh vibeflow:start block`;
}

export function selectedEngines(intake: AiInitIntake): Engine[] {
  const selected = (intake.engines ?? []).filter((engine): engine is Engine =>
    (ENGINES as readonly string[]).includes(engine),
  );
  return selected.length ? selected : [INIT_DEFAULT_ENGINE];
}

export const ADAPTER_ACCEPTANCE: Record<AiInitAdapterName, string> = {
  "ai-init-analyzer":
    "stack-evidence.md written, ProjectProfile summary backed by >=3 manifest/dependency citations",
  "ai-init-instruction-writer":
    "all 3 instruction files (CLAUDE.md, AGENTS.md, .github/copilot-instructions.md) carry a fresh vibeflow:start block with CONCISE summary (1 paragraph) + reference to .vibeflow/PROJECT_CONTEXT.md, NOT a full copy of project info",
  "ai-init-skill-curator":
    ">=1 stack skill installed under .vibeflow/skills/, phase skills enriched with stack-skill requires, references/{templates,examples}/ populated, unselected engine dirs cleaned, SKILL_INDEX.md regenerated, ctx7 (or fallback) cited as source",
  "ai-init-context-updater":
    ".vibeflow/PROJECT_CONTEXT.md updated as the CANONICAL source (≤200 lines), plus ≥3 topic files under `.vibeflow/context/` populated with deep details. Human-curated sections preserved. Instruction files only reference this file.",
  "ai-init-workflow-state-writer":
    ".vibeflow/WORKFLOW_STATE.json carries a `work_units` block with one unit per declared WorkflowPhase (name, status=pending, confidence=0, scope, owner_agent, skills_injected, skills_required, gates, resources), and `success_criteria` folds in each phase's `dod`",
};

/** Per-adapter description (the spec the engine receives when dispatched). */
export const ADAPTER_DESCRIPTION: Record<AiInitAdapterName, string> = {
  "ai-init-analyzer":
    "Investigate the project until confidence = 1.0 on every finding (build/test/lint commands, package manager, language + framework versions, CI). Read package.json, tsconfig/biome config, source tree, sample source files (>=5 across modules), and >=2 test files. Review and update .vibeflow/ai-context/stack-evidence.md with file/manifest evidence per component. Do not guess.",
  "ai-init-instruction-writer":
    "Update all 3 instruction files (CLAUDE.md, AGENTS.md, .github/copilot-instructions.md) for this project. Edit only inside the vibeflow:start/vibeflow:end markers; preserve all human content outside markers. Write a CONCISE summary (build/test/lint commands + 1 paragraph project overview + reference to `.vibeflow/PROJECT_CONTEXT.md`). Do NOT copy full project info — the context-updater writes that to PROJECT_CONTEXT.md. AI engines read PROJECT_CONTEXT.md at dispatch time.",
  "ai-init-skill-curator":
    "Discover and install skills for the detected stack via `npx ctx7 skills install` (headless), or fall back to manual SKILL.md authored from `ctx7 docs`. Follow the SKILL.md format from .vibeflow/ai-context/ANTHROPIC_SKILL_STANDARD.md. Copy to the engine-scoped skill directory only. Verify with `vf skills validate` and regenerate .vibeflow/SKILL_INDEX.md. Project-fit skills live under .vibeflow/skills/.",
  "ai-init-context-updater":
    "Update .vibeflow/PROJECT_CONTEXT.md with COMPLETE project context. This is the CANONICAL source of truth — other instruction files now contain only a short summary + reference to this file. Write EVERYTHING here: tech stack with versions (evidence-backed from stack-evidence.md), all modules and their roles, full code conventions (from real source code, not guesses), architecture (key modules + data flow, layer diagrams), build/test/lint exact commands, all gotchas, and the active workflow DAG. Preserve any human-authored sections outside the generated block. Do NOT leave any project detail out — if a future engineer reads only this file and the stack skills, they should have everything needed. **IMPORTANT: KEEP THIS FILE ≤ 200 LINES.** Write the CORE project info here only. For deep details, split into topic files under `.vibeflow/context/<topic>.md` (modules.md, conventions.md, architecture.md, database.md, security.md, api.md, testing.md) — each file holds the full detail for one topic. The phase that needs a topic reads only that file. Mapping: `basic-design` reads modules.md + architecture.md; `detail-design` reads all except security.md; `implement` reads modules.md, conventions.md, architecture.md, database.md, security.md; `testing` reads testing.md; `verify` reads all. Update the README at `.vibeflow/context/README.md` to reflect what you put in each topic file.",
  "ai-init-workflow-state-writer":
    "Update .vibeflow/WORKFLOW_STATE.json to declare one work unit per user-supplied WorkflowPhase (or omit `work_units` when the user supplied no phases). Each phase unit has: name (matching the phase), status=pending, confidence=0, scope (one entry per declared output), owner_agent (resolved from phase.ownerHint via fuzzy match against detected roles, defaulting to dispatch-runner), skills_injected + skills_required (resolved from the role's known skill list), gates=pending, resources=zero. Fold each phase.dod into `success_criteria` (dedup, preserve order). AFTER writing the baseline units, read `.vibeflow/skills/` (canonical skill store) and for each skill whose name matches a phase scope or stack dependency, APPEND the skill name to `skills_injected` and `skills_required` of the corresponding phase unit (dedupe, do NOT remove existing injected skills).",
};

/** Skills wiring per role. A small built-in catalogue that the planner
 *  injects into the relevant adapter / phase units as
 *  `skills_injected` (already loaded in the engine) and `skills_required`
 *  (must be present in the engine's skill store for the unit to count as
 *  done). The reviewer uses the same catalogue to validate that the
 *  evidence cites at least one of the required skills. */
export const ROLE_SKILLS: Record<RoleName, { injected: string[]; required: string[] }> = {
  "cli-engine": {
    injected: ["vf-skills", "vf-doctor"],
    required: ["ctx7:bash", "ctx7:find-skills"],
  },
  "web-ui": {
    injected: ["vf-skills", "imagegen-frontend-web"],
    required: ["ctx7:react", "ctx7:svelte"],
  },
  "skill-author": {
    injected: ["vf-skills", "skill-creator"],
    required: ["ctx7:skill-authoring"],
  },
  "preflight-engine": {
    injected: ["vf-skills", "vf-doctor"],
    required: ["ctx7:engine-probe"],
  },
  "dispatch-runner": {
    injected: ["vf-skills", "vf-orchestrate"],
    required: ["ctx7:work-unit", "ctx7:goal-eval"],
  },
  "doc-writer": {
    injected: ["vf-skills", "doc-coauthoring"],
    required: ["ctx7:markdown-lint"],
  },
};

/** Resolve the owner_agent for a phase based on the phase's
 *  `ownerHint`. Exact role-name match wins; otherwise the planner
 *  fuzzy-matches the hint (lowercased) against role-name substrings.
 *  Default is `dispatch-runner` (the role that owns cross-cutting
 *  orchestration work). */
export function resolveOwner(hint: string | undefined, detected: RoleName[]): RoleName {
  if (!hint) return "dispatch-runner";
  const lower = hint.toLowerCase().trim();
  for (const role of detected) {
    if (role === lower) return role;
  }
  for (const role of detected) {
    if (role.includes(lower) || lower.includes(role)) return role;
  }
  if (/(cli|command|flag|subcommand)/.test(lower)) return "cli-engine";
  if (/(ui|web|frontend|view|panel)/.test(lower)) return "web-ui";
  if (/(skill|capability)/.test(lower)) return "skill-author";
  if (/(preflight|readiness|probe|quota)/.test(lower)) return "preflight-engine";
  if (/(dispatch|orchestrat|runner|workflow)/.test(lower)) return "dispatch-runner";
  if (/(doc|readme|changelog|comment)/.test(lower)) return "doc-writer";
  return "dispatch-runner";
}

/** Slug a phase name to a path-safe unit suffix. Strips path-traversal
 *  sequences so a crafted phase name can never escape the canonical
 *  `ai-init-phase-` prefix. */
export function phaseSlug(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : "unnamed";
}

/** Skill wiring for each Tier-1 adapter (looked up via the role it
 *  maps to in ADAPTER_OWNER). Adapters that share a role share the
 *  same catalogue. */
export function adapterSkills(name: AiInitAdapterName): { injected: string[]; required: string[] } {
  return ROLE_SKILLS[ADAPTER_OWNER[name]];
}

/** Build the spec text for one Tier-1 adapter unit, given the live
 *  project context. The spec is what the engine receives as `unit.spec`
 *  in the dispatch prompt. */

export function stackSkillsForProfile(profile: ProjectProfile): string[] {
  const seen = new Set<string>();
  const candidates = new Set<string>();
  // Collect from scanner findings — the most accurate source.
  // Each finding has component + value, e.g. {component:"Framework", value:"Spring Boot"}.
  for (const f of profile.findings ?? []) {
    const slug = f.value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (slug && slug.length > 1 && !seen.has(slug)) {
      seen.add(slug);
      candidates.add(slug);
    }
  }
  // Also collect from frameworks/languages for extra coverage.
  for (const name of [...(profile.frameworks ?? []), ...profile.languages]) {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (slug && slug.length > 1 && !seen.has(slug)) {
      seen.add(slug);
      candidates.add(slug);
    }
  }
  return [...candidates];
}
