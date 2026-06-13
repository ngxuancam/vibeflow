import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { replayFromLog } from "../src/server.js";

describe("replayFromLog (test seam)", () => {
  let dir: string;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  test("returns [] when file does not exist (line 170-171)", () => {
    dir = mkdtempSync(join(tmpdir(), "vf-replay-"));
    const fakeFile = join(dir, "does-not-exist.log");
    expect(replayFromLog(fakeFile, 0, 100)).toEqual([]);
  });

  test("returns [] when file is empty (line 173-174)", () => {
    dir = mkdtempSync(join(tmpdir(), "vf-replay-"));
    const logFile = join(dir, "empty.log");
    writeFileSync(logFile, "");
    expect(replayFromLog(logFile, 0, 100)).toEqual([]);
  });

  test("reads small files directly (line 189-191, <2MB path)", () => {
    dir = mkdtempSync(join(tmpdir(), "vf-replay-"));
    const logFile = join(dir, "small.log");
    const lines = [
      JSON.stringify({ seq: 1, ts: 1, kind: "log", level: "info", text: "hello" }),
      JSON.stringify({ seq: 2, ts: 2, kind: "log", level: "info", text: "world" }),
    ];
    writeFileSync(logFile, lines.join("\n"));
    const events = replayFromLog(logFile, 0, 100);
    expect(events).toHaveLength(2);
    expect(events[0]?.text).toBe("hello");
  });

  test("reads large files via tail (line 177-188, >2MB path)", () => {
    dir = mkdtempSync(join(tmpdir(), "vf-replay-"));
    const logFile = join(dir, "large.log");
    // Create a file just over MAX_READ (2 * 1024 * 1024 = 2097152)
    // Write a small JSON line first, then 2.5MB of padding, then
    // a known-tail marker line. The replay should return events
    // found in the last 2MB (including the marker).
    const MAX_READ = 2 * 1024 * 1024;
    const padding = "x".repeat(MAX_READ + 1024);
    const marker = JSON.stringify({
      seq: 999,
      ts: 999,
      kind: "log",
      level: "info",
      text: "tail-marker",
    });
    const head = JSON.stringify({
      seq: 1,
      ts: 1,
      kind: "log",
      level: "info",
      text: "old-head",
    });
    writeFileSync(logFile, `${head}\n${padding}\n${marker}\n`);
    const events = replayFromLog(logFile, 0, 100);
    // The "old-head" line is in the head, which is discarded by the
    // tail-trim (line 187: indexOf("\n") + 1). The marker line
    // should be the first event returned.
    expect(events.length).toBeGreaterThan(0);
    expect(events[events.length - 1]?.text).toBe("tail-marker");
  });

  test("skips invalid JSON lines (line 194-196)", () => {
    dir = mkdtempSync(join(tmpdir(), "vf-replay-"));
    const logFile = join(dir, "mixed.log");
    const lines = [
      "not-json",
      JSON.stringify({
        seq: 1,
        ts: 1,
        kind: "log",
        level: "info",
        text: "valid",
      }),
      "{broken",
      JSON.stringify({
        seq: 2,
        ts: 2,
        kind: "log",
        level: "info",
        text: "also-valid",
      }),
    ];
    writeFileSync(logFile, lines.join("\n"));
    const events = replayFromLog(logFile, 0, 100);
    expect(events).toHaveLength(2);
    expect(events[0]?.text).toBe("valid");
    expect(events[1]?.text).toBe("also-valid");
  });
});
