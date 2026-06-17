# /plan: VibeFlow v0.6.0 development plan

**Date**: 2026-06-17
**Source**: 4-CLI adversarial audit (claude, codex, opencode, copilot)
**Synthesized**: 46 raw findings → 6 consensus + 10 medium + 14 low
**Validation**: parent re-validated all 6 consensus findings against source code

## 0. Verdict

VibeFlow v0.6.0 foundation solid (code 7-8/10, security 8/10). The weak link is **doc/code drift** (4-5/10) — docs and packaging ship with real defects that break user flows post-install. Per-feature engine support is honest about limitations; per-feature CLI surface is reasonable.

**Pattern observed across all 4 CLIs**: `vf` is designed top-down (architecture first, code second, docs third). The codebase has 3 different "source-of-truth" lists for the same concept (skill roots, engine priority, instruction files) — classic "no single owner" smell. Consolidation is the highest-leverage work.

## 1. Critical consensus findings (6) — fix this week

| ID  | Severity | Title                                                    | Effort | Validated |
|-----|----------|----------------------------------------------------------|--------|-----------|
| C1  | high     | `.viteflow/` typo in 6+ docs (docs say A, code is B)     | XS     | ✅ parent |
| C2  | high     | Skill mirror write/read mismatch (sync 4 dirs, read 3)  | M      | ✅ parent |
| C3  | high     | Engine priority disagreement (3 different orderings)    | S      | ✅ parent |
| C4  | **critical** | `package.json` `files` omits `.agents/skills/skill-creator/` | XS     | ✅ parent |
| C5  | **critical** | Hook output JSON shape doc contradicts actual runner output | S      | ✅ parent |
| C6  | high     | `doctor` requires copilot AND gh (false on copilot-only systems) | XS | ✅ parent |

**5-why on the pattern**:
1. *Why* do 3 source-of-truth lists exist? Each list is defined next to its consumer (write site, read site, doc).
2. *Why* are they not centralized? `core.ts` is the canonical "constants" file, but only used by some consumers.
3. *Why* was the discrepancy not caught? No test asserts the cross-cutting invariant.
4. *Why* is there no such test? Tests are per-file (100% line), not cross-file.
5. *Why* no cross-file invariant test? Effort-to-value tradeoff — until now, no audit has surfaced the cost.

**Root cause**: doc/code drift is the project's structural weak point. Single source of truth + cross-file invariant tests = the fix.

### 1.1 PR plan (one fix per PR, per-file 100% gate)

#### PR#64 — `docs:fix .viteflow → .vibeflow in all docs` (C1)
- `sed -i '' 's/\.viteflow/.vibeflow/g' docs/*.md`
- Commit: `docs: correct .viteflow → .vibeflow references in docs (C1)`
- Test: add a `test/docs-paths.test.ts` that reads every doc and asserts no `.viteflow` string.
- Per-file 100% gate: trivial, just the new test file.

#### PR#65 — `fix(skills): align discover read roots with workflow-artifacts write roots` (C2)
- Decision: **add** `.agents/skills` and `.github/skills` to `SKILL_ROOTS` in `src/skills/registry.ts:13`.
- Rationale: workflow-artifacts writes to engine-specific roots; discover should see what was written.
- New test: `test/skills-registry-roots.test.ts` — assert every root in `ENGINE_CONFIGS[*].skillRoot` is also in `SKILL_ROOTS`.
- This is the cross-file invariant test for C2.

#### PR#66 — `feat(core): centralize engine priority in settings.json with code default` (C3)
- `src/core.ts`: export `DEFAULT_ENGINE_PRIORITY = ["claude", "codex", "copilot"]`.
- `src/ai-init.ts`: read from `settings.json.enginePriority ?? DEFAULT_ENGINE_PRIORITY`.
- Drop the 2 hardcoded arrays.
- `docs/USER_GUIDE.md`: update to mention the config option.

