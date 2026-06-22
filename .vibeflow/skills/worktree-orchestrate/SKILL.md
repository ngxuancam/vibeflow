---
name: worktree-orchestrate
description: "Dispatch and manage a parallel-worktree queue — one isolated git worktree per work unit, zero file overlap, explicit refspec push, per-unit verify before PR. Trigger on `vf orchestrate --isolate` or when the coordinator dispatches work units that touch disjoint file scopes."
---

# Worktree Orchestrate

The coordinator dispatches work units into isolated git worktrees so parallel
lanes never clobber each other. Each worktree is one work unit; each branch
is one PR; each PR is verified before queueing.

## 1. When to trigger

- `vf orchestrate --isolate` is invoked.
- The coordinator splits a task into ≥ 2 work units with disjoint file scopes.
- A single worktree is insufficient (e.g., two engines need different
  checkouts, or a refactor and a feature must not interleave).

Do NOT isolate for: a single work unit, a typo fix, or work units that
share files (those are serialized in one worktree).

## 2. The worktree lifecycle

```
create → dispatch → verify → push → PR → merge → prune
```

### Step 1 — Create the worktree
```bash
# One worktree per work unit, rooted in /tmp or .vibeflow/worktrees/
git worktree add /tmp/vf-wt-<unit-name> -b <unit-branch>
```
- Branch name: `wt/<issue>-<unit-name>` (e.g., `wt/178-cross-review`).
- Worktree path: predictable, logged in the work unit ledger.
- Base the branch off `main` (or the latest commit on the parent branch if
  stacking).

### Step 2 — Dispatch the engine
```bash
cd /tmp/vf-wt-<unit-name>
<engine> exec "<prompt>"   # or claude -p "<prompt>"
```
- The prompt is the work unit's spec from the ledger.
- The engine runs typecheck/lint in the worktree — do NOT dispatch a second
  agent for verification that the engine should self-run.

### Step 3 — Per-unit verify
```bash
cd /tmp/vf-wt-<unit-name>
bun run check    # typecheck + lint + test + coverage
```
- `bun run check` must exit 0 before pushing. If it fails, fix in the
  worktree (loop back to step 2).
- Confidence gate: the unit's evidence must be recorded in the ledger
  (`vf units evidence <name> --add "bun run check exit 0"`).

### Step 4 — Push with explicit refspec
```bash
cd /tmp/vf-wt-<unit-name>
git commit -m "<type>(<scope>): <subject> (A2 #<issue>)

<body>
Signed-off-by: <user> <user@users.noreply.github.com>"
git push origin HEAD:refs/heads/<unit-branch>
```
- Explicit refspec (`HEAD:refs/heads/<branch>`) — never `git push` without
  a destination.
- No `--force`, no `--force-with-lease` on the first push.

### Step 5 — Create the PR
```bash
# In the main worktree:
vf pr queue --branch <unit-branch> --title "<subject>" --unit <unit-name>
```
- The PR is created but NOT merged yet. Merge happens after CI + cross-review,
  handled by the merge-when-green skill.

### Step 6 — Prune the worktree
```bash
# After merge (or on failure/abandon):
git worktree remove /tmp/vf-wt-<unit-name> --force
```
- Prune immediately after merge, not after "compaction." The user rule:
  "Làm đến đâu gọn gàng đến đấy."

## 3. Zero file overlap guarantee

Worktrees are assigned disjoint file scopes. The coordinator checks this
before dispatching:

```bash
# In the coordinator's main worktree:
vf units scope-check <unit-a> <unit-b>
```
- If scopes overlap (`exit 1`), the units are serialized in one worktree,
  not parallelized.
- Scopes are declared in the work unit ledger (`vf units add` sets them).

## 4. Worked example

```
$ vf orchestrate --isolate

[coordinator] 3 work units, 0 scope overlaps → 3 worktrees
[coordinator] wt/177-plan-debate   → /tmp/vf-wt-plan-debate   (codex)
[coordinator] wt/178-cross-review  → /tmp/vf-wt-cross-review  (claude)
[coordinator] wt/180-merge-green   → /tmp/vf-wt-merge-green   (claude)

$ cd /tmp/vf-wt-plan-debate && codex exec "...write plan-debate SKILL.md..."
[codex] DONE CHANGED=1 COMMITS=1

$ cd /tmp/vf-wt-plan-debate && bun run check
✓ typecheck ✓ lint ✓ test ✓ coverage → exit 0

$ git push origin HEAD:refs/heads/wt/177-plan-debate
$ cd /Users/linhn/vf-skills && vf pr queue --branch wt/177-plan-debate
[pr] #185 created, awaiting CI + cross-review
```

## 5. Pitfalls

- **Worktree leak.** A worktree created but never pruned leaves a stale
  checkout. Prune in step 6, always. `git worktree list` to audit.
- **Pushing without explicit refspec.** `git push` with no destination can
  push to the wrong branch or trigger `push.default` surprises. Always use
  `HEAD:refs/heads/<branch>`.
- **Skipping `bun run check` before push.** The implementer claiming "DONE"
  is not verification. `bun run check` in the worktree must exit 0.
- **Overlap blindness.** Two worktrees editing the same file produce a merge
  conflict at best, silent corruption at worst. Always `vf units scope-check`
  before parallel dispatch.
- **Pushing from wrong worktree.** `cd` into the worktree before `git push`.
  Pushing from the main worktree with `--branch` without the right checkout
  pushes the wrong code.
