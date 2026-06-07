/**
 * Quota / rate-limit detection for dispatched engine output.
 *
 * The orchestrator runs many work units against a shared account. When an engine starts
 * returning 429 / 529 / quota-exhausted, hammering it with the remaining units only deepens
 * the hole. This module inspects a dispatch result and reports whether the engine signalled a
 * limit, how confident we are, and how long to wait before retrying.
 *
 * DESIGN (decided by debate): trust TYPED events and STRUCTURED error fields first. Raw-prose
 * substring matching is a last-resort, LOW-confidence advisory only — a legitimate task like
 * "add a rate limiter" makes an engine print "rate limit" on a SUCCESSFUL run, so prose alone
 * must never auto-stop the orchestrator.
 */

export type QuotaKind = "rate-limit" | "overloaded" | "quota-exhausted";

export interface QuotaSignal {
  limited: boolean;
  kind?: QuotaKind;
  retryAfterMs?: number;
  /** high = typed/structured source; low = prose heuristic (advisory, do not auto-stop). */
  confidence: "high" | "low";
  /** Short, secret-free reason. */
  evidence: string;
}

export interface BackoffPlan {
  retry: boolean;
  delayMs: number;
}

export interface BackoffOpts {
  baseMs?: number;
  capMs?: number;
  maxRetries?: number;
  /** Injectable for deterministic tests; defaults to Math.random in production. */
  rng?: () => number;
}

const DEFAULT_BASE_MS = 2000;
const DEFAULT_CAP_MS = 60_000;
const DEFAULT_MAX_RETRIES = 2;
const MS_PER_SECOND = 1000;

/** Error-token VALUEs (from provider docs) mapped to a QuotaKind. */
const KIND_BY_TOKEN: Record<string, QuotaKind> = {
  rate_limit: "rate-limit",
  rate_limit_error: "rate-limit",
  overloaded: "overloaded",
  overloaded_error: "overloaded",
  insufficient_quota: "quota-exhausted",
  billing_error: "quota-exhausted",
  resource_exhausted: "quota-exhausted",
  quota_exceeded: "quota-exhausted",
};

/** HTTP status codes that map to a kind when they appear in a STRUCTURED token. */
const KIND_BY_STATUS: Record<string, QuotaKind> = {
  "429": "rate-limit",
  "529": "overloaded",
};

const PROSE_PATTERNS: { re: RegExp; kind: QuotaKind }[] = [
  { re: /too many requests|rate[ _-]?limit/, kind: "rate-limit" },
  { re: /overloaded/, kind: "overloaded" },
  {
    re: /quota (?:exceeded|exhausted)|resource_exhausted|insufficient_quota/,
    kind: "quota-exhausted",
  },
];

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null;
}

/** Parse stdout as a single JSON value or, failing that, as JSONL (one object per line). */
function parseJsonObjects(stdout: string): Json[] {
  const out: Json[] = [];
  const whole = tryParse(stdout);
  if (whole !== undefined) {
    if (isObject(whole)) out.push(whole);
    return out;
  }
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const v = tryParse(trimmed);
    if (isObject(v)) out.push(v);
  }
  return out;
}

function tryParse(s: string): unknown {
  try {
    return JSON.parse(s.trim());
  } catch {
    return undefined;
  }
}

/** Pull the limit token from an object's error/subtype fields (never its free-text message). */
function tokenFromObject(obj: Json): string | undefined {
  const err = obj.error;
  if (typeof err === "string" && KIND_BY_TOKEN[err]) return err;
  if (isObject(err) && typeof err.type === "string" && KIND_BY_TOKEN[err.type]) return err.type;
  if (typeof obj.subtype === "string" && KIND_BY_TOKEN[obj.subtype]) return obj.subtype;
  if (typeof obj.type === "string" && KIND_BY_TOKEN[obj.type]) return obj.type;
  return undefined;
}

/** Extract a retry hint (ms) from typed retry-delay fields; seconds fields are scaled up. */
function retryFromObject(obj: Json): number | undefined {
  const ms = obj.retry_delay_ms ?? obj.retryAfterMs;
  if (typeof ms === "number" && Number.isFinite(ms)) return ms;
  const secs = obj.retry_after ?? obj.retry_delay;
  if (typeof secs === "number" && Number.isFinite(secs)) return secs * MS_PER_SECOND;
  return undefined;
}

