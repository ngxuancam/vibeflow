# MVP Roadmap

## Phase 1: Local CLI and UI

Deliver:

```text
- npm CLI command
- local web server
- browser auto-open
- doctor command
- repo path selection
- basic project questionnaire
```

Success criteria:

```text
User can run npx @vibeflow/cli and open the UI locally.
```

## Phase 2: Context generation

Deliver:

```text
- repo scanner
- README/package/build file detection
- PROJECT_CONTEXT.md generation
- REQUIREMENTS.md and TASK_CONTEXT.md generation
```

Success criteria:

```text
Tool can scan a repo and generate useful canonical context.
```

## Phase 3: Skill registry

Deliver:

```text
- local skill registry
- SKILL.md parser
- skill.json metadata
- skill capability matching
- basic file skills: md, docx, xlsx, pptx, pdf
```

Success criteria:

```text
Tool can choose a verified skill based on file type or task capability.
```

## Phase 4: Engine adapters

Deliver:

```text
- Claude Code adapter
- Codex adapter
- Copilot CLI adapter
- CLAUDE.md generation
- AGENTS.md generation
- Copilot instruction generation
```

Success criteria:

```text
User can choose an engine and dispatch a structured task.
```

## Phase 5: Hooks and verification

Deliver:

```text
- universal hook protocol
- pre-command hook
- pre-write hook
- final verification hook
- risk scoring
- approval UI
```

Success criteria:

```text
Unsafe actions require approval and final result includes verification status.
```

## Phase 6: Multi-agent orchestration

Deliver:

```text
- orchestrator policy
- confidence thresholds
- bounded investigation
- debate workflow
- parallel task splitting
- reviewer agent
```

Success criteria:

```text
Complex tasks are planned, investigated, split, executed, and verified with evidence.
```

## Phase 7: External discovery

Deliver:

```text
- Context7/docs retrieval adapter
- official docs lookup workflow
- external skill draft import
- approval and verification workflow
```

Success criteria:

```text
Agent uses current external docs/skills when model knowledge may be stale.
```

## Phase 8: Skill evolution

Deliver:

```text
- skill-maintainer skill
- lesson learned extraction
- skill changelog
- draft skill update UI
- promote to verified flow
```

Success criteria:

```text
Tool proposes skill improvements based on real failures and workarounds.
```

## MVP scope recommendation

Build first:

```text
1. npm CLI + local UI
2. repo scanner
3. canonical context generator
4. CLAUDE.md + AGENTS.md + Copilot instruction generator
5. local skill registry
6. Claude Code adapter
7. basic hooks
8. final verification report
```

Then expand to Codex, Copilot, external discovery, and skill evolution.