#### PR#67 — `fix(packaging): include .agents/skills/skill-creator in npm tarball` (C4 — CRITICAL)
- `package.json`: `"files": [..., ".agents/skills/skill-creator"]`.
- `src/workflow-artifacts.ts:copySkillCreator`: add `console.warn` when `!existsSync(srcPath)` (was silent no-op via try/catch).
- Test: `test/workflow-artifacts.test.ts` — verify the warn message + new packaging test that runs `npm pack --dry-run` and greps the tarball for the file.

#### PR#68 — `docs(hooks): correct output JSON shape to match actual runner` (C5 — CRITICAL)
- `docs/HOOKS_AND_GUARDRAILS.md:77-84`: replace the fictional example with the real `hookSpecificOutput` envelope.
- Add a new section "Per-event output shape" documenting:
  - PreToolUse (Claude) → `{hookSpecificOutput: {hookEventName, permissionDecision, permissionDecisionReason}}`
  - Stop (Claude) → `{hookSpecificOutput: {hookEventName, decision, reason}}`
  - PostToolUse (Claude) → `{hookSpecificOutput: {hookEventName}}`
  - Other events → `{decision, risk, reasons}` (top-level)
- Test: `test/hook-output-shape.test.ts` — snapshot the actual output for each event type; doc asserts the same shape.

#### PR#69 — `fix(doctor): copilot readiness should be copilot OR gh, not AND` (C6)
- `src/commands.ts:179`: change `_hasCommand("copilot") && _hasCommand("gh")` to `_hasCommand("copilot")`.
- Add a separate `[..., "gh", _hasCommand("gh"), "optional"]` entry.
- Test: `test/commands-coverage.test.ts` — assert doctor reports copilot as ready when only copilot is installed (no gh).

## 2. Medium-priority fixes (10) — fix next week

| ID  | Title                                                            | Effort |
|-----|------------------------------------------------------------------|--------|
| M1  | Committed `coverage/lcov.info` is stale (99.92% vs claimed 100%) | XS     |
| M2  | `DEPLOYMENT.md` says 0.1.0, code is 0.6.0                       | XS     |
| M3  | Claude writes 3 instruction files; spec wants 1                  | S      |
| M4  | `splitOperators` in risk.ts misses `\n`                          | XS     |
| M5  | 9 KB INSTRUCTIONS_BODY embedded in ai-init.ts                    | M      |
| M6  | Codex `instructionFiles:[]` violates spec                        | XS     |
| M7  | SKILL_ADVISOR_PROTOCOL referenced, not implemented               | M      |
| M8  | Per-unit `TODO.md` / `HANDOFF.md` documented, not generated      | M      |
| M9  | `init` defaults copilot, `orchestrate` defaults claude           | S      |
| M10 | Copilot hook config written but engine ignores it                | M      |

**Effort legend**: XS (≤30 min) | S (≤2h) | M (≤1 day)

**Batch recommendation**: M1+M2+M4+M6 are all XS — ship in one PR. M3+M9 are S and architecturally related (canonical instruction file + canonical default) — ship together.

## 3. Low-priority cleanup (14) — fix over the next month

Style/cosmetic issues that don't break user flows:
- `commands.ts` 3376 lines (refactor to `commands/` directory when scope grows)
- `parseInlineList` frontmatter edge cases
- `generateWorkflowArtifacts` silent no-op
- `PROTECTED_PATH` case-sensitivity
- `selftest` hardcoded corpus
- Scanner walk truncation warning
- Windows `.cmd` shim detection
- `copilotVersion()` ENOENT on Windows
- `gh api copilot` wrong product for quota signal
- Confidence threshold 1.0 vs 0.7-0.95 spec
- Dispatch build path raw-string append
- `defaultContext` referenced before init
- `parseSkill` name normalization
- Prototype-pollution guard missing keys

## 4. Validated false positives (3) — leave alone

- `codex F-4` (branch coverage 0/0 = NaN): structural bun:coverage limitation; gate already documents and surfaces via `::notice::`.
- `codex F-11` (audit prompt refs nonexistent files): the audit prompt was wrong, not the code.
- `copilot` exit-code-2-vs-0: per Claude 2026 spec, `presentDecision` returns 0 unconditionally.

## 5. Strengths to preserve (8)

