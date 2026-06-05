# Generated Files

## Purpose

This document describes files the orchestrator should generate in a target repository.

## Minimal-footprint rule

The file lists below are the **maximum** surface VibeFlow may generate, not a mandatory
set. Per the minimal-footprint and AI-generated-output principle in `MASTER_SPEC.md`, the
orchestrator must:

```text
- generate only the files the selected engine and current task actually require
- skip optional/empty artifacts instead of creating placeholder files
- compose every file from canonical context with the AI at runtime (no static templates)
- keep generated files disposable and reproducible from the canonical vibeflow/* source
```

## Root files

### `CLAUDE.md`

Primary instruction file for Claude Code.

Should contain:

```text
- project overview
- architecture
- build/test/lint commands
- coding conventions
- workflow policy
- skill usage policy
- security rules
- verification rules
- skill evolution policy
```

### `AGENTS.md`

Cross-tool instruction file for Codex, Copilot, and other coding agents.

Should contain:

```text
- shared project context
- agent orchestration policy
- skill usage policy
- anti-hallucination policy
- verification requirements
- task execution rules
```

## GitHub Copilot files

```text
.github/copilot-instructions.md
.github/instructions/backend.instructions.md
.github/instructions/frontend.instructions.md
.github/instructions/testing.instructions.md
.github/instructions/security.instructions.md
```

Purpose:

```text
- repo-wide Copilot instructions
- path-specific coding rules
- testing/security guidance
```

## Claude files

```text
.claude/agents/
.claude/skills/
.claude/settings.json
```

Example agents:

```text
orchestrator.md
backend-engineer.md
frontend-engineer.md
test-engineer.md
security-reviewer.md
devops-engineer.md
skill-compliance-reviewer.md
```

Example skills:

```text
repo-onboarding/SKILL.md
skill-maintainer/SKILL.md
markdown-reader/SKILL.md
docx-reader/SKILL.md
xlsx-reader/SKILL.md
pptx-reader/SKILL.md
pdf-reader/SKILL.md
context7-docs/SKILL.md
```

## Codex files

```text
.codex/config.toml
vibeflow/dispatch/codex.md
```

Purpose:

```text
- standard Codex execution profile
- prompt template generated from canonical context
```

## vibeflow files

```text
vibeflow/PROJECT_CONTEXT.md
vibeflow/REQUIREMENTS.md
vibeflow/TASK_CONTEXT.md
vibeflow/WORKFLOW_POLICY.md
vibeflow/SKILL_INDEX.md
vibeflow/WORKFLOW_STATE.json
vibeflow/workunits/<name>/CONTEXT.md
vibeflow/workunits/<name>/TODO.md
vibeflow/workunits/<name>/HANDOFF.md
vibeflow/workunits/<name>/meta.json
vibeflow/workunits/<name>/evidence/
```

Purpose:

```text
- canonical workflow memory
- normalized context
- skill registry summary
- current task state
- per-task work units, gates, and resource ledger (see WORK_UNIT_ORCHESTRATION.md)
```

Work-unit files follow the minimal-footprint rule: create them only when a task is
decomposed (3+ files across multiple modules, or delegated agents). See
`WORK_UNIT_ORCHESTRATION.md` for when units are created and how they are tracked.

## Dispatch files

```text
vibeflow/dispatch/claude.md
vibeflow/dispatch/codex.md
vibeflow/dispatch/copilot.md
```

Each dispatch file should include:

```text
- task goal
- selected context
- selected skills
- allowed files
- constraints
- verification commands
- expected output schema
```

## Hook files

```text
vibeflow/hooks/pre-command.ts
vibeflow/hooks/post-command.ts
vibeflow/hooks/pre-write.ts
vibeflow/hooks/post-write.ts
vibeflow/hooks/skill-compliance.ts
vibeflow/hooks/final-verify.ts
```

Purpose:

```text
- enforce permissions
- reduce unsafe actions
- verify skill usage
- validate output
- reduce false positives through risk scoring
```
