/**
 * Context7 discovery — zero-install via stdlib `fetch`.
 *
 * Context7 exposes an HTTP API (https://context7.com/api/v2): library search and
 * context lookup, with an optional `Authorization: Bearer ${CONTEXT7_API_KEY}` header
 * (keyless is allowed but rate-limited). We use the global `fetch` (available in Bun and
 * Node >=18) so VibeFlow needs NO external `ctx7` binary — honoring the zero-install rule.
 *
 * SECURITY invariants enforced here:
 *  - No silent network: a lookup only reaches the wire when `approved` is set.
 *  - Bounded: every request carries an AbortSignal timeout so discovery cannot hang.
 *  - Graceful: offline / non-2xx / parse errors return `{ ok:false, reason }`, never throw.
 *  - Never auto-trusted: any skill obtained via discovery is `experimental` at most.
 *  - No path traversal: skill names are sanitized through the skill-name regex before
 *    they could ever be used as a path segment.
 */

/** Canonical Context7 HTTP base. */
export const CONTEXT7_BASE = "https://context7.com";

/** Default request timeout (ms) — discovery must never block a workflow indefinitely. */
const DEFAULT_TIMEOUT_MS = 8000;

/** Skill-name shape from the skill-creator standard (also our path-safety gate). */
const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** A doc/skill candidate returned by an external discovery provider. */
export interface DiscoveryResult {
  kind: "docs" | "skill";
  title: string;
  snippet: string;
  /** Imported skills always start experimental — never auto-trusted. */
  status?: "experimental";
  /** Sanitized, path-safe skill name (undefined when the source name was unsafe). */
  name?: string;
  source: string;
}

export interface DiscoveryOptions {
  /** Network calls require explicit approval (SECURITY_MODEL: no silent network). */
  approved?: boolean;
  /** Injectable command runner so legacy sync callers/tests never touch the network. */
  runner?: (cmd: string, args: string[]) => { status: number; stdout: string };
}

/** Options for the HTTP (fetch-based) discovery path. */
export interface HttpDiscoveryOptions {
  /** Network calls require explicit approval (SECURITY_MODEL: no silent network). */
  approved?: boolean;
  /** Injectable fetch so tests never hit the network. Defaults to the global `fetch`. */
  fetchFn?: typeof fetch;
  /** Bounded timeout in ms (default 8000). */
  timeoutMs?: number;
  /** Optional bearer token; falls back to CONTEXT7_API_KEY. Keyless is allowed. */
  apiKey?: string;
}

export interface DiscoveryOutcome {
  ok: boolean;
  approvalRequired?: boolean;
  reason?: string;
  results: DiscoveryResult[];
}

/**
 * Discovery is always available now: it rides on the global `fetch`, so there is no
 * external binary prerequisite. Kept for callers that probe capability.
 */
export function discoveryAvailable(): boolean {
  return typeof fetch === "function";
}

/** Sanitize a raw skill name: keep it only if it is already a safe, lowercase-hyphen slug. */
function safeSkillName(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim();
  return SKILL_NAME_RE.test(s) ? s : undefined;
}

interface ApiRow {
  name?: string;
  title?: string;
  description?: string;
  snippet?: string;
  text?: string;
}

/** Pull a list of rows out of whatever shape the Context7 API returned. */
function rowsFrom(body: unknown): ApiRow[] {
  if (Array.isArray(body)) return body as ApiRow[];
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    for (const key of ["results", "libraries", "docs", "items"]) {
      if (Array.isArray(o[key])) return o[key] as ApiRow[];
    }
  }
  return [];
}

/**
 * Perform a bounded, approval-gated GET and parse the JSON body, never throwing.
 * Returns the parsed rows or a graceful failure outcome.
 */
async function getJson(
  url: string,
  opts: HttpDiscoveryOptions,
): Promise<{ ok: true; rows: ApiRow[] } | { ok: false; reason: string }> {
  const fetchFn = opts.fetchFn ?? fetch;
  const apiKey = opts.apiKey ?? process.env.CONTEXT7_API_KEY;
  const headers: Record<string, string> = { accept: "application/json" };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    const res = await fetchFn(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { ok: false, reason: `context7 request failed (HTTP ${res.status})` };
    const body = (await res.json()) as unknown;
    return { ok: true, rows: rowsFrom(body) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `context7 lookup failed: ${msg}` };
  }
}

/**
 * Look up current library documentation via Context7's HTTP API.
 * Reaches the network only when `approved`; fails gracefully otherwise.
 */
