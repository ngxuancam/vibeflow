---
name: merge-when-green
description: "Manage the PR merge queue — watch CI on ALL jobs via `gh pr checks`, never auto-merge without a human, verify both check and publish jobs pass, merge only when CLEAN. Trigger when the coordinator has PRs queued and CI is running."
---

# Merge When Green

The coordinator queues PRs but does NOT merge them blindly. This skill
encodes the merge gate: wait for CI on **all** jobs, verify both `check`
and `publish` pass, and never auto-merge without a human in the loop.

## 1. When to trigger

- A PR is queued (`vf pr queue`) and CI starts running.
- CI finishes on any queued PR (poll or webhook).
- The coordinator loop reaches step 5 ("Merge when green").

## 2. The merge gate (5 checks before merge)

### Check 1 — All CI jobs, not just one
```bash
gh pr checks <pr-number> --required
```
- `--required` filters to branch-protection-required checks only.
- Without `--required`, a single passing job looks like "all green."
  Always use `--required`.

### Check 2 — Both `check` AND `publish` jobs
The CI pipeline has two critical jobs:
- **check**: typecheck + lint + test + coverage (the gate for correctness).
- **publish**: npm publish or equivalent (the gate for distribution).

Both must pass. A green `check` with a skipped `publish` is NOT green.
```bash
gh pr checks <pr-number> | grep -E 'check|publish'
# Both must show "pass" — not "skipped", not "pending", not "neutral".
```

### Check 3 — No merge conflicts
```bash
gh pr view <pr-number> --json mergeable
# Must return "mergeable": "MERGEABLE", not "CONFLICTING" or "UNKNOWN".
```
If CONFLICTING: rebase the PR onto the latest `main` and re-push. Do not
resolve conflicts in the merge queue itself — fix in the worktree.

### Check 4 — Cross-review approved
The cross-review (see `cross-review` skill) must have:
- All 4 lenses checked: `[x] Correctness [x] Design [x] Risk [x] Test`.
- Verdict: `APPROVE` (not `CHANGES REQUESTED` or `REJECT`).
- A different engine than the implementer signed the review.

If the cross-review is missing or `CHANGES REQUESTED`, the PR stays in
queue. Do not merge.

### Check 5 — Human in the loop
If the user is in the room:
```bash
# Ask, one word:
"Merge?"
```
If unattended: default to merge, but the user has explicitly stated
"không auto-merge without a human." Respect this. If the user is absent
and CI is green, note it in §5 of the brief and wait for the user's
return.

## 3. The merge

When all 5 checks pass:
```bash
gh pr merge <pr-number> --squash --subject "<merged subject>"
```
- `--squash`: one clean commit on `main`.
- `--subject`: exact conventional-commit subject from the PR title.
- No `--auto` flag — every merge is intentional.

After merge:
```bash
# Prune the worktree
git worktree remove /tmp/vf-wt-<unit-name> --force
# Update the brief (§4)
vf state brief --update "Merged PR #<num>: <subject>"
```

## 4. When CI fails

```bash
gh pr checks <pr-number>
```
Read the FAILING job. If the failure is:
- **Flaky test**: re-run the job (`gh pr checks <pr-number> --watch` may
  re-trigger; or use the GitHub UI). Max 2 re-runs. If it fails 3 times,
  it's not flaky — investigate.
- **Typecheck/lint**: fix in the worktree, re-push, re-run CI. Do not
  bypass `bun run check` with a `--no-verify` push.
- **Test failure**: the implementer's "DONE" claim was false. Reopen the
  work unit, re-dispatch, re-verify.
- **Publish failure**: check npm token, version collision, or registry
  outage. Escalate to the user if it's infra.

## 5. Worked example

```
$ gh pr checks 185 --required
check    pass   https://github.com/.../runs/123
publish  pass   https://github.com/.../runs/124

$ gh pr view 185 --json mergeable
{"mergeable":"MERGEABLE"}

$ # Cross-review verdict: APPROVE (codex reviewed claude)

> Merge?
$ gh pr merge 185 --squash --subject "docs(skills): add plan-debate skill (#177)"
✓ Merged PR #185

$ git worktree remove /tmp/vf-wt-plan-debate --force
$ vf state brief --update "Merged PR #185: docs(skills): add plan-debate skill (#177)"
```

## 6. Pitfalls

- **Merging on a single green check.** `gh pr checks` without `--required`
  shows all checks, not just required ones. A green lint job with a
  failing test job can masquerade as "all green." Always `--required`.
- **Ignoring `publish`.** The check suite can pass while publish fails
  (e.g., npm token expired). A merged PR that can't publish is a broken
  release. Check both.
- **Auto-merge without human.** The user has corrected: "không auto-merge
  without a human." If the user is not in the room, wait.
- **Merge-conflict-blind merge.** GitHub's merge button can squash-merge a
  conflicting PR if the conflict is resolvable. Don't assume — check
  `mergeable` explicitly.
- **PR pile-up.** The user has corrected: "không dồn ứ PR." Merge in the
  same turn CI turns green. Do not accumulate.
- **Forgetting to prune.** Merged PR → stale worktree. Prune immediately
  after merge, not later.
