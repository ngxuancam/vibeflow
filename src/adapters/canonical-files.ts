import type { ProjectContext } from "../adapters/context-builders.js";
import { VF_COMMANDS, VF_WORKFLOW, navigationPolicy } from "../adapters/context-builders.js";
import { CTX_DIR } from "../core.js";

export function canonicalFiles(ctx: ProjectContext): Record<string, string> {
  const sources = [
    ctx.docSource ? `- Doc source: ${ctx.docSource}` : "",
    ctx.taskSource ? `- Task source: ${ctx.taskSource}` : "",
    ctx.fileTypes?.length ? `- Touch only ${ctx.fileTypes.join(", ")} files & tests` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const requirements =
    ctx.expectedResult ?? "- TODO: capture business and technical requirements.\n";
  const sample = ctx.sample ? `- Reference/sample: ${ctx.sample}\n` : "";
  const stack = ctx.stack ? `\n## Detected stack\n\n${ctx.stack}\n` : "";
  const nav = navigationPolicy(ctx.settings);
  const navBlock = nav ? `\n## Code Navigation Priority\n- ${nav}\n` : "";
  return {
    [`${CTX_DIR}/PROJECT_CONTEXT.md`]: `# Project Context\n\n- Name: ${ctx.name}\n- Summary: ${ctx.summary}\n${sources}\n${stack}`,
    [`${CTX_DIR}/REQUIREMENTS.md`]: `# Requirements\n\n${requirements}${sample}`,
    [`${CTX_DIR}/TASK_CONTEXT.md`]: `# Task Context\n\n- Goal: ${ctx.goal}\n- Definition of Done: ${ctx.expectedResult ?? "TODO"}\n- Must not change: TODO\n`,
    [`${CTX_DIR}/WORKFLOW_POLICY.md`]: `# Workflow Policy\n\n- No evidence, no conclusion. No verification, no completion.\n- Generate the fewest files possible; every generated file is AI-composed from this context.\n- Ask approval only for side effects or high-risk actions.\n\n${VF_COMMANDS}\n\n${VF_WORKFLOW}\n\n## Incremental File Authoring\n- Never write a large file in a single operation — it causes request timeouts. Create the file with a small first part, then append/edit the remaining parts in separate steps.\n- When merging generated content into an existing file, edit/append the specific section rather than rewriting the whole file.\n\n## Knowledge\n- Read curated guidance in \`${CTX_DIR}/knowledge/\` before knowledge-heavy or research tasks. Treat it as input you maintain (cross-reference and keep current); never overwrite a source the human curated.\n- Read \`${CTX_DIR}/knowledge/index.md\` first to find the relevant pages.\n- After each task, append a dated entry to \`${CTX_DIR}/knowledge/log.md\` (\`## [YYYY-MM-DD] <op> | <title>\`), append-only — never rewrite past entries.\n- File durable findings as their own linked page and add a one-line entry to \`index.md\`.\n- Periodically lint for stale, contradictory, or orphaned notes.\n\n## Tool Error & Execution Policy\n- If any terminal command or test execution times out or returns an error code, do not give up immediately.\n- Autonomously analyze the error output or partial logs, fix the scripts or parameters, and retry the command up to 3 times.\n- Only prompt the user for feedback if the execution consistently fails after 3 distinct self-correction attempts.\n${navBlock}`,
    [`${CTX_DIR}/SKILL_INDEX.md`]:
      "# Skill Index\n\n| skill | status | capabilities |\n|-------|--------|--------------|\n",
  };
}
