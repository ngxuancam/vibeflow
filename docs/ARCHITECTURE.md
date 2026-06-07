# Architecture

## Overview

VibeFlow is a local-first tool composed of four main layers:

```text
npm CLI Launcher
  ↓
Local Web UI
  ↓
Workflow Orchestrator Core
  ↓
Tool Adapters: Claude Code / Codex CLI / Copilot CLI
```

The system should run on the user's machine and should not send source code to a remote service controlled by the tool owner unless the user explicitly configures it.

## Main components

### 1. npm CLI Launcher

Responsibilities:

- Start the local web server.
- Open the browser automatically.
- Check local dependencies.
- Install or guide installation of optional tools.
- Initialize workflow files inside the target repo.

Example commands:

```bash
npx @vibeflow/cli
vf doctor
vf init
vf ui
vf run claude
vf run codex
vf run copilot
vf skills list
vf tools status
```

### 2. Local Web UI

Responsibilities:

- Collect project information.
- Ask structured questions.
- Let user connect sources.
- Show detected skills and missing skills.
- Show generated instructions.
- Show execution logs, diffs, tests, risks, and final report.

### 3. Workflow Orchestrator Core

Responsibilities:

- Act as the main agent coordinator.
- Classify task type and risk level.
- Resolve sources and file readers.
- Select local or external skills.
- Generate project context files.
- Generate tool-specific adapters.
- Dispatch Claude Code, Codex, or Copilot CLI.
- Verify output.
- Propose skill updates.

### 4. Tool Adapters

Adapters translate canonical workflow context into each engine's expected format.

```text
Canonical Context
  ↓
Claude Adapter → CLAUDE.md + .claude/agents + .claude/skills
Codex Adapter  → AGENTS.md + .codex/config.toml + prompt injection
Copilot Adapter → AGENTS.md + .github/copilot-instructions.md + prompt injection
```

## Core data flow

```text
User input
  ↓
Intake schema
  ↓
Source resolver
  ↓
Skill resolver
  ↓
Document/file reader skills
  ↓
Normalized context
  ↓
Planning + debate + task split
  ↓
Engine adapter
  ↓
CLI execution
  ↓
Hooks + verification
  ↓
Result report
  ↓
Skill evolution proposal
```

## Canonical context principle

The system should not maintain three independent instruction systems. It should maintain one canonical source:

```text
.viteflow/PROJECT_CONTEXT.md
.viteflow/REQUIREMENTS.md
.viteflow/TASK_CONTEXT.md
.viteflow/WORKFLOW_POLICY.md
.viteflow/SKILL_INDEX.md
```

Then it generates:

```text
CLAUDE.md
AGENTS.md
.github/copilot-instructions.md
.github/instructions/*.instructions.md
```

This prevents instruction drift between Claude Code, Codex, and Copilot CLI.
