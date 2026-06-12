import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { printHelp } from "../src/commands.js";

const SKILL_SUBS = ["list", "search", "resolve", "validate", "sync", "verify-sync", "import"];

describe("help text", () => {
  test("printHelp() returns 0 (smoke check that the function runs)", () => {
    // printHelp writes via out()/logbus. Capture is complex; assert it doesn't throw.
    expect(printHelp()).toBe(0);
  });

  test("src/commands.ts skills help block mentions every skills subcommand", () => {
    const src = readFileSync(join(import.meta.dir, "..", "src/commands.ts"), "utf8");
    // The per-command help block starts with the `vf skills` line and
    // ends before the next command block.
    const skillsBlock = src.match(/skills: \(\) =>\n([\s\S]*?)\n\n {2}tools:/);
    expect(skillsBlock).not.toBeNull();
    const block = skillsBlock ? skillsBlock[1] : "";
    for (const sub of SKILL_SUBS) {
      expect(block).toContain(sub);
    }
  });

  test("src/commands.ts global help line (around line 2630) mentions validate/sync/verify-sync/import", () => {
    const src = readFileSync(join(import.meta.dir, "..", "src/commands.ts"), "utf8");
    const line = src.match(/skills \[sub\][^\n]*/);
    expect(line).not.toBeNull();
    for (const sub of ["list", "search", "resolve", "validate", "sync", "verify-sync", "import"]) {
      expect(line?.[0] ?? "").toContain(sub);
    }
  });
});