/** Priority 1 & 3: typed/structured JSON objects (last object wins for the exit-code case). */
function fromTypedJson(stdout: string): QuotaSignal | undefined {
  const objs = parseJsonObjects(stdout);
  for (const obj of [...objs].reverse()) {
    const token = tokenFromObject(obj);
    if (!token) continue;
    const kind = KIND_BY_TOKEN[token];
    return {
      limited: true,
      kind,
      retryAfterMs: retryFromObject(obj),
      confidence: "high",
      evidence: `typed error ${token} -> ${kind}`,
    };
  }
  return undefined;
}

/** Parse a `Retry-After:` header line (seconds or HTTP-date) into ms. */
function parseRetryAfter(stdout: string): number | undefined {
  const m = stdout.match(/retry-after:\s*([^\n\r]+)/i);
  if (!m?.[1]) return undefined;
  const raw = m[1].trim();
  if (/^\d+$/.test(raw)) return Number(raw) * MS_PER_SECOND;
  const when = Date.parse(raw);
  if (Number.isNaN(when)) return undefined;
  return Math.max(0, when - Date.now());
}

/** Priority 2: an explicit HTTP status appearing in a STRUCTURED token (not loose prose). */
function fromHttpStatus(stdout: string): QuotaSignal | undefined {
  for (const [code, kind] of Object.entries(KIND_BY_STATUS)) {
    const structured = new RegExp(`(?:"status"\\s*:\\s*${code}\\b|http[ /]?${code}\\b)`, "i");
    if (!structured.test(stdout)) continue;
    return {
      limited: true,
      kind,
      retryAfterMs: parseRetryAfter(stdout),
      confidence: "high",
      evidence: `http ${code} -> ${kind}`,
    };
  }
  return undefined;
}

/** Priority 4: prose heuristic — LOW confidence, advisory only, never on a successful run. */
function fromProse(stdout: string): QuotaSignal | undefined {
  const text = stdout.toLowerCase();
  for (const { re, kind } of PROSE_PATTERNS) {
    if (!re.test(text)) continue;
    return {
      limited: true,
      kind,
      confidence: "low",
      evidence: `prose heuristic -> ${kind} (advisory)`,
    };
  }
  return undefined;
}

/**
 * Detect a quota / rate-limit signal from a dispatch result, in priority order:
 *  1. typed JSON error tokens (HIGH)  2. structured HTTP status (HIGH)
 *  3. prose substring (LOW, advisory) — only when the run FAILED.
 * Never throws on malformed input. `evidence` names the kind only; it never echoes raw tokens.
 */
export function detectQuota(r: {
  status: number;
  stdout?: string;
  stderr?: string;
  reason?: string;
}): QuotaSignal {
  const text = [r.stdout, r.stderr, r.reason].filter(Boolean).join("\n");
  const typed = fromTypedJson(text);
  if (typed) return typed;
  const http = fromHttpStatus(text);
  if (http) return http;
  if (r.status !== 0) {
    const prose = fromProse(text);
    if (prose) return prose;
  }
  return { limited: false, confidence: "high", evidence: "no quota signal" };
}

/** raw = min(cap, base * 2^attempt); full jitter picks uniformly in [0, raw]. */
function jitteredDelay(attempt: number, baseMs: number, capMs: number, rng: () => number): number {
  const raw = Math.min(capMs, baseMs * 2 ** attempt);
  return Math.floor(rng() * raw);
}

/**
 * Decide whether (and how long) to wait before retrying a limited dispatch.
 *  - rate-limit / overloaded: exponential backoff with FULL JITTER; honor a server
 *    `retryAfterMs` as a floor (and force retry, the server told us to wait).
 *  - quota-exhausted: hard stop — retrying cannot help.
 *  - low confidence: never auto-retry on a guess (caller should pause + warn instead).
 */
export function backoffPlan(
  sig: QuotaSignal,
  attempt: number,
  opts: BackoffOpts = {},
): BackoffPlan {
  if (!sig.limited || sig.confidence === "low" || sig.kind === "quota-exhausted") {
    return { retry: false, delayMs: 0 };
  }
  const baseMs = opts.baseMs ?? DEFAULT_BASE_MS;
  const capMs = opts.capMs ?? DEFAULT_CAP_MS;
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const rng = opts.rng ?? Math.random;
  const jittered = jitteredDelay(attempt, baseMs, capMs, rng);
  if (sig.retryAfterMs !== undefined) {
    return { retry: true, delayMs: Math.max(sig.retryAfterMs, jittered) };
  }
  return { retry: attempt < maxRetries, delayMs: jittered };
}
