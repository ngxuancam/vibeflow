// size-waiver: #186 — ai-init-workflow.ts split into ai-init-workflow/{dispatch,review,subagents}; see issue #186
/**
 * AI-init workflow decomposition.
 *
 * Decomposes the AI-init surface into 2 tiers of work units that the
 * orchestrator (src/orchestrator/run.ts) can dispatch concurrently with
 * disjoint file scopes, run an independent reviewer over each, and gate
 * close on goalEval (confidence = 1.0 with recorded evidence per unit).
 *
 *   Tier 1 (always 5 adapter units): analyzer, instruction-writer,
 *     skill-curator, context-updater, workflow-state-writer.
 *     They cover the canonical baseline (instruction files, skills,
 *     project context, and workflow state).
 *
 *   Tier 2 (0..N phase units): one unit per `WorkflowPhase` in the
 *     intake, named `ai-init-phase-<slug>-<n>`. Each phase unit carries
 *     the phase's owner_hint, scope (declared outputs), acceptance
 *     signal (the phase's dod), and skill wiring.
 *
 * Pure module: no I/O, no engine calls. Both `planAiInitUnits` and
 * `aiInitReviewer` are deterministic given (profile, intake) so unit
 * tests can pin the decomposition.
 */

import { statSync } from "node:fs";
import { resolve } from "node:path";
import { ROLE_NAMES, type RoleName } from "./agents/role-templates.js";
import { ENGINES, type Engine, type WorkUnit } from "./core.js";
import type { ProjectProfile } from "./scanner.js";

/** A trimmed intake-answers shape this planner depends on. The full
 * `IntakeAnswers` from commands.ts is accepted with all fields optional. */
export interface AiInitIntake {
  goal?: string;
  engines?: string[];
  docSource?: string;
  taskSource?: string;
  fileTypes?: string[];
  expectedResult?: string;
  sample?: string;
  repoPath?: string;
  /** Workflow phases the user wants this init to cover. Each phase
   *  becomes a work unit in Tier 2 of the planner. Empty array (or
   *  undefined) is valid — the planner still emits the Tier 1 adapter
   *  units so a project with no explicit phases still gets the full
   *  baseline. */
  workflowPhases?: WorkflowPhase[];
  /** Code-navigation tools the user wants enabled. When absent, the
   *  planner leaves `SETTINGS.json` untouched (user opt-in only). */
  toolToggles?: { codegraph?: boolean; lsp?: boolean };
  /** When true, the planner generates the agent-team agent files
   *  (`.claude/agents/<role>.md` × N roles) alongside the rest. Default
   *  true — matches the legacy `agentFiles()` behaviour. */
  generateAgentTeam?: boolean;
  /** CLI-side ctx7 auth status collected before Phase 2. false means the
   *  user declined/failed login or init is non-interactive, so specs must
   *  use the documented fallback path without prompting again. */
  ctx7Authenticated?: boolean;
  /** P1-10: pre-resolved ctx7 repo list, formatted as a hint block
   *  (see `formatResolvedReposHint` in `discovery/ctx7-resolve.ts`).
   *  Injected into the skill-curator spec so the engine never has to
   *  try-fail candidate repo names one at a time. Empty/undefined
   *  means the CLI did not run the pre-check; the engine should
   *  fall back to its existing try-fail behaviour. */
  ctx7ResolvedReposHint?: string;
}

/** A single user-declared workflow phase. Mirrors the structure the
 *  web intake wizard already exposes in `src/ui/shell.html` (workflow
 *  steps with name, description, definition of done). */
export interface WorkflowPhase {
  /** Stable phase name; the planner uses it as the work-unit name
   *  (`ai-init-phase-<slug>-<n>`). MUST be unique within `workflowPhases`. */
  name: string;
  /** Free-text description the engine sees as the unit spec. */
  description: string;
  /** Inputs this phase consumes (file paths, env, or upstream phase names). */
  inputs?: string[];
  /** Outputs this phase produces (file paths, commands, or downstream
   *  phase names). The reviewer gates on evidence citing at least one. */
  outputs?: string[];
  /** Template the engine should follow (file path or inline body). */
  template?: string;
  /** Definition of done — reviewer reads this to set the acceptance
   *  signal for the phase's work unit. */
  dod?: string;
  /** Hint the planner uses to assign `owner_agent`. Matches a role name
   *  (see `agents/role-templates.ts`) or a substring the planner can
   *  fuzzy-route against detected roles. */
  ownerHint?: string;
}

/** A work unit tailored for the AI init phase. Same fields as
 * {@link WorkUnit} plus an acceptance signal the reviewer uses. The
 * planner sets `owner_agent` to a default role so the orchestrator can
 * route it to the matching engine-agnostic agent, and `spec` to the
 * human-readable description (what the engine receives). */
export interface AiInitUnit extends WorkUnit {
  /** Disjoint file scope — used by the orchestrator to detect conflicts and
   *  serialize overlapping units. The default units below have disjoint
   *  scopes so they all run in parallel under `scheduleWaves`. */
  scope: string[];
  /** Acceptance signal the reviewer checks (e.g. "all 4 instruction files
   *  carry a fresh `vibeflow:start` block"). */
  acceptance: string;
  /** Names of work units this unit depends on. The orchestrator uses
   *  `depends_on` to schedule units into parallel waves: units in the
   *  same wave (no transitive dependencies) run concurrently; waves run
   *  sequentially. Empty array means this unit has no dependencies and
   *  belongs to wave 0. */
  depends_on: string[];
}

/** Stable IDs for the Tier 1 (adapter) init units. The orchestrator
 *  depends on stable names (no UUIDs) so the same workflow reproduces
 *  identical work units on a re-run. Tier 2 phase units are emitted
 *  with names `ai-init-phase-<slug>-<n>` (one per `WorkflowPhase` in
 *  intake). */
export const AI_INIT_ADAPTER_NAMES = [
  "ai-init-analyzer",
  "ai-init-instruction-writer",
  "ai-init-skill-curator",
  "ai-init-context-updater",
  "ai-init-workflow-state-writer",
] as const;
export type AiInitAdapterName = (typeof AI_INIT_ADAPTER_NAMES)[number];

/**
 * P0-4: the four "finisher" adapter units produce optional docs/files
 * (SETTINGS.json tools flag, WORKFLOW_POLICY.md, WORKFLOW_STATE.json,
 * QUICKSTART.md). When quota is low they are skipped in order of
 * lowest-value-first to preserve the core skill-curator + analyzer +
 * instruction-writer + context-updater path. Phase-skill enrichment
 * is NEVER in this set — those are the reusable templates that
 * downstream workflows depend on, and skipping them would defeat
 * the whole point of `vf init`. */
