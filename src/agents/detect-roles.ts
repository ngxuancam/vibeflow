import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ProjectProfile } from "../scanner.js";
import { ROLE_NAMES, type RoleName } from "./role-templates.js";

/**
 * Map each role to the repo signals that should trigger it. A signal is
 * either a manifest/file path (relative to the repo root) or a
 * framework/language entry on the {@link ProjectProfile}.
 *
 * `detectRolesForRepo` returns every role whose at least one signal is
 * present, preserving the canonical order from {@link ROLE_NAMES}.
 */
const ROLE_SIGNALS: Record<RoleName, { files: string[]; frameworkMatch: RegExp[] }> = {
  "cli-engine": {
    files: ["src/cli.ts", "src/commands.ts", "src/adapters.ts", "bin/"],
    frameworkMatch: [/cli/i],
  },
  "web-ui": {
    files: ["src/server.ts", "src/ui/", "src/dispatch.ts", "public/", "web/"],
    frameworkMatch: [/react/i, /vue/i, /svelte/i, /next/i, /nuxt/i, /solid/i, /express/i],
  },
  "skill-author": {
    files: [".vibeflow/skills/", ".claude/skills/", ".agents/skills/", ".github/skills/"],
    frameworkMatch: [/skill/i],
  },
  "preflight-engine": {
    files: ["src/preflight.ts", "src/probe-cache.ts", "src/engine-quota.ts"],
    frameworkMatch: [/engine/i],
  },
  "dispatch-runner": {
    files: ["src/dispatch.ts", "src/orchestrator/", "src/logbus.ts", "src/safety/checkpoint.ts"],
    frameworkMatch: [/orchestrat/i, /dispatch/i],
  },
  "doc-writer": {
    files: ["docs/", "README.md", "AGENTS.md", "CLAUDE.md", "CHANGELOG.md"],
    frameworkMatch: [/docs?/i],
  },
};

function hasFile(repo: string, rel: string): boolean {
  // Treat trailing `/` as a directory prefix to scan (existsSync handles
  // both files and dirs).
  return existsSync(join(repo, rel));
}

function matchesFramework(profile: ProjectProfile, patterns: RegExp[]): boolean {
  const haystack = [...profile.frameworks, ...profile.languages, profile.packageManager ?? ""].join(
    " ",
  );
  return patterns.some((p) => p.test(haystack));
}

/** Detect which roles apply to a repo based on its scanner profile and
 * on-disk file presence. Returns a deduplicated, order-stable list. */
export function detectRolesForRepo(repo: string, profile?: ProjectProfile): RoleName[] {
  const out = new Set<RoleName>();
  for (const role of ROLE_NAMES) {
    const sig = ROLE_SIGNALS[role];
    const fileHit = sig.files.some((f) => hasFile(repo, f));
    const fwHit = profile ? matchesFramework(profile, sig.frameworkMatch) : false;
    if (fileHit || fwHit) out.add(role);
  }
  // Always include doc-writer (every project has docs/ or README.md or
  // should — keep it as a safety net for the routing table).
  if (!out.has("doc-writer") && (hasFile(repo, "README.md") || hasFile(repo, "docs/"))) {
    out.add("doc-writer");
  }
  return ROLE_NAMES.filter((n) => out.has(n));
}
