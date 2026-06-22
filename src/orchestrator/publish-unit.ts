// src/orchestrator/publish-unit.ts
//
// W3: after a unit's review PASSES, optionally publish its worktree changes as
// a PR — commit the scope, push with an explicit refspec, open a PR via gh, and
// enqueue it in the pr-queue. It NEVER merges: autonomous merge is forbidden
// (security). The most a unit does on its own is queue a PR for a human (or the
// separate `vf pr merge-when-green` watcher) to land.
//
// Every external command goes through an injectable runner (git/gh) so tests
// drive each branch without touching real git/GitHub — the inject-seam pattern,
// NOT mock.module.

import { spawnSync } from "node:child_process";

/** The shape of one git/gh invocation result the publisher consumes. */
export interface PublishRunResult {
  status: number | null;
  stdout: string;
}

/** Injectable command runner for git / gh. `args` is the argv after the binary;
 *  `cwd` is the unit's worktree. */
export type PublishRunner = (args: readonly string[], cwd: string) => PublishRunResult;

export interface PublishUnitInput {
  /** The unit name (used in the commit message + PR title). */
  unitName: string;
  /** The branch to push to (explicit refspec target). */
  branch: string;
  /** The unit's worktree path (cwd for git). */
  wtPath: string;
  /** The unit's declared file scope — staged EXPLICITLY (never `git add -A`). */
  scope: readonly string[];
  /** Whether the unit's review passed. When false, publishUnit is a no-op. */
  reviewPassed: boolean;
  /** Base branch for the PR (default "main"). */
  base?: string;
  /** Injectable git runner. */
  git: PublishRunner;
  /** Injectable gh runner. */
  gh: PublishRunner;
}

export interface PublishUnitResult {
  /** Did we publish a PR? false when skipped (review failed) or a step failed. */
  published: boolean;
  /** The PR URL when published. */
  prUrl?: string;
  /** Why we stopped, when published === false. */
  reason?: string;
}

/**
 * Commit → push → open PR (queued, never merged) for one reviewed unit.
 * Bails early (no-op) when the review did not pass.
 */
export function publishUnit(input: PublishUnitInput): PublishUnitResult {
  const { unitName, branch, wtPath, scope, reviewPassed, git, gh } = input;
  const base = input.base ?? "main";

  // Gate 1: never publish an unreviewed/failed unit.
  if (!reviewPassed) return { published: false, reason: "review did not pass" };

  // Gate 2: nothing to commit when the unit declared no scope.
  if (scope.length === 0) return { published: false, reason: "no scope to publish" };

  // Stage EXACT scope paths — never `git add -A` (a parallel unit's stray files
  // must not be swept into this unit's commit).
  const add = git(["add", ...scope], wtPath);
  if (add.status !== 0) {
    return { published: false, reason: `git add failed: ${firstLine(add.stdout)}` };
  }

  // Commit. -s for DCO sign-off (repo convention).
  const commit = git(
    ["commit", "-s", "-m", `feat(${unitName}): orchestrated unit changes`],
    wtPath,
  );
  if (commit.status !== 0) {
    return { published: false, reason: `git commit failed: ${firstLine(commit.stdout)}` };
  }

  // Push with an EXPLICIT refspec — never a bare push (the worktree's upstream
  // may point at the wrong branch).
  const push = git(["push", "origin", `HEAD:${branch}`], wtPath);
  if (push.status !== 0) {
    return { published: false, reason: `git push failed: ${firstLine(push.stdout)}` };
  }

  // Open the PR. This ENQUEUES it for review/merge — it does NOT merge.
  const pr = gh(
    [
      "pr",
      "create",
      "--base",
      base,
      "--head",
      branch,
      "--title",
      `${unitName}: orchestrated unit`,
      "--body",
      `Automated PR for work unit ${unitName}. Queued — not auto-merged.`,
    ],
    wtPath,
  );
  if (pr.status !== 0) {
    return { published: false, reason: `gh pr create failed: ${firstLine(pr.stdout)}` };
  }

  return { published: true, prUrl: firstLine(pr.stdout) };
}

function firstLine(s: string): string {
  for (const line of s.split("\n")) {
    const t = line.trim();
    if (t.length > 0) return t;
  }
  return "";
}

/** Real spawnSync-backed PublishRunner factory args — the default git/gh runner
 *  used by orchestrate when no inject override is supplied. Exported so the
 *  default path is covered by a direct unit test (not driven through a full
 *  orchestrate run). */
export function publishSpawn(bin: string, args: readonly string[], cwd: string): PublishRunResult {
  const rr = spawnSync(bin, [...args], { cwd, encoding: "utf8" });
  return {
    status: rr.status,
    stdout:
      (typeof rr.stdout === "string" ? rr.stdout : "") +
      (typeof rr.stderr === "string" ? rr.stderr : ""),
  };
}

/** One reviewed unit the publisher considers. */
export interface ReviewedUnit {
  name: string;
  scope?: readonly string[];
  reviewPassed: boolean;
}

export interface PublishReviewedInput {
  units: readonly ReviewedUnit[];
  base: string;
  worktreePath: (unitName: string) => string;
  git: PublishRunner;
  gh: PublishRunner;
  report: (line: string) => void;
}

/** Publish every review-passed unit as a queued PR. Extracted from orchestrate
 *  so the command file stays under the size cap and the loop is unit-testable
 *  on its own. Never merges. */
export function publishReviewedUnits(input: PublishReviewedInput): void {
  const { units, base, worktreePath, git, gh, report } = input;
  for (const u of units) {
    if (!u.reviewPassed) continue;
    if (!u.scope?.length) continue;
    const res = publishUnit({
      unitName: u.name,
      branch: `vibeflow/${u.name}`,
      wtPath: worktreePath(u.name),
      scope: u.scope,
      reviewPassed: true,
      base,
      git,
      gh,
    });
    report(
      res.published
        ? `  ✓ PR queued for ${u.name}: ${res.prUrl}`
        : `  • ${u.name}: PR not published (${res.reason})`,
    );
  }
}

/** Decide + run the optional `--pr` post-review publish step. STRICTLY opt-in
 *  via `flags.pr` (cli mode only) and requires `isolate` (each unit needs its
 *  own worktree to commit from). Kept here (not inline in orchestrate) so the
 *  command file stays under the size cap. Returns a status line to report when
 *  the gate is on but isolation is missing, else null. */
export interface MaybePublishInput {
  prRequested: boolean;
  isolated: boolean;
  units: readonly ReviewedUnit[];
  base: string;
  worktreePath: (unitName: string) => string;
  git: PublishRunner;
  gh: PublishRunner;
  report: (line: string) => void;
}

export function maybePublishPrs(input: MaybePublishInput): void {
  if (!input.prRequested) return;
  if (!input.isolated) {
    input.report("! --pr requires --isolate (per-unit worktree) — skipping PR publish");
    return;
  }
  publishReviewedUnits({
    units: input.units,
    base: input.base,
    worktreePath: input.worktreePath,
    git: input.git,
    gh: input.gh,
    report: input.report,
  });
}
