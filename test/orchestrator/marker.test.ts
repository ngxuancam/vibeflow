import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const TEST_PREFIX = `marker-test-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
const dir = () => join(homedir(), ".vibeflow", "markers");

// Track every unit-name we've created so we can clean up after each test
const created: string[] = [];

async function loadMarker() {
  return await import("../../src/orchestrator/marker");
}

beforeAll(async () => {
  // Ensure marker dir exists
  const { mkdirSync } = await import("node:fs");
  try {
    mkdirSync(dir(), { recursive: true });
  } catch {}
});

afterEach(async () => {
  // Wipe any test marker files we created in this test
  const { cleanupMarker } = await loadMarker();
  for (const unit of created.splice(0)) {
    try {
      cleanupMarker(unit);
    } catch {}
  }
});

afterAll(async () => {
  // Final sweep — in case afterEach skipped a test (e.g. failing test)
  const { cleanupMarker } = await loadMarker();
  for (const unit of created.splice(0)) {
    try {
      cleanupMarker(unit);
    } catch {}
  }
  // Also clean up any stray files matching TEST_PREFIX (in case afterAll
  // missed them due to crashes)
  try {
    const entries = readdirSync(dir());
    for (const e of entries) {
      if (e.startsWith(TEST_PREFIX)) {
        try {
          rmSync(join(dir(), e), { force: true });
        } catch {}
      }
    }
  } catch {}
});

function unit(name: string): string {
  const u = `${TEST_PREFIX}-${name}`;
  created.push(u);
  return u;
}

describe("markerDir", () => {
  test("creates the directory if it doesn't exist", async () => {
    const { markerDir } = await loadMarker();
    const d = markerDir();
    expect(existsSync(d)).toBe(true);
    expect(d).toContain(".vibeflow/markers");
  });
});

describe("createMarker", () => {
  test("writes a pending marker to disk and returns it", async () => {
    const { createMarker } = await loadMarker();
    const u = unit("create-a");
    const marker = createMarker(u);
    expect(marker.unit).toBe(u);
    expect(marker.status).toBe("pending");
    expect(marker.confidence).toBe(0);
    expect(marker.evidence).toEqual([]);
    expect(marker.agent).toBeUndefined();
    expect(marker.exitCode).toBeUndefined();
    const file = join(dir(), `${u}.json`);
    expect(existsSync(file)).toBe(true);
    const onDisk = JSON.parse(readFileSync(file, "utf8"));
    expect(onDisk.unit).toBe(u);
  });

  test("accepts an optional agent name", async () => {
    const { createMarker, readMarker } = await loadMarker();
    const u = unit("create-b");
    createMarker(u, "claude");
    const marker = readMarker(u);
    expect(marker?.agent).toBe("claude");
  });
});

describe("updateMarker", () => {
  test("merges fields and de-duplicates evidence", async () => {
    const { createMarker, updateMarker } = await loadMarker();
    const u = unit("update-a");
    createMarker(u);
    const updated = updateMarker(u, {
      status: "running",
      confidence: 0.5,
      evidence: ["/tmp/a", "/tmp/b"],
    });
    expect(updated?.status).toBe("running");
    expect(updated?.confidence).toBe(0.5);
    expect(updated?.evidence).toEqual(["/tmp/a", "/tmp/b"]);
    const again = updateMarker(u, { evidence: ["/tmp/b", "/tmp/c"] });
    expect(again?.evidence).toEqual(["/tmp/a", "/tmp/b", "/tmp/c"]);
  });

  test("returns null when the marker does not exist", async () => {
    const { updateMarker } = await loadMarker();
    unit("update-nope"); // mark for cleanup
    const result = updateMarker(`${TEST_PREFIX}-update-nope-xyz`, {
      confidence: 0.5,
    });
    expect(result).toBeNull();
  });

  test("preserves existing evidence when update omits the field", async () => {
    const { createMarker, updateMarker } = await loadMarker();
    const u = unit("update-b");
    createMarker(u);
    updateMarker(u, { evidence: ["/keep/me"] });
    const again = updateMarker(u, { confidence: 0.9 });
    expect(again?.evidence).toEqual(["/keep/me"]);
  });
});

describe("readMarker", () => {
  test("returns null for a missing marker", async () => {
    const { readMarker } = await loadMarker();
    unit("read-missing"); // mark for cleanup
    expect(readMarker(`${TEST_PREFIX}-read-missing-xyz`)).toBeNull();
  });

  test("returns the marker when fresh", async () => {
    const { createMarker, readMarker } = await loadMarker();
    const u = unit("read-a");
    createMarker(u);
    const m = readMarker(u);
    expect(m).not.toBeNull();
    expect(m?.unit).toBe(u);
  });

  test("returns null and removes the marker when past TTL", async () => {
    const { createMarker, readMarker } = await loadMarker();
    const u = unit("read-b");
    createMarker(u);
    const file = join(dir(), `${u}.json`);
    const old = JSON.parse(readFileSync(file, "utf8"));
    old.startedAt = Date.now() - 5 * 60 * 60 * 1000; // 5 hours ago
    writeFileSync(file, JSON.stringify(old));
    const result = readMarker(u);
    expect(result).toBeNull();
    expect(existsSync(file)).toBe(false);
  });

  test("returns null for a corrupt marker file", async () => {
    const { createMarker, readMarker } = await loadMarker();
    const u = unit("read-c");
    createMarker(u);
    const file = join(dir(), `${u}.json`);
    writeFileSync(file, "not json");
    expect(readMarker(u)).toBeNull();
  });

  test("listMarkers: corrupt marker file is skipped (line 98 catch)", async () => {
    // Write a corrupt .json file directly to the marker dir. The
    // listMarkers readFileSync/JSON.parse catch fires and the file
    // is silently skipped.
    const { listMarkers, cleanupMarker } = await loadMarker();
    const { existsSync, readdirSync, rmSync, unlinkSync } = await import("node:fs");
    const file = join(dir(), "list-corrupt-marker.json");
    // Make sure the file is gone first
    if (existsSync(file)) rmSync(file);
    writeFileSync(file, "{not valid json");
    // Sanity: the file is in the dir
    expect(readdirSync(dir()).some((e) => e === "list-corrupt-marker.json")).toBe(true);
    try {
      const all = listMarkers();
      // The corrupt file is skipped, not thrown
      expect(Array.isArray(all)).toBe(true);
    } finally {
      // Clean up so other tests don't see this corrupt file
      try {
        unlinkSync(file);
      } catch {}
      cleanupMarker("list-corrupt-marker");
    }
  });
});

describe("listMarkers", () => {
  test("filters to our test prefix (not the full global set)", async () => {
    const { createMarker, listMarkers } = await loadMarker();
    const u1 = unit("list-a");
    const u2 = unit("list-b");
    const u3 = unit("list-c");
    createMarker(u1);
    createMarker(u2);
    createMarker(u3);
    const all = listMarkers();
    const ours = all.filter((m) => m.unit.startsWith(TEST_PREFIX));
    expect(ours.length).toBe(3);
  });

  test("returns non-expired markers sorted by updatedAt desc", async () => {
    // Other tests in the same file (and concurrent runs) may share the
    // global TEST_PREFIX. We can't rely on absolute position. The
    // minimal invariant we test: u1 is updated AFTER u2 and u3, and
    // among OUR three test units u1 should come before u2 and u3.
    const { createMarker, listMarkers, updateMarker } = await loadMarker();
    const u1 = unit("sort-a");
    const u2 = unit("sort-b");
    const u3 = unit("sort-c");
    createMarker(u1);
    await new Promise((r) => setTimeout(r, 5));
    createMarker(u2);
    await new Promise((r) => setTimeout(r, 5));
    createMarker(u3);
    // u1 gets the latest updatedAt (after all creates). Sleep enough
    // that u1's updatedAt is strictly greater than any other TEST_PREFIX
    // marker that other tests may create in parallel.
    await new Promise((r) => setTimeout(r, 20));
    updateMarker(u1, { status: "done" });
    const all = listMarkers().filter((m) => m.unit.startsWith(TEST_PREFIX));
    const units = all.map((m) => m.unit);
    const i1 = units.indexOf(u1);
    const i2 = units.indexOf(u2);
    const i3 = units.indexOf(u3);
    expect(i1).toBeGreaterThanOrEqual(0);
    // u1 must come before u2 and u3 (in absolute position) because
    // it's the newest marker with our prefix — there's no other test
    // marker that could have a more recent updatedAt.
    expect(i1).toBeLessThan(i2);
    expect(i1).toBeLessThan(i3);
  });

  test("skips non-json files (locks) and corrupt files silently", async () => {
    const { createMarker, listMarkers } = await loadMarker();
    const u = unit("skip");
    createMarker(u);
    writeFileSync(join(dir(), `${u}.lock`), "{}");
    writeFileSync(join(dir(), `${u}.corrupt.json`), "not json");
    const all = listMarkers().filter((m) => m.unit === u);
    expect(all.length).toBe(1);
    expect(all[0]?.unit).toBe(u);
  });
});

describe("cleanupMarker", () => {
  test("removes both the marker file and the lock file", async () => {
    const { createMarker, cleanupMarker, tryLock } = await loadMarker();
    const u = unit("cleanup");
    createMarker(u);
    tryLock(u);
    const file = join(dir(), `${u}.json`);
    const lock = join(dir(), `${u}.lock`);
    expect(existsSync(file)).toBe(true);
    expect(existsSync(lock)).toBe(true);
    cleanupMarker(u);
    expect(existsSync(file)).toBe(false);
    expect(existsSync(lock)).toBe(false);
  });

  test("is a no-op when neither file exists", async () => {
    const { cleanupMarker } = await loadMarker();
    unit("cleanup-noop");
    cleanupMarker(`${TEST_PREFIX}-cleanup-noop-xyz`);
  });
});

describe("tryLock / releaseLock", () => {
  test("tryLock returns true on first call, false on second (lock alive)", async () => {
    const { tryLock, releaseLock } = await loadMarker();
    const u = unit("lock-a");
    expect(tryLock(u)).toBe(true);
    expect(tryLock(u)).toBe(false);
    releaseLock(u);
    expect(tryLock(u)).toBe(true);
    releaseLock(u);
  });

  test("tryLock returns false when the lock file is corrupt JSON", async () => {
    const { tryLock, releaseLock } = await loadMarker();
    const u = unit("lock-corrupt");
    writeFileSync(join(dir(), `${u}.lock`), "not json");
    expect(tryLock(u)).toBe(false);
    releaseLock(u);
  });

  test("tryLock respects a live process: writes lock and refuses re-entry", async () => {
    // Live process (current process) holds the lock — tryLock must not
    // steal it. We use process.pid which isProcessAlive() can signal.
    const { tryLock, releaseLock, markerDir } = await loadMarker();
    const u = unit("lock-live");
    // Pre-seed a lock with our own PID so isProcessAlive returns true
    writeFileSync(
      join(markerDir(), `${u}.lock`),
      JSON.stringify({ pid: process.pid, ts: Date.now() }),
    );
    // Since we are alive and the lock is fresh, tryLock must refuse
    expect(tryLock(u)).toBe(false);
    releaseLock(u);
  });

  test("tryLock steals the lock when the previous process is dead (stale PID)", async () => {
    const { tryLock, releaseLock } = await loadMarker();
    const u = unit("lock-stale");
    writeFileSync(join(dir(), `${u}.lock`), JSON.stringify({ pid: 99999999, ts: Date.now() }));
    expect(tryLock(u)).toBe(true);
    releaseLock(u);
  });

  test("tryLock steals the lock when the previous process is dead (stale PID)", async () => {
    const { tryLock, releaseLock } = await loadMarker();
    const u = unit("lock-stale");
    writeFileSync(join(dir(), `${u}.lock`), JSON.stringify({ pid: 99999999, ts: Date.now() }));
    expect(tryLock(u)).toBe(true);
    releaseLock(u);
  });

  test("tryLock steals the lock when data.pid is missing (legacy lock without pid)", async () => {
    const { tryLock, releaseLock } = await loadMarker();
    const u = unit("lock-no-pid");
    // Lock with no `pid` field at all. The `data.pid && ...` check short-
    // circuits to false, so tryLock proceeds (steals) the lock.
    writeFileSync(join(dir(), `${u}.lock`), JSON.stringify({ ts: Date.now() }));
    expect(tryLock(u)).toBe(true);
    releaseLock(u);
  });

  test("tryLock steals the lock when the lock is older than TTL", async () => {
    const { tryLock, releaseLock } = await loadMarker();
    const u = unit("lock-old");
    writeFileSync(
      join(dir(), `${u}.lock`),
      JSON.stringify({ pid: process.pid, ts: Date.now() - 5 * 60 * 60 * 1000 }),
    );
    expect(tryLock(u)).toBe(true);
    releaseLock(u);
  });
});
