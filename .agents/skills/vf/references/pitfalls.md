# VibeFlow Pitfalls (learned the hard way)

Anti-patterns to avoid when driving work through `vf`. Read this before improvising a
manual workaround — most of these are the exact failure modes the CLI exists to prevent.

- **Do not free-hand what `vf orchestrate` does.** Manual `codex exec` + a hand-dispatched
  reviewer + `gh pr create` re-implements `--isolate --pr` + the built-in reviewer + the
  evidence ledger, badly. Use the orchestrator; it is the product.

- **Spec-first is non-negotiable for writing commands.** A vague goal yields a vague
  dispatch. Restate goal + scope + engine + risk and confirm before `--yes`. (See
  SKILL.md §0 and `grill.md` for the bare-`/vf` interview that forces this.)

- **`--dry-run` / no-`--yes` is your friend.** Every destructive/dispatch path previews
  first. Default to the preview, show the plan, then re-run with `--yes`.

- **Re-run `vf init` after editing `.vibeflow/*`.** The context block is generated; hand
  edits to the generated region (between the vibeflow markers) are clobbered on the next
  regeneration. Edit sources, then regenerate.

- **A red `vf verify` is investigated, not worked around.** Read the failing lines — each
  names a failing toolchain gate (typecheck/lint/test) or a policy gate (confidence < 1,
  no-evidence, scope overlap). Fix the root cause, then re-run. Never paper over it by
  forcing a status or fabricating evidence.

- **One runner / cold engine fails the creation gate.** Run `vf doctor --probe` first to
  confirm the engine is warm; a dispatch against a cold engine fails the gate.

- **Never assume a destructive command is blocked on Codex/Copilot.** The live PreToolUse
  gate BLOCKS only on Claude; Codex/Copilot hook configs are detection-only (observe +
  log). See `hooks.md` — do not rely on a block that will not happen.

- **Overlapping work-unit scopes serialise; they do not run in parallel.** If you expected
  concurrency and got serial execution, check for file-scope overlap between units and
  split the scopes cleanly.

Powered by VibeFlow.
