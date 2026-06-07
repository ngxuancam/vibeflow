import type { SkillStatus } from "../core.js";

/**
 * Skill evolution (SKILL_DISCOVERY_AND_EVOLUTION.md): learn from real execution.
 * A lesson is extracted when an agent hit a repeated failure or needed a manual
 * workaround. VibeFlow turns lessons into skill DRAFTS — never auto-trusted — that a
 * human reviews and explicitly promotes to `verified`.
 */
export interface HandoffRecord {
  unit: string;
  /** Free-text problems the agent reported. */
  failures?: string[];
  /** Manual workarounds the agent had to apply. */
  workarounds?: string[];
  /** A reusable, project-specific process the agent discovered. */
  discovered?: string[];
}

export interface Lesson {
  topic: string;
  evidence: string[];
  /** How many handoffs surfaced this topic — drives "repeated failure" detection. */
  recurrences: number;
  kind: "failure" | "workaround" | "process";
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "lesson"
  );
}

/** Extract lessons from a set of handoffs, grouping repeated topics by their first words. */
export function extractLessons(handoffs: HandoffRecord[]): Lesson[] {
  const byTopic = new Map<string, Lesson>();
  const add = (text: string, kind: Lesson["kind"]) => {
    const topic = text.split(/[.:;\n]/)[0]?.trim() ?? text.trim();
    if (!topic) return;
    const key = `${kind}:${slugify(topic)}`;
    const existing = byTopic.get(key);
    if (existing) {
      existing.recurrences++;
      existing.evidence.push(text);
    } else {
      byTopic.set(key, { topic, evidence: [text], recurrences: 1, kind });
    }
  };
  for (const h of handoffs) {
    for (const f of h.failures ?? []) add(f, "failure");
    for (const w of h.workarounds ?? []) add(w, "workaround");
    for (const d of h.discovered ?? []) add(d, "process");
  }
  // Most-recurrent, most-actionable first.
  return [...byTopic.values()].sort((a, b) => b.recurrences - a.recurrences);
}

/**
 * A lesson is worth proposing as a skill when it recurred (repeated failure) or it is a
 * discovered reusable process. One-off failures are noise, not skills.
 */
export function shouldPropose(lesson: Lesson): boolean {
  return lesson.recurrences >= 2 || lesson.kind === "process";
}

export interface SkillDraft {
  name: string;
  content: string;
}

/** Render a lesson into a SKILL.md DRAFT (skill-creator standard, status draft). */
export function draftSkillFromLesson(lesson: Lesson): SkillDraft {
  const name = `${slugify(lesson.topic)}-skill`;
  const content = [
    "---",
    `name: ${name}`,
    `description: ${lesson.topic}. Generated from ${lesson.recurrences} real execution lesson(s); review before use.`,
    "version: 0.1.0",
    // Lifecycle starts at `draft` (draft → experimental → verified → deprecated). A freshly
    // mined lesson is unproven; it must be validated before it even becomes experimental.
    "status: draft",
    "---",
    "",
    `# ${name}`,
    "",
    "## Why this exists",
    "",
    `Derived from repeated execution evidence (${lesson.kind}, x${lesson.recurrences}).`,
    "",
    "## Evidence",
    "",
    ...lesson.evidence.map((e) => `- ${e}`),
    "",
    "## Promotion",
    "",
    "Experimental until validated against a task-specific test and explicitly approved.",
    "",
  ].join("\n");
  return { name, content };
}

/**
 * Promotion gate: a draft/experimental/unverified skill may only become `verified` after a
 * task-specific validation passed AND a human approved it. No silent trust — and an external
 * (`discovered`) skill can never be written straight to `verified`: it must be re-homed as a
 * local skill and go through validation + approval like everything else.
 */
export function canPromote(opts: {
  status: SkillStatus;
  validated: boolean;
  approved: boolean;
  provenance?: "local" | "discovered";
}): { ok: boolean; reason: string } {
  if (opts.status === "verified") return { ok: false, reason: "already verified" };
  if (opts.status === "deprecated") return { ok: false, reason: "deprecated skills are retired" };
  if (opts.provenance === "discovered") {
    return { ok: false, reason: "external skills cannot be promoted directly — re-home as local" };
  }
  if (!opts.validated) return { ok: false, reason: "no task-specific validation recorded" };
  if (!opts.approved) return { ok: false, reason: "human approval required" };
  return { ok: true, reason: "validated + approved → promote to verified" };
}
