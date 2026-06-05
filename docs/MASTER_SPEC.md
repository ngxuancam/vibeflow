# VibeFlow Master Spec

## One-sentence summary

A local-first npm CLI tool that opens a web UI and orchestrates Claude Code, Codex CLI, and GitHub Copilot CLI using shared project context, Anthropic-style skills, source/file readers, hooks, multi-agent planning, verification, and continuous skill evolution.

## What the tool does

```text
- Starts from npm/npx
- Opens a local web UI
- Collects repo, task, docs, and work management sources
- Finds source connector skills
- Finds file reader skills
- Reads and normalizes project context
- Generates CLAUDE.md, AGENTS.md, and Copilot instructions
- Creates Claude agents and Anthropic-style skills
- Dispatches Claude Code, Codex, or Copilot CLI
- Uses hooks to control risky actions
- Verifies diff, tests, logs, and acceptance criteria
- Proposes skill updates from lessons learned
```

## Key design principles

```text
Main agent is always the orchestrator.
Do not rely on stale model memory for version-sensitive tasks.
Use verified skills when available.
Search trusted external docs/skills when needed.
Do not silently install or enable risky dependencies.
Confidence below threshold triggers bounded investigation, not infinite loops.
If confidence remains low, recommend the next best action with evidence.
Ask for approval only for side effects or high-risk actions.
No evidence, no conclusion.
No verification, no completion.
Generate the fewest files possible.
Everything a tool emits is AI-generated, not hand-maintained boilerplate.
```

## Minimal-footprint and AI-generated output

VibeFlow must keep the number of files it creates in a target repo as small as
possible, and every file it does create must be produced by the AI at runtime from
canonical context — not copied from static, hand-maintained template files.

```text
- Generate the minimum set of files needed for the selected engine and task.
- Do not scaffold files the current run does not use (lazy, on-demand generation).
- Prefer one canonical source plus on-demand projections over many persisted copies.
- No static template files checked into the tool as the source of generated output;
  the orchestrator composes each file from canonical context with the AI.
- Generated files are disposable and reproducible: deleting them and re-running
  must reproduce equivalent output from the same canonical context.
- Collapse optional/empty artifacts: only emit per-area files (e.g.
  .github/instructions/*.instructions.md, .claude/agents/*) that the task actually needs.
```

This principle takes precedence over the illustrative "full" file lists elsewhere in
these specs (for example in `GENERATED_FILES.md` and `ARCHITECTURE.md`): those lists
describe the maximum surface VibeFlow *may* generate, not a set it must always create.

## Engine support

```text
Claude Code:
- CLAUDE.md
- .claude/agents
- .claude/skills
- .claude/settings.json

Codex CLI:
- AGENTS.md
- .codex/config.toml
- prompt-injected selected skills

GitHub Copilot CLI:
- AGENTS.md
- .github/copilot-instructions.md
- .github/instructions/*.instructions.md
- prompt-injected selected skills
```

## Skill system

```text
External skills = baseline knowledge from trusted sources
Internal skills = verified project/team lessons
```

Every skill:

```text
- has SKILL.md
- has metadata skill.json
- declares capabilities
- declares permissions
- has status: draft / experimental / verified / deprecated
- has changelog when updated
```

## Hook system

Hooks use a universal protocol:

```text
pre-command
post-command
pre-write
post-write
skill-compliance
final-verify
```

Decisions:

```text
allow
warn
require_approval
block
```

## Security posture

```text
Local-first
Read-only by default
No public tunnel by default
No silent install
No source upload by default
No auto-push
No auto-merge
No auto-deploy
```

## Recommended MVP

```text
1. npm CLI and local UI
2. repo scanner
3. canonical context generator
4. skill registry
5. Claude Code adapter
6. AGENTS.md and Copilot instruction generation
7. basic hooks
8. final verification report
```


## Naming decision

The recommended public product name is **VibeFlow** and the short CLI command is `vf`.

Recommended package:

```bash
npx @vibeflow/cli
```

## Updated skill provider decision

Context7 / `ctx7 skills` should be the primary external skill and documentation resolver. Vercel `find-skills` remains a supported secondary provider.

Default priority:

```text
1. Local verified skills
2. Context7 / ctx7 skills and docs
3. Anthropic official skills/plugins
4. Vercel find-skills
5. Official vendor docs
6. Trusted MCP registries
7. Community skills after review
8. npm packages after security verification
```
