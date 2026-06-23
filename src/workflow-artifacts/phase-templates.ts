import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { yamlQuote } from "../agents/render.js";
import type { WorkflowPhase } from "../ai-init-workflow.js";
import { CTX_DIR, VERSION } from "../core.js";
import { phaseSlug } from "./types.js";

// ── Phase skill template reader ──────────────────────────────────────────

/**
 * Read a phase template from the vibeflow package's `templates/skills/` directory.
 * Resolution: `new URL("../templates/skills/...", import.meta.url)` resolves correct
 * path in both dev mode (src/) and installed package (dist/ → ../templates/skills/).
 * Returns the raw template text, or null if not found.
 */
export function readPhaseSkillTemplate(phase: WorkflowPhase): string | null {
  const slug = phaseSlug(phase);
  const tmplUrl = new URL(
    `../templates/skills/${slug}/SKILL.md`,
    import.meta.url,
  );
  try {
    const path = tmplUrl.pathname;
    if (existsSync(path)) return readFileSync(path, "utf8");
  } catch {
    /* fallback: not found */
  }
  return null;
}

/**
 * Render a phase skill to `.vibeflow/skills/<phase>/SKILL.md`.
 *
 * Uses the template from `templates/<phase>/SKILL.md` as the base structure,
 * fills `{{PROJECT_NAME}}` / `{{VERSION}}`, and populates the Example section
 * with the phase's concrete in/out paths (if provided). This way the skill
 * body never hardcodes paths — it uses `{{INPUT_PATH}}`/`{{OUTPUT_PATH}}`.
 *
 * When the template is not found, falls back to the legacy inline render.
 */
