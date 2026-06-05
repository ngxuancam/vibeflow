# Command Reference

## Start UI

```bash
npx @vibeflow/cli
```

or after global install:

```bash
vf
```

This starts a local server bound to `127.0.0.1`, opens the browser, and launches the visual workflow UI.

## Initialize repository

```bash
vf init
```

Generates baseline files:

```text
CLAUDE.md
AGENTS.md
.github/copilot-instructions.md
.github/instructions/*.instructions.md
.claude/agents/*.md
.claude/skills/*/SKILL.md
.codex/config.toml
vibeflow/*
```

## Check environment

```bash
vf doctor
```

Checks:

```text
Node.js
Git
Claude Code
Codex CLI
GitHub Copilot CLI
Docker optional
ctx7 optional
Vercel find-skills optional
required permissions
```

## Run engine

```bash
vf run claude
vf run codex
vf run copilot
```

The run command uses the current workflow state, selected skills, generated prompts, and tool-specific adapters.

## Work units

Inspect and track the orchestration ledger (see `WORK_UNIT_ORCHESTRATION.md`):

```bash
vf units status            # board of all work units: status, gates, owner, confidence
vf units show <name>       # one unit: scope, todos, gates, evidence, resources
vf units resources         # token / cost / wall-time totals rolled up across units
vf units evidence <name>   # list recorded gate output under the unit's evidence/ folder
```

These commands read `vibeflow/WORKFLOW_STATE.json` and the per-unit `meta.json`; they
are the CLI mirror of the Run-screen orchestration dashboard.

## Skills

```bash
vf skills list
vf skills search "xlsx reader"
vf skills suggest
vf skills install ctx7:<skill>
vf skills install vercel:<skill>
vf skills verify
vf skills promote <skill-name>
vf skills deprecate <skill-name>
```

## Hooks

```bash
vf hooks status
vf hooks install
vf hooks test
vf hooks logs
```

## Verification

```bash
vf verify
```

Runs final checks for:

```text
skill compliance
diff risk
tests/lint/build if configured
protected file changes
missing evidence
confidence threshold
```