export const AI_INIT_FINISHER_NAMES: ReadonlySet<AiInitAdapterName> = new Set([
  "ai-init-workflow-state-writer",
] as const);

/** Back-compat export: a flat list of the original 4 unit names. New
 *  code should reference `AI_INIT_ADAPTER_NAMES` (8 entries). Kept so
 *  external callers and the existing test suite still resolve. */
export const AI_INIT_UNIT_NAMES = [
  "ai-init-analyzer",
  "ai-init-instruction-writer",
  "ai-init-skill-curator",
  "ai-init-context-updater",
] as const;
export type AiInitUnitName = (typeof AI_INIT_UNIT_NAMES)[number];

/** Map each Tier-1 adapter unit to its default role (owner_agent). The
 *  reviewer passes when the unit's evidence cites the expected role's
 *  runtime state). Each adapter owns a distinct on-disk artifact so two
 *  units never try to write the same path. */
const ADAPTER_OWNER: Record<AiInitAdapterName, RoleName> = {
  "ai-init-analyzer": "cli-engine",
  "ai-init-instruction-writer": "doc-writer",
  "ai-init-skill-curator": "skill-author",
  "ai-init-context-updater": "doc-writer",
  "ai-init-workflow-state-writer": "dispatch-runner",
};

/** Per-adapter file scope. Disjoint by design so the orchestrator's
 *  `findScopeConflicts` reports zero conflicts and all units run in
 *  parallel under `runParallel`. Each adapter owns a distinct on-disk
 *  artifact so two units never try to write the same path. */
const ADAPTER_SCOPE: Record<AiInitAdapterName, string[]> = {
  "ai-init-analyzer": [".vibeflow/ai-context/stack-evidence.md"],
  "ai-init-instruction-writer": ["AGENTS.md", ".github/copilot-instructions.md"],
  "ai-init-skill-curator": [".vibeflow/skills/", ".vibeflow/SKILL_INDEX.md"],
  "ai-init-context-updater": [".vibeflow/PROJECT_CONTEXT.md"],
  "ai-init-workflow-state-writer": [".vibeflow/WORKFLOW_STATE.json"],
};

/** Per-adapter dependency map for wave scheduling.
 *
 *  Wave 0 (no deps): analyzer, instruction-writer, tool-configurator
 *  Wave 1 (waits for analyzer): skill-curator, context-updater
 *    — skill-curator needs stack-evidence.md to match whitelist
 *    — context-updater needs stack-evidence.md + project-profile.json
 *  Wave 2 (waits for wave 1): policy-writer, state-writer, quickstart-writer
 *    — policy-writer needs skill list + context to be in sync
 *    — state-writer needs skill curator's work for the work_units block
 *    — quickstart-writer needs project context to render
 */
const ADAPTER_DEPENDS_ON: Record<AiInitAdapterName, string[]> = {
  "ai-init-analyzer": [],
  "ai-init-instruction-writer": [],
  "ai-init-skill-curator": ["ai-init-analyzer"],
  "ai-init-context-updater": ["ai-init-analyzer"],
  "ai-init-workflow-state-writer": ["ai-init-analyzer", "ai-init-skill-curator"],
};

export const ENGINE_INSTRUCTION_SCOPE: Record<Engine, string[]> = {
  claude: ["CLAUDE.md"],
  codex: ["AGENTS.md"],
  copilot: ["AGENTS.md", ".github/copilot-instructions.md"],
};

export const ENGINE_SKILL_DIR: Record<Engine, string> = {
  claude: ".claude/skills/",
  codex: ".agents/skills/",
  copilot: ".github/skills/",
};

const INIT_DEFAULT_ENGINE: Engine = "copilot";

function selectedInstructionScope(intake: AiInitIntake): string[] {
  const selected = (intake.engines ?? []).filter((engine): engine is Engine =>
    (ENGINES as readonly string[]).includes(engine),
  );
  if (selected.length === 0) return ENGINE_INSTRUCTION_SCOPE[INIT_DEFAULT_ENGINE];
  return [...new Set(selected.flatMap((engine) => ENGINE_INSTRUCTION_SCOPE[engine]))];
}

function instructionDescription(scope: string[]): string {
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
    "3. **Reference** to `.vibeflow/PROJECT_CONTEXT.md`: \"Read this file for the full project context.\"",
    "4. **Key gotchas** (only if non-obvious, 1-2 max)",
    "",
    "Everything else (code conventions, architecture details, module structure) lives ONLY in",
    "`.vibeflow/PROJECT_CONTEXT.md`.",
  ].join(" ");
}

function instructionAcceptance(scope: string[]): string {
  return `instruction file scope (${scope.join(", ")}) carries a fresh vibeflow:start block`;
}

function selectedEngines(intake: AiInitIntake): Engine[] {
  const selected = (intake.engines ?? []).filter((engine): engine is Engine =>
    (ENGINES as readonly string[]).includes(engine),
  );
  return selected.length ? selected : [INIT_DEFAULT_ENGINE];
}

