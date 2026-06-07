import type { WorkflowState } from "./core.js";

export interface GateReport {
  ok: boolean;
  failures: string[];
  passed: string[];
}

/** Normalize a scope glob/prefix to a comparable path prefix. */
function normPrefix(s: string): string {
  return s.replace(/\*+$/, "").replace(/\/+$/, "");
}

/** Two scope prefixes overlap when one is a path-prefix of the other. */
function prefixesOverlap(a: string, b: string): boolean {
  if (a === "" || b === "") return true; // an empty scope means "whole repo"
  return (
    a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`) || a.startsWith(b) || b.startsWith(a)
  );
}

/** Detect overlapping scopes among proposed units (for the planner, before dispatch). */
export function findScopeConflicts(
  units: Array<{ name: string; scope?: string[] }>,
): Array<[string, string]> {
  const conflicts: Array<[string, string]> = [];
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const a = units[i];
      const b = units[j];
      const sa = (a?.scope ?? []).map(normPrefix);
      const sb = (b?.scope ?? []).map(normPrefix);
      if (!sa.length || !sb.length) continue;
      if (sa.some((pa) => sb.some((pb) => prefixesOverlap(pa, pb)))) {
        conflicts.push([a?.name ?? "?", b?.name ?? "?"]);
      }
    }
  }
  return conflicts;
}

/**
 * The three policy gates that compose with build/lint/test (WORK_UNIT_ORCHESTRATION.md):
 *  - confidence: no work unit may sit below 1.0 (orchestrator is still guessing).
 *  - evidence:   a unit marked `done` must carry recorded evidence.
 *  - scope:      no two units may declare overlapping file scopes (parallel safety).
 * Pure over a WorkflowState so it is unit-testable and reusable by hooks + `vf verify`.
 */
export function policyGates(state: WorkflowState | null): GateReport {
  const failures: string[] = [];
  const passed: string[] = [];
  if (!state) {
    return { ok: true, failures: [], passed: ["no workflow state — nothing to gate"] };
  }
  const units = state.work_units ?? [];

  // Confidence gate.
  const lowConf = units.filter((u) => (u.confidence ?? 0) < 1);
  if (lowConf.length) {
    for (const u of lowConf) {
      failures.push(
        `confidence<1: "${u.name}" at ${u.confidence} — investigate/debate before close`,
      );
    }
  } else {
    passed.push("confidence: all units at 1.0");
  }

  // Evidence gate.
  const noEvidence = units.filter((u) => u.status === "done" && !u.evidence?.length);
  if (noEvidence.length) {
    for (const u of noEvidence) {
      failures.push(`no-evidence: "${u.name}" is done but has no recorded evidence`);
    }
  } else {
    passed.push("evidence: every done unit has recorded evidence");
  }

  // Scope-overlap gate.
  let overlapFound = false;
  for (let i = 0; i < units.length; i++) {
    for (let j = i + 1; j < units.length; j++) {
      const a = units[i];
      const b = units[j];
      const sa = (a?.scope ?? []).map(normPrefix);
      const sb = (b?.scope ?? []).map(normPrefix);
      if (!sa.length || !sb.length) continue;
      const clash = sa.some((pa) => sb.some((pb) => prefixesOverlap(pa, pb)));
      if (clash) {
        overlapFound = true;
        failures.push(`scope-overlap: "${a?.name}" and "${b?.name}" declare overlapping scopes`);
      }
    }
  }
  if (!overlapFound) passed.push("scope: no overlapping work-unit scopes");

  return { ok: failures.length === 0, failures, passed };
}