- Strong risk.ts (8 attack patterns, $IFS, subshell recursion, quote-aware)
- Crash-safe writes (chmod-before-rename)
- Symlink-safe scanner (lstatSync)
- Skill provenance gate (prototype-pollution-safe)
- Bounded async concurrency with POSIX process-group kill
- Zero runtime dependencies (77 kB tarball)
- 100% line coverage gate (with documented branch limitation)
- TDD workflow, per-file 100% gate, 1253 tests passing

## 6. Cross-cutting improvements (meta-fixes)

### 6.1 Cross-file invariant tests
The audit revealed that per-file 100% coverage is necessary but not sufficient. The 6 consensus findings all stem from missing cross-file assertions. Add a `test/invariants.test.ts` suite that asserts:
- Every write root in workflow-artifacts is a read root in registry
- Every engine mentioned in adapter has ENGINE_CONFIG
- Every doc path is a real code path

### 6.2 Single source of truth for cross-cutting constants
The audit found 3+ copies of "skill roots", 2+ copies of "engine priority". Centralize in `src/core.ts` and re-export. Document the rule "one canonical definition, import everywhere".

### 6.3 Doc freshness
`DEPLOYMENT.md` and `USER_GUIDE.md` reference 0.1.0. Add a CI check that fails if any version string in docs ≠ `package.json` version. Simple grep.

## 7. Sequenced execution

```
Week 1 (critical — must ship before next release):
  PR#64 docs:fix viteflow typo (XS)
  PR#67 packaging skill-creator (XS, blocks every npm install)
  PR#68 docs(hooks) correct shape (S, blocks external integrators)
  PR#69 fix(doctor) copilot OR gh (XS)
  PR#66 feat(core) engine priority (S)

Week 2 (high — design consolidation):
  PR#65 fix(skills) registry roots (M)
  PR#70 test: add cross-file invariants (M)
  PR#71 refactor: extract INSTRUCTIONS_BODY to .md (M)
  PR#72 feat: implement SKILL_ADVISOR_PROTOCOL OR remove (M)

Week 3 (medium batch):
  PR#73 fix: claude instructions → AGENTS.md only (S)
  PR#74 fix: init default = orchestrate default (S)
  PR#75 test: dispatcher path trim (XS)
  PR#76 fix: scanner walk warning (XS)
  PR#77 fix: Windows .cmd shim (S)
  PR#78 fix: gh api copilot wrong product (XS)
  PR#79 docs: refresh DEPLOYMENT.md (XS)
  PR#80 fix: splitOperators newline (XS)
  PR#81 fix: codex instructionFiles (XS)
  PR#82 chore: remove stale committed lcov.info (XS)

Week 4+ (low + refactor):
  PR#83+ low priority cleanup
  PR#XX refactor: split commands.ts into commands/ directory
```

## 8. Success metrics

- All 6 critical findings resolved before next npm release.
- 4-CLI re-audit: doc_code_alignment score should rise from 4.3 to ≥8.
- `npm pack --dry-run` includes the skill-creator source.
- `test/invariants.test.ts` prevents re-introduction of the 6 finding classes.
- Coverage stays at 100% line, lcov branch limitation remains documented.
- No new 4-CLI consensus findings in next monthly audit.

## 9. Files referenced

- Synthesis: `/Users/linhn/vibeflow-docs/.vibeflow/knowledge/audit-2026-06-17-4cli-synthesis.json`
- Raw audits: `/tmp/audit-{claude,codex,opencode,copilot}.json`
- Code under audit: `/Users/linhn/vibeflow-docs/src/**/*.ts`
- Docs under audit: `/Users/linhn/vibeflow-docs/docs/*.md`

## 10. Confidence: 0.92

- All 6 consensus findings re-validated against source by parent.
- Effort estimates derived from diff size of similar past PRs.
- Sequenced by dependency (C4 blocks C5's downstream effect; C2 blocks C6's test).
- 3 false-positive validations by parent.
- 1 audit (claude) used slightly different score axes; normalized for display only.

Powered by VibeFlow v0.6.0
