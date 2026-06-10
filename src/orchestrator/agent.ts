import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { WorkUnit } from "../core.js";
import {
  createMarker,
  updateMarker,
  cleanupMarker,
  tryLock,
  releaseLock,
} from "./marker.js";

/**
 * Subagent lifecycle manager for vf — independent of .copilot/tools.
 *
 * Protocol:
 *   1. createMarker(unit) + tryLock
 *   2. spawn agent (node subprocess with JSONL stdin/stdout)
 *   3. Agent writes progress to stdout as JSONL lines:
 *      {"type":"status","status":"running","message":"..."}
 *      {"type":"evidence","text":"..."}
 *      {"type":"result","confidence":0.95,"output":"..."}
 *   4. On exit: updateMarker final, releaseLock
 *
 * Both CLI (`vf orchestrate`) and web UI (`GET /api/markers`) read the
 * SAME marker files — real-time shared state, no copilot dependency.
 */

export interface AgentConfig {
  /** Engine binary to spawn (claude, copilot, codex). */
  engine: string;
  /** Path to the repo being worked on. */
  cwd: string;
  /** Max wall-clock seconds per agent (0 = disable). */
  timeoutMs?: number;
}

export interface AgentOutcome {
  status: "done" | "failed";
  confidence: number;
  evidence: string[];
  /** Raw stdout from the agent. */
  output: string;
}

/**
 * Spawn a subagent for a single work unit. Blocks until the agent exits.
 * Writes progress to marker files so CLI + web can observe.
 */
export async function spawnAgent(
  unit: WorkUnit,
  prompt: string,
  config: AgentConfig,
): Promise<AgentOutcome> {
  // Gate: prevent duplicate dispatch for the same unit
  if (!tryLock(unit.name)) {
    return {
      status: "failed",
      confidence: 0,
      evidence: [],
      output: "unit already dispatched (lock held)",
    };
  }

  createMarker(unit.name, config.engine);
  updateMarker(unit.name, { status: "running" });

  const evidence: string[] = [];

  try {
    const result = await runAgent(config.engine, prompt, config);
    updateMarker(unit.name, {
      status: "done",
      confidence: result.confidence,
      evidence: result.evidence,
    });
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    updateMarker(unit.name, {
      status: "failed",
      confidence: 0,
      evidence: [...evidence, `error: ${msg}`],
    });
    return { status: "failed", confidence: 0, evidence, output: msg };
  } finally {
    releaseLock(unit.name);
  }
}

async function runAgent(
  engine: string,
  prompt: string,
  config: AgentConfig,
): Promise<AgentOutcome> {
  return new Promise((resolve) => {
    const evidence: string[] = [];
    let output = "";

    // Use the node runtime to spawn the engine — same as dispatch.ts engineCommand
    const args = engineArgs(engine);
    const child = spawn(engine, args, {
      cwd: config.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
      timeout: config.timeoutMs || undefined,
    });

    let stderr = "";

    const onReadable = () => {
      let line: string | null;
      while ((line = child.stdout?.read() as string | null)) {
        // Agent outputs JSONL lines on stdout
        for (const segment of line.toString().split("\n").filter(Boolean)) {
          try {
            const obj = JSON.parse(segment.trim());
            if (obj.type === "evidence" && typeof obj.text === "string") {
              evidence.push(obj.text);
            } else if (obj.type === "result") {
              const confidence =
                typeof obj.confidence === "number" ? obj.confidence : 0;
              resolve({
                status: confidence >= 1 ? "done" : "failed",
                confidence,
                evidence: [
                  ...evidence,
                  ...(obj.evidence ?? []),
                ] as string[],
                output: obj.output || output,
              });
            } else if (obj.type === "status") {
              updateMarker("", {
                evidence: [...evidence],
              });
            }
          } catch {
            // Non-JSON line: treat as raw output
            output += segment + "\n";
          }
        }
      }
    };

    child.stdout?.on("readable", onReadable);

    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    // Feed the prompt to the agent
    // Claude Code-style: prompt as command arg. Other engines: stdin
    if (engine === "claude") {
      child.stdin?.end(); // Claude handles prompt via args
    } else {
      child.stdin?.write(prompt);
      child.stdin?.end();
    }

    child.on("exit", (code) => {
      // Agent didn't produce structured result — fallback: raw output
      resolve({
        status: code === 0 ? "done" : "failed",
        confidence: code === 0 ? 1.0 : 0,
        evidence: evidence.length
          ? evidence
          : [`agent exited with code ${code}`],
        output: output + stderr,
      });
    });

    child.on("error", (err) => {
      resolve({
        status: "failed",
        confidence: 0,
        evidence: [`spawn error: ${err.message}`],
        output: stderr,
      });
    });
  });
}

function engineArgs(engine: string): string[] {
  switch (engine) {
    case "claude":
      return ["-p", "--print", "--no-color"];
    case "codex":
      return ["exec"];
    case "copilot":
      return ["-p", "--allow-all-tools"];
    default:
      return [engine];
  }
}

/**
 * Build a dispatch prompt for a single work unit — used by the agent.
 */
export function agentPrompt(unit: WorkUnit): string {
  const lines = [
    `You are a code implementation agent.`,
    `\n## Task: ${unit.name}`,
    unit.spec ? `\n### Spec\n${unit.spec}` : "",
    unit.scope?.length
      ? `\n### Files to modify\n${unit.scope.join("\n")}`
      : "",
    `\n## Output format`,
    `Reply with a single JSON object: {"confidence": number 0-1, "output": "summary", "evidence": ["list", "of", "strings"]}`,
    `\nOnly output the JSON — no markdown, no preamble.`,
  ];
  return lines.filter(Boolean).join("\n");
}

/**
 * Write structured output from an agent run to the evidence directory.
 */
export function persistAgentOutput(
  base: string,
  unitName: string,
  outcome: AgentOutcome,
): string {
  const evidenceDir = join(base, ".viteflow", "workunits", unitName, "evidence");
  if (!existsSync(evidenceDir)) {
    require("node:fs").mkdirSync(evidenceDir, { recursive: true });
  }
  const outPath = join(evidenceDir, `${outcome.status}-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(outcome, null, 2));
  return outPath;
}
