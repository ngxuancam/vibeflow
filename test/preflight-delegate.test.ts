import { describe, expect, test } from "bun:test";
import { preflightDelegate } from "../src/preflight-delegate";
import type { EngineReadiness } from "../src/preflight.js";
import { ProbeCache } from "../src/probe-cache";

const READY: EngineReadiness = {
  level: "ready",
  detail: "ok",
  engine: "claude",
  checkedAt: "2026-06-12T00:00:00Z",
};
const NO_BINARY: EngineReadiness = {
  level: "no-binary",
  detail: "missing",
  engine: "claude",
  checkedAt: "2026-06-12T00:00:00Z",
};
const NO_AUTH: EngineReadiness = {
  level: "no-auth",
  detail: "login",
  engine: "claude",
  checkedAt: "2026-06-12T00:00:00Z",
};

describe("preflightDelegate", () => {
  test("ready when engine is ready and quota is high", async () => {
    const r = await preflightDelegate("/repo", "claude", {
      cache: new ProbeCache(),
      presenceCheck: () => READY,
      quotaProbe: async () => ({ level: "ready" }),
      pickFallback: () => undefined,
    });
    expect(r.allowed).toBe(true);
    expect(r.level).toBe("ready");
  });

  test("no-binary blocks", async () => {
    const r = await preflightDelegate("/repo", "claude", {
      cache: new ProbeCache(),
      presenceCheck: () => NO_BINARY,
      quotaProbe: async () => ({ level: "ready" }),
      pickFallback: () => undefined,
    });
    expect(r.allowed).toBe(false);
    expect(r.level).toBe("exhausted");
  });

  test("no-auth blocks as not-logged-in", async () => {
    const r = await preflightDelegate("/repo", "claude", {
      cache: new ProbeCache(),
      presenceCheck: () => NO_AUTH,
      quotaProbe: async () => ({ level: "ready" }),
      pickFallback: () => undefined,
    });
    expect(r.allowed).toBe(false);
    expect(r.level).toBe("not-logged-in");
  });

  test("warning allows but with warning level", async () => {
    const r = await preflightDelegate("/repo", "claude", {
      cache: new ProbeCache(),
      presenceCheck: () => READY,
      quotaProbe: async () => ({ level: "warning", error: "low" }),
      pickFallback: () => undefined,
    });
    expect(r.allowed).toBe(true);
    expect(r.level).toBe("warning");
  });

  test("exhausted blocks if no fallback", async () => {
    const r = await preflightDelegate("/repo", "claude", {
      cache: new ProbeCache(),
      presenceCheck: () => READY,
      quotaProbe: async () => ({ level: "exhausted", error: "no calls left" }),
      pickFallback: () => undefined,
    });
    expect(r.allowed).toBe(false);
    expect(r.level).toBe("exhausted");
  });

  test("exhausted falls back to next ready engine", async () => {
    const r = await preflightDelegate("/repo", "claude", {
      cache: new ProbeCache(),
      presenceCheck: () => READY,
      quotaProbe: async () => ({ level: "exhausted" }),
      pickFallback: () => "codex",
    });
    expect(r.allowed).toBe(true);
    expect(r.fallbackEngine).toBe("codex");
  });

  test("rate-limited (HTTP 429) falls back", async () => {
    const r = await preflightDelegate("/repo", "claude", {
      cache: new ProbeCache(),
      presenceCheck: () => READY,
      quotaProbe: async () => ({ level: "rate-limited", error: "HTTP 429" }),
      pickFallback: () => "codex",
    });
    expect(r.allowed).toBe(true);
    expect(r.fallbackEngine).toBe("codex");
  });

  test("forbidden (HTTP 403) blocks — do NOT fall back (auth issue)", async () => {
    const r = await preflightDelegate("/repo", "claude", {
      cache: new ProbeCache(),
      presenceCheck: () => READY,
      quotaProbe: async () => ({ level: "forbidden", error: "HTTP 403" }),
      pickFallback: () => "codex",
    });
    expect(r.allowed).toBe(false);
    expect(r.level).toBe("forbidden");
  });

  test("not-logged-in blocks", async () => {
    const r = await preflightDelegate("/repo", "claude", {
      cache: new ProbeCache(),
      presenceCheck: () => READY,
      quotaProbe: async () => ({ level: "not-logged-in", error: "login required" }),
      pickFallback: () => "codex",
    });
    expect(r.allowed).toBe(false);
    expect(r.level).toBe("not-logged-in");
  });

  test("skipQuotaCheck=true skips quota probe and allows", async () => {
    const r = await preflightDelegate("/repo", "claude", {
      cache: new ProbeCache(),
      skipQuotaCheck: true,
      presenceCheck: () => READY,
      quotaProbe: async () => ({ level: "exhausted" }),
      pickFallback: () => undefined,
    });
    expect(r.allowed).toBe(true);
    expect(r.level).toBe("ready");
  });
});
