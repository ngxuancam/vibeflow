// src/skills/crystallize.ts
//
// `vf skill crystallize <run-id>` — MECHANICAL pattern extraction (issue #179).
//
// Reads the run's log + knowledge journal, counts recurring patterns, and DRAFTS
// a new skill file. Auto-extraction is AI-complete and risky (Claude debate), so
// this is deliberately mechanical + reviewable: NO LLM, just counting. The draft
// is NEVER auto-installed — it lands as an untracked file for human review, and
// the caller points the journal at it.

/** A recurring pattern the extractor found worth crystallizing. */
export interface CrystallizedPattern {
  kind: "command" | "skill" | "failure";
  /** The repeated token (a command string, skill name, or failure signature). */
  value: string;
  count: number;
}

export interface CrystallizeInput {
  /** The run id (used in the draft skill name + body). */
  runId: string;
  /** Raw log lines (e.g. from .vibeflow/logs/current.log). */
  logLines: readonly string[];
  /** Raw journal lines (e.g. from .vibeflow/knowledge/log.md). */
  journalLines: readonly string[];
}

export interface CrystallizeResult {
  /** True when at least one pattern crossed its threshold. */
  hasPatterns: boolean;
  patterns: CrystallizedPattern[];
  /** The draft skill name (slug). */
  draftName: string;
  /** The rendered SKILL.md body (empty string when hasPatterns is false). */
  draft: string;
}

// Thresholds from the issue's acceptance criteria.
const COMMAND_MIN = 3; // same command invoked 3+ times
const SKILL_MIN = 5; // same skill referenced 5+ times
const FAILURE_MIN = 2; // same failure mode hit 2+ times

/** Pull a `$ <command>` invocation out of a log line, if present. */
function extractCommand(line: string): string | null {
  // Match a leading shell prompt: "$ cmd …" or "vf> cmd …" or "[run] $ cmd".
  const m = line.match(/(?:^|\]\s*)\$\s+(.+)$/);
  if (!m) return null;
  const cmd = (m[1] ?? "").trim();
  // Normalize to the first 2 words (the command + subcommand) so
  // `git commit -m "a"` and `git commit -m "b"` count as the same pattern.
  const parts = cmd.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  return parts.slice(0, 2).join(" ");
}

/** Pull a referenced skill name out of a line: `skill: <name>` or `[skill:<name>]`. */
function extractSkill(line: string): string | null {
  const m = line.match(/skill[:=]\s*([a-z0-9][\w-]*)/i);
  return m ? (m[1] ?? "").trim() : null;
}

/** Pull a failure signature: `ERROR: <msg>`, `FAIL <msg>`, `✗ <msg>`. */
function extractFailure(line: string): string | null {
  const m = line.match(/(?:ERROR|FAIL(?:ED)?|✗)[:\s]\s*(.+)$/);
  if (!m) return null;
  // Collapse to the first 6 words so variable tails (paths, ids) don't fragment
  // the same failure into distinct buckets.
  return (m[1] ?? "").trim().split(/\s+/).slice(0, 6).join(" ");
}

function tally(
  lines: readonly string[],
  extract: (l: string) => string | null,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of lines) {
    const key = extract(line);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function aboveThreshold(
  counts: Map<string, number>,
  min: number,
  kind: CrystallizedPattern["kind"],
): CrystallizedPattern[] {
  const out: CrystallizedPattern[] = [];
  for (const [value, count] of counts) {
    if (count >= min) out.push({ kind, value, count });
  }
  // Most-frequent first, deterministic tie-break by value.
  return out.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** Slugify a run id into a safe skill directory name. */
export function draftSkillName(runId: string): string {
  const slug = runId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `crystallized-${slug || "run"}`;
}

/**
 * Mechanically extract recurring patterns from a run and render a draft skill.
 * Pure + deterministic — no I/O, no LLM. The caller owns reading the files and
 * writing the draft (so tests drive it with literal line arrays).
 */
export function crystallize(input: CrystallizeInput): CrystallizeResult {
  const { runId, logLines, journalLines } = input;
  const allLines = [...logLines, ...journalLines];

  const commandPats = aboveThreshold(tally(allLines, extractCommand), COMMAND_MIN, "command");
  const skillPats = aboveThreshold(tally(allLines, extractSkill), SKILL_MIN, "skill");
  const failurePats = aboveThreshold(tally(allLines, extractFailure), FAILURE_MIN, "failure");

  const patterns = [...commandPats, ...skillPats, ...failurePats];
  const draftName = draftSkillName(runId);

  if (patterns.length === 0) {
    return { hasPatterns: false, patterns, draftName, draft: "" };
  }

  return { hasPatterns: true, patterns, draftName, draft: renderDraft(runId, draftName, patterns) };
}

/** Render the draft SKILL.md from the extracted patterns. */
export function renderDraft(
  runId: string,
  draftName: string,
  patterns: readonly CrystallizedPattern[],
): string {
  const commands = patterns.filter((p) => p.kind === "command");
  const skills = patterns.filter((p) => p.kind === "skill");
  const failures = patterns.filter((p) => p.kind === "failure");

  const lines: string[] = [
    "---",
    `name: ${draftName}`,
    `description: "DRAFT crystallized from run ${runId}. Recurring patterns observed during the run — review and refine before installing."`,
    "status: draft",
    "---",
    "",
    `# ${draftName}`,
    "",
    "> ⚠️ DRAFT — auto-crystallized from observed run patterns (issue #179).",
    "> NOT auto-installed. Review, rename, and fill in the real procedure before use.",
    "",
    `Crystallized from run \`${runId}\`.`,
    "",
    "## When to use",
    "This run repeated the patterns below. If a future task matches them, this skill",
    "is a candidate — but the steps below are observations, not a verified procedure.",
    "",
  ];

  if (commands.length) {
    lines.push("## Repeated commands");
    for (const p of commands) lines.push(`- \`${p.value}\` — invoked ${p.count}×`);
    lines.push("");
  }
  if (skills.length) {
    lines.push("## Skills leaned on");
    for (const p of skills) lines.push(`- \`${p.value}\` — referenced ${p.count}×`);
    lines.push("");
  }
  if (failures.length) {
    lines.push("## Failure modes hit (encode the fix)");
    for (const p of failures) lines.push(`- ${p.value} — hit ${p.count}×`);
    lines.push("");
  }

  lines.push("## When NOT to use");
  lines.push("Delete this skill if the patterns above were incidental to this run only.");
  lines.push("");
  lines.push("## Example invocation");
  lines.push("Fill in a concrete, copy-pasteable example before installing.");
  lines.push("");
  return lines.join("\n");
}
