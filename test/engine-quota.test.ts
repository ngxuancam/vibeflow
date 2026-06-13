import { describe, expect, test } from "bun:test";
import { checkEngineQuota, parseQuotaOutput } from "../src/engine-quota";

describe("parseQuotaOutput", () => {
  test("claude: JSON {limit, used, remaining, resetAt}", () => {
    const r = parseQuotaOutput(
      "claude",
      JSON.stringify({ limit: 100, used: 80, remaining: 20, resetAt: "2026-06-13" }),
    );
    expect(r.remaining).toBe(20);
    expect(r.percentRemaining).toBe(20);
    expect(r.resetAt).toBe("2026-06-13");
  });

  test("codex: text 'quota: 5/100 (5% used, 95% remaining)'", () => {
    const r = parseQuotaOutput("codex", "quota: 5/100 (5% used, 95% remaining)");
    expect(r.percentRemaining).toBe(95);
  });

  test("copilot: JSON {quota_remaining, quota_total, reset_at}", () => {
    const r = parseQuotaOutput(
      "copilot",
      JSON.stringify({ quota_remaining: 5, quota_total: 100, reset_at: "2026-06-13" }),
    );
    expect(r.remaining).toBe(5);
    expect(r.percentRemaining).toBe(5);
    expect(r.resetAt).toBe("2026-06-13");
  });

  test("empty output → exhausted level", () => {
    expect(parseQuotaOutput("claude", "").level).toBe("exhausted");
  });

  test("unparseable output → exhausted level", () => {
    expect(parseQuotaOutput("claude", "???garbage???").level).toBe("exhausted");
  });
});

describe("checkEngineQuota", () => {
  test("ready when remaining > 20%", () => {
    expect(checkEngineQuota({ percentRemaining: 50 }).level).toBe("ready");
  });

  test("warning when 5% < remaining <= 20%", () => {
    expect(checkEngineQuota({ percentRemaining: 10 }).level).toBe("warning");
  });

  test("exhausted when remaining <= 5%", () => {
    expect(checkEngineQuota({ percentRemaining: 1 }).level).toBe("exhausted");
  });

  test("ready when percentRemaining undefined (assume ok)", () => {
    expect(checkEngineQuota({}).level).toBe("ready");
  });

  test("rate-limited on HTTP 429 in stderr", () => {
    expect(checkEngineQuota({ stderr: "HTTP 429 too many requests" }).level).toBe("rate-limited");
  });

  test("forbidden on HTTP 403 in stderr", () => {
    expect(checkEngineQuota({ stderr: "HTTP 403 forbidden" }).level).toBe("forbidden");
  });

  test("not-logged-in when stderr mentions login", () => {
    expect(checkEngineQuota({ stderr: "not logged in" }).level).toBe("not-logged-in");
  });

  test("stderr signal overrides percentRemaining", () => {
    expect(checkEngineQuota({ percentRemaining: 80, stderr: "HTTP 429 too many" }).level).toBe(
      "rate-limited",
    );
  });
});

describe("parseQuotaOutput: edge cases", () => {
  test("codex text with malformed fraction (line 61-62 NaN guard)", () => {
    // fraction regex matches but values are empty strings → parseInt NaN
    // → percentRemaining stays undefined → falls through to "exhausted"
    const r = parseQuotaOutput("codex", "quota: / (0% used, 0% remaining)");
    // The regex `(\d+)\s*\/\s*(\d+)` requires at least one digit, so an
    // empty fraction won't match. The function should fall through to
    // the unparseable branch.
    expect(r.level).toBe("exhausted");
  });

  test("codex text with non-numeric percent in remaining", () => {
    // The text has a fraction but no `NN% remaining` → parsePercent
    // returns undefined → percentRemaining undefined.
    const r = parseQuotaOutput("codex", "quota: 5/100 (5% used, 95% remaining)");
    expect(r.percentRemaining).toBe(95);
  });

  test("claude JSON with bad percent → percentRemaining undefined (line 32)", () => {
    const bad = JSON.stringify({
      result: { limit: 100, used: 5, remaining: 95 },
    });
    const r = parseQuotaOutput("claude", bad);
    // No `*%` substring → parsePercent returns undefined
    expect(r.percentRemaining).toBeUndefined();
  });

  test("claude non-JSON body → exhausted with error message (line 61-62 catch)", () => {
    // The text starts with `{` (to match the JSON branch) but isn't
    // valid JSON → JSON.parse throws → catch returns exhausted.
    const r = parseQuotaOutput("claude", "{not valid json");
    expect(r.level).toBe("exhausted");
    expect(r.error).toBeDefined();
  });
});
