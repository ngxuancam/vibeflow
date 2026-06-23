import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { makeWorktreeOps } from "../../src/commands/dispatch-runtime.js";

const HAS_BASH = process.platform !== "win32";

describe("makeWorktreeOps real-git integration (F1 lock-in)", () => {
  test.skipIf(!HAS_BASH)("create makes a real worktree off HEAD, remove deletes it", () => {
    const wt = makeWorktreeOps();
    const branch = `vf-test-iso-${Date.now()}`;
    let path: string | undefined;
    try {
      // base = "HEAD" (a git ref) — the F1 contract: base MUST be a commit-ish,
      // NOT a directory. The shell script runs `git worktree add -b <branch> <path> <base>`.
      path = wt.create(branch, "HEAD");
      // biome-ignore lint/style/noNonNullAssertion: assigned above, narrowed by try/catch
      expect(existsSync(path!)).toBe(true);
    } finally {
      if (path) {
        wt.remove(path);
        // `git worktree remove` cleans the worktree admin entry but leaves the branch.
        try {
          execFileSync("git", ["branch", "-D", branch], { cwd: process.cwd() });
        } catch {
          /* best-effort: branch may already be gone */
        }
      }
    }
    // after cleanup: worktree dir gone, branch deleted
    if (path) expect(existsSync(path)).toBe(false);
  });
});
