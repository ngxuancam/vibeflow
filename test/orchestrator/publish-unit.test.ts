// test/orchestrator/publish-unit.test.ts
//
// W3: publishUnit commits → pushes (explicit refspec) → opens a PR (queued,
// NEVER merged). Every git/gh call goes through the injected runner — no real
// git/GitHub is touched. Covers every branch for 100% line coverage.

import { describe, expect, test } from "bun:test";
import {
  type PublishRunResult,
  publishSpawn,
  publishUnit,
} from "../../src/orchestrator/publish-unit.js";

const ok: PublishRunResult = { status: 0, stdout: "" };

function recorder() {
  const calls: string[] = [];
  const make =
    (bin: string, out: (args: readonly string[]) => PublishRunResult = () => ok) =>
    (args: readonly string[]) => {
      calls.push(`${bin} ${args.join(" ")}`);
      return out(args);
    };
  return { calls, make };
}

describe("publishUnit", () => {
  test("commits, pushes with explicit refspec, opens PR — and NEVER merges", () => {
    const { calls, make } = recorder();
    const git = make("git");
    const gh = make("gh", () => ({ status: 0, stdout: "https://github.com/x/y/pull/1" }));
    const r = publishUnit({
      unitName: "u1",
      branch: "vibeflow/u1",
      wtPath: "/tmp/wt",
      scope: ["src/a.ts"],
      reviewPassed: true,
      git,
      gh,
    });
    expect(r.published).toBe(true);
    expect(r.prUrl).toBe("https://github.com/x/y/pull/1");
    // explicit refspec push
    expect(calls.some((c) => c === "git push origin HEAD:vibeflow/u1")).toBe(true);
    // staged the exact scope, never `add -A`
    expect(calls.some((c) => c === "git add src/a.ts")).toBe(true);
    expect(calls.every((c) => !c.includes("add -A") && !c.includes("add ."))).toBe(true);
    // opened a PR
    expect(calls.some((c) => c.includes("pr create"))).toBe(true);
    // NEVER merges — no `gh pr merge` / `git merge` command is ever issued.
    // (The PR body legitimately contains the word "auto-merged" in its prose,
    // so assert on the COMMAND shape, not a bare substring.)
    expect(calls.every((c) => !c.startsWith("gh pr merge") && !c.startsWith("git merge"))).toBe(
      true,
    );
  });

  test("no-op when the review did not pass", () => {
    const { calls, make } = recorder();
    const r = publishUnit({
      unitName: "u1",
      branch: "b",
      wtPath: "/tmp/wt",
      scope: ["src/a.ts"],
      reviewPassed: false,
      git: make("git"),
      gh: make("gh"),
    });
    expect(r.published).toBe(false);
    expect(r.reason).toContain("review did not pass");
    expect(calls.length).toBe(0);
  });

  test("no-op when the unit has no scope", () => {
    const { calls, make } = recorder();
    const r = publishUnit({
      unitName: "u1",
      branch: "b",
      wtPath: "/tmp/wt",
      scope: [],
      reviewPassed: true,
      git: make("git"),
      gh: make("gh"),
    });
    expect(r.published).toBe(false);
    expect(r.reason).toContain("no scope");
    expect(calls.length).toBe(0);
  });

  test("stops and reports when git add fails", () => {
    const git = (args: readonly string[]): PublishRunResult =>
      args[0] === "add" ? { status: 1, stdout: "fatal: pathspec" } : ok;
    const r = publishUnit({
      unitName: "u1",
      branch: "b",
      wtPath: "/tmp/wt",
      scope: ["src/a.ts"],
      reviewPassed: true,
      git,
      gh: () => ok,
    });
    expect(r.published).toBe(false);
    expect(r.reason).toContain("git add failed");
  });

  test("stops and reports when git commit fails", () => {
    const git = (args: readonly string[]): PublishRunResult =>
      args[0] === "commit" ? { status: 1, stdout: "nothing to commit" } : ok;
    const r = publishUnit({
      unitName: "u1",
      branch: "b",
      wtPath: "/tmp/wt",
      scope: ["src/a.ts"],
      reviewPassed: true,
      git,
      gh: () => ok,
    });
    expect(r.published).toBe(false);
    expect(r.reason).toContain("git commit failed");
  });

  test("stops and reports when git push fails", () => {
    const git = (args: readonly string[]): PublishRunResult =>
      args[0] === "push" ? { status: 1, stdout: "rejected: non-fast-forward" } : ok;
    const r = publishUnit({
      unitName: "u1",
      branch: "b",
      wtPath: "/tmp/wt",
      scope: ["src/a.ts"],
      reviewPassed: true,
      git,
      gh: () => ok,
    });
    expect(r.published).toBe(false);
    expect(r.reason).toContain("git push failed");
  });

  test("stops and reports when gh pr create fails", () => {
    const r = publishUnit({
      unitName: "u1",
      branch: "b",
      wtPath: "/tmp/wt",
      scope: ["src/a.ts"],
      reviewPassed: true,
      git: () => ok,
      gh: () => ({ status: 1, stdout: "gh: auth required" }),
    });
    expect(r.published).toBe(false);
    expect(r.reason).toContain("gh pr create failed");
  });

  test("uses a custom base branch when provided", () => {
    const { calls, make } = recorder();
    publishUnit({
      unitName: "u1",
      branch: "b",
      wtPath: "/tmp/wt",
      scope: ["src/a.ts"],
      reviewPassed: true,
      base: "develop",
      git: make("git"),
      gh: make("gh", () => ({ status: 0, stdout: "url" })),
    });
    expect(calls.some((c) => c.includes("--base develop"))).toBe(true);
  });

  test("firstLine returns empty string when push output is blank (reason has no tail)", () => {
    const git = (args: readonly string[]): PublishRunResult =>
      args[0] === "push" ? { status: 1, stdout: "\n  \n" } : ok;
    const r = publishUnit({
      unitName: "u1",
      branch: "b",
      wtPath: "/tmp/wt",
      scope: ["src/a.ts"],
      reviewPassed: true,
      git,
      gh: () => ok,
    });
    expect(r.published).toBe(false);
    expect(r.reason).toBe("git push failed: ");
  });

  test("publishSpawn runs a real command, capturing status + stdout", () => {
    const r = publishSpawn("echo", ["publish-spawn-ok"], process.cwd());
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("publish-spawn-ok");
  });

  test("publishSpawn captures a non-zero exit (false → status 1)", () => {
    const r = publishSpawn("false", [], process.cwd());
    expect(r.status).toBe(1);
  });
});
