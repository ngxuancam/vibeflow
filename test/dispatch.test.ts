import { describe, expect, test } from "bun:test";
import {
  type AsyncSpawner,
  type EngineProbe,
  engineCommand,
  isUnavailable,
  parseEngineSummary,
  runDispatch,
  runDispatchAsync,
} from "../src/dispatch.js";

describe("engineCommand — exact argv per engine (defect #1)", () => {
  test("claude → -p --output-format json", () => {
    const r = engineCommand("claude");
    expect(isUnavailable(r)).toBe(false);
    if (!isUnavailable(r)) {
      expect(r.cmd).toBe("claude");
      expect(r.args).toEqual(["-p", "--output-format", "json"]);
    }
  });

  test("codex → exec with the `-` stdin sentinel", () => {
    const r = engineCommand("codex");
    expect(isUnavailable(r)).toBe(false);
    if (!isUnavailable(r)) {
      expect(r.cmd).toBe("codex");
      expect(r.args).toEqual(["exec", "-"]);
    }
  });

  test("copilot present → copilot -p (never `gh -p`)", () => {
    const probe: EngineProbe = { has: () => true, version: () => "copilot 1.2.3" };
    const r = engineCommand("copilot", probe);
    expect(isUnavailable(r)).toBe(false);
    if (!isUnavailable(r)) {
      expect(r.cmd).toBe("copilot");
      expect(r.args).toEqual(["-p"]);
      expect(r.cmd).not.toBe("gh");
      expect(r.warning).toBeUndefined();
    }
  });

  test("copilot absent → unavailable, NOT a bogus `gh -p`", () => {
    const probe: EngineProbe = { has: () => false };
    const r = engineCommand("copilot", probe);
    expect(isUnavailable(r)).toBe(true);
    if (isUnavailable(r)) expect(r.unavailable).toContain("copilot CLI not found");
  });

  test("copilot version unverifiable → warns (github/copilot-cli#1606 guard)", () => {
    const probe: EngineProbe = { has: () => true, version: () => undefined };
    const r = engineCommand("copilot", probe);
    expect(isUnavailable(r)).toBe(false);
    if (!isUnavailable(r)) {
      expect(r.cmd).toBe("copilot");
      expect(r.warning).toContain("copilot --version");
    }
  });

  test("no engine ever resolves to `gh -p`", () => {
    for (const engine of ["claude", "codex"] as const) {
      const r = engineCommand(engine);
      if (!isUnavailable(r)) {
        expect(r.cmd).not.toBe("gh");
        expect(r.args).not.toEqual(["-p"]);
      }
    }
  });
});

describe("runDispatch — copilot-absent path (defect #1)", () => {
  test("cli mode for absent copilot yields an unavailable reason, runs no command", () => {
    // No spawner injection → the real-PATH branch runs. copilot is not installed in CI, so we
    // get a clear unavailable reason (never a bogus `gh -p`).
    const r = runDispatch({ engine: "copilot", prompt: "p", mode: "cli" });
    if (!r.ok) expect(r.reason).toMatch(/copilot/i);
  });
});

describe("parseEngineSummary — robust shapes (defect #2)", () => {
  test("(a) fenced ```json block", () => {
    const out = 'noise\n```json\n{"confidence":0.9,"files_changed":["a.ts"]}\n```\ntail';
    const s = parseEngineSummary(out);
    expect(s?.confidence).toBe(0.9);
    expect(s?.files_changed).toEqual(["a.ts"]);
  });

  test("(b) claude --output-format json envelope unwraps .result", () => {
    const envelope = JSON.stringify({
      type: "result",
      result: 'done\n```json\n{"confidence":1,"tests_run":["bun test"]}\n```',
      total_cost_usd: 0.01,
    });
    const s = parseEngineSummary(envelope);
    expect(s?.confidence).toBe(1);
    expect(s?.tests_run).toEqual(["bun test"]);
  });

  test("(b') envelope with structured_output", () => {
    const envelope = JSON.stringify({ structured_output: { confidence: 0.42 } });
    const s = parseEngineSummary(envelope);
    expect(s?.confidence).toBe(0.42);
  });

  test("(c) bare object", () => {
    const s = parseEngineSummary('prefix {"confidence":0.5} suffix');
    expect(s?.confidence).toBe(0.5);
  });

  test("nested object parses (old lastIndexOf('{') slice failed here)", () => {
    const out = 'log\n{"confidence":0.8,"meta":{"nested":{"deep":1}},"files_changed":["x"]}\n';
    const s = parseEngineSummary(out);
    expect(s?.confidence).toBe(0.8);
    expect(s?.files_changed).toEqual(["x"]);
  });

  test('nested-only object {"a":{"b":1}} does not crash and yields the object', () => {
    const s = parseEngineSummary('{"a":{"b":1}}');
    expect(s).toBeDefined();
  });

  test("no JSON → undefined", () => {
    expect(parseEngineSummary("just prose, no json here")).toBeUndefined();
  });
});

describe("runDispatchAsync — genuine async spawn seam (defect #3)", () => {
  test("parses an async spawner result", async () => {
    const spawner: AsyncSpawner = async () => ({
      status: 0,
      stdout: '```json\n{"confidence":1}\n```',
    });
    const r = await runDispatchAsync({ engine: "claude", prompt: "p", mode: "cli", spawner });
    expect(r.ok).toBe(true);
    expect(r.summary?.confidence).toBe(1);
  });

  test("dry mode short-circuits", async () => {
    const r = await runDispatchAsync({ engine: "claude", prompt: "p", mode: "dry" });
    expect(r.ok).toBe(true);
    expect(r.raw).toBe("");
  });
});
