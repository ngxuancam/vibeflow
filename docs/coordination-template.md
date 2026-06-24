# Coordination Template

Copy-pasteable template for coordinating a sub-agent via `CoordinationBrief` / `CoordinationResult`.

## Coordinator Brief

Fill these 7 fields when dispatching a sub-agent:

| Field | Type | Description |
|-------|------|-------------|
| `unit` | `string` | Work-unit name — the lane id |
| `goal` | `string` | One-sentence objective |
| `scope` | `string[]` | Exact file paths the sub may touch |
| `spec` | `string?` | Free-text build spec (optional) |
| `acceptance` | `string` | How the parent verifies — the gate |
| `skills_required` | `string[]?` | Skills the sub MUST load (optional) |
| `fallback` | `string?` | What parent does if unit fails (optional) |

### Filled Example

```json
{
  "unit": "split-foo",
  "goal": "Split foo.ts under 400 LOC",
  "scope": ["src/foo.ts"],
  "spec": "Extract helper functions into a separate module. Keep public API unchanged.",
  "acceptance": "bun run check exit 0, every file <400 LOC, 100% coverage no waiver",
  "skills_required": ["refactor", "testing"],
  "fallback": "if codex stalls in verify loop >15min, coordinator takes over the coverage fix"
}
```

### Rendered Prompt (via `renderBrief`)

```
Unit: split-foo
Goal: Split foo.ts under 400 LOC
Scope: src/foo.ts
Spec: Extract helper functions into a separate module. Keep public API unchanged.
Acceptance: bun run check exit 0, every file <400 LOC, 100% coverage no waiver
Skills required: refactor, testing
Fallback: if codex stalls in verify loop >15min, coordinator takes over the coverage fix
```

## Sub-Agent Result Contract

The engine MUST emit this JSON block as its LAST output. This is the single-source contract
(`COORDINATION_RESULT_CONTRACT` in `src/orchestrator/coordination.ts`).

```json
{
  "skills_used": [],
  "files_changed": [],
  "commands_run": [],
  "tests_run": [],
  "confidence": 0.0,
  "uncertainty": ""
}
```

### Filled Example

```json
{
  "unit": "split-foo",
  "status": "done",
  "confidence": 1.0,
  "evidence": ["bun run check exit 0", "all files <400 LOC"],
  "files_changed": ["src/foo.ts", "src/foo-helpers.ts"],
  "commands_run": ["bun test", "bun run check"],
  "tests_run": ["test/foo.test.ts", "test/foo-helpers.test.ts"],
  "uncertainty": ""
}
```

## Field Mapping

Template fields map to existing orchestrator types (one source of truth):

| Template Field | Source Type | Source Field |
|---------------|-------------|-------------|
| `CoordinationBrief.unit` | `WorkUnit` | `.name` |
| `CoordinationBrief.goal` | — | free text (set by coordinator) |
| `CoordinationBrief.scope` | `WorkUnit` | `.scope` |
| `CoordinationBrief.spec` | `WorkUnit` | `.spec` (via `UnitBrief.spec`) |
| `CoordinationBrief.acceptance` | — | free text (the gate definition) |
| `CoordinationBrief.skills_required` | `WorkUnit` | `.skills` (via `UnitBrief.skills`) |
| `CoordinationBrief.fallback` | — | free text (fallback plan) |
| `CoordinationResult.status` | `UnitOutcome` | `.status` |
| `CoordinationResult.confidence` | `UnitOutcome` | `.confidence` |
| `CoordinationResult.evidence` | `UnitOutcome` | `.evidence` |
| `CoordinationResult.files_changed` | dispatch JSON | `files_changed` |
| `CoordinationResult.commands_run` | dispatch JSON | `commands_run` |
| `CoordinationResult.tests_run` | dispatch JSON | `tests_run` |
| `CoordinationResult.uncertainty` | dispatch JSON | `uncertainty` |

The template is a teaching surface, not a parallel runtime. The orchestrator (`src/orchestrator/`) is
the single source of truth.
