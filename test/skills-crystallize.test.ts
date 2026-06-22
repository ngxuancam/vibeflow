// test/skills-crystallize.test.ts
//
// issue #179: mechanical pattern extraction for `vf skill crystallize`. The
// extractor is pure — driven here with literal line arrays (no I/O, no LLM).

import { describe, expect, test } from "bun:test";
import {
  type CrystallizeInput,
  crystallize,
  draftSkillName,
  renderDraft,
} from "../src/skills/crystallize.js";

function input(over: Partial<CrystallizeInput> = {}): CrystallizeInput {
  return { runId: "run-1", logLines: [], journalLines: [], ...over };
}

describe("crystallize", () => {
  test("no patterns → hasPatterns false, empty draft", () => {
    const r = crystallize(input({ logLines: ["$ ls", "nothing repeats here"] }));
    expect(r.hasPatterns).toBe(false);
    expect(r.draft).toBe("");
    expect(r.patterns).toEqual([]);
  });

  test("a command invoked 3+ times crosses the threshold", () => {
    const r = crystallize(
      input({
        logLines: ['$ git commit -m "a"', '$ git commit -m "b"', '$ git commit -m "c"'],
      }),
    );
    expect(r.hasPatterns).toBe(true);
    const cmd = r.patterns.find((p) => p.kind === "command");
    expect(cmd?.value).toBe("git commit");
    expect(cmd?.count).toBe(3);
    expect(r.draft).toContain("## Repeated commands");
    expect(r.draft).toContain("`git commit` — invoked 3×");
  });

  test("a command invoked only twice does NOT cross the threshold", () => {
    const r = crystallize(input({ logLines: ["$ bun test", "$ bun test"] }));
    expect(r.patterns.some((p) => p.kind === "command")).toBe(false);
  });

  test("a skill referenced 5+ times crosses the threshold", () => {
    const lines = Array.from({ length: 5 }, (_, i) => `[${i}] skill: dogfood applied`);
    const r = crystallize(input({ journalLines: lines }));
    expect(r.hasPatterns).toBe(true);
    const sk = r.patterns.find((p) => p.kind === "skill");
    expect(sk?.value).toBe("dogfood");
    expect(sk?.count).toBe(5);
    expect(r.draft).toContain("## Skills leaned on");
  });

  test("a skill referenced only 4 times does NOT cross", () => {
    const lines = Array.from({ length: 4 }, () => "skill: almost");
    const r = crystallize(input({ journalLines: lines }));
    expect(r.patterns.some((p) => p.kind === "skill")).toBe(false);
  });

  test("a failure mode hit 2+ times crosses the threshold", () => {
    const r = crystallize(
      input({
        logLines: [
          "ERROR: connect timeout to upstream host",
          "ERROR: connect timeout to upstream host",
        ],
      }),
    );
    expect(r.hasPatterns).toBe(true);
    const f = r.patterns.find((p) => p.kind === "failure");
    expect(f?.count).toBe(2);
    expect(r.draft).toContain("## Failure modes hit");
  });

  test("failure signatures collapse to the first 6 words (variable tails merge)", () => {
    // Same first-6-words, different tails → same bucket.
    const r = crystallize(
      input({
        logLines: [
          "ERROR: build failed in module foo bar /path/a.ts:10",
          "ERROR: build failed in module foo bar /path/b.ts:99",
        ],
      }),
    );
    const f = r.patterns.find((p) => p.kind === "failure");
    expect(f?.value).toBe("build failed in module foo bar");
    expect(f?.count).toBe(2);
  });

  test("acceptance: 3+ identical log lines + 2+ journal entries of the same shape → non-empty body", () => {
    const r = crystallize(
      input({
        logLines: ["$ vf verify", "$ vf verify", "$ vf verify"],
        journalLines: ["✗ coverage gate under 100 percent", "✗ coverage gate under 100 percent"],
      }),
    );
    expect(r.hasPatterns).toBe(true);
    expect(r.draft.length).toBeGreaterThan(0);
    expect(r.draft).toContain("`vf verify` — invoked 3×");
    expect(r.draft).toContain("## Failure modes hit");
    // valid frontmatter so discoverSkills would accept the draft
    expect(r.draft.startsWith("---\nname: crystallized-run-1")).toBe(true);
  });

  test("patterns are sorted most-frequent first, value tie-break", () => {
    const r = crystallize(
      input({
        logLines: [
          "$ a x",
          "$ a x",
          "$ a x",
          "$ a x", // a x ×4
          "$ b y",
          "$ b y",
          "$ b y", // b y ×3
        ],
      }),
    );
    const cmds = r.patterns.filter((p) => p.kind === "command");
    expect(cmds[0]?.value).toBe("a x");
    expect(cmds[1]?.value).toBe("b y");
  });

  test("extractCommand handles a bracketed run prefix", () => {
    const r = crystallize(
      input({ logLines: ["[run] $ make build", "[run] $ make build", "[run] $ make build"] }),
    );
    expect(r.patterns.find((p) => p.kind === "command")?.value).toBe("make build");
  });

  test("a line with a prompt but no command after it is ignored", () => {
    // "$ " with only whitespace after → no command extracted.
    const r = crystallize(input({ logLines: ["$ ", "$ ", "$ "] }));
    expect(r.patterns.some((p) => p.kind === "command")).toBe(false);
  });
});

describe("draftSkillName", () => {
  test("slugifies a run id", () => {
    expect(draftSkillName("Run #42 / Batch.2")).toBe("crystallized-run-42-batch-2");
  });

  test("falls back to 'run' for an all-symbol id", () => {
    expect(draftSkillName("///")).toBe("crystallized-run");
  });
});

describe("renderDraft", () => {
  test("renders only the sections that have patterns", () => {
    const draft = renderDraft("r", "crystallized-r", [{ kind: "skill", value: "x", count: 9 }]);
    expect(draft).toContain("## Skills leaned on");
    expect(draft).not.toContain("## Repeated commands");
    expect(draft).not.toContain("## Failure modes hit");
    // always includes the safety scaffolding
    expect(draft).toContain("## When NOT to use");
    expect(draft).toContain("DRAFT");
  });
});