function skillCuratorDescription(intake: AiInitIntake, profile: ProjectProfile): string {
  const engines = selectedEngines(intake);
  const skillDirs = engines.map((engine) => ENGINE_SKILL_DIR[engine]);
  const syncCmd = engines.map((e) => `vf skills sync --mode pointer --engine ${e}`).join(" && ");
  const verifyCmd = engines.map((e) => `vf skills verify-sync --engine ${e}`).join(" && ");
  // ctx7 skills install does NOT support a `--copilot` flag (its
  // location flags are --claude, --universal, --antigravity, --cursor,
  // --all-agents). Since the user selected engine=copilot, the only
  // ctx7 location flag that targets codex is `--universal` (.agents/skills/).
  // Use that as a SCRATCH location, then import to canonical and sync to
  // the copilot mirror so .github/skills/ is the only engine folder left.
  const ctx7ScratchFlag = "--universal";
  const ctx7ScratchDir = ".agents/skills";
  const importCmd = `vf skills import ${ctx7ScratchDir}/<skill-name>`;
  const authInstruction =
    intake.ctx7Authenticated === true
      ? `ctx7 is already authenticated from the CLI pre-check. Use \`npx ctx7 library\`, \`npx ctx7 docs\`, and \`npx ctx7 skills install --yes --all ${ctx7ScratchFlag} <repo>\` to populate the scratch mirror at ${ctx7ScratchDir}/. ctx7 has NO --copilot flag — do not invent one. After ctx7 writes, run \`${importCmd}\` to canonicalize, then sync to the selected engine mirror.`
      : "ctx7 is NOT authenticated or the user chose not to login. Do not run `npx ctx7 login` inside the engine. Use fallback discovery from `.vibeflow/ai-context/stack-evidence.md`, bundled skill standards, and any available docs; author fallback skills with `status: experimental` and cite the fallback source.";

  const phases = intake.workflowPhases ?? [];
  const stackFrameworks = profile.frameworks?.length
    ? profile.frameworks.join(", ")
    : profile.languages?.join(", ") || "unknown";
  const unselectedSkillDirs = (Object.keys(ENGINE_SKILL_DIR) as Engine[])
    .filter((e) => !engines.includes(e))
    .map((e) => ENGINE_SKILL_DIR[e]);
  const unselectedInstrFiles = (Object.keys(ENGINE_INSTRUCTION_SCOPE) as Engine[])
    .filter((e) => !engines.includes(e))
    .flatMap((e) => ENGINE_INSTRUCTION_SCOPE[e]);

  return [
    authInstruction,
    "",
    "--- PART 1: Stack skills ---",
    `Detected stack: ${stackFrameworks}`,
    "Discover and install skills for the detected stack. Project-fit skills live under `.vibeflow/skills/<name>/SKILL.md` and must follow `.vibeflow/ai-context/ANTHROPIC_SKILL_STANDARD.md`.",
    `After installing, run \`${syncCmd}\` and \`${verifyCmd}\`.`,
    `Only these selected engine skill mirror(s) are in scope: ${skillDirs.join(", ")}. Do not create or sync skill directories for unselected engines.`,
    `If ctx7 writes to ${ctx7ScratchDir}/, that is a SCRATCH location for codex. You MUST canonicalize via \`vf skills import\` then sync via \`vf skills sync --engine ${engines[0]}\`. The scratch directory will be pruned after Phase 2 completes.`,
    "CRITICAL: Always use the --engine flag on `vf skills sync` and `vf skills verify-sync` — without it they default to copilot but the prompt must remain explicit.",
    "Verify with `vf skills validate` and regenerate `.vibeflow/SKILL_INDEX.md`.",
    "",
    "--- PART 2: Phase skill enrichment ---",
    phases.length > 0
      ? [
          `User declared ${phases.length} phase(s): ${phases.map((p) => p.name).join(", ")}.`,
          "For EACH phase, create or enrich a phase skill under `.vibeflow/skills/<phase-name>/SKILL.md`:",
          "",
          "  a. Read phase details from the intake:",
          `     - Each phase has inputs, outputs, template, and description.`,
           "  b. Check each phase: was it provisioned with a template or enriched?",
           "     - Read `.vibeflow/skills/<phase-name>/SKILL.md` frontmatter:",
           "       `status: template` = user did NOT provide in/out paths.",
           "       → Skip SKILL.md body enrichment. Template is the skill body.",
           "       → Still run step e (create references/) for this phase.",
           "         Template body has generic steps; references/{templates,examples}/",
           "         add project-specific context.",
           "       `status: baseline` = user provided in/out paths. The skill has",
           "       Example paths filled but needs AI enrichment.",
           "       → Enrich this phase. Go to step d.",
           "       `status: enriched` = already enriched by a previous run.",
           "       → Skip enrichment. Already done.",
           "",
           "  ⚠ DO NOT TOUCH `.vibeflow/WORKFLOW_STATE.json`.",
           "    The `ai-init-workflow-state-writer` unit (parallel) writes this file.",
           "    Writing here races with it → corrupted or overwritten state.",
           "    It scans `.vibeflow/skills/` and injects stack skills itself.",
           "  c. Map the phase to matching stack skills (DYNAMIC):",
           "     - This project's stack is already detected in `stack-evidence.md`.",
           "     - Stack skills were already created in PART 1 (e.g. under `.vibeflow/skills/`).",
           "     - For EACH phase, determine which existing stack skills match:",
           "       • Read phase name + description + scope (input/output paths) —",
           "         they hint at which stack layer the phase works on.",
           "       • Read `.vibeflow/skills/` — list every installed skill.",
           "       • Cross-reference: a phase working with Java files → match",
           "         the 'spring-boot' skill IF it exists in the list (do NOT",
           "         invent it). A phase working with Python files → match",
           "         the 'fastapi' skill IF it exists. Phase using Playwright",
           "         → match 'playwright' if it exists.",
           "       • NEVER hardcode a stack name that doesn't exist in `.vibeflow/skills/`.",
           "       • If no stack skills exist (project has no tech detected),",
           "         skip `requires` entirely — the phase still works.",
           "     - Use `.vibeflow/ai-context/stack-evidence.md` to confirm which",
           "       frameworks/libraries are actually in the project.",
            "  d. Create or enrich SKILL.md (ANTHROPIC_SKILL_STANDARD.md format) ONLY for phases that need enrichment (step b said skip otherwise).",
           "     The skill body MUST follow this structure. Fill EACH section with",
           "     CONCRETE, PHASE-SPECIFIC content. Do NOT leave generic placeholders.",
           "",
           "     === DETAIL LEVEL RULE ===",
           "     For EACH step in Execution Logic, name the specific artifact files the output path implies.",
           "     DO NOT hardcode artifact lists by phase name. Instead, ANALYZE the actual",
           "     `{{INPUT_PATH}}` and `{{OUTPUT_PATH}}`:",
           "       - Read the file extensions, directory names, and file names in both paths.",
           "         They reveal the input format → output format transformation.",
           "       - If output path contains `entity` or `domain`, steps must include Entity/DTO/Mapper.",
           "       - If output path contains `controller` or `api`, steps must include API contracts.",
           "       - If output path contains `test`, steps must include test cases and assertions.",
           "       - If output path contains `.md`, steps must include structured markdown sections.",
           "       - If output path contains `.sql` or `changelog`, steps must include DB migrations.",
           "       - If output path contains `.py`, steps must include FastAPI endpoints + schemas.",
           "       - If output path contains `.html` or `template`, steps must include Thymeleaf views.",
           "       - General rule: look at the output directory tree and file type → derive artifacts.",
           "     Example: output = `brain/docs/detail_designs/P03_0001.md`",
           "       → Read existing similar files in `brain/docs/` to understand format conventions.",
           "       → Steps: interface table, entity schema, sequence diagram, error code table.",
           "     Example: output = `brain/eps/src/main/java/.../controller/`",
           "       → Read existing controllers in same package for convention matching.",
           "       → Steps: Controller class, Request DTO, Response DTO, Service method, Test class.",
           "     IF `{{INPUT_PATH}}` or `{{OUTPUT_PATH}}` is `_not provided_` (user didn't specify),",
           "       infer from `{{TEMPLATE}}` if available, or from the phase name + project stack",
           "       in `.vibeflow/ai-context/stack-evidence.md`.",
           "",
           "     === REFERENCES SECTIONS ===",
           "     In the SKILL.md body, add these sections after `## Error Handling`:",
           "",
           "     ## Context",
           "     Which topic files this phase reads in addition to PROJECT_CONTEXT.md:",
           "     - All phases read `.vibeflow/PROJECT_CONTEXT.md` (core ~150 lines).",
           "     - Map: requirements-analysis → (no extra);",
           "       basic-design → `.vibeflow/context/modules.md`, `.vibeflow/context/architecture.md`;",
           "       detail-design → `.vibeflow/context/modules.md`, `.vibeflow/context/architecture.md`,",
           "         `.vibeflow/context/database.md`, `.vibeflow/context/api.md`, `.vibeflow/context/conventions.md`;",
           "       implement → `.vibeflow/context/conventions.md`, `.vibeflow/context/modules.md`,",
           "         `.vibeflow/context/database.md`, `.vibeflow/context/security.md`;",
           "       testing → `.vibeflow/context/testing.md`;",
           "       verify → read all topic files (cross-check).",
           "",
           "     ## References",
           "",
           "     === SKILL.md STRUCTURE ===",
           "     ```yaml",
           "     ---",
           "     name: <kebab-phase-name>",
           "     description: <one-line summary>",
           "     version: 1.0.0",
           "     status: enriched",
           "     requires: [<stack-skill-from-step-c>]",
           "     triggers:",
           "       - workflow-phase:<phase-name>",
           "     ---",
           "     ",
           "     # <Phase-Name> — Skills for <project>",
           "     ",
           "     ## Purpose",
           "     <one paragraph, specific to this project>",
           "     ",
           "     ## When to Use",
           "     <project-specific conditions>",
           "     ",
           "     ## When NOT to Use",
           "     <project-specific anti-conditions>",
           "     ",
           "     ## Inputs",
           "     | Name | Type | Required | Notes |",
           "     |------|------|----------|-------|",
           "     | `{{INPUT_PATH}}` | file path(s) | yes | <describe> |",
           "     | `{{TEMPLATE}}` | file path or hint | no | Optional |",
           "     | Project context | auto-discovered | yes | Read PROJECT_CONTEXT.md |",
           "     ",
           "     ## Execution Logic",
           "     <Numbered steps. Each step names a concrete artifact file and its purpose.>",
           "     <Steps must cover: artifact creation → build → test → verify>",
           "     1. <first concrete artifact, e.g. Create `entity/XxxEntity.java`>",
           "     2. <second concrete artifact>",
           "     N. Build: `<specific build command>`",
           "     N+1. Test: `<specific test command>`",
           "     N+2. Verify output in `{{OUTPUT_PATH}}`.",
           "     N+3. Record evidence in `.vibeflow/knowledge/log.md`.",
           "     ",
           "     ## Outputs",
           "     | Name | Type | Notes |",
           "     |------|------|-------|",
           "     | `{{OUTPUT_PATH}}` | file(s) | <concrete artifacts expected> |",
           "     | references/templates/ | file(s) | Templates for this phase |",
           "     | references/examples/ | file(s) | Examples from this project |",
           "     | Evidence log | `.vibeflow/knowledge/log.md` | Paths, counts |",
           "     ",
           "     ## Constraints",
           "     <project-specific constraints>",
           "     ",
           "     ## Guardrails",
           "     <project-specific automated checks>",
           "     ",
            "     ## Error Handling",
            "     | Failure | Action |",
            "     |---------|--------|",
            "     | <scenario> | <action> |",
            "     ",
            "     ## Context",
            "     - Core: `.vibeflow/PROJECT_CONTEXT.md` (all phases read this)",
            "     - <topic-specific context files for this phase: `.vibeflow/context/<topic>.md`>",
            "     - See `.vibeflow/context/README.md` for full topic→phase mapping.",
            "     ",
            "     ## References",
            "     - Templates: `.vibeflow/skills/<phase-name>/references/templates/`",
           "       Templates created during enrichment from project conventions.",
           "     - Examples: `.vibeflow/skills/<phase-name>/references/examples/`",
           "       Concrete examples from the vf init questionnaire.",
           "     - ANTHROPIC_SKILL_STANDARD.md — required frontmatter format",
           "     - `.vibeflow/PROJECT_CONTEXT.md` — project domain and conventions",
           "     - `.vibeflow/knowledge/log.md` — evidence log",
           "     ```",
           "  e. Create references/ directory for EACH enriched phase (and ALSO for template-provisioned phases — references are universal, not gated by status):",
           "     Path: `.vibeflow/skills/<phase-name>/references/`",
           "     Required subdirs:",
           "       - `templates/` — at least 1 template file. If `{{TEMPLATE}}` resolves to a",
           "         real project file, copy it here. If not, AI generates a template based on",
           "         the project's existing docs/ in `.vibeflow/PROJECT_CONTEXT.md` and the",
           "         output path. User can edit later.",
           "       - `examples/` — at least 1 example. If the phase has user-provided concrete",
           "         in/out paths from the questionnaire, create a small stub output file",
           "         showing the expected structure (just file skeleton, no full content).",
           "     Both subdirs MUST contain a `README.md` listing what each file is for.",
           "",
         ].join("\n")
      : "(No phases declared — skip phase skill enrichment.)",
    "",
    "--- PART 3: Engine cleanup ---",
    `Selected engine(s): ${engines.join(", ")}`,
    `Active skill mirror dirs: ${skillDirs.join(", ")}`,
    unselectedSkillDirs.length > 0
      ? `DELETE unselected engine skill dirs (entire dir if exists): ${unselectedSkillDirs.join(", ")}`
      : "(All engines selected — no cleanup needed.)",
    unselectedInstrFiles.length > 0
      ? `DELETE unselected engine instruction files: ${unselectedInstrFiles.join(", ")}`
      : "",
    "Also DELETE `.claude/` top-level dir when Claude is NOT the selected engine.",
    "Also DELETE `.agents/` top-level dir when Codex is NOT the selected engine.",
    "",
    "--- PART 4: Verification ---",
    "- `vf skills validate` passes (no errors).",
    "- `.vibeflow/SKILL_INDEX.md` regenerated via `vf skills list`.",
    "- Each phase skill has templated execution steps with `{{INPUT_PATH}}`/`{{OUTPUT_PATH}}` variables plus a concrete Example section.",
    "- Unselected engine dirs are gone (verify with `ls -d .claude .agents 2>/dev/null`).",
    "- Confidence = 1.0 with evidence paths cited.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Per-adapter acceptance signal the reviewer uses to decide pass/fail.
 *  The strings are evidence patterns: the unit's recorded evidence must
 *  cite at least one of these (file path) for the reviewer to pass it. */
const ADAPTER_ACCEPTANCE: Record<AiInitAdapterName, string> = {
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
const ADAPTER_DESCRIPTION: Record<AiInitAdapterName, string> = {
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
const ROLE_SKILLS: Record<RoleName, { injected: string[]; required: string[] }> = {
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
function resolveOwner(hint: string | undefined, detected: RoleName[]): RoleName {
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
function phaseSlug(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned.length > 0 ? cleaned : "unnamed";
}

/** Skill wiring for each Tier-1 adapter (looked up via the role it
 *  maps to in ADAPTER_OWNER). Adapters that share a role share the
 *  same catalogue. */
function adapterSkills(name: AiInitAdapterName): { injected: string[]; required: string[] } {
  return ROLE_SKILLS[ADAPTER_OWNER[name]];
}

/** Build the spec text for one Tier-1 adapter unit, given the live
 *  project context. The spec is what the engine receives as `unit.spec`
 *  in the dispatch prompt. */
function buildAdapterSpec(
  name: AiInitAdapterName,
  profile: ProjectProfile,
  intake: AiInitIntake,
  detectedRoles: RoleName[],
): string {
  const goal = intake.goal?.trim() || "Set up VibeFlow AI guidance for this repository";
  const engines = (intake.engines ?? []).join(", ") || "(default: copilot)";
  const roleList = detectedRoles.length ? detectedRoles.join(", ") : ROLE_NAMES.join(", ");
  return [
    `## ${name}`,
    "",
    `Goal: ${goal}`,
    `Engines: ${engines}`,
    `Project: ${profile.name} (${profile.languages.join(", ") || "unknown"})`,
    `Active roles in this repo: ${roleList}`,
    "",
    name === "ai-init-instruction-writer"
      ? instructionDescription(selectedInstructionScope(intake))
      : name === "ai-init-skill-curator"
        ? skillCuratorDescription(intake, profile)
        : ADAPTER_DESCRIPTION[name],
  ].join("\n");
}

/** Map project profile to candidate stack skill names.
 *  Uses the scanner's own findings (detected languages/frameworks) and
 *  converts each to a kebab-case skill name. This is a general algorithm
 *  — no hardcoded stack names — so it works for ANY project regardless
 *  of tech stack. The skill-curator AI adapter creates skills matching
 *  these names; this function just hints at planning time so phase
 *  units already reference them. */
function stackSkillsForProfile(profile: ProjectProfile): string[] {
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

/** Build one Tier-2 work unit per WorkflowPhase in the intake. Each
 *  phase becomes a unit the orchestrator can dispatch in parallel
 *  alongside the Tier-1 adapter units. The unit's owner_agent,
 *  skills_injected, and skills_required are derived from the resolved
 *  role so the reviewer gates on the right evidence. Stack skills
 *  matching the project profile are injected automatically. */
function buildPhaseUnits(intake: AiInitIntake, detectedRoles: RoleName[], profile: ProjectProfile): AiInitUnit[] {
  const phases = intake.workflowPhases ?? [];
  if (phases.length === 0) return [];
  // T4: enforce phase.name uniqueness. Two phases with the same name would
  // produce two units whose `name` differs only by the position suffix
  // (e.g. ai-init-phase-build-cli-1 and ai-init-phase-build-cli-2), but
  // they share the same slug — a re-run would shadow the first in
  // WORKFLOW_STATE.json and the orchestrator's conflict detection would
  // silently merge them. Case-insensitive: "build-cli" and "Build-CLI"
  // are visually identical in the dashboard.
  const seen = new Set<string>();
  for (const phase of phases) {
    const key = phase.name.trim().toLowerCase();
    if (seen.has(key)) {
      throw new Error(
        `duplicate phase name "${phase.name}" in workflowPhases (phase names must be unique, case-insensitive)`,
      );
    }
    seen.add(key);
  }
  return phases.map((phase, idx): AiInitUnit => {
    const slug = phaseSlug(phase.name);
    const unitName = `ai-init-phase-${slug}-${idx + 1}`;
    const owner = resolveOwner(phase.ownerHint, detectedRoles);
    const roleSkills = ROLE_SKILLS[owner];
    const scope = (phase.outputs ?? []).map((o) => o.trim()).filter(Boolean);
    const finalScope = scope.length > 0 ? scope : [`.vibeflow/phase-outputs/${slug}.md`];
    const acceptance = phase.dod?.trim() || `phase ${phase.name} completed (one output path cited)`;
    const spec = [
      `## ${unitName}`,
      "",
      `Phase: ${phase.name}`,
      phase.description ? `Description: ${phase.description}` : "",
      phase.inputs?.length ? `Inputs: ${phase.inputs.join(", ")}` : "",
      phase.outputs?.length ? `Outputs: ${phase.outputs.join(", ")}` : "",
      phase.template ? `Template: ${phase.template}` : "",
      phase.dod ? `Definition of done: ${phase.dod}` : "",
      "",
      "Execute this phase end-to-end. Produce the declared outputs and",
      "stop. Do not start the next phase. If a declared output cannot be",
      "produced, mark the unit blocked and explain why in the JSON output.",
    ]
      .filter(Boolean)
      .join("\n");
    const injectedSet = new Set<string>(roleSkills.injected);
    const requiredSet = new Set<string>(roleSkills.required);
    for (const skill of stackSkillsForProfile(profile)) {
      injectedSet.add(skill);
      requiredSet.add(skill);
    }
    return {
      name: unitName,
      status: "pending",
      confidence: 0,
      owner_agent: owner,
      spec,
      scope: finalScope,
      acceptance,
      skills_injected: [...injectedSet],
      skills_required: [...requiredSet],
      depends_on: [],
      gates: { build: "pending", lint: "pending", test: "pending", review: "pending" },
      resources: { agents: 0, tokens: 0, cost_usd: 0, wall_seconds: 0 },
      evidence: [],
    };
  });
}

/**
 * Build Phase-2 phase-skill enrichment units. One unit per phase that
 * has BOTH concrete inputs AND concrete outputs. Each unit asks the
 * engine to read the declared input files as STRUCTURAL EXAMPLES,
 * apply the skill-creator methodology, and enrich the per-phase skill
 * file (already generated by Phase 1.5) with a REUSABLE TEMPLATE that
 * captures the transformation pattern (input structure → output
 * structure), NOT the task-specific content.
 *
 * The resulting skill body MUST remain valid for a future task of the
 * same phase type. It MUST NOT embed concrete requirement IDs (e.g.
 * BR-001, AC-032, E-014) or hardcode file paths from the current
 * project. Project/task-specific values are expressed as placeholders
 * (`{{...}}`) that the dispatch layer fills at execution time.
 *
 * These units are dispatched in parallel with the 8 adapter units
 * inside `runAiInitWorkflow`. They do NOT participate in the long
 * orchestrator loop — they run a single AI pass per phase.
 *
 * Phases without input/output paths are skipped here: Phase 1.5 already
 * copied the common template skill for them, and there is nothing
 * project-specific to enrich against.
 *
 * One engine call per `vf init` run: previously this returned N
 * parallel units (one per phase), each spawning its own engine call.
 * With the typical 3-phase workflow that meant 3 separate engine
 * invocations on the same prompt shape — burning rate-limit budget and
 * ballooning wall-clock. The batched unit below packages all phases
 * into a single spec, the engine processes them in one turn, and the
 * reviewer gates on every per-phase skill file existing on disk.
 */
export function buildPhaseSkillEnrichmentUnits(
  intake: AiInitIntake,
  engines: Engine[],
  skillPathFor: (engine: Engine, slug: string) => string,
): AiInitUnit[] {
  const phases = (intake.workflowPhases ?? []).filter((phase) => {
    const inputs = (phase.inputs ?? []).map((s) => s.trim()).filter(Boolean);
    const outputs = (phase.outputs ?? []).map((s) => s.trim()).filter(Boolean);
    return inputs.length > 0 && outputs.length > 0;
  });
  if (phases.length === 0 || engines.length === 0) return [];
  const target = engines[0] as Engine;

  // Build the per-phase spec sections once and stitch them into one
  // master spec. The engine sees the same per-phase content as before
  // (it just has to walk more sections in one turn), so the per-phase
  // output quality is identical.
  const phaseSections = phases
    .map((phase, idx) => {
      const slug = phaseSlug(phase.name);
      const inputs = (phase.inputs ?? []).map((s) => s.trim()).filter(Boolean);
      const outputs = (phase.outputs ?? []).map((s) => s.trim()).filter(Boolean);
      const skillPath = skillPathFor(target, slug);
      return [
        `### Phase ${idx + 1}: ${phase.name}`,
        "",
        `Slug: ${slug}`,
        phase.description ? `Description: ${phase.description}` : "",
        `Skill file to enrich: \`${skillPath}\``,
        `Inputs (read these to understand the PROJECT STRUCTURE, not to copy): ${inputs.join(", ")}`,
        `Outputs (do NOT touch — evidence paths for the next phase): ${outputs.join(", ")}`,
        phase.template ? `Template: ${phase.template}` : "",
        phase.dod ? `Definition of done: ${phase.dod}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const skillPaths = phases.map((p) => skillPathFor(target, phaseSlug(p.name)));
  const unitName = "ai-init-skill-enrich-batch";
  const spec = [
    `## ${unitName}`,
    "",
    `Enrich ${phases.length} phase skill template(s) in a single pass. Each section below is one phase — process them sequentially within this turn.`,
    "",
    phaseSections,
    "",
    "For EACH phase above:",
    "1. Read every input file to identify the STRUCTURE and CONVENTIONS.",
    "2. Read the current skill file (the TEMPLATE SKELETON).",
    "3. Extract the TRANSFORMATION PATTERN from input→output (not the specific content).",
    "4. Rewrite the skill file in place as a REUSABLE TEMPLATE:",
    "   - Use placeholders like `{{project.name}}`, `{{task.inputs}}`, `{{task.business_rules}}`",
    "   - Do NOT embed task-specific requirement IDs (e.g. BR-001, AC-032, E-014)",
    "   - Do NOT hardcode file paths from the current project",
    "   - Do NOT copy business rules or specific data shapes from the samples",
    "   - Do describe the STRUCTURE that the input MUST follow",
    "   - Do describe what TRANSFORMATIONS to apply",
    "   - Do describe how to VERIFY the output is correct",
    "   - Include an Anti-Patterns section listing common mistakes",
    "5. The skill body MUST be reusable for a DIFFERENT task of the same phase type.",
    "6. Keep the frontmatter (name, description).",
    "7. Do NOT touch the output files — they belong to the next phase.",
    "8. Return JSON: {status: 'verifying'|'blocked', confidence, evidence: [skillPath, ...]}.",
  ].join("\n");

  return [
    {
      name: unitName,
      status: "pending",
      confidence: 0,
      owner_agent: "skill-author",
      spec,
      scope: skillPaths,
      acceptance: `all ${skillPaths.length} phase skill file(s) exist and are non-empty: ${skillPaths.join(", ")}`,
      skills_injected: ["vf-skills", "skill-creator"],
      skills_required: ["ctx7:skill-authoring"],
      depends_on: ["ai-init-analyzer"],
      gates: { build: "pending", lint: "pending", test: "pending", review: "pending" },
      resources: { agents: 0, tokens: 0, cost_usd: 0, wall_seconds: 0 },
      evidence: [],
    },
  ];
}

/**
 * P1-7: build a single batched unit that combines the four optional
 * finisher adapters (workflow-state-writer) into one engine call.
 */
export function buildFinisherBatchUnit(
  profile: ProjectProfile,
  intake: AiInitIntake,
  detectedRoles: RoleName[],
): AiInitUnit {
  const goal = intake.goal?.trim() || "Set up VibeFlow AI guidance for this repository";
  const engines = (intake.engines ?? []).join(", ") || "(default: copilot)";
  const roleList = detectedRoles.length ? detectedRoles.join(", ") : ROLE_NAMES.join(", ");

  const sections = [
    {
      title: "ai-init-workflow-state-writer",
      scope: [".vibeflow/WORKFLOW_STATE.json"],
      body: ADAPTER_DESCRIPTION["ai-init-workflow-state-writer"],
    },
  ];

  const sectionText = sections
    .map(
      (s, i) =>
        `### Section ${i + 1}: ${s.title}\n\n**Output file**: \`${s.scope[0]}\`\n\n**Scope** (must exist on disk when you're done): ${s.scope.join(", ")}\n\n${s.body}`,
    )
    .join("\n\n");

  const allScope = sections.map((s) => s.scope[0] as string);
  const unitName = "ai-init-finishers-batch";
  const spec = [
    `## ${unitName}`,
    "",
    `Goal: ${goal}`,
    `Engines: ${engines}`,
    `Project: ${profile.name} (${profile.languages.join(", ") || "unknown"})`,
    `Active roles in this repo: ${roleList}`,
    "",
    "This is a BATCHED unit — process the four sections below in a single turn.",
    "Each section owns exactly ONE file. Do not write to any other path. Read",
    "existing files before editing; merge generated content into the existing",
    "file rather than rewriting it whole. Use the incremental-authoring rule",
    "in AGENTS.md (small first part, then append in follow-up edits if a",
    "section's output would exceed ~1000 lines).",
    "",
    sectionText,
    "",
    "Return JSON: {status: 'verifying'|'blocked', confidence, evidence: [scope, ...]}",
  ].join("\n");

  return {
    name: unitName,
    status: "pending",
    confidence: 0,
    owner_agent: "dispatch-runner",
    spec,
    scope: allScope,
    acceptance: `all ${allScope.length} finisher file(s) exist and are non-empty: ${allScope.join(", ")}`,
    skills_injected: ["vf-skills"],
    skills_required: [],
    depends_on: ["ai-init-analyzer", "ai-init-context-updater"],
    gates: { build: "pending", lint: "pending", test: "pending", review: "pending" },
    resources: { agents: 0, tokens: 0, cost_usd: 0, wall_seconds: 0 },
    evidence: [],
  };
}

/**
 * Decompose the AI-init phase into 2 tiers of work units.
 *
 * Pure: no I/O. The orchestrator can feed the result straight into
 * `planWorkUnits` + `scheduleWaves` (no conflicts; all units land in
 * wave 0).
 *
 * @param profile       scanner profile (always available — applyIntake
 *                      calls scanRepo before phase 2)
 * @param intake        trimmed intake answers (all fields optional)
 * @param detectedRoles roles detectRolesForRepo returned for this repo.
 *                      Used to (a) interpolate into adapter specs and
 *                      (b) resolve phase.ownerHint into owner_agent.
 */
export function planAiInitUnits(
  profile: ProjectProfile,
  intake: AiInitIntake,
  detectedRoles: RoleName[] = [...ROLE_NAMES],
): AiInitUnit[] {
  const adapterUnits: AiInitUnit[] = AI_INIT_ADAPTER_NAMES.map((name): AiInitUnit => {
    const spec = buildAdapterSpec(name, profile, intake, detectedRoles);
    const skills = adapterSkills(name);
    const scope =
      name === "ai-init-instruction-writer"
        ? selectedInstructionScope(intake)
        : ADAPTER_SCOPE[name];
    return {
      name,
      status: "pending",
      confidence: 0,
      owner_agent: ADAPTER_OWNER[name],
      spec,
      scope,
      acceptance:
        name === "ai-init-instruction-writer"
          ? instructionAcceptance(scope)
          : ADAPTER_ACCEPTANCE[name],
      skills_injected: [...skills.injected],
      skills_required: [...skills.required],
      depends_on: [...(ADAPTER_DEPENDS_ON[name] ?? [])],
      gates: { build: "pending", lint: "pending", test: "pending", review: "pending" },
      resources: { agents: 0, tokens: 0, cost_usd: 0, wall_seconds: 0 },
      evidence: [],
    };
  });
  const phaseUnits = buildPhaseUnits(intake, detectedRoles, profile);
  return [...adapterUnits, ...phaseUnits];
}

/**
 * Reviewer used by the orchestrator: a unit passes when its recorded
 * evidence cites at least one path matching its acceptance pattern. This
 * is intentionally simple — a richer review (e.g. diff-based) is out of
 * scope and would require a second engine pass. The point is to gate
 * `status = done` on real on-disk evidence, not on the engine's word.
 */
export function aiInitReviewer(
  unit: WorkUnit,
  outcome: { status: WorkUnit["status"]; confidence: number; evidence: string[] },
  // MINOR-4: pass the project base so the reviewer can resolve cited
  // paths against it. Defaults to process.cwd() for back-compat with
  // existing tests (which chdir into a tmpdir before each case).
  base: string = process.cwd(),
): { pass: boolean; reason: string } {
  if (outcome.status === "blocked") {
    // Production dispatchers return "verifying" (per src/orchestrator/run.ts:96-99);
    // the reviewer is the gate, not the dispatcher. Only "blocked" is fatal.
    return { pass: false, reason: "dispatcher reported status=blocked" };
  }
  if (outcome.confidence < 1) {
    return { pass: false, reason: `confidence=${outcome.confidence} < 1.0` };
  }
  if (!outcome.evidence?.length) {
    return { pass: false, reason: "no evidence recorded" };
  }
  const name = unit.name as string;
  // Helper: for an evidence line, extract a path-like token that contains p.
  // - "edited CLAUDE.md" → "CLAUDE.md" (idx 7, word start at 0, end at 16)
  // - "updated .vibeflow/SETTINGS.json tools.codegraph" → ".vibeflow/SETTINGS.json"
  // - "CLAUDE.md content" → "CLAUDE.md" (idx 0, wordStart -1)
  const citeExists = (e: string, required: string[]): string | null => {
    for (const p of required) {
      const idx = e.indexOf(p);
      if (idx === -1) continue;
      const after = e.slice(idx);
      const wordEndRel = after.search(/\s/);
      const end = wordEndRel === -1 ? e.length : idx + wordEndRel;
      const before = e.slice(0, idx);
      const wordStart = before.search(/\S+$/);
      const start = wordStart === -1 || e.slice(wordStart, idx).trim() === "" ? wordStart : idx;
      const candidate = start === -1 ? e.slice(idx, end) : e.slice(start, end);
      if (candidate.length > 0) return candidate;
    }
    return null;
  };
  const pathIsFile = (p: string): boolean => {
    // Returns true only for existing regular files. Rejects directories,
    // symlinks-to-dirs, and missing paths. Catches the bug where a unit
    // could claim "I wrote `.vibeflow/skills/`" (a dir) and pass review
    // (MINOR-2 fix). Cited paths may be relative; resolve them against
    // the project base (MINOR-4 fix).
    try {
      return statSync(resolve(base, p)).isFile();
    } catch {
      return false;
    }
  };
  const pathIsDir = (p: string): boolean => {
    try {
      return statSync(resolve(base, p)).isDirectory();
    } catch {
      return false;
    }
  };
  const checkFileExists = (
    e: string,
    required: string[],
  ): { ok: true } | { ok: false; reason: string } => {
    // File-scope entries (don't end with "/"): cited path must exist on disk.
    // Dir-scope entries (end with "/"): the path that starts at the dir prefix
    // and continues to the next whitespace must exist on disk.
    // Both are checked independently. The substring pre-filter upstream
    // guarantees at least one match in REQUIRED; if it was a file path, it
    // must exist; if a dir-scope path, the cited file inside the dir must exist.
    const dirEntries = required.filter((p) => p.endsWith("/"));
    const fileEntries = required.filter((p) => !p.endsWith("/"));
    if (fileEntries.length > 0) {
      const cited = citeExists(e, fileEntries);
      if (cited && !pathIsFile(cited)) {
        return {
          ok: false,
          reason: `path is not a regular file (missing or a directory): ${cited} (claimed by evidence "${e}")`,
        };
      }
    }
    if (dirEntries.length > 0) {
      for (const p of dirEntries) {
        const idx = e.indexOf(p);
        if (idx === -1) continue;
        const before = e.slice(0, idx);
        const wordStart = before.search(/\S+$/);
        const start = wordStart === -1 || e.slice(wordStart, idx).trim() === "" ? wordStart : idx;
        const after = e.slice(idx);
        const wordEndRel = after.search(/\s/);
        const end = wordEndRel === -1 ? e.length : idx + wordEndRel;
        const candidate = start === -1 ? e.slice(idx, end) : e.slice(start, end);
        if (pathIsFile(candidate) || pathIsDir(candidate)) return { ok: true };
        return {
          ok: false,
          reason: `path is not a regular file (missing or a directory): ${candidate} (claimed by evidence "${e}")`,
        };
      }
    }
    return { ok: true };
  };
  if (name === "ai-init-instruction-writer") {
    // Fallback uses the INIT_DEFAULT_ENGINE (copilot) scope, NOT the
    // all-3-engines union, so a unit missing its scope can't be passed
    // by evidence citing an unselected engine's instruction file.
    const REQUIRED = unit.scope?.length
      ? unit.scope
      : ENGINE_INSTRUCTION_SCOPE[INIT_DEFAULT_ENGINE];
    const hit = outcome.evidence.some((e) => REQUIRED.some((p) => e.includes(p)));
    if (!hit) {
      return {
        pass: false,
        reason: `no evidence cites one of: ${REQUIRED.join(", ")}`,
      };
    }
    // T3: file-exists check on the cited path.
    for (const e of outcome.evidence) {
      const r = checkFileExists(e, REQUIRED);
      if (!r.ok) return { pass: false, reason: r.reason };
    }
  }
  if (name === "ai-init-skill-curator") {
    const REQUIRED = unit.scope?.length
      ? unit.scope
      : (ADAPTER_SCOPE["ai-init-skill-curator"] ?? []);
    const hit = outcome.evidence.some((e) => REQUIRED.some((p) => e.includes(p)));
    if (!hit) {
      return {
        pass: false,
        reason: `no evidence cites one of: ${REQUIRED.join(", ")}`,
      };
    }
    // T3: file-exists check.
    for (const e of outcome.evidence) {
      const r = checkFileExists(e, REQUIRED);
      if (!r.ok) return { pass: false, reason: r.reason };
    }
  }
  if (name === "ai-init-workflow-state-writer") {
    const hit = outcome.evidence.some(
      (e) => e.includes("WORKFLOW_STATE") || e.includes("workflow-state"),
    );
    if (!hit) {
      return {
        pass: false,
        reason: "no evidence cites WORKFLOW_STATE.json — the workflow-state-writer must update it",
      };
    }
    // T3: file-exists check.
    for (const e of outcome.evidence) {
      const r = checkFileExists(e, ADAPTER_SCOPE["ai-init-workflow-state-writer"] ?? []);
      if (!r.ok) return { pass: false, reason: r.reason };
    }
  }
  // P1-7: batched finisher unit. The engine must cite every scope
  // path in evidence AND every cited file must exist on disk —
  // partial batches are fails (same all-or-nothing contract as
  // the phase-skill enrichment batch).
  if (name === "ai-init-finishers-batch") {
    const REQUIRED = unit.scope ?? [];
    if (REQUIRED.length === 0) {
      return { pass: false, reason: "finisher-batch unit has no scope paths" };
    }
    const missing = REQUIRED.filter(
      (p) => !outcome.evidence.some((e) => e.includes(p) || p.endsWith(e) || e.endsWith(p)),
    );
    if (missing.length > 0) {
      return {
        pass: false,
        reason: `finisher-batch evidence missing ${missing.length}/${REQUIRED.length} file(s): ${missing.join(", ")}`,
      };
    }
    for (const e of outcome.evidence) {
      const r = checkFileExists(e, REQUIRED);
      if (!r.ok) return { pass: false, reason: r.reason };
    }
  }
  if (name === "ai-init-analyzer") {
    // T3: file-exists check on the single scope file.
    for (const e of outcome.evidence) {
      const r = checkFileExists(e, ADAPTER_SCOPE["ai-init-analyzer"] ?? []);
      if (!r.ok) return { pass: false, reason: r.reason };
    }
  }


if (name.startsWith("ai-init-phase-")) {
    const REQUIRED = unit.scope ?? [];
    const hit = outcome.evidence.some((e) =>
      REQUIRED.some((p) => e.includes(p) || p.endsWith(e) || e.endsWith(p)),
    );
    if (!hit) {
      return {
        pass: false,
        reason: `no phase evidence cites one of the declared outputs: ${REQUIRED.join(", ")}`,
      };
    }
    // MINOR-3: phase units now also pass through the file-exists check
    // (consistency with adapter units). Previously a phase could claim
    // to write `.vibeflow/phase-outputs/foo.md` and pass review even
    // when the file wasn't on disk.
    for (const e of outcome.evidence) {
      const r = checkFileExists(e, REQUIRED);
      if (!r.ok) return { pass: false, reason: r.reason };
    }
  }
  // Phase-skill enrichment units: every skill file in scope must be
  // cited in evidence AND exist on disk. The pre-batch shape had 1
  // path per unit; the batched shape (`ai-init-skill-enrich-batch`)
  // carries N paths and requires all of them to be written — a partial
  // batch is still a fail (the user can re-run to retry, but we don't
  // claim success on a half-finished enrichment).
  if (name.startsWith("ai-init-skill-enrich-")) {
    const REQUIRED = unit.scope ?? [];
    if (REQUIRED.length === 0) {
      return { pass: false, reason: "enrichment unit has no scope paths" };
    }
    const missing = REQUIRED.filter(
      (p) => !outcome.evidence.some((e) => e.includes(p) || p.endsWith(e) || e.endsWith(p)),
    );
    if (missing.length > 0) {
      return {
        pass: false,
        reason: `enrichment evidence missing ${missing.length}/${REQUIRED.length} skill file(s): ${missing.join(", ")}`,
      };
    }
    for (const e of outcome.evidence) {
      const r = checkFileExists(e, REQUIRED);
      if (!r.ok) return { pass: false, reason: r.reason };
    }
  }
  return { pass: true, reason: "evidence + confidence 1.0" };
}
