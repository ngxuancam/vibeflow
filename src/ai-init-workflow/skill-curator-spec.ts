/**
 * Skill curator description builder.
 *
 * Builds the spec text for the ai-init-skill-curator adapter unit.
 * Extracted from descriptions.ts to keep each file under 400 LOC.
 */

import type { Engine } from "../core.js";
import type { ProjectProfile } from "../scanner.js";
import { selectedEngines } from "./descriptions.js";
import type { AiInitIntake } from "./types.js";
import { ENGINE_INSTRUCTION_SCOPE, ENGINE_SKILL_DIR } from "./types.js";
export function skillCuratorDescription(intake: AiInitIntake, profile: ProjectProfile): string {
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
          "     - Each phase has inputs, outputs, template, and description.",
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
          "     ## MCP Tools",
          "     This project has codegraph MCP tools configured by `vf init`:",
          "     - `codegraph_explore` — browse directory structure",
          "     - `codegraph_node` — read a file or listing",
          "     - `codegraph_search` — search symbols/patterns",
          "     - `codegraph_callers` — find callers of a function",
          "     Priority: explore > node > search > callers > native grep/glob/read/bash.",
          "     Mention specific tools in Execution Logic steps where relevant.",
          "     ",
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
          "     ## MCP Tools",
          "     - `codegraph_explore` — browse directory structure",
          "     - `codegraph_node` — read a file or listing",
          "     - `codegraph_search` — search symbols/patterns",
          "     - `codegraph_callers` — find callers of a function",
          "     - Priority: explore > node > search > callers > native grep/glob/read/bash",
          "",
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
          "     ⚠ PRESERVE EXISTING REFERENCE FILES: Some files in references/ may already",
          "       exist from Phase 1 (pre-populated by `vf init`). For example, the testing",
          "       phase may already have `viewpoint_testing.md` — a common test viewpoint base",
          "       knowledge file shipped with VibeFlow. Do NOT delete or overwrite these files.",
          "       Only add new content to templates/ and examples/. Update the `## References`",
          "       section in SKILL.md to reference any pre-existing files.",
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
