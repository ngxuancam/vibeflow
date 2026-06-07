import { existsSync, readFileSync } from "node:fs";
import { ctxPathIn, cwd, writeFileSafe } from "./core.js";

/** Tool tiers, in the canonical preference family used by the priority ladder. */
export type ToolTier = "codegraph" | "lsp" | "native";

/** All valid tiers, in the canonical default order (highest preference first). */
const TIERS: ToolTier[] = ["codegraph", "lsp", "native"];

/** Per-repo user settings persisted to `.viteflow/SETTINGS.json`. */
export interface VibeSettings {
  tools: { codegraph: boolean; lsp: boolean };
  toolPriority: ToolTier[];
  lspServers?: string[];
  /** ISO timestamp stamped by the writer. */
  updatedAt: string;
}

/** Off-by-default baseline. `readSettings` always returns a fresh copy, never this object. */
export const DEFAULT_SETTINGS: VibeSettings = {
  tools: { codegraph: false, lsp: false },
  toolPriority: [...TIERS],
  updatedAt: "",
};

function isTier(v: unknown): v is ToolTier {
  return v === "codegraph" || v === "lsp" || v === "native";
}

/** Deep copy of the defaults so callers can mutate the result freely. */
function defaults(): VibeSettings {
  return {
    tools: { ...DEFAULT_SETTINGS.tools },
    toolPriority: [...DEFAULT_SETTINGS.toolPriority],
    updatedAt: DEFAULT_SETTINGS.updatedAt,
  };
}

/** Path to the settings file inside a given repo's canonical context dir. */
export function settingsPath(base?: string): string {
  return ctxPathIn(base ?? cwd(), "SETTINGS.json");
}

/** Validate + dedupe a stored priority list; fall back to defaults when unusable. */
function normalizePriority(raw: unknown): ToolTier[] {
  if (!Array.isArray(raw) || raw.length === 0) return [...TIERS];
  // Any unknown tier makes the whole list untrustworthy → default order.
  if (!raw.every(isTier)) return [...TIERS];
  const seen = new Set<ToolTier>(raw);
  // Keep declared order, then append any tiers the file omitted (forward-compatible).
  const ordered = [...seen];
  for (const tier of TIERS) {
    if (!seen.has(tier)) ordered.push(tier);
  }
  return ordered;
}

/** Merge a partial/old/unknown stored object over the defaults into a complete VibeSettings. */
function coerce(raw: unknown): VibeSettings {
  const out = defaults();
  if (!raw || typeof raw !== "object") return out;
  const obj = raw as Record<string, unknown>;

  const tools = obj.tools;
  if (tools && typeof tools === "object") {
    const t = tools as Record<string, unknown>;
    if (typeof t.codegraph === "boolean") out.tools.codegraph = t.codegraph;
    if (typeof t.lsp === "boolean") out.tools.lsp = t.lsp;
  }

  out.toolPriority = normalizePriority(obj.toolPriority);

  if (Array.isArray(obj.lspServers)) {
    const servers = obj.lspServers.filter(
      (s): s is string => typeof s === "string" && s.length > 0,
    );
    if (servers.length) out.lspServers = servers;
  }

  if (typeof obj.updatedAt === "string") out.updatedAt = obj.updatedAt;
  return out;
}

/** Read settings for a repo; missing/corrupt files yield a fresh copy of the defaults. */
export function readSettings(base?: string): VibeSettings {
  const p = settingsPath(base);
  if (!existsSync(p)) return defaults();
  try {
    return coerce(JSON.parse(readFileSync(p, "utf8")) as unknown);
  } catch {
    return defaults();
  }
}

/** Read-modify-write: merge `next` over current settings, stamp `updatedAt`, persist, return it. */
export function writeSettings(
  base: string,
  next: Partial<VibeSettings>,
  opts?: { now?: () => string },
): VibeSettings {
  const now = opts?.now ?? (() => new Date().toISOString());
  const current = readSettings(base);
  const merged: VibeSettings = {
    tools: { ...current.tools, ...(next.tools ?? {}) },
    toolPriority: next.toolPriority ? normalizePriority(next.toolPriority) : current.toolPriority,
    updatedAt: now(),
  };
  const servers = next.lspServers ?? current.lspServers;
  if (servers?.length) merged.lspServers = [...servers];
  writeFileSafe(settingsPath(base), JSON.stringify(merged, null, 2));
  return merged;
}

/**
 * Turn the ordered `toolPriority` list into a rank map where higher = preferred, mirroring
 * STATUS_RANK in skills/registry.ts. The first element gets the highest rank.
 */
export function priorityRank(settings: VibeSettings): Record<ToolTier, number> {
  const order = normalizePriority(settings.toolPriority);
  const rank = {} as Record<ToolTier, number>;
  const top = order.length;
  for (let i = 0; i < order.length; i++) {
    rank[order[i] as ToolTier] = top - i;
  }
  return rank;
}
