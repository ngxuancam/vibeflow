# Workflow Policy

- No evidence, no conclusion. No verification, no completion.
- Generate the fewest files possible; every generated file is AI-composed from this context.
- Ask approval only for side effects or high-risk actions.

## VibeFlow commands (use these)
- `vf doctor [--probe]` — check engine readiness before dispatching.
- `vf init` — regenerate context/engine files after editing .vibeflow/*.
- `vf units status|add <name>|update <name>|delete <name>` — track work units.
- `vf orchestrate --engine <e> [--yes]` — plan + dispatch work units in parallel with the confidence gate.
- `vf verify` — run typecheck/lint/test + confidence/evidence/scope gates BEFORE claiming done (no verification, no completion).
- `vf tools status|enable codegraph|lsp` — code-navigation tools (prefer codegraph > lsp > native).
- `vf hooks status|install` — guardrails (block destructive cmds, secret reads).
- `vf skills resolve` / `vf discover docs <lib> --yes` — skill needs + Context7 docs.
- `vf workflow delete|import` — manage/combine workflows.
- `.vibeflow/knowledge/log.md` + `index.md` — the work journal (append-only log + page catalog); read before, append after.

## Working with vf (the loop)
Drive every task through this loop instead of free-handing it:
1. **Sync context.** After editing .vibeflow/*, run `vf init` to regenerate this file and the engine context from canonical sources. Don't hand-edit generated files.
2. **Shape the work.** A single-concern task runs as-is — no ceremony. When the task splits into parallel slices with distinct file scopes, model each as a work unit (`vf units add <name>`); status, confidence, and evidence are tracked per unit in the ledger.
3. **Dispatch.** `vf orchestrate` plans and dispatches the units, runs an independent review, and records evidence. Work units with overlapping file scopes are serialized automatically so lanes never clobber each other; non-overlapping ones run in parallel.
4. **Verify before claiming done.** `vf verify` runs typecheck/lint/test plus the policy gates.

**Confidence gate — nothing is "done" until `vf verify` passes.** A unit only closes at confidence = 1.0 WITH recorded evidence (command output, file path, or test result) and within its declared scope. Below the bar, the unit is investigated, not silently closed. No verification, no completion; no evidence, no conclusion.

**Guardrails (hooks) are safety, not bureaucracy.** `vf hooks` routes risky actions — destructive commands (`rm -rf`, force-push), reads of secret files, edits to protected configs — through a decision layer that can warn, require approval, or block. Keep them on.

**Skills & knowledge before manual steps.** Prefer a verified skill over inventing steps (`vf skills` to list/resolve). Read curated guidance in .vibeflow/knowledge/ before knowledge-heavy work, and pull external library docs on demand with `vf discover docs <lib> --yes`. After acting, record what you did or learned: append an entry to `.vibeflow/knowledge/log.md` (`## [YYYY-MM-DD] note | <title>`, append-only) and keep `.vibeflow/knowledge/index.md` current.

**Tools.** `vf tools enable codegraph|lsp` turns on richer code navigation (definitions, references, callers) — prefer it over grep/find when available.

## Incremental File Authoring
- Never write a large file in a single operation — it causes request timeouts. Create the file with a small first part, then append/edit the remaining parts in separate steps.
- When merging generated content into an existing file, edit/append the specific section rather than rewriting the whole file.

## Knowledge
- Read curated guidance in `.vibeflow/knowledge/` before knowledge-heavy or research tasks. Treat it as input you maintain (cross-reference and keep current); never overwrite a source the human curated.
- Read `.vibeflow/knowledge/index.md` first to find the relevant pages.
- After each task, append a dated entry to `.vibeflow/knowledge/log.md` (`## [YYYY-MM-DD] <op> | <title>`), append-only — never rewrite past entries.
- File durable findings as their own linked page and add a one-line entry to `index.md`.
- Periodically lint for stale, contradictory, or orphaned notes.

## Tool Error & Execution Policy
- If any terminal command or test execution times out or returns an error code, do not give up immediately.
- Autonomously analyze the error output or partial logs, fix the scripts or parameters, and retry the command up to 3 times.
- Only prompt the user for feedback if the execution consistently fails after 3 distinct self-correction attempts.
