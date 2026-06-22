// src/commands/protection.ts
//
// Source-protection pipeline: pre-dispatch gate, checkpoint, rollback,
// and unit-failure handling. Issue #80, phase 6/14.
// Dispatch/orchestration runtime extracted to dispatch-runtime.ts (#131).

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { writeFileSafe } from "../core.js";
import {
  c,
  createCheckpoint,
  detectQuota,
  gitState,
  out,
  recoveryHint,
  restoreIgnored,
} from "./_shared.js";
import type {
  Checkpoint,
  DispatchResult,
  FailureProtection,
  GitRunner,
  QuotaSignal,
  UnitInvestigationOutcome,
  UnitOutcome,
} from "./_shared.js";

export const MS_PER_SECOND = 1000;

/** Worktree isolation seam (W1). Injected so tests verify create/remove
/** Shared quota latch: the first HIGH-confidence limit signal stops not-yet-started units. */
interface QuotaState {
  limited: boolean;
  signal?: QuotaSignal;
}

/** Per-dispatch source-protection runtime threaded into the (cli-mode) dispatcher. */
export interface ProtectionRuntime {
  checkpoint: Checkpoint | null;
  fp: FailureProtection;
  git: GitRunner;
  quota: QuotaState;
  rolledBack: boolean;
}

/** Decision from the pre-dispatch source-protection gate. */
interface ProtectionPlan {
  refused: boolean;
  reason?: string;
  checkpoint: Checkpoint | null;
}

/** Default git seam (argv only, never shell) scoped to a repo, mirroring checkpoint.ts. */
export function repoGit(base: string): GitRunner {
  return (args) => {
    const r = spawnSync("git", args, { cwd: base, encoding: "utf8" });
    return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  };
}

/** Settings + per-run flags merged: a flag can only turn a protection ON, never off. */
export function resolveProtection(
  flags: Record<string, string | boolean>,
  fp: FailureProtection,
): FailureProtection {
  return {
    timeoutSeconds: fp.timeoutSeconds,
    autoWip: fp.autoWip || Boolean(flags["auto-wip"]),
    requireGit: fp.requireGit || Boolean(flags["require-git"]),
    rollbackOnFail: fp.rollbackOnFail || Boolean(flags["rollback-on-fail"]),
  };
}

/**
 * Gate a REAL (cli) dispatch on repo state. Refuses (no checkpoint) when git is required but
 * absent, or the tree is dirty without `autoWip`; otherwise warns/checkpoints and proceeds.
 */
export function planProtection(
  base: string,
  runId: string,
  fp: FailureProtection,
  git: GitRunner,
): ProtectionPlan {
  const state = gitState(base, git);
  if (!state.isRepo) {
    if (fp.requireGit) {
      return {
        refused: true,
        reason: "refusing: not a git repository (requireGit). Run `git init` then re-run.",
        checkpoint: null,
      };
    }
    out(
      "vf",
      c.yellow("! no git — engine edits are irreversible; proceeding without a checkpoint"),
    );
    return { refused: false, checkpoint: createCheckpoint(base, runId, { autoWip: false, git }) };
  }
  if (state.dirty && !fp.autoWip) {
    return {
      refused: true,
      reason:
        "refusing: uncommitted changes in the working tree. Commit/stash them, or pass --auto-wip.",
      checkpoint: null,
    };
  }
  const cp = createCheckpoint(base, runId, { autoWip: state.dirty, git });
  if (cp.wipSha) {
    out("vf", c.dim(`checkpoint: WIP snapshot ${cp.wipSha.slice(0, 8)} taken before dispatch`));
  }
  return { refused: false, checkpoint: cp };
}

/** Persist the pre-dispatch checkpoint (+ recovery hint) as auditable unit evidence. */
export function persistCheckpoint(unitDir: string, cp: Checkpoint): string {
  const rel = "evidence/checkpoint.json";
  writeFileSafe(join(unitDir, rel), JSON.stringify({ ...cp, recovery: recoveryHint(cp) }, null, 2));
  return rel;
}

/** Persist a detected quota signal as unit evidence. */
export function persistQuota(unitDir: string, sig: QuotaSignal): string {
  const rel = "evidence/quota.json";
  writeFileSafe(join(unitDir, rel), JSON.stringify(sig, null, 2));
  return rel;
}

/**
 * Inspect a dispatch result for a quota/rate-limit signal. Records it as evidence and, on a
 * HIGH-confidence limit, latches the shared stop flag so not-yet-started units are skipped
 * rather than deepening the hole. LOW-confidence prose stays advisory (never auto-stops).
 */
export function recordQuota(
  prot: ProtectionRuntime,
  unitRel: string,
  unitDir: string,
  result: DispatchResult,
  evidence: string[],
): void {
  const sig = detectQuota({ status: result.ok ? 0 : 1, stdout: result.raw, reason: result.reason });
  if (!sig.limited) return;
  evidence.push(`${unitRel}/${persistQuota(unitDir, sig)}`);
  if (sig.confidence === "high") {
    prot.quota.limited = true;
    prot.quota.signal = sig;
    out("vf", c.yellow(`! quota signal (${sig.kind}) — stopping remaining units: ${sig.evidence}`));
  }
}

/** Roll the tree back to the pre-dispatch state (once) and restore backed-up ignored files. */
function rollbackCheckpoint(base: string, prot: ProtectionRuntime): void {
  const cp = prot.checkpoint;
  if (!cp || prot.rolledBack) return;
  prot.rolledBack = true;
  const target = cp.baseRef ?? cp.wipSha;
  if (target) prot.git(["reset", "--hard", target]);
  const restored = restoreIgnored(cp, base);
  const ref = (target ?? "HEAD").slice(0, 8);
  const extra = restored.length ? ` (+${restored.length} ignored file(s) restored)` : "";
  out("vf", c.yellow(`rolled back to ${ref}${extra}`));
}

/** On a blocked unit in cli mode: print the recovery hint, then roll back when configured. */
// Exported (not just internal) so the `run` subcommand
// (src/commands/run.ts, phase 6.5/14) can call it via the barrel
// (_shared.js). Without the export, the run path would
// re-implement the same hook.
export function handleUnitFailure(prot: ProtectionRuntime, base: string): void {
  if (prot.checkpoint) out("vf", c.yellow(recoveryHint(prot.checkpoint)));
  if (prot.fp.rollbackOnFail) rollbackCheckpoint(base, prot);
}

/** Blocked outcome for a unit skipped because an upstream rate limit was already hit. */
export function skippedByQuota(): UnitOutcome {
  return {
    status: "blocked",
    confidence: 0,
    evidence: [],
    gates: { build: "pending", lint: "pending", test: "pending", review: "pending" },
  };
}

export function persistInvestigation(unitDir: string, outcome: UnitInvestigationOutcome): string {
  const rel = "evidence/investigation.json";
  writeFileSafe(
    join(unitDir, rel),
    JSON.stringify(
      {
        proceed: outcome.proceed,
        finalConfidence: outcome.finalConfidence,
        threshold: outcome.threshold,
        stoppedBy: outcome.stoppedBy,
        recommendation: outcome.recommendation,
        rounds: outcome.rounds,
      },
      null,
      2,
    ),
  );
  return rel;
}