export async function lookupDocsHttp(
  library: string,
  opts: HttpDiscoveryOptions = {},
): Promise<DiscoveryOutcome> {
  if (!opts.approved) {
    return {
      ok: false,
      approvalRequired: true,
      reason: `Network lookup for "${library}" requires approval.`,
      results: [],
    };
  }
  const url = `${CONTEXT7_BASE}/api/v2/context?libraryId=${encodeURIComponent(library)}&query=${encodeURIComponent(library)}`;
  const r = await getJson(url, opts);
  if (!r.ok) return { ok: false, reason: r.reason, results: [] };
  const results: DiscoveryResult[] = r.rows.map((row) => ({
    kind: "docs",
    title: row.title ?? row.name ?? library,
    snippet: row.snippet ?? row.text ?? row.description ?? "",
    source: "context7",
  }));
  return { ok: true, results };
}

/**
 * Search Context7's library/skill registry over HTTP. Imported skills are forced to
 * `experimental` and their names are sanitized so they can never become a path.
 */
export async function searchSkillsHttp(
  query: string,
  opts: HttpDiscoveryOptions = {},
): Promise<DiscoveryOutcome> {
  if (!opts.approved) {
    return {
      ok: false,
      approvalRequired: true,
      reason: `Skill search for "${query}" requires approval.`,
      results: [],
    };
  }
  const url = `${CONTEXT7_BASE}/api/v2/libs/search?query=${encodeURIComponent(query)}`;
  const r = await getJson(url, opts);
  if (!r.ok) return { ok: false, reason: r.reason, results: [] };
  const results: DiscoveryResult[] = r.rows.map((row) => {
    const name = safeSkillName(row.name ?? row.title);
    return {
      kind: "skill",
      title: row.name ?? row.title ?? "skill",
      snippet: row.description ?? row.snippet ?? "",
      // Discovery never yields trust — experimental at most.
      status: "experimental" as const,
      name,
      source: "context7",
    };
  });
  return { ok: true, results };
}

// --- Legacy synchronous API (kept for existing CLI plumbing) -------------------------
// These retain the original signature so synchronous callers keep compiling. The default
// path no longer shells out to a `ctx7` binary (zero-install); real network discovery now
// flows through the async *Http functions above. An injected `runner` is still honored.

function notWired(query: string): DiscoveryOutcome {
  return {
    ok: false,
    reason: `Context7 HTTP discovery is async; use lookupDocs/searchSkills *Http for "${query}".`,
    results: [],
  };
}

/** Legacy sync docs lookup. Approval-gated; uses an injected runner when provided. */
export function lookupDocs(library: string, opts: DiscoveryOptions = {}): DiscoveryOutcome {
  if (!opts.approved) {
    return {
      ok: false,
      approvalRequired: true,
      reason: `Network lookup for "${library}" requires approval.`,
      results: [],
    };
  }
  if (!opts.runner) return notWired(library);
  const r = opts.runner("ctx7", ["docs", library]);
  if (r.status !== 0) return { ok: false, reason: "docs lookup failed", results: [] };
  return { ok: true, results: parseDocs(r.stdout, library) };
}

/** Legacy sync skill search. Approval-gated; uses an injected runner when provided. */
export function searchSkills(query: string, opts: DiscoveryOptions = {}): DiscoveryOutcome {
  if (!opts.approved) {
    return {
      ok: false,
      approvalRequired: true,
      reason: `Skill search for "${query}" requires approval.`,
      results: [],
    };
  }
  if (!opts.runner) return notWired(query);
  const r = opts.runner("ctx7", ["skills", "search", query]);
  if (r.status !== 0) return { ok: false, reason: "skill search failed", results: [] };
  return { ok: true, results: parseSkills(r.stdout) };
}

/** Parse runner docs output (NDJSON or plain lines) into doc results. */
function parseDocs(stdout: string, library: string): DiscoveryResult[] {
  return parseLines(stdout).map((line) => ({
    kind: "docs" as const,
    title: line.title ?? library,
    snippet: line.snippet ?? line.text ?? "",
    source: "context7",
  }));
}

/** Parse runner skill search output into experimental, path-safe skill candidates. */
function parseSkills(stdout: string): DiscoveryResult[] {
  return parseLines(stdout).map((line) => ({
    kind: "skill" as const,
    title: line.name ?? line.title ?? "skill",
    snippet: line.description ?? line.snippet ?? "",
    status: "experimental" as const,
    name: safeSkillName(line.name ?? line.title),
    source: "context7",
  }));
}

/** Tolerant parser: prefer JSON lines, fall back to plain text lines. */
function parseLines(stdout: string): Array<Record<string, string>> {
  const out: Array<Record<string, string>> = [];
  for (const raw of stdout.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const obj = JSON.parse(line) as Record<string, string>;
      out.push(obj);
    } catch {
      out.push({ text: line });
    }
  }
  return out;
}
