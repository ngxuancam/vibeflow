import type { EngineReadiness } from "./preflight.js";

const DEFAULT_TTL_MS = 60_000;
const SHORT_TTL_MS = 5_000;

type CacheClass = "stable" | "short";

interface CacheEntry {
  result: EngineReadiness;
  expiresAt: number;
}

export interface ProbeCacheOpts {
  ttlMs?: number;
  shortTtlMs?: number;
  now?: () => number;
}

export class ProbeCache {
  private map = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private readonly shortTtlMs: number;
  private readonly now: () => number;

  constructor(opts: ProbeCacheOpts = {}) {
    this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
    this.shortTtlMs = opts.shortTtlMs ?? SHORT_TTL_MS;
    this.now = opts.now ?? (() => Date.now());
  }

  private key(engine: string, repo: string, args: readonly string[]): string {
    return `${engine}|${repo}|${args.join("\u0001")}`;
  }

  get(
    engine: string,
    repo: string,
    args: readonly string[],
    at?: Date,
  ): EngineReadiness | undefined {
    const k = this.key(engine, repo, args);
    const entry = this.map.get(k);
    if (!entry) return undefined;
    const t = at ? at.getTime() : this.now();
    if (t >= entry.expiresAt) {
      this.map.delete(k);
      return undefined;
    }
    return entry.result;
  }

  set(
    engine: string,
    repo: string,
    args: readonly string[],
    result: EngineReadiness,
    at?: Date,
    class_: CacheClass = "stable",
  ): void {
    const t = at ? at.getTime() : this.now();
    const ttl = class_ === "short" ? this.shortTtlMs : this.ttlMs;
    this.map.set(this.key(engine, repo, args), {
      result,
      expiresAt: t + ttl,
    });
  }

  invalidate(engine: string): void {
    for (const k of [...this.map.keys()]) {
      if (k.startsWith(`${engine}|`)) this.map.delete(k);
    }
  }

  invalidateAll(): void {
    this.map.clear();
  }

  size(): number {
    return this.map.size;
  }
}

let _sharedCache: ProbeCache | undefined;

export function getSharedCache(): ProbeCache {
  if (!_sharedCache) _sharedCache = new ProbeCache();
  return _sharedCache;
}

export function setSharedCache(c: ProbeCache | undefined): void {
  _sharedCache = c;
}

export function getCachedProbe(
  engine: string,
  repo: string,
  args: readonly string[],
): EngineReadiness | undefined {
  return getSharedCache().get(engine, repo, args);
}

export function setCachedProbe(
  engine: string,
  repo: string,
  args: readonly string[],
  result: EngineReadiness,
): void {
  const class_: CacheClass = result.level === "probe-failed" ? "short" : "stable";
  getSharedCache().set(engine, repo, args, result, undefined, class_);
}

export function invalidateProbe(engine: string): void {
  getSharedCache().invalidate(engine);
}

export function invalidateAllProbes(): void {
  getSharedCache().invalidateAll();
}
