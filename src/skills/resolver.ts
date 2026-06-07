import type { Skill } from "../core.js";
import type { ProjectProfile } from "../scanner.js";
import { discoverSkills, matchSkillsForFile } from "./registry.js";

/**
 * Canonical map from a file extension to the *reader skill capability* an agent would
 * need to ingest it. This names a NEED, not a shipped artifact — VibeFlow does not bundle
 * reader skills. The resolver checks whether the need is already satisfied by a local
 * verified skill and, if not, recommends acquiring one on demand (Context7), behind
 * approval. This is the minimal-footprint principle: nothing is pre-installed.
 */
const READER_SKILL_BY_EXT: Record<string, string> = {
  md: "markdown-reader",
  markdown: "markdown-reader",
  txt: "text-reader",
  doc: "docx-reader",
  docx: "docx-reader",
  xls: "xlsx-reader",
  xlsx: "xlsx-reader",
  csv: "csv-reader",
  tsv: "csv-reader",
  ppt: "pptx-reader",
  pptx: "pptx-reader",
  pdf: "pdf-reader",
  json: "json-reader",
  yaml: "yaml-reader",
  yml: "yaml-reader",
  png: "image-ocr",
  jpg: "image-ocr",
  jpeg: "image-ocr",
  gif: "image-ocr",
  webp: "image-ocr",
};

/** Name the reader-skill capability a file would require (a need, not an installed skill). */
export function skillForFile(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return READER_SKILL_BY_EXT[ext] ?? "generic-file-reader";
}

export interface SkillNeed {
  /** The needed reader-skill capability (e.g. "xlsx-reader") or docs need. */
  need: string;
  /** Human-readable justification (which file/type/framework drove the need). */
  reason: string;
  status: "satisfied" | "missing";
  /** The local skill that satisfies the need, if any. */
  satisfiedBy?: string;
  /** Suggested on-demand acquisition command when missing. */
  acquire?: string;
}

export interface ResolveInput {
  repo: string;
  /** Attached sample file names (drive reader needs). */
  attachments?: string[];
  /** Declared file types in scope (extensions). */
  fileTypes?: string[];
  /** The task/goal text (drives capability needs). */
  task?: string;
  /** Evidence-based scan of the repo (drives framework-docs needs). */
  profile?: ProjectProfile;
}

/**
 * Find a skill that can SATISFY a reader need. A need is only considered satisfied by a
 * VERIFIED skill — an unverified/experimental/draft match is not enough (it must still be
 * validated/acquired), and `deprecated` skills are excluded by the matcher. This keeps the
 * resolver from silently treating an unproven skill as production-ready.
 */
function satisfier(local: Skill[], reader: string, filename: string): Skill | undefined {
  const verified = local.filter((s) => s.status === "verified");
  const byName = verified.find((s) => s.name === reader);
  if (byName) return byName;
  const match = matchSkillsForFile(verified, filename)[0]?.skill;
  return match;
}

/**
 * Turn an evidence-based scan + intake into a list of skill NEEDS, marking each as already
 * satisfied by a local skill or missing (with a recommended on-demand acquisition step).
 * Demand-driven: nothing is acquired here — this only reports what the task requires.
 */
export function resolveSkillNeeds(input: ResolveInput): SkillNeed[] {
  const local = discoverSkills(input.repo);
  const needs = new Map<string, SkillNeed>();

  const addReaderNeed = (filename: string, ext: string, why: string) => {
    const reader = skillForFile(filename);
    if (needs.has(reader)) return;
    const hit = satisfier(local, reader, filename);
    needs.set(reader, {
      need: reader,
      reason: why,
      status: hit ? "satisfied" : "missing",
      satisfiedBy: hit?.name,
      acquire: hit ? undefined : `vf discover skills ${ext} --yes`,
    });
  };

  for (const name of input.attachments ?? []) {
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    addReaderNeed(name, ext, `attachment ${name}`);
  }
  for (const ext of input.fileTypes ?? []) {
    const clean = ext.trim().toLowerCase().replace(/^\./, "");
    if (clean) addReaderNeed(`x.${clean}`, clean, `declared file type .${clean}`);
  }

  // Detected frameworks → version-specific docs are best fetched fresh on demand.
  for (const fw of input.profile?.frameworks ?? []) {
    const key = `docs:${fw.toLowerCase()}`;
    if (needs.has(key)) continue;
    needs.set(key, {
      need: `${fw} docs`,
      reason: `detected framework ${fw} — prefer current docs over stale model knowledge`,
      status: "missing",
      acquire: `vf discover docs ${fw} --yes`,
    });
  }

  return [...needs.values()].sort((a, b) => {
    if (a.status !== b.status) return a.status === "missing" ? -1 : 1;
    return a.need.localeCompare(b.need);
  });
}

/** Render skill needs as CLI lines. */
export function renderSkillNeeds(needs: SkillNeed[]): string {
  if (!needs.length) return "No skill needs derived from the current context.\n";
  return `${needs
    .map((n) => {
      const mark = n.status === "satisfied" ? "✓" : "•";
      const tail =
        n.status === "satisfied" ? `satisfied by ${n.satisfiedBy}` : `missing — ${n.acquire}`;
      return `${mark} ${n.need}  (${n.reason}) — ${tail}`;
    })
    .join("\n")}\n`;
}
