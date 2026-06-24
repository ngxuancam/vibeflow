import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  COORDINATION_RESULT_CONTRACT,
  type CoordinationBrief,
  type CoordinationResult,
  renderBrief,
} from "../../src/orchestrator/coordination.js";

describe("renderBrief", () => {
  test("required fields only — optional absent → omitted", () => {
    const b: CoordinationBrief = {
      unit: "split-foo",
      goal: "Split foo.ts",
      scope: ["a.ts"],
      acceptance: "bun run check exit 0",
    };
    const out = renderBrief(b);
    expect(out).toContain("Unit: split-foo");
    expect(out).toContain("Goal: Split foo.ts");
    expect(out).toContain("Scope: a.ts");
    expect(out).toContain("Acceptance: bun run check exit 0");
    expect(out).not.toContain("Spec:");
    expect(out).not.toContain("Skills required:");
    expect(out).not.toContain("Fallback:");
  });

  test("all optional fields present → rendered", () => {
    const b: CoordinationBrief = {
      unit: "split-foo",
      goal: "Split foo.ts",
      scope: ["a.ts"],
      spec: "Use extract-method pattern",
      acceptance: "bun run check exit 0",
      skills_required: ["refactor", "testing"],
      fallback: "coordinator takes over",
    };
    const out = renderBrief(b);
    expect(out).toContain("Spec: Use extract-method pattern");
    expect(out).toContain("Skills required: refactor, testing");
    expect(out).toContain("Fallback: coordinator takes over");
  });

  test("scope with multiple files → comma-separated", () => {
    const b: CoordinationBrief = {
      unit: "refactor",
      goal: "Refactor",
      scope: ["a.ts", "b.ts"],
      acceptance: "test pass",
    };
    expect(renderBrief(b)).toContain("Scope: a.ts, b.ts");
  });

  test("spec present, skills+fallback absent → only spec leaks in", () => {
    const b: CoordinationBrief = {
      unit: "u",
      goal: "g",
      scope: ["x.ts"],
      spec: "some spec",
      acceptance: "a",
    };
    const out = renderBrief(b);
    expect(out).toContain("Spec: some spec");
    expect(out).not.toContain("Skills required:");
    expect(out).not.toContain("Fallback:");
  });

  test("skills_required empty array → omitted", () => {
    const b: CoordinationBrief = {
      unit: "u",
      goal: "g",
      scope: ["x.ts"],
      acceptance: "a",
      skills_required: [],
    };
    expect(renderBrief(b)).not.toContain("Skills required:");
  });
});

test("result contract matches dispatch/prompt.ts (no drift)", () => {
  const prompt = readFileSync("src/dispatch/prompt.ts", "utf8");
  expect(prompt).toContain(COORDINATION_RESULT_CONTRACT);
});

test("CoordinationResult type-level: status from UnitOutcome", () => {
  const r: CoordinationResult = {
    unit: "test-unit",
    status: "done",
    confidence: 1.0,
    evidence: ["log.txt"],
    files_changed: ["src/x.ts"],
    commands_run: ["bun test"],
    tests_run: ["test/x.test.ts"],
    uncertainty: "",
  };
  expect(r.status).toBe("done");
  expect(r.confidence).toBe(1.0);
});
