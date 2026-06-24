# Anthropic Skill Standard

A skill is a folder named `<skill-name>` containing a required `SKILL.md`.
Skills follow the Anthropic skill format (github.com/anthropics/skills): metadata
lives in a `## Meta` section within the markdown body, not in YAML frontmatter.

## Required structure

```
<skill-name>/
├── SKILL.md            # required
├── scripts/            # optional — deterministic helpers
├── references/         # optional — domain docs (loaded on demand)
└── assets/             # optional — templates, fixtures
```

## SKILL.md format

```markdown
# <skill-name>

## Meta
- **name**: <kebab-case-name>
- **description**: <one-line trigger description, <= 1024 chars>

## Trigger / When to Read
- <when the model should activate this skill>

## Body
<actionable instructions, >= 50 chars>
```

### Requirements
- **`## Meta` section** with `- **name**:` and `- **description**:` bullet points.
- `name` is lowercase kebab-case (e.g. `rust-debugging`, `web-search`).
- `description` is concise, <= 1024 characters.
- Body contains actionable instructions, not TODO placeholders (>= 50 chars).

### Recommended sections
- **`## Trigger / When to Read`** — when the model should activate this skill.
- **`## Compatibility`** (optional) — required tools, versions, or runtimes.

## Deprecated format (YAML frontmatter)

Previously skills used YAML frontmatter between `---` delimiters:

```yaml
---
name: basic-design
description: "..."
version: 1.0.0
---
```

This format is **deprecated**. `vf skills validate` still accepts it with a
warning. Migrate to `## Meta` format (see above).

## Validation rules (enforced by `vf skills validate`)

| Rule | Severity |
|------|----------|
| missing `SKILL.md` | error |
| missing `## Meta` section AND no YAML frontmatter | error |
| `## Meta` missing `**name**` or `**description**` | error |
| `name` not lowercase kebab-case | error |
| folder name != `name` | warning |
| body < 50 chars | error |
| body without markdown heading | warning |
| YAML frontmatter used (deprecated format) | warning |
| empty `scripts/`, `references/`, `assets/` | warning |

## Canonical source of truth

`.vibeflow/skills/<name>/` is canonical. Engine dirs (`.claude/skills/`,
`.agents/skills/`, `.github/skills/`) are generated views.

Default sync writes a tiny `SKILL.md` pointer. Use `--mode full` to copy
the entire directory.
