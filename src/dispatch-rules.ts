import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CTX_DIR, cwd } from "./core.js";

/** Built-in dispatch hard rules — the floor that's always injected into the prompt
 *  Constraints block, even if .vibeflow/WORKFLOW_POLICY.md is missing. */
export const DISPATCH_HARD_RULES = [
  "- Push with an explicit refspec: `git push origin HEAD:<branch>` (a bare push can hit main).",
  "- Stage explicit paths (`git add <file>`), never `git add -A` (it sweeps unrelated junk).",
  "- Verify lint with the FULL tree: `bunx biome check src test` (a single-file check misses format/organizeImports/noDelete).",
  "- To cover a gh/exec call, use an injectable `exec = execFileSync` default-param seam plus a fake — NEVER `mock.module` + `?nocache=` (it dual-imports the module and craters coverage).",
  "- Verify coverage in the FULL suite (the gate measures the full suite), not an isolated file run.",
];

/** Read dispatch hard rules from .vibeflow/WORKFLOW_POLICY.md.
 *  Extracts the `## Dispatch hard rules` section and returns bullet lines.
 *  Returns [] if the file is missing, unreadable, or has no matching section. */
export function readDispatchPolicyRules(readPolicy?: () => string | undefined): string[] {
  try {
    const reader =
      readPolicy ??
      (() => {
        const policyPath = join(cwd(), CTX_DIR, "WORKFLOW_POLICY.md");
        if (!existsSync(policyPath)) return undefined;
        return readFileSync(policyPath, "utf-8");
      });
    const policyText = reader();
    if (!policyText) return [];
    const section = policyText.match(/## Dispatch hard rules\n([\s\S]*?)(?=\n## |$)/);
    if (!section?.[1]) return [];
    return section[1]
      .split("\n")
      .filter((l) => l.startsWith("- "))
      .map((l) => l.trim());
  } catch {
    return [];
  }
}

/** Merge built-in DISPATCH_HARD_RULES with policy-file augment rules, deduplicated. */
export function resolveDispatchRules(readPolicy?: () => string | undefined): string[] {
  const augment = readDispatchPolicyRules(readPolicy);
  return [...new Set([...DISPATCH_HARD_RULES, ...augment])];
}
