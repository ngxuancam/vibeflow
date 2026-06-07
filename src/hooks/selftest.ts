import type { HookInput } from "../core.js";
import { type EnvGetter, evaluateHook, exitCodeFor } from "./runner.js";

/** What a corpus case must end up as once decided. */
type Expectation = "blocked" | "allowed";

/** One fixed self-test case: an input plus the decision class it must land in. */
interface SelftestCase {
  input: HookInput;
  expected: Expectation;
}

/**
 * The FIXED dogfood corpus: the item-1 command-evasion attacks (each must be BLOCKED, i.e.
 * decided high/critical → exit 2) and the benign false-positive boundary (each must be
 * ALLOWED, exit 0). This is the deterministic acceptance set that drives confidence to 1.0.
 */
const ATTACK_COMMANDS = [
  'bash -c "rm -rf /"',
  'sh -c "rm -rf /"',
  "$(rm -rf /)",
  "`rm -rf /`",
  "rm${IFS}-rf${IFS}/",
  "git status; rm -rf x",
  "a && rm -rf x",
  "a | rm -rf x",
  'bash -c "git push --force"',
];

const BENIGN_COMMANDS = [
  'echo "rm -rf is dangerous"',
  "grep -rf pattern file",
  'git commit -m "drop table users"',
  "git log --oneline",
  "git status",
  "ls -la",
  "bun test",
];

const CONFIG_FILES = ["tsconfig.json", "biome.json", ".githooks/pre-commit"];

function selftestCases(): SelftestCase[] {
  const cases: SelftestCase[] = [];
  for (const command of ATTACK_COMMANDS) {
    cases.push({ input: { event: "pre-command", command }, expected: "blocked" });
  }
  for (const command of BENIGN_COMMANDS) {
    cases.push({ input: { event: "pre-command", command }, expected: "allowed" });
  }
  for (const f of CONFIG_FILES) {
    cases.push({ input: { event: "pre-write", files: [f] }, expected: "blocked" });
  }
  cases.push({ input: { event: "pre-write", files: ["src/foo.ts"] }, expected: "allowed" });
  return cases;
}

/** A short, stable label for a case in the report (command or file list). */
function caseLabel(input: HookInput): string {
  return input.command ?? (input.files ?? []).join(", ");
}

/** Per-case self-test record, serialized into the knowledge report. */
export interface SelftestCaseResult {
  input: string;
  event: string;
  expected: Expectation;
  actual: "blocked" | "allowed";
  decision: string;
  risk: string;
  pass: boolean;
}

/** Full self-test report shape written to .viteflow/knowledge/hook-selfcheck.json. */
export interface SelftestReport {
  timestamp: string;
  passed: number;
  failed: number;
  cases: SelftestCaseResult[];
}

/**
 * Run the fixed corpus through the real decision path (no engine spawn, fully deterministic)
 * and produce a report. A case "passes" when its decided exit code matches the expectation:
 * blocked → exit 2, allowed → exit 0. Hooks are forced ON (env getter returns {}) so the
 * kill-switch can never mask a regression during the self-check.
 */
export function runSelftest(now: () => string): SelftestReport {
  const forceHooksOn: EnvGetter = () => ({});
  const cases: SelftestCaseResult[] = selftestCases().map(({ input, expected }) => {
    const result = evaluateHook(input, forceHooksOn);
    const actual: "blocked" | "allowed" =
      exitCodeFor(result.decision) === 2 ? "blocked" : "allowed";
    return {
      input: caseLabel(input),
      event: input.event,
      expected,
      actual,
      decision: result.decision,
      risk: result.risk,
      pass: actual === expected,
    };
  });
  const failed = cases.filter((c) => !c.pass).length;
  return { timestamp: now(), passed: cases.length - failed, failed, cases };
}
