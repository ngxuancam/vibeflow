# Agent Orchestration Policy

> This document defines orchestration **policy**. The file-backed **mechanism** that makes
> the policy observable and auditable — scoped work units, quality gates, evidence ledger,
> and resource tracking — is specified in `WORK_UNIT_ORCHESTRATION.md`.

## Core principle

The main AI agent is always the orchestrator, not just an implementer.

```text
Main Agent = Orchestrator / Planner / Judge
Sub Agents = Investigator / Implementer / Reviewer / Verifier
Strongest Model = Final reasoning authority for high-risk decisions
```

## Universal task pipeline

```text
Receive prompt
  ↓
Clarify intent internally
  ↓
Identify assumptions and risks
  ↓
Estimate confidence
  ↓
If confidence < threshold → bounded investigation
  ↓
If still low → recommend next best action with evidence
  ↓
Plan
  ↓
Split tasks
  ↓
Run non-overlapping work in parallel
  ↓
Execute
  ↓
Verify
  ↓
Report result, evidence, uncertainty
```

## Confidence policy

Do not use `confidence < 1` as an infinite loop trigger. Perfect certainty is rare.

Use threshold by risk level:

```text
Formatting / documentation:      0.70
Simple code change:              0.80
Feature implementation:          0.85
Architecture decision:           0.90
Security / auth / payment:       0.95
Production deployment:           0.95+
```

If confidence is below threshold, the orchestrator must investigate within limits.

Recommended limits:

```text
Max investigation rounds: 3
Max debate rounds: 2
Max retry per failed command: 2
Default max parallel agents: 3
```

## Low confidence escalation

The orchestrator must not ask the user an open-ended question such as:

```text
What should I do next?
```

Instead, it must recommend the next best action.

Required format:

```text
Current confidence:
Evidence found:
Evidence missing:
Why confidence is low:
Recommended next action:
Reasoning:
Risk of proceeding:
Risk of not proceeding:
Verification plan:
```

Ask for approval only when the next action has side effects or elevated risk.

Approval is required before:

```text
- installing dependencies
- running unknown scripts
- modifying CI/CD
- changing authentication or authorization
- changing payment, billing, or security logic
- deleting files
- pushing commits
- opening pull requests
- deploying
- enabling a new external skill
- granting network, filesystem, or credential access
```

## Debate policy

For complex or high-risk tasks, run a debate before execution.

Minimum roles:

```text
Planner Agent
Domain Specialist Agent
Skeptic / Risk Reviewer Agent
Verifier Agent
```

Debate questions:

```text
- What are we trying to achieve?
- What evidence do we have?
- What assumptions exist?
- What can go wrong?
- What alternatives exist?
- Which approach is safest and most maintainable?
- How will the result be verified?
```

## Parallel execution policy

Parallel work is allowed only when scopes do not overlap.

Safe examples:

```text
- Backend API analysis
- Frontend UI analysis
- Test coverage review
- Documentation review
```

Unsafe examples:

```text
- Two agents editing the same service
- One agent refactoring while another adds features in the same files
- CI/CD changes without coordination
```

## Anti-hallucination policy

Agents must not invent:

```text
- APIs
- library behavior
- file contents
- business requirements
- user intentions
- test results
- performance results
- security guarantees
```

Every factual claim about the repository must be backed by:

```text
- file path
- code reference
- command output
- test result
- documentation source
```

## Verification policy

Before marking a task complete, verify with appropriate checks:

```text
- read diff
- run tests
- run lint
- run type check
- run build
- inspect generated files
- check acceptance criteria
- ask reviewer agent to inspect
```

Final report must include:

```text
- what changed
- why it changed
- how it was verified
- what remains uncertain
- recommended next action
```
