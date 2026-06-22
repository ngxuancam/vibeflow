import { describe, expect, test } from "bun:test";
import type { WorkUnit } from "../../src/core.js";
import { orchestrateUnits } from "../../src/orchestrator/run.js";

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