function renderPhaseSkillToCanonical(
  phase: WorkflowPhase,
  projectName: string,
  version: string,
  hasUserPaths = Boolean(phase.inputs?.length) ||
    Boolean(phase.outputs?.length),
): string {
  const slug = phaseSlug(phase);
  const name = phase.name;
  const desc = yamlQuote(phase.description || `Execute the ${name} phase.`);
  const inputSection = phase.inputs?.length
    ? `- **Input**: \`${phase.inputs.join("`, `")}\``
    : "- **Input**: _not provided_";
  const outputSection = phase.outputs?.length
    ? `- **Output**: \`${phase.outputs.join("`, `")}\``
    : "- **Output**: _not provided_";
  const templateSection = phase.template
    ? `- **Template**: \`${phase.template}\``
    : "- **Template**: _not provided_";

  // When the user provided concrete in/out paths, the skill is "baseline"
  // (has project-specific Example values but needs AI enrichment for
  // project-specific execution logic). Without paths, it stays "template".
  const status = hasUserPaths ? "baseline" : "template";

  // Try reading the package template first.
  const template = readPhaseSkillTemplate(phase);

  if (template) {
    let body = template
      .replace(/\{\{PROJECT_NAME\}\}/g, projectName)
      .replace(/\{\{VERSION\}\}/g, version)
      .replace(/^status: template$/m, `status: ${status}`);
    // Replace Example section with filled-in values
    body = body.replace(
      /\{\{phase\.inputs path\}\}/g,
      phase.inputs?.length ? phase.inputs.join(", ") : "_not provided_",
    );
    body = body.replace(
      /\{\{phase\.outputs path\}\}/g,
      phase.outputs?.length ? phase.outputs.join(", ") : "_not provided_",
    );
    body = body.replace(
      /\{\{template if provided\}\}/g,
      phase.template ?? "_not provided_",
    );
    return body;
  }

  // Fallback: render with the standard structure
  const lines: string[] = [
    "---",
    `name: ${slug}`,
    `description: ${desc}`,
    `version: ${version}`,
    `purpose: ${phase.description || `Execute the ${name} phase`}`,
    `status: ${status}`,
    "requires: []",
    "triggers:",
    `  - workflow-phase:${slug}`,
    "---",
    "",
    `# ${name} — ${projectName}`,
    "",
    "## Purpose",
    "",
    phase.description || `Execute the ${name} phase.`,
    "",
    "## When to Use",
    "",
    "- A task matching this phase needs execution.",
    "- The phase input is ready at `{{INPUT_PATH}}`.",
    "",
    "## When NOT to Use",
    "",
    "- The input is not ready or the DoD is not clearly defined.",
    "",
    "## Inputs",
    "",
    "| Name | Type | Required | Notes |",
    "|------|------|----------|-------|",
    "| `{{INPUT_PATH}}` | file path | yes | Input source for this phase. |",
    "| `{{TEMPLATE}}` | file path or format hint | no | Optional format reference. |",
    "| Project context | auto-discovered | yes | Read `.vibeflow/PROJECT_CONTEXT.md`. |",
    "",
    "## Execution Logic",
    "",
    "1. Read input from `{{INPUT_PATH}}`.",
    "2. Apply the phase workflow according to the description.",
    "3. Write output to `{{OUTPUT_PATH}}`.",
    "4. Verify against the Definition of Done.",
    "5. Record evidence in `.vibeflow/knowledge/log.md`.",
    "",
    "## Outputs",
    "",
    "| Name | Type | Notes |",
    "|------|------|-------|",
    "| `{{OUTPUT_PATH}}` | file | Phase output. |",
    "| Evidence log | `.vibeflow/knowledge/log.md` | Paths + results. |",
    "",
    "## Constraints",
    "",
    "- Do not modify files outside the declared input/output set.",
    "",
    "## Guardrails",
    "",
    "- Verify output is complete before marking phase done.",
    "- Do not skip Definition of Done checks.",
    "",
    "## Error Handling",
    "",
    "| Failure | Action |",
    "|---------|--------|",
    "| Input file missing | Stop, log error, return blocked. |",
    "| Output path not writable | Stop, log error, return blocked. |",
    "| Spec ambiguity discovered | Stop, flag in output, return blocked. |",
    "",
    "## MCP Tools",
    "",
    "- `codegraph_explore` — browse directory structure",
    "- `codegraph_node` — read a file or listing",
    "- `codegraph_search` — search symbols/patterns",
    "- `codegraph_callers` — find callers of a function",
    "- Priority: explore > node > search > callers > native grep/glob/read/bash",
    "",
    "## References",
    "",
    inputSection,
    outputSection,
    templateSection,
    "",
    "## References",
    "",
    `- Templates: \`.vibeflow/skills/${slug}/references/templates/\``,
    `- Examples: \`.vibeflow/skills/${slug}/references/examples/\``,
    "- ANTHROPIC_SKILL_STANDARD.md — required frontmatter format",
    "- `.vibeflow/PROJECT_CONTEXT.md` — project domain and conventions",
    "- `.vibeflow/knowledge/log.md` — evidence log",
    "",
    "---",
    "",
    `Powered by VibeFlow v${version}`,
  ];
  return lines.join("\n");
}

// ── Per-phase skill files (engine mirrors) ──────────────────────────────────
//
// Both canonical (`.vibeflow/skills/<phase>/`) and engine mirrors use the
// same `renderPhaseSkillToCanonical` body so they stay in lockstep.

export function renderPhaseSkill(
  phase: WorkflowPhase,
  projectName: string,
): string {
  return renderPhaseSkillToCanonical(phase, projectName, VERSION);
}

/**
 * Create `.vibeflow/context/` scaffolding with README placeholders.
 * Actual content is populated by `ai-init-context-updater` during AI enrichment.
 */
