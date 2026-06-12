import type { Engine } from "./core.js";
import { ENGINES } from "./core.js";
import { type QuotaStatus, checkEngineQuota } from "./engine-quota.js";
import { type EngineReadiness, checkEngine } from "./preflight.js";
import type { ProbeCache, getSharedCache } from "./probe-cache.js";

export type DelegateLevel =
  | "ready"
  | "warning"
  | "exhausted"
  | "rate-limited"
  | "forbidden"
  | "not-logged-in";

export interface DelegateGate {
  allowed: boolean;
  level: DelegateLevel;
  detail: string;
  fallbackEngine?: Engine;
  quota?: QuotaStatus;
}

export interface PreflightDelegateOpts {
  cache?: ProbeCache;
  skipQuotaCheck?: boolean;
  /** Override the quota probe (test seam). */
  quotaProbe?: (engine: Engine) => Promise<QuotaStatus> | QuotaStatus;
  /** Override the engine check (test seam). */
  presenceCheck?: (engine: Engine) => EngineReadiness;
  /** Override the next-engine picker (test seam). */
  pickFallback?: (exclude: Engine) => Engine | undefined;
  /** Base dir for default presence check (test seam). */
  base?: string;
}

export async function preflightDelegate(
  base: string,
  engine: Engine,
  opts: PreflightDelegateOpts = {},
): Promise<DelegateGate> {
  // Layer 1: presence + auth
  const presence = opts.presenceCheck?.(engine) ?? defaultPresenceCheck(base, engine, opts);
  if (presence.level === "no-binary") {
    return { allowed: false, level: "exhausted", detail: presence.detail };
  }
  if (presence.level === "no-auth") {
    return { allowed: false, level: "not-logged-in", detail: presence.detail };
  }
  if (presence.level === "probe-failed" || presence.level === "unknown") {
    return { allowed: false, level: "exhausted", detail: presence.detail };
  }

  // Layer 2: quota probe
  if (opts.skipQuotaCheck) {
    return { allowed: true, level: "ready", detail: "quota check skipped" };
  }
  const quota: QuotaStatus = opts.quotaProbe ? await opts.quotaProbe(engine) : { level: "ready" };
  if (quota.level === "exhausted" || quota.level === "rate-limited") {
    const fallback = opts.pickFallback ? opts.pickFallback(engine) : defaultPickFallback(engine);
    if (fallback) {
      return {
        allowed: true,
        level: "ready",
        detail: `primary ${engine} ${quota.level}; falling back to ${fallback}`,
        fallbackEngine: fallback,
        quota,
      };
    }
    return {
      allowed: false,
      level: quota.level,
      detail: quota.error ?? "quota exhausted",
      quota,
    };
  }
  if (quota.level === "forbidden" || quota.level === "not-logged-in") {
    return {
      allowed: false,
      level: quota.level,
      detail: quota.error ?? "auth failed",
      quota,
    };
  }
  if (quota.level === "warning") {
    return {
      allowed: true,
      level: "warning",
      detail: quota.error ?? "quota low",
      quota,
    };
  }
  return { allowed: true, level: "ready", detail: "ready", quota };
}

function defaultPresenceCheck(
  base: string,
  engine: Engine,
  _opts: PreflightDelegateOpts,
): EngineReadiness {
  // Reuse the existing checkEngine from preflight. Presence is fast and the
  // existing function already does the right thing for known engines.
  // Skip spawner (we don't have one in the delegate context); this means we
  // only do presence + (if copilot) auth, no live probe. The full live probe
  // happens in applyDispatch's runProbe path.
  return checkEngine(engine, { has: (cmd) => cmd !== "missing" });
}

function defaultPickFallback(exclude: Engine): Engine | undefined {
  for (const candidate of ENGINES) {
    if (candidate === exclude) continue;
    const r = checkEngine(candidate, { has: (cmd) => cmd !== "missing" });
    if (r.level === "ready") return candidate;
  }
  return undefined;
}
