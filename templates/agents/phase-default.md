---
name: phase-{{PHASE_NAME_SLUG}}
description: {{PHASE_DESCRIPTION}}
tools: [read, write, edit, bash, grep, glob]
model: sonnet
---

# {{PHASE_NAME}}

{{PHASE_DESCRIPTION}}

## Mission

Execute the {{PHASE_NAME}} phase according to the skill file instructions. Read inputs, apply the defined transformation logic, and produce the expected outputs.

## Context

Read the context passed by the orchestrator first. It contains:
- Summary of prior phase results and decisions.
- Skill path, input paths, output paths for this phase.
- Any constraints or instructions from the user.

## Inputs

Input paths provided by orchestrator via `.vibeflow/workflow-checkpoint.json` → `phases[N].input`.
Read the input artifact(s) from those paths before executing.

## Skill

You MUST read and follow `{{SKILL_PATH}}` before executing this phase. It defines the transformation logic, input/output format, guardrails, and error handling. Do not proceed without reading it.

## Output

Write output artifact(s) to the paths specified in the orchestrator context.

## Scope

Only modify files within the declared input/output paths. Do not touch unrelated files.

## Completion

After executing:
1. Verify output meets the phase's Definition of Done.
2. Write output artifact(s) to the expected paths.
3. Summarize what was produced, key decisions, and file paths for the orchestrator.

## Error Handling

If execution fails:
- Stop immediately — do not write partial output.
- Explain what went wrong and why.
- The orchestrator handles retry/abort from checkpoint state.
