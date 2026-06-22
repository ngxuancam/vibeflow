---
name: cross-review
description: "Review a plan, commit, or work unit through 4 lenses — Correctness, Design, Risk, Test — before merge. Trigger on every non-trivial change (> 2 files or any new logic path) as the cross-review gate in the coordinator loop."
---

# Cross-Review

A cross-review is the gate before merge. It uses a DIFFERENT engine than the
implementer (codex reviews claude, claude reviews codex) and reads the diff
through 4 lenses. A green CI gate is not a substitute — tests don't catch
design bugs, security regressions, or scope creep.

## 1. When to trigger

- Any change touching > 2 files.
- Any new logic path (new function, new branch, new error handler).
- Any plan/commit that the implementer self-reports as "done."
- Before merge, always. The review is in the loop, not after it.

Skip for: typo fixes, one-line config changes, re-running a flaky test.

## 2. The 4 lenses

### Lens 1 — Correctness
Does the code do what it claims?

Checklist:
- [ ] The claimed behavior matches the diff (read the commit message + plan).
- [ ] Edge cases: empty input, null/undefined, concurrent access, timeout.
- [ ] Off-by-one: boundaries, array indices, loop conditions.
- [ ] Error paths: do failures propagate or silently swallow?
- [ ] Return values: does every branch return what the caller expects?

### Lens 2 — Design
Is the shape right?

Checklist:
- [ ] Single responsibility: one function, one job. No "and" in the name.
- [ ] Coupling: does this change add a new import dependency that isn't needed?
- [ ] Naming: do names describe the intent or the implementation? (e.g. `save()` not `writeToFile()`).
- [ ] Abstraction level: are high-level and low-level operations mixed in one
  function?
- [ ] Interface bloat: exported things that nothing imports = dead code.

### Lens 3 — Risk
What breaks if this is wrong?

Checklist:
- [ ] Security: user input, auth bypass, secret exposure, injection surface.
- [ ] Data loss: does this delete, overwrite, or migrate data? Is the migration
  reversible?
- [ ] Irreversibility: can this be rolled back? If not, flag as HIGH severity.
- [ ] Blast radius: how many callers/consumers does this change affect?
- [ ] Concurrency: shared state, race windows, lock ordering.

### Lens 4 — Test
Are the tests real?

Checklist:
- [ ] Assert behavior, not trivia: `expect(result).toBe(expected)` not
  `expect(true).toBe(true)`.
- [ ] Cover failure paths: error handler tested, not just happy path.
- [ ] Edge-case coverage: the specific edge cases from Lens 1 have test cases.
- [ ] Branch coverage trap: "100% line coverage" ≠ "all branches tested."
  Spot-check the new code's branches.
- [ ] Test isolation: no shared mutable state between tests.

## 3. How to report findings

Every finding has 3 parts:

```
[SEVERITY] <file:line> — <one-line description>
FIX: <concrete fix suggestion, one sentence>
```

Severity levels:
| Level | Meaning | Action |
|-------|---------|--------|
| **BLOCKER** | Data loss, security, irreversibility | Must fix before merge |
| **HIGH** | Wrong behavior, broken edge case | Fix before merge |
| **MEDIUM** | Design smell, naming, coupling | Fix in follow-up PR |
| **LOW** | Style nit, dead import | Optional |

Report format:
```
## Cross-Review — <artifact name>
Engine: <reviewing engine> reviewing <implementer engine>
Lenses checked: [x] Correctness [x] Design [x] Risk [x] Test

### Findings
[BLOCKER] src/workflow/dispatch.ts:42 — dispatchAll runs promises sequentially
FIX: Use Promise.all or a proper work-queue with bounded concurrency.

[HIGH] src/state/ledger.ts:88 — addEvidence overwrites existing evidence array
FIX: Spread the existing array: evidence: [...prev, newEntry].

[MEDIUM] src/cli/orchestrate.ts:15 — function name `run` is too generic
FIX: Rename to `orchestrateWorkUnits`.

### Verdict
[ ] APPROVE — merge when CI is green
[x] CHANGES REQUESTED — fix BLOCKER + HIGH before re-review
[ ] REJECT — fundamental design issue, re-plan
```

## 4. Pitfalls

- **Approving on a green CI gate without reading the diff.** CI proves the
  code compiles and existing tests pass. It does not prove the new code is
  correct, well-designed, or safe. Read the diff.
- **Same-engine review.** An engine reviewing its own work is blind to its
  own patterns. Always cross-engine.
- **Nitpicking without severity.** "I would have named it differently" is
  LOW, not HIGH. Don't block merge on style preferences unless they violate
  a documented convention.
- **Missing the blast-radius check.** A 3-line change to a shared utility
  can break 40 callers. Check `rg <function-name>` before approving.
- **Accepting "100% coverage" at face value.** Branch coverage lies. Look
  at the new code's branches and verify each has a test that exercises it.
- **Review fatigue on large diffs.** If the diff is > 500 lines, ask the
  implementer to split it. Review quality drops hard beyond 200-300 lines.