export function ensureContextDir(
  base: string,
  inject: { onWarn?: (msg: string) => void } = {},
): string[] {
  const onWarn = inject.onWarn ?? ((msg: string) => console.warn(msg));
  const written: string[] = [];

  const ctxDir = join(base, CTX_DIR, "context");
  mkdirSync(ctxDir, { recursive: true });

  const topics = [
    "modules",
    "conventions",
    "architecture",
    "database",
    "security",
    "api",
    "testing",
  ];

  const readmeContent = [
    "# Context by Topic",
    "",
    "This directory contains project context split by topic, so each phase only reads what it needs.",
    "",
    "| File | Content | Phases that need it |",
    "|------|---------|---------------------|",
    "| `modules.md` | Module structure, file layout | basic-design, detail-design, implement |",
    "| `conventions.md` | Entity/DTO/Mapper/Controller patterns, MapStruct, Records | detail-design, implement |",
    "| `architecture.md` | 4-layer DDD, data flow, AOP, session, Redis | basic-design, detail-design, implement |",
    "| `database.md` | ERD, Liquibase workflow, entity list | detail-design, implement |",
    "| `security.md` | Roles, permissions, auth flow, @AccessControl | implement |",
    "| `api.md` | URL scheme, request/response patterns, error codes | detail-design, implement |",
    "| `testing.md` | JUnit 5 config, Playwright fixtures, test data strategy | testing |",
    "",
    "All phases read `.vibeflow/PROJECT_CONTEXT.md` (core ~150 lines) first.",
    "",
    "Generated by VibeFlow. Content populated by `vf init --ai` enrichment.",
  ].join("\n");
  writeFileSync(join(ctxDir, "README.md"), readmeContent);
  written.push(`${CTX_DIR}/context/README.md`);

  for (const topic of topics) {
    const topicPath = join(ctxDir, `${topic}.md`);
    const placeholder = [
      `# ${topic}`,
      "",
      "Context populated by `vf init --ai` enrichment.",
      "",
      `This file covers ${topic} topics relevant to the project.`,
      "",
      "---",
      "",
      "Generated by VibeFlow.",
    ].join("\n");
    writeFileSync(topicPath, placeholder);
    written.push(`${CTX_DIR}/context/${topic}.md`);
  }

  return written;
}

/** Copy phase skill templates for phases where the user did NOT provide
 * input/output paths. Writes to `.vibeflow/skills/<phase>/SKILL.md`.
 * For phases WITH in/out paths, call `renderPhaseSkillToCanonical` instead. */
export function copyPhaseSkillTemplates(
  base: string,
  phases: WorkflowPhase[],
  projectName: string,
  inject: { onWarn?: (msg: string) => void } = {},
): string[] {
  const onWarn = inject.onWarn ?? ((msg: string) => console.warn(msg));
  const written: string[] = [];
  const VF_VERSION = VERSION;

  for (const phase of phases) {
    const slug = phaseSlug(phase);
    const canonDir = join(base, CTX_DIR, "skills", slug);
    const canonPath = join(canonDir, "SKILL.md");
    const hasPaths =
      Boolean(phase.inputs?.length) || Boolean(phase.outputs?.length);

    if (hasPaths) {
      // User provided in/out — use template-based render with Example
      mkdirSync(canonDir, { recursive: true });
      const body = renderPhaseSkillToCanonical(phase, projectName, VF_VERSION);
      writeFileSync(canonPath, body);
    } else {
      // No in/out — copy canonical template
      const template = readPhaseSkillTemplate(phase);
      if (!template) {
        onWarn(
          `vibeflow: template not found for phase "${phase.name}" (${slug}) — skipping`,
        );
        continue;
      }
      mkdirSync(canonDir, { recursive: true });
      const body = template
        .replace(/\{\{PROJECT_NAME\}\}/g, projectName)
        .replace(/\{\{VERSION\}\}/g, VF_VERSION)
        .replace(/^status: template$/m, "status: template")
        .replace(/\{\{phase\.inputs path\}\}/g, "_not provided_")
        .replace(/\{\{phase\.outputs path\}\}/g, "_not provided_")
        .replace(
          /\{\{template if provided\}\}/g,
          phase.template ?? "_not provided_",
        );
      writeFileSync(canonPath, body);
    }

    // Create references/ scaffolding — copy pre-existing reference files
    // from the package template (e.g. viewpoint_testing.md, template stubs).
    // If none exist, create empty README placeholders.
    const refDir = join(canonDir, "references");
    copyPhaseTemplateReferences(slug, refDir);
    written.push(`.vibeflow/skills/${slug}/references/`);
  }

  return written;
}

