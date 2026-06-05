# Hooks and Guardrails

## Purpose

Hooks provide a common guardrail and automation layer across Claude Code, Codex, and GitHub Copilot CLI.

Hooks should not contain the main reasoning logic. They should enforce safety, validate outputs, collect logs, and reduce risky behavior.

## Universal hook design

Use one shared hook engine and tool-specific adapters.

```text
vibeflow/hooks/
  pre-command.ts
  post-command.ts
  pre-write.ts
  post-write.ts
  skill-compliance.ts
  final-verify.ts
```

Each AI engine calls the same scripts through its own configuration:

```text
Claude Code hook config  → vibeflow/hooks/*.ts
Codex hook config        → vibeflow/hooks/*.ts
Copilot hook config      → vibeflow/hooks/*.ts
Git pre-commit           → vibeflow/hooks/final-verify.ts
```

> `.ts` hooks are not directly executable by git or by engines expecting a runnable
> command. The orchestrator must generate a runnable wrapper (e.g. a shim that invokes
> `tsx vibeflow/hooks/<hook>.ts`) or emit compiled `.js`, and wire that wrapper as the
> actual hook command.

## Enforcement scope per engine (feasibility constraint)

Blocking pre-action hooks (`pre-command`/`pre-write` that can `require_approval` or
`block` *before* a command runs or a file is written) require the engine to expose a
native, vetoing interception point. This cannot be assumed for every engine:

```text
Claude Code → native blocking hooks available; full pre-action enforcement.
Codex CLI   → no equivalent vetoing pre-command/pre-write hook today.
Copilot CLI → no equivalent vetoing pre-command/pre-write hook today.
```

Because the security guarantees (read-only by default, no silent install, `block` on
destructive commands) depend on pre-action interception, VibeFlow must provide one of the
following for engines without native blocking hooks — otherwise those guarantees degrade
to detection-only:

```text
Option A (preferred): run the engine under a VibeFlow-imposed process-level enforcement
  layer (sandbox / restricted FS overlay / shell-command proxy / PTY interceptor) that
  applies the same allow|warn|require_approval|block decisions independent of native hooks.
Option B (fallback): scope blocking hooks to Claude Code, and explicitly downgrade Codex
  and Copilot to post-hoc verification (post-command/post-write + final-verify) with the
  reduced guarantee documented to the user before the run starts.
```

The `EngineAdapter` contract (see `TOOL_ADAPTERS.md`) must therefore expose an enforcement
capability descriptor so the orchestrator knows, per engine, whether pre-action blocking is
real or downgraded.

## Universal hook input

```json
{
  "engine": "claude-code",
  "event": "pre-command",
  "workspace": "/repo",
  "command": "npm install lodash",
  "files": [],
  "agent": "backend-engineer",
  "taskId": "TASK-123",
  "intent": "implement feature"
}
```

## Universal hook output

```json
{
  "decision": "require_approval",
  "severity": "high",
  "reason": "Installing a new dependency modifies the project and may run install scripts.",
  "requiresApproval": true
}
```

Allowed decisions:

```text
allow
warn
require_approval
block
```

## Recommended hooks

### Pre-command

Used before shell commands.

Responsibilities:

```text
- block destructive commands
- require approval for package installation
- require approval for deployment
- prevent reading secrets
- prevent commands outside workspace
```

### Post-command

Used after shell commands.

Responsibilities:

```text
- capture command output
- detect failures
- suggest bounded retries
- update workflow state
```

### Pre-write

Used before file modification.

Responsibilities:

```text
- block writes outside workspace
- require approval for protected files
- prevent deletion of important files
- enforce scope boundaries
```

### Post-write

Used after file modification.

Responsibilities:

```text
- inspect diff
- check if changed files match task scope
- record files changed
- trigger skill compliance check
```

### Skill compliance

Responsibilities:

```text
- verify matching skills were used
- detect manual processing when verified skill exists
- check skill version and status
- request skill update if repeated workaround appears
```

### Final verify

Responsibilities:

```text
- run configured tests/lint/build if allowed
- summarize diff
- check acceptance criteria
- produce final verification report
```

## Avoiding false positives

Hooks should use risk scoring instead of simple block rules.

```text
Low risk      → allow + log
Medium risk   → warn + continue
High risk     → require approval
Critical risk → block
```

## False positive reduction techniques

### 1. Scope-aware checks

Only escalate for sensitive paths:

```text
auth/**
payments/**
infra/**
.github/workflows/**
terraform/**
k8s/**
.env*
```

### 2. Intent-aware checks

If the task is explicitly about auth, editing auth files is expected. The hook should increase review strictness, not automatically block.

### 3. Diff-aware checks

Evaluate actual change content, not only file names.

### 4. Repo allowlist

Example policy:

```json
{
  "allowedCommands": ["npm test", "pnpm lint", "mvn test"],
  "protectedPaths": [".env", "infra/prod/**"],
  "approvalRequiredPaths": ["auth/**", ".github/workflows/**"]
}
```

### 5. Human override with reason

Allow:

```text
Approve once
Approve for this task
Approve for this repo policy
```

Every override must be logged.

## Final hook rule

```text
Hooks must prevent irreversible or unsafe actions.
Hooks must not prevent normal development work.
When unsure, prefer warn or require approval over block.
Block only when the action is clearly unsafe.
```
