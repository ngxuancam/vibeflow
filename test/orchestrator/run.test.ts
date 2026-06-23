import { describe, expect, test } from "bun:test";
import type { WorkUnit } from "../../src/core.js";
import { orchestrateUnits, runParallel } from "../../src/orchestrator/run.js";

function unit(name: string): WorkUnit {
  return {
    name,
    status: "pending",
    confidence: 0,
    scope: [`src/${name}/`],
    gates: { build: "pending", lint: "pending", test: "pending", review: "pending" },
    resources: { agents: 0, tokens: 0, cost_usd: 0, wall_seconds: 0 },
  };
}

const passDispatcher = async () => ({
  status: "done" as const,
  confidence: 0.9,
  evidence: ["e.log"],
});

const passReviewer = () => ({ pass: true, reason: "ok" });

const alwaysRun = () => () => Promise.resolve("run" as const);

function secResult(verdict: string): string {
  return `SECURITY_CHECK_RESULT\nverdict: ${verdict}\nitems_checked: 10\nitems_failed: none\nevidence: test`;
}

describe("orchestrateUnits — security checkpoint (lines 205-215)", () => {
  test("verdict fail → status blocked, gates.security=fail", async () => {
    const { units } = await orchestrateUnits({
      units: [unit("sec-fail")],
      dispatcher: passDispatcher,
      reviewer: passReviewer,
      security: {
        base: "/tmp",
        askFn: alwaysRun,
        runSkillFn: async () => secResult("fail"),
      },
    });
    const u = units.find((x) => x.name === "sec-fail");
    expect(u).toBeDefined();
    expect(u?.security?.verdict).toBe("fail");
    expect(u?.gates.security).toBe("fail");
  });

  test("verdict pass → gates.security=pass", async () => {
    const { units } = await orchestrateUnits({
      units: [unit("sec-pass")],
      dispatcher: passDispatcher,
      reviewer: passReviewer,
      security: {
        base: "/tmp",
        askFn: alwaysRun,
        runSkillFn: async () => secResult("pass"),
      },
    });
    const u = units.find((x) => x.name === "sec-pass");
    expect(u).toBeDefined();
    expect(u?.security?.verdict).toBe("pass");
    expect(u?.gates.security).toBe("pass");
  });

  test("verdict needs-review → gates.security=pass", async () => {
    const { units } = await orchestrateUnits({
      units: [unit("sec-review")],
      dispatcher: passDispatcher,
      reviewer: passReviewer,
      security: {
        base: "/tmp",
        askFn: alwaysRun,
        runSkillFn: async () => secResult("needs-review"),
      },
    });
    const u = units.find((x) => x.name === "sec-review");
    expect(u).toBeDefined();
    expect(u?.security?.verdict).toBe("needs-review");
    expect(u?.gates.security).toBe("pass");
  });
});

describe("runParallel — AbortSignal", () => {
  test("stops pulling new items once the signal aborts", async () => {
    const started: number[] = [];
    const ac = new AbortController();
    await runParallel(
      [0, 1, 2, 3, 4, 5],
      async (i) => {
        started.push(i);
        if (i === 1) ac.abort();
        return i;
      },
      1,
      0,
      undefined,
      ac.signal,
    );
    expect(started).toEqual([0, 1]);
  });

  test("no signal — all items run (back-compat)", async () => {
    const started: number[] = [];
    await runParallel(
      [0, 1, 2],
      async (i) => {
        started.push(i);
        return i;
      },
      2,
    );
    expect(started.sort()).toEqual([0, 1, 2]);
  });
});

describe("orchestrateUnits — quota-skip abort", () => {
  test("aborts remaining lanes when a unit returns quota-skip evidence", async () => {
    const called: string[] = [];
    const dispatcher = async (u: WorkUnit) => {
      called.push(u.name);
      if (u.name === "quota-hit") {
        return {
          status: "blocked" as const,
          confidence: 0,
          // Matches the EXACT prefix the dispatcher emits (dispatch-runtime.ts):
          // `skipped: upstream rate limit (${kind})`.
          evidence: ["skipped: upstream rate limit (quota)"],
        };
      }
      return {
        status: "done" as const,
        confidence: 0.9,
        evidence: ["e.log"],
      };
    };
    const reviewer = () => ({ pass: true, reason: "ok" });
    // concurrency 1 → serial. quota-hit triggers abort, should-skip never dispatched.
    const { units, reviews } = await orchestrateUnits({
      units: [unit("quota-hit"), unit("should-skip")],
      dispatcher,
      reviewer,
      concurrency: 1,
    });
    expect(called).toEqual(["quota-hit"]);
    // The skipped unit leaves a sparse hole in the lane arrays; the result must
    // be DENSE (no undefined) so downstream `reviews.map(r => r.unit)` never
    // reads undefined.unit.
    expect(units).toHaveLength(1);
    expect(reviews).toHaveLength(1);
    expect(units.every((u) => u !== undefined)).toBe(true);
    expect(reviews.every((r) => r !== undefined)).toBe(true);
  });
});
