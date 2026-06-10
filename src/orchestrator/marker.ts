import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/**
 * Marker-based progress tracking for vf subagent dispatch.
 *
 * Inspired by `.copilot/tools/_tentacle_core.py` marker protocol but fully
 * independent — vf uses its own marker directory (`~/.viteflow/markers/`).
 * CLI and web UI share the same marker files for real-time progress.
 *
 * Each marker is a lightweight JSON file:
 * - `{name}` → marker payload (unit name, status, timestamps)
 * - `{name}.lock` → advisory file lock (fcntl-style)
 *
 * Marker lifecycle:
 * 1. `createMarker()` — written when unit dispatch starts
 * 2. `updateMarker()` — updated periodically with progress
 * 3. `resolveMarker()` — written on completion (success/failure)
 * 4. `cleanupMarker()` — auto-removes after TTL (4h default)
 */

export type MarkerStatus = "pending" | "running" | "done" | "failed" | "blocked";

export interface DispatchMarker {
  /** Work unit name (matches vf units name). */
  unit: string;
  status: MarkerStatus;
  /** Unix epoch millis when the marker was created. */
  startedAt: number;
  /** Unix epoch millis of last update. */
  updatedAt: number;
  /** Current confidence (0-1). Updated by the review phase. */
  confidence: number;
  /** Latest evidence strings appended during dispatch. */
  evidence: string[];
  /** Optional agent/engine identifier for debugging. */
  agent?: string;
  /** Exit code (only meaningful for done/failed). */
  exitCode?: number;
}

const MARKER_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

/** Canonical marker directory — persisted across CLI invocations. */
export function markerDir(): string {
  const dir = join(homedir(), ".viteflow", "markers");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function markerPath(unitName: string): string {
  return join(markerDir(), `${unitName}.json`);
}

function lockPath(unitName: string): string {
  return join(markerDir(), `${unitName}.lock`);
}

/** Create a dispatch marker for a work unit (idempotent — overwrites stale). */
export function createMarker(unit: string, agent?: string): DispatchMarker {
  const marker: DispatchMarker = {
    unit,
    status: "pending",
    startedAt: Date.now(),
    updatedAt: Date.now(),
    confidence: 0,
    evidence: [],
    agent,
  };
  writeFileSync(markerPath(unit), JSON.stringify(marker, null, 2));
  return marker;
}

/** Update an existing marker with new status/confidence/evidence. */
export function updateMarker(
  unit: string,
  update: Partial<Pick<DispatchMarker, "status" | "confidence" | "evidence" | "exitCode">>,
): DispatchMarker | null {
  const path = markerPath(unit);
  if (!existsSync(path)) return null;
  const current: DispatchMarker = JSON.parse(readFileSync(path, "utf8"));
  const marker: DispatchMarker = {
    ...current,
    ...update,
    updatedAt: Date.now(),
    evidence: update.evidence
      ? [...new Set([...current.evidence, ...update.evidence])]
      : current.evidence,
  };
  if (update.status) marker.status = update.status;
  if (update.confidence !== undefined) marker.confidence = update.confidence;
  if (update.exitCode !== undefined) marker.exitCode = update.exitCode;
  writeFileSync(path, JSON.stringify(marker, null, 2));
  return marker;
}

/** Read a marker (returns null if missing or expired). */
export function readMarker(unit: string): DispatchMarker | null {
  const path = markerPath(unit);
  if (!existsSync(path)) return null;
  try {
    const marker: DispatchMarker = JSON.parse(readFileSync(path, "utf8"));
    if (Date.now() - marker.startedAt > MARKER_TTL_MS) {
      // Stale — remove it
      try { unlinkSync(path); } catch { /* race with other reader */ }
      return null;
    }
    return marker;
  } catch {
    return null;
  }
}

/** List all active markers (units currently or recently dispatched). */
export function listMarkers(): DispatchMarker[] {
  const markers: DispatchMarker[] = [];
  const dir = markerDir();
  let entries: string[];
  try {
    entries = require("node:fs").readdirSync(dir);
  } catch {
    return [];
  }
  const now = Date.now();
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    try {
      const marker: DispatchMarker = JSON.parse(readFileSync(join(dir, entry), "utf8"));
      if (now - marker.startedAt <= MARKER_TTL_MS) {
        markers.push(marker);
      }
    } catch {
      /* skip corrupt files */
    }
  }
  return markers.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Remove a completed marker (cleanup after dispatch finishes). */
export function cleanupMarker(unit: string): void {
  const path = markerPath(unit);
  try { if (existsSync(path)) unlinkSync(path); } catch { /* already gone */ }
  const lock = lockPath(unit);
  try { if (existsSync(lock)) unlinkSync(lock); } catch { /* already gone */ }
}

/**
 * Acquire an advisory file lock for a unit dispatch (prevents duplicate dispatch).
 * Returns true if the lock was acquired, false if another dispatch is already active.
 */
export function tryLock(unit: string): boolean {
  const lock = lockPath(unit);
  // Write PID + timestamp to the lock file
  // If a stale lock exists (TTL expired), overwrite it
  if (existsSync(lock)) {
    try {
      const data = JSON.parse(readFileSync(lock, "utf8"));
      const age = Date.now() - (data.ts || 0);
      if (age < MARKER_TTL_MS && data.pid && isProcessAlive(data.pid)) {
        return false; // Another active dispatch holds the lock
      }
      // Stale lock — clean up and proceed
      unlinkSync(lock);
    } catch {
      return false;
    }
  }
  writeFileSync(lock, JSON.stringify({ pid: process.pid, ts: Date.now() }));
  return true;
}

/** Release an advisory lock after dispatch completes. */
export function releaseLock(unit: string): void {
  try { if (existsSync(lockPath(unit))) unlinkSync(lockPath(unit)); } catch { /* ok */ }
}

// ---- helpers ----

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
