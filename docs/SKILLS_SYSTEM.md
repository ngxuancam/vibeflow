# Skills System

## Skill standard

The system uses Anthropic-style skills. A skill is a directory containing `SKILL.md` and optional scripts, templates, references, and examples.

```text
.claude/skills/
  skill-name/
    SKILL.md
    scripts/
    templates/
    references/
    examples/
```

`SKILL.md` must contain YAML frontmatter:

```md
---
name: skill-name
description: Clear description of when this skill should be used
---

# Skill Name

Instructions...
```

## Skill metadata

Skill metadata lives in the `SKILL.md` YAML frontmatter. The orchestrator parses that frontmatter for deterministic capability matching — there is no separate metadata file.

Example:

```md
---
name: xlsx-reader
version: 1.0.0
capabilities: ["read:xlsx", "extract:tables"]
triggers: ["xlsx", "spreadsheet", "excel"]
requires:
  filesystem: read
  network: false
  shell: false
status: verified
---

# XLSX Reader

Instructions...
```

## Skill categories

### Source skills

Used to access project sources:

```text
github-source-skill
gitlab-source-skill
google-drive-source-skill
confluence-source-skill
notion-source-skill
jira-source-skill
linear-source-skill
slack-source-skill
local-folder-source-skill
s3-source-skill
```

### File processing skills

Used to read and normalize files:

```text
markdown-reader-skill
docx-reader-skill
xlsx-reader-skill
pptx-reader-skill
pdf-reader-skill
image-ocr-skill
openapi-reader-skill
postman-reader-skill
drawio-reader-skill
mermaid-reader-skill
```

### Workflow skills

Used to run AI SDLC processes:

```text
repo-onboarding
instruction-generator
sdlc-agent-generator
copilot-task-dispatcher
claude-task-dispatcher
codex-task-dispatcher
diff-reviewer
skill-maintainer
```

## Skill usage rule

Agents must use verified skills whenever a task matches an available skill capability.

If a matching verified skill exists but the agent does not use it, the task is not compliant.

Every agent output must include:

```json
{
  "agent": "document-reader",
  "skills_considered": ["xlsx-reader"],
  "skill_used": "xlsx-reader",
  "skill_version": "1.0.0",
  "confidence": 0.91
}
```

## Skill registry priority

Canonical order (kept in sync with `MASTER_SPEC.md`, `SKILL_PROVIDERS.md`, and
`SKILL_DISCOVERY_AND_EVOLUTION.md`):

```text
1. Local verified skills
2. Context7 HTTP API (skills and docs)
3. Official Anthropic skills/plugins
4. Vercel find-skills
5. Official vendor documentation
6. Trusted MCP registries
7. Community skills after review
8. npm packages only after security verification
```

## No silent improvisation

Agents must not invent a manual process before checking available skills.

If no skill exists, the agent must report:

```text
Missing capability:
Recommended skill:
Risk:
Safe fallback:
Validation plan:
```
