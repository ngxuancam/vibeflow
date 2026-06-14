import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type MarkerStatus = "pending" | "running" | "done" | "failed" | "blocked";

export interface DispatchMarker {
  unit: string;
  status: MarkerStatus;
  startedAt: number;
  updatedAt: number;
  confidence: number;
  evidence: string[];
  agent?: string;
  exitCode?: number;
}

const MARKER_TTL_MS = 4 * 60 * 60 * 1000;

export function markerDir(): string {
  const dir = join(homedir(), ".vibeflow", "markers");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function markerPath(unitName: string): string {
  return join(markerDir(), `${unitName}.json`);
}

function lockPath(unitName: string): string {
  return join(markerDir(), `${unitName}.lock`);
}

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

export function readMarker(unit: string): DispatchMarker | null {
  const path = markerPath(unit);
  if (!existsSync(path)) return null;
  try {
    const marker: DispatchMarker = JSON.parse(readFileSync(path, "utf8"));
    if (Date.now() - marker.startedAt > MARKER_TTL_MS) {
      removeIfExists(path);
      return null;
    }
    return marker;
  } catch {
    return null;
  }
}

export function listMarkers(): DispatchMarker[] {
  const markers: DispatchMarker[] = [];
  const dir = markerDir();
  // markerDir() guarantees the directory exists (creates it if not),
  // so readdirSync should not throw in practice.
  const entries = readdirSync(dir);
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

export function cleanupMarker(unit: string): void {
  removeIfExists(markerPath(unit));
  removeIfExists(lockPath(unit));
}

export function tryLock(unit: string): boolean {
  const lock = lockPath(unit);
  if (existsSync(lock)) {
    try {
      const data = JSON.parse(readFileSync(lock, "utf8"));
      const age = Date.now() - (data.ts || 0);
      if (age < MARKER_TTL_MS && data.pid && isProcessAlive(data.pid)) {
        return false;
      }
      unlinkSync(lock);
    } catch {
      return false;
    }
  }
  writeFileSync(lock, JSON.stringify({ pid: process.pid, ts: Date.now() }));
  return true;
}

export function releaseLock(unit: string): void {
  removeIfExists(lockPath(unit));
}

function removeIfExists(p: string): void {
  try {
    if (existsSync(p)) unlinkSync(p);
  } catch {
    /* already gone */
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
