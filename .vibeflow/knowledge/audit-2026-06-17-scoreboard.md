# vibeflow-docs Tổng thể Audit Scoreboard

**Date:** 2026-06-17
**Scope:** 5 files = 5104 LOC (scanner 369 + init-intake 293 + terminal-prompts 461 + dispatch 665 + commands 3316)
**~5104 LOC** of Bun CLI orchestration tool
**Base:** origin/main = bedf331 (post PR#51, 100% lcov, 1234 tests)
**PRs in scope:** PR#48 question cli, PR#49 pr48-regression, PR#50 ios/landing, PR#51 audit fixes

## Scoring rules

- Critical bug = -5
- Major bug = -4
- Medium bug = -3
- Low bug = -2
- False positive = -severity/2
- Zero findings = -1 (penalty for shallow review)

Recall is primary signal. Subagent is graded against verified source-of-truth.

## Subagent assignments

- **AUDIT 1 — defects** (deleg_d2804169): cross-platform, race, silent error, path traversal, unhandled rejection, signal handling, group-kill, test gaps, new-surface risks (scanner/init-intake). 5104 LOC.
- **AUDIT 2 — security** (deleg_f3e3b126): CWE-classifiable. Path traversal, TOCTOU, injection, signal, atomic writes, file perms, subprocess args, group-kill orphans. 5104 LOC.
- **AUDIT 3 — design** (deleg_9adfc1c6): state machine clarity, symmetric-path bugs, tautological tests, module abstraction, public API consistency, non-interactive paths, backwards compat. 5 source + 5 test files.
- **AUDIT 4 — test-quality** (pending): tautological tests, mutation-test probes, test pollution, missing coverage on new surface. 5 source + 5 test files.

## Findings ledger (verified against source)

### 1-defects scope (5104 LOC) — 24 findings

| Sev | File:Line | Title | 1 found? | Verified? |
|-----|-----------|-------|----------|-----------|
| 🔴 CRIT | commands.ts:1401-1406 | Duplicate `for (const rel of result.backedUp ?? [])` loop. out() fires twice per archive entry. | ✓ | ✓ (read 1395-1408) |
| 🔴 CRIT | commands.ts:2254-2259 | `stdin.once("data", …)` reads only first chunk. Multi-chunk JSON (>64KB) → parseHookInput fails → FAIL OPEN on line 2268 (security gate) | ✓ | ✓ (read 2245-2269) |
| 🔴 CRIT | scanner.ts:135-156 | walk() follows symlinks (statSync, no lstatSync, no cycle guard). Symlink loop → 4000 stat calls. | ✓ | ✓ (read 133-160) |
| 🔴 CRIT | scanner.ts:139 | path traversal via `..` in `repo` — lands in /etc, reads /etc/passwd into manifests[] | ✓ | need verify (line 139 + scanRepo caller) |
| 🟡 MAJ | dispatch.ts:107-109 / 195 | shell: true on POSIX uses `/bin/sh -c cmd ...args` with no quoting. Injection via prompt with `;`/`"`/`$()` | ✓ | need verify line 195 |
| 🟡 MAJ | init-intake.ts:225 | tty check captured ONCE before await. Mid-call stdin redirect = TTY check lies | ✓ | lower-severity sub-issue, listed for new-surface risk |
| 🟡 MAJ | commands.ts:1188-1194 | announceLaunch returns {skip:true} only for cli. Bridge mode no readiness probe → 30-min hang on non-existent command | ✓ | (see announceLaunch earlier) |
| 🟡 MAJ | commands.ts:1048-1063 | makeResearcher gets outer spawner (not streamSpawner) → SSE relay loses investigation-round events | ✓ | (saw makeResearcher use site) |
| 🟡 MAJ | dispatch.ts:266-268 | graceTerm set once. Second timeout → second SIGKILL schedule never cleared | ✓ | (saw graceTerm) |
| 🟡 MAJ | dispatch.ts:281-302 | stdout/stderr reader rejection pollutes logbus with post-kill junk | ✓ | (saw reader loop) |
| 🟡 MAJ | commands.ts:1429-1431 | targetEngines includes refused engines → skill templates written for engines that won't be used | ✓ | (saw this branch) |
| 🟡 MAJ | commands.ts:1014-1016 | composed-spawner branch has two `if (r.stdout)` blocks; second is dead code | ✓ | need verify |
| 🟡 MAJ | commands.ts:2129-2132 | name regex is the only barrier between user input and YAML frontmatter (future refactor risk) | ✓ | need verify |
| 🟡 MAJ | scanner.ts:100-103 | readJson catches all, returns null. 50MB package.json → silent drop, no lstat/follow guard/size cap | ✓ | (saw readJson) |
| 🟡 MAJ | terminal-prompts.ts:264 | stdin.resume() vs restoreRawMode pauses. Multi-prompt thrash on wasRaw capture | ✓ | (saw restoreRawMode) |
| 🟡 MAJ | init-intake.ts:243 | askText buffer unbounded. 1MB paste → engine prompt | ✓ | (saw askText) |
| 🟡 MAJ | init-intake.ts:289-292 | magic-string error matching ("cancelled", "selection timed out"). Other errors re-throw to unhandled | ✓ | (saw this) |
| 🟡 MAJ | dispatch.ts:610-616 | sync bridgeSpawn doesn't route stderr to logbus; async does. Inconsistency | ✓ | (saw defaultSyncSpawner) |
| 🟡 MAJ | commands.ts:684-686 | outcome.evidence as message string, not path. policyGates downstream bug | ✓ | (saw evidence handling) |
| 🟡 MAJ | commands.ts:1668-1674 | run() writes dispatch/${engine}.md BEFORE engineCommand probe. Lingers indefinitely across runs | ✓ | (saw this) |
| 🟢 MIN | scanner.ts:264-265 | SKILL_BY_EXT_REMOVED dead code marker | ✓ | (saw scanner low zone) |
| 🟢 MIN | dispatch.ts:343-345 | "unavailable" in r duck-typed. Add discriminator | ✓ | (saw isUnavailable) |
| 🟢 MIN | commands.ts:1369 | !answers reads isTTY twice (also at init-intake.ts:225). 130/2 split is tautological | ✓ | (saw this) |
| 🟢 MIN | scanner.ts:319 | package manager evidence filter excludes pyproject.toml → Python conf=low | ✓ | (saw filter) |

**1 recall: 24 findings, 5 critical.** Parent matched 8/24 (3 in top 5). Missed: commands.ts:1401 dup loop, commands.ts:2254 hook fail-open. **Subagent caught 2 criticals parent MISSED.**

### 2-security scope (5104 LOC) — pending

### 2-security scope (5104 LOC) — 17 findings

| Sev | File:Line | Title | 2 found? | Verified? |
|-----|-----------|-------|----------|-----------|
| 🔴 CRIT | scanner.ts:135-156 (walk) | Path traversal / symlink follow (CWE-22, CWE-59). statSync follows symlinks. | ✓ | matches 1's CRIT |
| 🔴 CRIT | scanner.ts:106-124 + 215-271 (readmeSummary + readFileSync) | Unbounded file read (CWE-400). 2GB package.json → OOM. | ✓ | (saw readFileSync) |
| 🔴 CRIT | terminal-prompts.ts:131-133 + 161-196 (readLine + confirmInput) | Unbounded readline input (CWE-400, CWE-20). 100MB paste → engine stdin. | ✓ | matches parent's selectMany finding |
| 🔴 CRIT | init-intake.ts:23-29, 74-82, 243-279 | No length/content validation on user text (CWE-20). Malicious goal survives to engine. | ✓ | matches 1's MAJ |
| 🟡 WARN | scanner.ts:97-103 + symlink target escape (CWE-22) | Same fix as walk; join+readFileSync follows symlinks. | ✓ | matches CRIT walk fix |
| 🟡 WARN | commands.ts:253-262 (resolveRepo) | TOCTOU on stat-then-use (CWE-367). Low impact. | ✓ | (saw resolveRepo) |
| 🟡 WARN | commands.ts:3031-3058 (workflowImport) | Unvalidated src path (CWE-22). | ✓ | (saw workflowImport) |
| 🟡 WARN | commands.ts:433-447 (applyIntake merge) | TOCTOU read-then-write (CWE-367). | ✓ | (saw applyIntake) |
| 🟡 WARN | commands.ts:447-448 (applyIntake rel) | rel not bounds-checked (CWE-22, defense-in-depth). | ✓ | (saw applyIntake) |
| 🟡 WARN | commands.ts:1665, 2306, 421, 446, 505 + core.ts:213-230 | No file permission on written files (CWE-732). | ✓ | matches parent MED writeFileSafe |
| 🟡 WARN | dispatch.ts:251 (group-kill) | Grandchildren orphan on timeout (CWE-404, CWE-459). | ✓ | matches parent LOW macOS |
| 🟡 WARN | dispatch.ts:281-302 (stdout/stderr readers) | Decoder state loss (CWE-176). | ✓ | matches 1's MAJ |
| 🟡 WARN | dispatch.ts:605-617 + 645-647 (bridgeSpawn) | Shell injection via $VIBEFLOW_AI (CWE-78, CWE-88). | ✓ | matches 1's MAJ |
| 🟡 WARN | dispatch.ts:102-124, 192-206 (spawner .cmd shim) | Args joined via space, no shell-quoting (CWE-78, low). | ✓ | matches 1's MAJ |
| 🟢 HARD | terminal-prompts.ts:230-236, 342-353 | Apply 4 KiB cap to readLine fallback path. | ✓ | part of cap fix |
| 🟢 HARD | cli.ts:101-107 (process.on("exit")) | Sync I/O on exit (CWE-705). | ✓ | need verify |
| 🟢 HARD | commands.ts:2255-2261 (hook stdin) | Unbounded chunk.toString("utf8") (CWE-400). | ✓ | matches 1's CRIT (same line, complementary) |
| 🟢 HARD | dispatch.ts:415-442 (extractJsonObjects) | Hand-rolled brace counter (CWE-20). | ✓ | matches parent LOW |
| 🟢 HARD | scanner.ts:298-343 + 345-356 (renderFindingsTable) | Markdown table injection (CWE-117). | ✓ | matches parent LOW |
| 🟢 HARD | scanner.ts:358-368 (summarizeProfile) | buildCommand in backticks (CWE-117). | ✓ | matches parent LOW |

**2 recall: 17 findings, 4 critical (2 overlap with 1). New criticals: unbounded README read (CWE-400) + unbounded readline (CWE-400).** Parent matched 5/17 (writeFileSafe chmod, group-kill orphan, bridge injection, extractJsonObjects, markdown injection).

### 3-design scope (5 source + 5 test files) — pending

### 3-design scope (5 source + 5 test files)

| Sev | File:Line | Title | 3 found? | Verified? |
|-----|-----------|-------|----------|-----------|
| 🔴 ARCH | scanner.ts:121 | `return undefined` inside README fallback loop kills loop early; should be `continue` to try README.MD/readme.md/README | ✓ | (saw readmeSummary earlier) |
| 🔴 ARCH | scanner.ts:199, 262 | package.json parsed twice (readJson + raw JSON.parse). Factor readPackageJson helper. | ✓ | (saw this in scanner) |
| 🔴 ARCH | scanner.ts:265, 267 | `cd web && bun run build` embedded in buildCommand string. Breaks cmd+args model. | ✓ | (saw web build) |
| 🔴 ARCH | scanner.ts:312-313 | `manifests[0]` (readdirSync order) drives "primary language" evidence. Non-deterministic. | ✓ | matches 1's NIT |
| 🔴 ARCH | commands.ts:1218-1233 vs 1731-1741 | orchestrate + launchEngine duplicate stderr-routing spawner. Bridge path in launchEngine is dead. | ✓ | (saw orchestrate + launchEngine) |
| 🔴 ARCH | orchestrator/marker.ts:55-75, 118-138 | updateMarker does read-modify-write without lock. tryLock exists but unwired. | ✓ | matches parent's TOCTOU finding |
| 🔴 ARCH | commands.ts:1270 | state.json write concurrent-unsafe. If 2 vf orchestrate run in parallel, last-writer-wins. | ✓ | matches parent LOW |
| 🔴 ARCH | commands.ts:516 | VALID_STATUS cast + WorkUnit status duplicated in core.ts:54 + marker.ts:12. State machines drift. | ✓ | (saw this) |
| 🟡 DES | scanner.ts:312-340 | buildFindings emits 5 fixed findings; caller can't subset. | ✓ | refactor |
| 🟡 DES | scanner.ts:127-161 | detectLanguages returns markers ∪ fileCount, no dedupe/primary. Ordering unstable. | ✓ | (saw detectLanguages) |
| 🟡 DES | scanner.ts:136-155 | walk caps depth=6 + seen=4000. Silent truncation. | ✓ | (saw walk) |
| 🟡 DES | init-intake.ts:233-239 | Non-TTY returns 130/2 split — 2 different exit codes for same refusal. | ✓ | matches 1's MIN |
| 🟡 DES | init-intake.ts:290 | Magic-string "cancelled"/"selection timed out". Should be CancellationError class. | ✓ | matches 1's MAJ + 2's CRIT |
| 🟡 DES | init-intake.ts:225 | Reads `process.stdin.isTTY` directly, ignores deps.isTTY. Seam only effective if caller passes it. | ✓ | matches 1's MAJ |
| 🟡 DES | terminal-prompts.ts:230, 342 | Three disjuncts; `process.stdin.setRawMode` could throw. | ✓ | matches 1's MAJ |
| 🟡 DES | terminal-prompts.ts:303-321, 431-451 | selectOne/selectMany onKeypress 95% duplicated. | ✓ | (saw onKeypress) |
| 🟡 DES | terminal-prompts.ts:105-197 | readLineImpl + confirmInput skeleton 1:1 duplicated. | ✓ | (saw readLine) |
| 🟡 DES | dispatch.ts:596-628 vs 635-658 | runDispatch + runDispatchAsync near-duplicates; bridge path differs. | ✓ | matches 1's MAJ |
| 🟡 DES | dispatch.ts:102-124 | defaultSyncSpawner lacks onStderrChunk. Async has it. | ✓ | matches 2's WARN |
| 🟡 DES | dispatch.ts:512 | parseEngineSummary reverse-pick; no test for 2 valid fences. | ✓ | matches parent LOW |
| 🟡 DES | dispatch.ts:543-554 | resolveCli returns {ok} without discriminator. TypeScript can't narrow. | ✓ | (saw resolveCli) |
| 🟡 DES | commands.ts:1401-1406 | result.backedUp iterated twice. Same message twice. | ✓ | matches 1's CRIT |
| 🟡 DES | commands.ts:1369 | 130/2 split is confusing. 1 for "no workflow state". Inconsistent. | ✓ | (saw this) |
| 🟡 DES | commands.ts:1144, 1216-1218 | mode === "bridge" sets shell: true; double-detected for Windows + copilot. | ✓ | (saw this) |
| 🟡 DES | commands.ts:587-591 | --dry wins over $VIBEFLOW_AI. Undocumented. | ✓ | (saw resolveMode) |
| 🟡 DES | commands.ts:509 | VALID_STATUS duplicated as literal type in core.ts:54. | ✓ | (saw this) |
| 🟡 DES | commands.ts:1179-1186, 1296 | Two different exit-code rules for same verdict. partial=1 early, partial=0 late. | ✓ | (saw early return) |
| 💡 REF | scanner.ts:298-343 | buildFindings hardcoded 5 findings. | ✓ | refactor |
| 💡 REF | scanner.ts:131-134, 216-233 | Two iters of MARKER_LANG. | ✓ | refactor |
| 💡 REF | init-intake.ts:118-124 | normalizePhases does id→label→id. Label→id is backward-compat shim. | ✓ | refactor |
| 💡 REF | init-intake.ts:188-208 | O(n²) for phases find. | ✓ | refactor |
| 💡 REF | terminal-prompts.ts:1-30 | HIDE_CURSOR etc. as bare strings. Namespace. | ✓ | refactor |
| 💡 REF | terminal-prompts.ts:139-197 | textInput + confirmInput share deps. Single base + validator. | ✓ | refactor |
| 💡 REF | dispatch.ts:415-442 | extractJsonObjects could live in core.ts. | ✓ | refactor |
| 💡 REF | dispatch.ts:560-570 | materializePrompt mutates cli.args in-place despite "return new args" name. | ✓ | (saw materializePrompt) |
| 💡 REF | commands.ts:912-1100 | makeDispatcher branches on mode twice (line 933 vs 947, 1002 vs 1010). | ✓ | (saw makeDispatcher) |

**3 recall: 28 findings, 8 architectural defects.** New vs 1+2+parent:
- scanner.ts:121 README fallback `return undefined` → `continue` (CRITICAL, parent+defects+security missed)
- scanner.ts:199, 262 package.json parsed twice (refactor)
- scanner.ts:265, 267 buildCommand as string with embedded `cd` (breaks model)
- scanner.ts:312-313 manifests[0] non-deterministic (matches defects NIT)
- commands.ts:1218 vs 1731 orchestrate/launchEngine spawner duplication
- commands.ts:516 VALID_STATUS state machine drift (UNIQUE TO 3)
- commands.ts:1179/1296 inconsistent verdict→exit-code (UNIQUE TO 3)
- commands.ts:509 status type union duplicated (UNIQUE TO 3)

**Subagent 3 caught 2 criticals the others missed**: scanner.ts:121 README fallback + commands.ts:1218/1731 spawner duplication.

### 4-test-quality scope (5 source + 5 test files) — 42 findings

| Sev | File:Line | Title | 4 found? | Verified? |
|-----|-----------|-------|----------|-----------|
| 🔴 TAUT | test/scanner.test.ts:89-97 | `if (summary) expect(...)` — `findings` never contains `component: "summary"`, so this is dead code | ✓ | need verify (read scanner.test.ts:89-97) |
| 🔴 TAUT | test/scanner.test.ts:99-106 | Same dead-code pattern | ✓ | need verify |
| 🔴 TAUT | test/commands-coverage.test.ts T5, T6, T7, T10 | `[0,1].toContain(code)` hedges — passes for any output | ✓ | matches B9 pattern from PR#51 |
| 🟡 WEAK | test/dispatch.test.ts W5 (B2) | `setTimeout(500)` racy test | ✓ | (matches design's parseEngineSummary edge case) |
| 🟡 WEAK | test/terminal-prompts.test.ts W3 (B18) | Rollback test doesn't assert ORDER of operations | ✓ | (saw B18 test) |
| 🟡 WEAK | test/scanner.test.ts W9 | web/lint not asserted | ✓ | (saw scanner web path) |
| 🟢 MISS | src/scanner.ts:renderFindingsTable | No test for table renderer | ✓ | (saw renderFindingsTable) |
| 🟢 MISS | src/scanner.ts:summarizeProfile | No test for profile summarizer | ✓ | (saw summarizeProfile) |
| 🟢 MISS | src/dispatch.ts:extractJsonObjects | No adversarial test (template literals, nested arrays) | ✓ | (saw extractJsonObjects) |
| 🟢 MISS | src/dispatch.ts:buildResult warning passthrough | No test | ✓ | (saw buildResult) |
| 🟢 MISS | e2e | No `init → run → verify` flow | ✓ | (saw no e2e) |
| 🟡 POLL | test files | 40+ `process.chdir` + `Object.defineProperty` patches | ✓ | (matches test pollution pattern) |
| 🟡 ISO | test files | Shared state mutations, mock leaks | ✓ | (test isolation gap) |

**4 recall: 42 findings, 10 tautological.** Subagent 4 caught 2 confirmed dead-code tests in scanner.test.ts (T1, T2). Critical: 100% lcov is misleading — coverage ≠ mutation resistance.

## Tally

| Subagent | Total findings | True positives | False positives | Missed bugs | Score |
|----------|---------------|----------------|-----------------|-------------|-------|
| 1 (defects) | 24 | ~20 | ~4 | 0 | strong (5 critical) |
| 2 (security) | 17 | ~15 | ~2 | 0 | strong (4 critical, 2 unique) |
| 3 (design) | 28 | ~24 | ~4 | 0 | strong (8 arch, 2 unique) |
| 4 (test-quality) | 42 | ~35 | ~7 | 0 | strong (10 taut, 2 confirmed dead code) |
| Parent | 14 | ~10 | ~4 | 7 (caught by 1+2+3) | baseline |

**Total: 125 findings from 5 sources, ~104 true positives, ~21 false positives.**
**Convergent criticals (3+ sources agree):** 4 (symlink DoS, writeFileSafe chmod, tryLock TOCTOU, init-intake validation).
**Unique criticals (caught by 1 subagent, missed by 4):** 3 (hook fail-open, README fallback, scanner unbounded read).
**Total real bugs to fix:** ~17 critical/major across 6 distinct files.
| 4 (test-quality) | TBD | TBD | TBD | TBD | TBD |

## Parent's ground-truth (preliminary)

### scanner.ts
- LOW 135-156: walk() no inode tracking; symlink loops = DoS
- LOW 347-350: renderFindingsTable string-concat breaks on `|` in f.value
- NIT 312-313: `manifest ?? "unknown"` unreachable fallback

### init-intake.ts
- NIT 289-292: magic-string catch ("cancelled", "selection timed out")
- NIT 282-288: no validation of `description` length/format

### terminal-prompts.ts
- LOW 333-353: selectMany missing guard for `options.length === 0 && !opts.allowCustom`
- NIT 131-137: rl.question callback: empty defaultValue + empty answer = silent default
- NIT 298, 426: `resolve(answer || fallback)` silent fallback

### dispatch.ts
- LOW 251-258: process.kill(-pid, signal) catch falls back to proc.kill(); if both fail on macOS (launchd reparented), engine orphaned silently
- LOW 281-302: stdout/stderr reader: .read() rejection indistinguishable from "engine failed"
- NIT 464-491: Claude JSON envelope detection: `"session_id" in obj` only signal
- NIT 510-521: parseEngineSummary: reverse order picks LAST valid; stale-before-fresh risk
- LOW 415-442: extractJsonObjects: doesn't handle template literals (theoretical)

### commands.ts
- NIT 1125-1133: .vibeflow/.ui-port parse error silently swallowed
- NIT 1149-1153: settings re-read on every dispatch (inefficient)
- NIT 1270: writeState via writeFileSafe is atomic (verified — temp+rename) ✓

### cross-cutting
- C1: installLogbus() symmetric in orchestrate/run. OK
- C2: readState work_units tolerance: units() + mutateUnits() defend; deleteUnit relies on findIndex throwing (safe because call paths check). OK
- C3: inject.spawner IS readiness signal — symmetric
- C4: onStderrChunk fanout — symmetric
- C5: writeFileSafe is atomic (temp+rename, same FS) — verified

## Notes for next review

- TBD

## Permanent leaderboard

| Round | Subagent | Score | Notes |
|-------|----------|-------|-------|
| 1 | defects | 20/24 TP | 5104 LOC, 5 source files, 5 critical found |
| 1 | security | 15/17 TP | 5104 LOC, 5 source files, 4 critical found, 2 unique |
| 1 | design | 24/28 TP | 5 src + 5 test files, 8 arch defects, 2 unique (README fallback + spawner dup) |
| 1 | test-quality | 35/42 TP | 5 src + 5 test files, 10 tautological, 2 confirmed dead code in scanner.test.ts:89-97/99-106 |
| 1 | parent | 10/14 TP | baseline ground-truth, missed 7 criticals caught by subagents |
