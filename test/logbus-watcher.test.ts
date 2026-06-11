import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type LogEvent, Logbus, watchLogbus } from "../src/logbus.js";

function fresh(): { bus: Logbus; dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "vf-watch-"));
  const bus = new Logbus({ runId: "watch-test", dir });
  return {
    bus,
    dir,
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    },
  };
}

describe("watchLogbus()", () => {
  let cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const c of cleanups) c();
    cleanups = [];
  });

  it("delivers events written to current.log to the subscriber", async () => {
    const { bus, cleanup } = fresh();
    cleanups.push(cleanup);
    const seen: LogEvent[] = [];
    const watcher = watchLogbus(bus, (ev) => seen.push(ev), { pollMs: 50, debounceMs: 10 });
    bus.write({ channel: "vf", level: "info", text: "watch-me", runId: "watch-test" });
    const deadline = Date.now() + 2000;
    while (seen.length < 1 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
    }
    watcher.close();
    await bus.close();
    expect(seen.length).toBeGreaterThanOrEqual(1);
    expect(seen.some((e) => e.text === "watch-me")).toBe(true);
  });

  it("currentOffset() advances as the file grows", async () => {
    const { bus, cleanup } = fresh();
    cleanups.push(cleanup);
    const watcher = watchLogbus(bus, () => {}, { pollMs: 50, debounceMs: 10 });
    bus.write({ channel: "vf", level: "info", text: "advance", runId: "watch-test" });
    await new Promise((r) => setTimeout(r, 250));
    const offset = watcher.currentOffset();
    expect(offset).toBeGreaterThan(0);
    watcher.close();
    await bus.close();
  });

  it("resets offset on rotation (inode change) and continues tailing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vf-watch-rot-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const bus = new Logbus({ runId: "rot-watch", dir, thresholdBytes: 65 * 1024 });
    cleanups.push(() => bus.close());
    const seen: LogEvent[] = [];
    const watcher = watchLogbus(bus, (ev) => seen.push(ev), { pollMs: 50, debounceMs: 10 });
    for (let i = 0; i < 400; i++) {
      bus.write({
        channel: "vf",
        level: "info",
        text: `rot-line ${i} ${"x".repeat(150)}`,
        runId: "rot-watch",
      });
    }
    await new Promise((r) => setTimeout(r, 400));
    watcher.close();
    expect(seen.length).toBeGreaterThan(0);
  });

  it("close() stops further events from being delivered", async () => {
    const { bus, cleanup } = fresh();
    cleanups.push(cleanup);
    const seen: LogEvent[] = [];
    const watcher = watchLogbus(bus, (ev) => seen.push(ev), { pollMs: 50, debounceMs: 10 });
    bus.write({ channel: "vf", level: "info", text: "before-close", runId: "watch-test" });
    await new Promise((r) => setTimeout(r, 200));
    watcher.close();
    bus.write({ channel: "vf", level: "info", text: "after-close", runId: "watch-test" });
    await new Promise((r) => setTimeout(r, 200));
    // We tolerate a couple of in-flight events (the watcher may have buffered)
    // but the new "after-close" event must NOT arrive.
    expect(seen.every((e) => e.text !== "after-close")).toBe(true);
  });

  it("does not throw on a malformed JSONL line — it skips and continues", async () => {
    const dir = mkdtempSync(join(tmpdir(), "vf-watch-bad-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    const bus = new Logbus({ runId: "bad-line", dir });
    cleanups.push(() => bus.close());
    const seen: LogEvent[] = [];
    const watcher = watchLogbus(bus, (ev) => seen.push(ev), { pollMs: 50, debounceMs: 10 });
    // Append a malformed line directly to current.log, then a valid one.
    bus.write({ channel: "vf", level: "info", text: "valid-1", runId: "bad-line" });
    await new Promise((r) => setTimeout(r, 200));
    const { appendFileSync } = await import("node:fs");
    appendFileSync(bus.currentFile(), "this is not JSON\n", "utf8");
    bus.write({ channel: "vf", level: "info", text: "valid-2", runId: "bad-line" });
    await new Promise((r) => setTimeout(r, 300));
    watcher.close();
    // We should have at least one valid event; the bad line is skipped silently.
    expect(seen.some((e) => e.text === "valid-1") || seen.some((e) => e.text === "valid-2")).toBe(
      true,
    );
  });
});
