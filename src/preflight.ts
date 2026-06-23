import { ENGINES, type Engine, hasCommand, resolveCommand, resolveEngineBinary } from "./core.js";
import { checkEngineAsync, runAttempts } from "./preflight/check-async.js";
import {
  GH_AUTH_TIMEOUT_MS,
  checkCopilotAuth,
  defaultSpawner,
  engineBinary,
  engineBinaryResolved,
  installHint,
  probeTimeoutMs,
  runProbeSafe,
} from "./preflight/probe.js";
import type { EngineReadiness, PreflightOpts, ReadinessLevel } from "./preflight/types.js";

// Re-export public types so the 14 importers see no change
export type {
  ReadinessLevel,
  EngineReadiness,
  ProbeSpawner,
  PreflightOpts,
} from "./preflight/types.js";

// Re-export moved functions for the original public surface
export { probeInvocation } from "./preflight/probe.js";
export { checkEngineAsync, runAttempts };

/**
 * Staged, short-circuiting readiness check: presence → auth → live probe. Each stage that fails
 * stops the chain with the most actionable level. Never throws — a misbehaving spawner is caught.
 */
export function checkEngine(engine: Engine, opts: PreflightOpts = {}): EngineReadiness {
  const has = opts.has ?? hasCommand;
  const spawner =
    opts.spawner ??
    ((cmd: string, args: string[], input: string) =>
      defaultSpawner(cmd, args, input, cmd === "gh" ? GH_AUTH_TIMEOUT_MS : probeTimeoutMs(engine)));
  const now = opts.now ?? (() => new Date().toISOString());
  const stamp = (level: ReadinessLevel, detail: string): EngineReadiness => ({
    engine,
    level,
    detail,
    checkedAt: now(),
  });

  // Cache lookup: short-circuit when fresh
  if (!opts.skipCache) {
    const { getSharedCache } = require("./probe-cache.js") as typeof import("./probe-cache.js");
    const cache = getSharedCache();
    const cacheRepo = opts.cacheKey ?? process.cwd();
    const hit = cache.get(engine, cacheRepo, [], undefined);
    if (hit) return hit;
  }

  const cmd = engineBinary(engine);
  // Issue #87: bare-name `has` is insufficient on Windows (npm shims).
  const usesDefaultHas = opts.has === undefined;
  if (!has(cmd)) {
    const shimCheck = usesDefaultHas ? resolveEngineBinary(cmd) : undefined;
    if (shimCheck === undefined) {
      const r = stamp("no-binary", installHint(engine));
      writeToCache(engine, opts, r);
      return r;
    }
  }
  // Issue #87: resolve shim-aware name so the probe spawner is invoked
  // with the actual executable on Windows.
  const effectiveCmd = engineBinaryResolved(engine);
  const resolvedCmd =
    opts.spawner !== undefined ? effectiveCmd : (resolveCommand(effectiveCmd) ?? effectiveCmd);

  if (engine === "copilot") {
    try {
      const auth = checkCopilotAuth(has, spawner, usesDefaultHas);
      const r = stamp(auth.level, auth.detail);
      writeToCache(engine, opts, r);
      return r;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const r = stamp("probe-failed", `${engine}: probe failed (${msg})`);
      writeToCache(engine, opts, r);
      return r;
    }
  }

  if (opts.probe === false) {
    const r = stamp("ready", `${engine}: installed (probe skipped)`);
    writeToCache(engine, opts, r);
    return r;
  }

  const probe = runProbeSafe(engine, (probeCmd, args, input) =>
    spawner(probeCmd === cmd ? resolvedCmd : probeCmd, args, input),
  );
  const r = stamp(probe.level, probe.detail);
  writeToCache(engine, opts, r);
  return r;
}

function writeToCache(engine: Engine, opts: PreflightOpts, r: EngineReadiness): void {
  if (opts.skipCache) return;
  const { setCachedProbe } = require("./probe-cache.js") as typeof import("./probe-cache.js");
  const repo = opts.cacheKey ?? process.cwd();
  setCachedProbe(engine, repo, [], r);
}

/** De-duplicated, ENGINES-validated subset of the requested engines, in canonical order. */
function normalizeEngines(engines: Engine[]): Engine[] {
  const requested = new Set(engines);
  return ENGINES.filter((e) => requested.has(e));
}

/** Check every (valid, deduped) engine. Synchronous to match doctor's simplicity. */
export function preflightAll(engines: Engine[], opts: PreflightOpts = {}): EngineReadiness[] {
  return normalizeEngines(engines).map((e) => checkEngine(e, opts));
}

/** Run all probes in parallel via the async path. Returns in ~max(probe) instead of sum(probes). */
export function preflightAllAsync(
  engines: Engine[],
  opts: PreflightOpts = {},
): Promise<EngineReadiness[]> {
  return Promise.all(normalizeEngines(engines).map((e) => checkEngineAsync(e, opts)));
}

/** True if at least one engine is fully ready (the gate the next agent uses to allow creation). */
export function anyReady(list: EngineReadiness[]): boolean {
  return list.some((r) => r.level === "ready");
}

/** The engines that are fully ready, in input order. */
export function readyEngines(list: EngineReadiness[]): Engine[] {
  return list.filter((r) => r.level === "ready").map((r) => r.engine);
}