/**
 * Copy pre-existing reference files from `templates/skills/<slug>/references/`
 * into the phase skill's canonical references dir. Falls back to creating
 * empty README placeholders when no package references exist.
 */
function copyPhaseTemplateReferences(slug: string, refDir: string): void {
  const refTemplatesDir = join(refDir, "templates");
  const refExamplesDir = join(refDir, "examples");

  // Check if the package has pre-existing reference files for this phase.
  const tmplRefUrl = new URL(
    `../templates/skills/${slug}/references`,
    import.meta.url,
  );
  let hasPackageRefs = false;
  try {
    const tmplRefPath = tmplRefUrl.pathname;
    if (existsSync(tmplRefPath)) {
      const entries = readdirSync(tmplRefPath);
      // Exclude the well-known subdirs (templates/, examples/) — they get
      // separate treatment. Copy everything else (viewpoint files, etc.).
      const filesToCopy = entries.filter(
        (e) =>
          e !== "templates" &&
          e !== "examples" &&
          e !== "." &&
          e !== ".." &&
          e !== "README.md",
      );
      for (const file of filesToCopy) {
        const srcPath = join(tmplRefPath, file);
        const dstPath = join(refDir, file);
        if (statSync(srcPath).isFile()) {
          mkdirSync(dirname(dstPath), { recursive: true });
          copyFileSync(srcPath, dstPath);
          hasPackageRefs = true;
        }
      }
      // Also copy templates/ and examples/ content if they exist in the package.
      for (const sub of ["templates", "examples"]) {
        const subSrc = join(tmplRefPath, sub);
        if (existsSync(subSrc)) {
          const subDst = join(refDir, sub);
          mkdirSync(subDst, { recursive: true });
          for (const entry of readdirSync(subSrc)) {
            const src = join(subSrc, entry);
            const dst = join(subDst, entry);
            if (statSync(src).isFile()) {
              copyFileSync(src, dst);
              hasPackageRefs = true;
            }
          }
        }
      }
    }
  } catch {
    // No package references — fall back to empty scaffolding below.
  }

  if (!hasPackageRefs) {
    // Create empty README placeholders so the directory structure exists.
    mkdirSync(refTemplatesDir, { recursive: true });
    mkdirSync(refExamplesDir, { recursive: true });
    const refReadmeContent = [
      "# References",
      "",
      "## templates/",
      "Template files for this phase. Populated by `vf init --ai` enrichment",
      "or manually by the user.",
      "",
      "## examples/",
      "Example outputs for this phase. Populated by `vf init --ai` enrichment",
      "or manually by the user.",
      "",
    ].join("\n");
    writeFileSync(join(refDir, "README.md"), refReadmeContent);
    writeFileSync(
      join(refTemplatesDir, "README.md"),
      "# Templates\n\nPlace template files here.\n",
    );
    writeFileSync(
      join(refExamplesDir, "README.md"),
      "# Examples\n\nPlace example files here.\n",
    );
  } else {
    // Ensure README exists in refDir listing the files.
    const refReadme = [
      "# References",
      "",
      "Pre-existing reference files for this phase (from package template).",
      "Additional content can be added by `vf init --ai` enrichment.",
      "",
    ].join("\n");
    mkdirSync(refDir, { recursive: true });
    if (!existsSync(join(refDir, "README.md"))) {
      writeFileSync(join(refDir, "README.md"), refReadme);
    }
  }
}
