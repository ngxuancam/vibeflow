
## [2026-06-09] verify | pass
4 gate(s) passed

## [2026-06-10] fix | hook PreToolUse format + stdin read (root cause of "No stderr output")
Two root causes:
1. Stdin read: `readSync(fd, buf, ...)` fought with Node's internal stream buffer which already consumed the JSON. Switched to `data` event in flowing mode (`resume()` + once('data') + `pause()`).
2. Response format: Claude Code expects PreToolUse hooks to return `{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision,permissionDecisionReason}}` envelope. Old code only wrapped require_approval in this; allow/warn returned raw JSON that Claude Code couldn't parse → printed "hook error" as a non-blocking warning.
Fix: presentDecision always wraps in hookSpecificOutput for PreToolUse events. require_approval uses exit 0 (the "ask" prompt IS the block), deny uses exit 2.
Verified: no more "No stderr output" on live Bash commands. Dangerous commands blocked correctly.
Released v0.2.14.

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
