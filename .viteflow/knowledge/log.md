
## [2026-06-09] verify | pass
4 gate(s) passed

## [2026-06-10] fix | hook stdin deadlock
Claude Code hook command (`vf hook`) spawned with JSON on stdin but pipe never closes.
Old code: `for await...of process.stdin` → hangs forever → "No stderr output".
Fix: `fs.readSync(fd, buf, 0, buf.length, null)` — blocking sync read on fd 0 with null-offset (ESPIPE fix for pipes).
Committed 73b9a5f, merged to main.

## [2026-06-10] fix | init clobber context files
`vf init` overwrote REQUIREMENTS.md, PROJECT_CONTEXT.md, WORKFLOW_POLICY.md, SKILL_INDEX.md unconditionally.
Only TASK_CONTEXT.md and SETTINGS.json were preserved. Added PRESERVED_CONTEXT_FILES set matching the TASK_CONTEXT
preservation pattern. Also re-enabled .githooks/post-checkout + post-merge hooks.
Commit 0aed535, released v0.2.13.

## [2026-06-10] fix | init engine gate false negative
Teammate at v0.2.12: `vf init` → "No engine is ready" while `vf doctor` → ok.
Root cause: init used `probe: true` (live model round-trip), doctor used `probe: false` (binary presence only).
If `copilot -p` exits non-zero but binary on PATH, init blocks but doctor passes.
Fix: `vf init` now defaults to `probe: false`, matching doctor. Live probe is for orchestrate/dispatch, not init.
Released v0.2.13.
