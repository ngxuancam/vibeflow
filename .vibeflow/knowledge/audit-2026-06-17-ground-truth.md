# vibeflow-docs Tổng thể Audit — Parent Ground Truth

**Date:** 2026-06-17
**Base:** origin/main = bedf331 (post PR#51, 100% lcov, 1234 tests)
**Scope:** 5 files = 5104 LOC
  - src/scanner.ts (369, NEW PR#50)
  - src/init-intake.ts (293, NEW PR#48)
  - src/terminal-prompts.ts (461, PR#51 B3/B18)
  - src/dispatch.ts (665, PR#51 M1/M2/group-kill)
  - src/commands.ts (3316, PR#51 multi-fix)
**Auditors (running):**
  - AUDIT 1: defects-aspect (deleg_d2804169)
  - AUDIT 2: security-aspect (deleg_f3e3b126)
  - AUDIT 3: design-aspect (deleg_9adfc1c6)
  - AUDIT 4: test-quality-aspect (pending dispatch)

## Parent's read of the code (preliminary findings)

### src/scanner.ts

| Sev | File:Line | Title | Notes |
|-----|-----------|-------|-------|
| LOW | scanner.ts:135-156 | walk() recurses into subdirs but does not track visited inodes; symlink loops = DoS | Real but uncommon. SKIP_DIRS checks NAME not the inode. |
| LOW | scanner.ts:347-350 | renderFindingsTable builds markdown rows by string-concat; `|` in f.value/evidence breaks table | User data path → low risk in practice |
| NIT | scanner.ts:312-313 | `manifest ?? "unknown"` is unreachable (manifests[0] of non-empty array) | Dead fallback, can be removed |

### src/init-intake.ts

| Sev | File:Line | Title | Notes |
|-----|-----------|-------|-------|
| NIT | init-intake.ts:289-292 | Catches only "cancelled" / "selection timed out" magic strings; if prompt throws anything else, re-throws to caller. Magic-string coupling. | Real coupling, not a bug |
| NIT | init-intake.ts:282-288 | After askText() returns, no validation of `description` length/format | Punted to engine |

### src/terminal-prompts.ts

| Sev | File:Line | Title | Notes |
|-----|-----------|-------|-------|
| LOW | terminal-prompts.ts:333-353 | selectMany missing guard for `options.length === 0 && !opts.allowCustom` (selectOne has it at L224-226). Falls through to raw mode with empty items. | No crash but inconsistent |
| NIT | terminal-prompts.ts:131-137 | `rl.question` callback uses `answer.trim() || defaultValue` — but if readLineImpl's defaultValue is also empty, no signal of empty answer | Documented behavior |
| NIT | terminal-prompts.ts:298, 426 | `resolve(answer || fallback)` — if answer is "" after deps.readLine override, falls back silently | Documented behavior |

### src/dispatch.ts

| Sev | File:Line | Title | Notes |
|-----|-----------|-------|-------|
| LOW | dispatch.ts:251-258 | process.kill(-pid, signal) catch falls back to proc.kill() but if BOTH fail (e.g. macOS child reparented by launchd), the engine is orphaned with no log | Silent orphan on macOS |
| LOW | dispatch.ts:281-302 | stdout/stderr reader loop: if .read() rejects (process killed mid-read), Promise.all rejects and caller can't distinguish "engine failed" from "read pipe broke" | Type-only, hard to use |
| NIT | dispatch.ts:464-491 | Claude JSON envelope detection: `"session_id" in obj` is the only "type" check. If a non-Claude engine wraps in `type: "result"` with `session_id`, the synthesis fires incorrectly. | Low risk in practice |
| NIT | dispatch.ts:510-521 | parseEngineSummary: `fences.reverse()` returns FIRST valid one in reverse order (i.e. LAST valid one chronologically). If stale fenced block precedes a fresh one, picks stale | Real edge case |
| LOW | dispatch.ts:415-442 | extractJsonObjects: string-aware brace scanner. Doesn't handle template literals (e.g. `` `\`${`{`}\`` ``). Engine output is plain text, low risk. | Theoretical |

### src/commands.ts (just orchestrate/run/launchEngine reviewed)

| Sev | File:Line | Title | Notes |
|-----|-----------|-------|-------|
| NIT | commands.ts:1125-1133 | .vibeflow/.ui-port read + parse: parse error silently swallowed (caught without log) | Documented as best-effort |
| NIT | commands.ts:1149-1153 | `ctx: ProjectContext = { ...defaultContext(), goal: state.goal, settings: readSettings(base) }` — reads settings INSIDE the context (not in spawner setup). Re-reads on every dispatch. | Inefficient, not a bug |
| LOW | commands.ts:1270 | `writeState(base, state)` after dispatch — uses writeFileSafe which is atomic (temp+rename, same FS). Verified. | OK |

### cross-cutting security

| Sev | File:Line | Title | Notes |
|-----|-----------|-------|-------|
| MED | core.ts:213-230 (writeFileSafe) | writeFileSafe doesn't chmod 0o600; state.json, settings.json, evidence/*.json, workunits/*, log.md are all written world-readable (default umask). logbus.ts DOES chmod. 21 writeFileSafe call sites. | Real security defect — other users on the system can read workflow state (which contains commands run, file paths, possibly secrets in evidence) |
| NIT | core.ts:227 | tmp file path uses Date.now() — same-millisecond collision possible across multiple writes | Very rare; race across processes on same pid+ts |

## Cross-cutting observations

- **C1**: `installLogbus()` is called in BOTH `orchestrate()` (L1119) and `run()` (L1631) — idem­potent per comment, but the install point is in two functions. Symmetric coverage? OK.
- **C2**: `state.work_units` access in `units()` (L1770) — `if (!Array.isArray(state.work_units)) state.work_units = []` — defensive hotfix from PR#48 regression. Other call sites: do they tolerate missing work_units? Need to check.
- **C3**: `inject.spawner` IS the readiness signal in BOTH `orchestrate` (L1193) and `launchEngine` (L1702) — symmetric.
- **C4**: `out("engine-stderr", ...)` callback: same pattern at L1227 (orchestrate) and L1735 (launchEngine). Symmetric, OK.
- **C5**: `makeAsyncSpawner({ timeoutMs, onStderrChunk })` — symmetric. Good.

## Open questions for subagents

- Q1: Does writeState in core.ts use atomic temp+rename? (C5 risk)
- Q2: Are all readState() call sites protected against missing work_units? (C2)
- Q3: scanner.ts walk() — does it follow symlinks? Real DoS risk or not?
- Q4: selectMany empty-options crash: real bug or just inconsistency with selectOne?
- Q5: Cross-platform: are there platform-specific branches in commands.ts that the 5 reviewers should focus on?
- Q6: test/terminal-prompts.test.ts — is B18 regression actually tested, or just asserted to compile?
- Q7: test/scanner.test.ts — does it exist? Does it cover all branches?
- Q8: dispatch.ts extractJsonObjects — has anyone tested it with a Claude envelope containing nested arrays and template literals?
