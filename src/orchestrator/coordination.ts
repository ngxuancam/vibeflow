import type { UnitOutcome } from "./run.js";

/** Parent → sub: the input brief. A documented superset of what buildEnginePrompt renders. */
export interface CoordinationBrief {
  unit: string;
  goal: string;
  scope: string[];
  spec?: string;
  acceptance: string;
  skills_required?: string[];
  fallback?: string;
}

/** Sub → parent: the JSON summary the engine emits (mirrors UnitOutcome + the dispatch contract). */
export interface CoordinationResult {
  unit: string;
  status: UnitOutcome["status"];
  confidence: number;
  evidence: string[];
  files_changed: string[];
  commands_run: string[];
  tests_run: string[];
  uncertainty: string;
}

/** The JSON-summary contract block the engine must emit — single source, MUST stay byte-identical to
 *  src/dispatch/prompt.ts:18. Export it so the test can assert no drift. */
export const COORDINATION_RESULT_CONTRACT =
  '{ "skills_used": [], "files_changed": [], "commands_run": [], "tests_run": [], "confidence": 0.0, "uncertainty": "" }';

/** Render a brief into a stable, documented prompt block. Optional fields are OMITTED cleanly when absent
 *  (no "undefined" leak, no empty "Fallback:" line). */
export function renderBrief(b: CoordinationBrief): string {
  const lines = [`Unit: ${b.unit}`, `Goal: ${b.goal}`, `Scope: ${b.scope.join(", ")}`];
  if (b.spec) lines.push(`Spec: ${b.spec}`);
  lines.push(`Acceptance: ${b.acceptance}`);
  if (b.skills_required?.length) lines.push(`Skills required: ${b.skills_required.join(", ")}`);
  if (b.fallback) lines.push(`Fallback: ${b.fallback}`);
  return lines.join("\n");
}
