import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import type { StackFinding } from "../scanner.js";
import { EXT_LANG, MARKER_LANG, MAX_SCAN_FILE_BYTES, SKIP_DIRS } from "./tables.js";

export function readJson(path: string): Record<string, unknown> | null {
  try {
    // Size-cap the read so a 2GB package.json doesn't OOM the
    // scanner. We check statSync.size BEFORE readFileSync — no
    // partial read, no allocation of the buffer.
    const st = statSync(path);
    if (st.size > MAX_SCAN_FILE_BYTES) return null;
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** First non-empty, non-heading line of the README, used as a one-line summary. */
export function readmeSummary(repo: string): string | undefined {
  for (const n of ["README.md", "README.MD", "readme.md", "README"]) {
    const p = join(repo, n);
    if (!existsSync(p)) continue;
    try {
      // Size-cap: a binary mistakenly named README.md would
      // otherwise be loaded as utf8 (corrupting the buffer) and
      // split into megabytes of lines.
      const st = statSync(p);
      if (st.size > MAX_SCAN_FILE_BYTES) continue;
      const lines = readFileSync(p, "utf8").split("\n");
      for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith("#") || line.startsWith("![") || line.startsWith("<"))
          continue;
        return line.replace(/^[*_>-]+\s*/, "").slice(0, 240);
      }
      // The current README variant had no usable content (every line
      // was empty / a heading / a badge / an HTML tag). Fall through
      // to the next variant instead of bailing out — the original
      // `return undefined` here silently killed the outer loop and
      // broke the README.MD / readme.md / README fallbacks, leaving
      // summary=undefined on repos whose primary README opens with
      // a title image + ## sections.
    } catch {
      /* try the next variant */
    }
  }
  return undefined;
}

/** Infer languages from build markers (depth-independent) + a capped extension walk. */
export function detectLanguages(repo: string): {
  languages: string[];
  truncated: boolean;
  reason?: "depth" | "files";
} {
  const counts = new Map<string, number>();
  let seen = 0;
  let depthHit = false;
  let filesHit = false;
  // Marker files at the repo root win regardless of how deep the source lives (KMP, monorepos).
  const markers = new Set<string>();
  for (const [file, lang] of MARKER_LANG) {
    if (existsSync(join(repo, file))) markers.add(lang);
  }
  const walk = (dir: string, depth: number) => {
    if (depth > 6) {
      depthHit = true;
      return;
    }
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (entry.startsWith(".") || SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      // lstatSync (not statSync) so we can detect symlinks WITHOUT
      // following them. Following symlinks opens three security holes:
      //   1) Symlink loops (a → b → a) blow the depth/seen caps.
      //   2) A symlink to `..` walks out of the repo and reads the
      //      user's home directory (CWE-22, path traversal).
      //   3) A symlink to /etc reads system files (CWE-200).
      // No try/catch: lstatSync on a path returned by readdirSync is
      // reliable (readdir gave us a snapshot). Broken symlinks resolve
      // to a valid lstat result (the symlink itself, not its target).
      // Race-condition delete-between-readdir-and-lstat is not a real
      // concern in a single-process scan of a user-owned repo.
      const st = lstatSync(full);
      if (st.isSymbolicLink()) {
        // Hard skip: never follow symlinks during the language walk.
        continue;
      }
      if (st.isDirectory()) {
        walk(full, depth + 1);
      } else {
        if (seen >= 4000) {
          filesHit = true;
          return;
        }
        seen++;
        const lang = EXT_LANG[extname(entry).toLowerCase()];
        if (lang) counts.set(lang, (counts.get(lang) ?? 0) + 1);
      }
    }
  };
  walk(repo, 0);
  // Marker-detected languages first (they signal the project's primary stack), then by file count.
  const byCount = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([lang]) => lang);
  const ordered = [...markers, ...byCount.filter((l) => !markers.has(l))];
  const truncated = depthHit || filesHit;
  let reason: "depth" | "files" | undefined;
  if (depthHit && filesHit)
    reason = undefined; // both → caller can detect "both" via flags
  else if (depthHit) reason = "depth";
  else if (filesHit) reason = "files";
  return { languages: ordered, truncated, reason };
}

export function detectPackageManager(repo: string): string | undefined {
  if (existsSync(join(repo, "bun.lock")) || existsSync(join(repo, "bun.lockb"))) return "bun";
  if (existsSync(join(repo, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(repo, "yarn.lock"))) return "yarn";
  if (existsSync(join(repo, "package-lock.json"))) return "npm";
  if (existsSync(join(repo, "poetry.lock"))) return "poetry";
  if (existsSync(join(repo, "Cargo.lock"))) return "cargo";
  if (existsSync(join(repo, "go.sum"))) return "go";
  return undefined;
}

export function hasCI(repo: string): boolean {
  return (
    existsSync(join(repo, ".github", "workflows")) ||
    existsSync(join(repo, ".gitlab-ci.yml")) ||
    existsSync(join(repo, ".circleci")) ||
    existsSync(join(repo, "azure-pipelines.yml"))
  );
}

/** Build evidence-backed stack findings from scan results. */
export function buildFindings(input: {
  repo: string;
  languages: string[];
  packageManager?: string;
  frameworks: string[];
  manifests: string[];
  hasCI: boolean;
}): StackFinding[] {
  const findings: StackFinding[] = [];
  const manifest = input.manifests[0];
  const language = input.languages[0];
  findings.push({
    component: "language",
    value: language ?? "unknown",
    evidence: input.manifests.length ? [manifest ?? "unknown"] : [],
    confidence: input.manifests.length ? "high" : "low",
  });
  findings.push({
    component: "package manager",
    value: input.packageManager ?? "unknown",
    evidence: input.packageManager
      ? input.manifests.filter((m) => m.endsWith(".lock") || m === "Cargo.toml" || m === "go.mod")
      : [],
    confidence: input.packageManager ? "high" : "low",
  });
  findings.push({
    component: "frameworks",
    value: input.frameworks.length ? input.frameworks.join(", ") : "none detected",
    evidence: input.manifests,
    confidence: input.frameworks.length ? "medium" : "low",
  });
  const hasWeb = input.manifests.some((m) => m === "package.json" || m.startsWith("web/"));
  findings.push({
    component: "ui",
    value: hasWeb ? "web (see package.json)" : "none detected",
    evidence: hasWeb ? input.manifests : [],
    confidence: hasWeb ? "medium" : "low",
  });
  findings.push({
    component: "ci",
    value: input.hasCI ? "configured" : "none detected",
    evidence: input.hasCI ? [".github/workflows/"] : [],
    confidence: input.hasCI ? "high" : "low",
  });
  return findings;
}
