import { describe, expect, mock, test } from "bun:test";
import type { WorkUnit } from "../../src/core/types.js";

describe("demo", () => {
  test("calls writeUnits with DEMO_FILES.length units, each scoped correctly", async () => {
    const { demo, DEMO_FILES } = await import("../../src/commands/demo.js");

    let writtenUnits: WorkUnit[] | null = null;
    const writeUnits = mock((units: WorkUnit[]) => {
      writtenUnits = units;
    });
    const orchestrate = mock(async () => 0);

    const code = await demo({}, { orchestrate, writeUnits });

    expect(writeUnits).toHaveBeenCalledTimes(1);
    const written = writtenUnits as WorkUnit[] | null;
    expect(written).not.toBeNull();
    if (written === null) throw new Error("writtenUnits was null");
    expect(written).toHaveLength(DEMO_FILES.length);

    DEMO_FILES.forEach((f, i) => {
      const u = written[i];
      expect(u).toBeDefined();
      if (!u) throw new Error(`unit ${i} missing`);
      expect(u.scope).toEqual([f]);
      expect(u.name).toMatch(/^split-/);
      expect(u.spec).toContain(f);
    });
  });

  test("calls orchestrate with dry:true and focus:true", async () => {
    const { demo } = await import("../../src/commands/demo.js");

    let capturedFlags: Record<string, string | boolean> | null = null;
    const writeUnits = mock(() => {});
    const orchestrate = mock(async (flags: Record<string, string | boolean>) => {
      capturedFlags = { ...flags };
      return 0;
    });

    await demo({}, { orchestrate, writeUnits });

    expect(orchestrate).toHaveBeenCalledTimes(1);
    const captured = capturedFlags as Record<string, string | boolean> | null;
    if (captured === null) throw new Error("orchestrate flags not captured");
    expect(captured.dry).toBe(true);
    expect(captured.focus).toBe(true);
  });

  test("returns the exit code from orchestrate", async () => {
    const { demo } = await import("../../src/commands/demo.js");

    const writeUnits = mock(() => {});
    const orchestrate = mock(async () => 42);

    const code = await demo({}, { orchestrate, writeUnits });

    expect(code).toBe(42);
  });

  test("unit count matches DEMO_FILES length", async () => {
    const { demo, DEMO_FILES } = await import("../../src/commands/demo.js");

    const writeUnits = mock(() => {});
    const orchestrate = mock(async () => 0);

    await demo({}, { orchestrate, writeUnits });

    expect(DEMO_FILES.length).toBeGreaterThan(0);
    expect(writeUnits).toHaveBeenCalledTimes(1);
  });

  test("defaultWriteUnits persists units to a fresh ledger (no existing state)", async () => {
    const { defaultWriteUnits } = await import("../../src/commands/demo.js");
    const { readState } = await import("../../src/core.js");
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "vf-demo-write-"));
    const prevCwd = process.cwd();
    try {
      process.chdir(dir);
      const units: WorkUnit[] = [
        {
          name: "split-foo",
          status: "pending",
          confidence: 0,
          scope: ["src/foo.ts"],
          spec: "x",
        } as WorkUnit,
      ];
      defaultWriteUnits(units);
      const state = readState(dir);
      expect(state).not.toBeNull();
      expect(state?.work_units.some((u) => u.name === "split-foo")).toBe(true);
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("defaultWriteUnits replaces prior split-* units in an existing ledger (idempotent)", async () => {
    const { defaultWriteUnits } = await import("../../src/commands/demo.js");
    const { readState, writeState } = await import("../../src/core.js");
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "vf-demo-write2-"));
    const prevCwd = process.cwd();
    try {
      process.chdir(dir);
      // Seed an existing ledger with a non-demo unit AND a stale split-* unit.
      const seed = (name: string): WorkUnit =>
        ({
          name,
          status: "pending",
          confidence: 0,
          resources: { tokens: 0, cost_usd: 0, wall_seconds: 0 },
        }) as WorkUnit;
      writeState(dir, {
        task_id: "t",
        goal: "g",
        success_criteria: [],
        work_units: [seed("keep-me"), seed("split-stale")],
        totals: { units: 2, done: 0, tokens: 0, cost_usd: 0, wall_seconds: 0 },
      });
      defaultWriteUnits([
        {
          name: "split-new",
          status: "pending",
          confidence: 0,
          scope: ["src/new.ts"],
          spec: "y",
        } as WorkUnit,
      ]);
      const state = readState(dir);
      const names = (state?.work_units ?? []).map((u) => u.name);
      expect(names).toContain("keep-me"); // non-demo unit preserved
      expect(names).toContain("split-new"); // new demo unit added
      expect(names).not.toContain("split-stale"); // stale split-* dropped
    } finally {
      process.chdir(prevCwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
