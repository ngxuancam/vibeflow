import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CTX_DIR, type WorkUnit } from "../core.js";
import { createMarker, releaseLock, tryLock, updateMarker } from "./marker.js";

export interface AgentConfig {
  engine: string;
  cwd: string;
  timeoutMs?: number;
}

export interface AgentOutcome {
  status: "done" | "failed";
  confidence: number;
  evidence: string[];
  output: string;
}

export async function spawnAgent(
  unit: WorkUnit,
  prompt: string,
  config: AgentConfig,
): Promise<AgentOutcome> {
  if (!tryLock(unit.name)) {
    return { status: "failed", confidence: 0, evidence: [], output: "lock held" };
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

    // Build args: for claude, prompt goes as last arg after -p. For others: via stdin.
    const args = engineArgs(engine, prompt);
    const child = spawn(engine, args, {
      cwd: config.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
      timeout: config.timeoutMs || undefined,
    });

    let stderr = "";

    child.stdout?.on("readable", () => {
      const raw = child.stdout?.read() as string | null;
      if (!raw) return;
      const line = raw;
      for (const segment of line.toString().split("\n").filter(Boolean)) {
        try {
          const obj = JSON.parse(segment.trim());
          if (obj.type === "evidence" && typeof obj.text === "string") {
            evidence.push(obj.text);
          } else if (obj.type === "result") {
            const conf = typeof obj.confidence === "number" ? obj.confidence : 0;
            resolve({
              status: conf >= 1 ? "done" : "failed",
              confidence: conf,
              evidence: [...evidence, ...(obj.evidence ?? [])] as string[],
              output: obj.output || output,
            });
          }
        } catch {
          output += `${segment}\n`;
        }
      }
    });

    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    // Claude & Copilot: prompt is already in args via -p. Close stdin so the
    // engine doesn't hang waiting for interactive input (pipe mode without .end()
    // can make some CLI versions think they're in a TTY session).
    if (engine === "claude" || engine === "copilot") {
      child.stdin?.end();
    } else {
      child.stdin?.write(prompt);
      child.stdin?.end();
    }

    child.on("exit", (code) => {
      resolve({
        status: code === 0 ? "done" : "failed",
        confidence: code === 0 ? 1.0 : 0,
        evidence: evidence.length ? evidence : [`exited ${code}`],
        output: output + stderr,
      });
    });

    child.on("error", (err) => {
      resolve({
        status: "failed",
        confidence: 0,
        evidence: [`spawn: ${err.message}`],
        output: stderr,
      });
    });
  });
}

function engineArgs(engine: string, prompt: string): string[] {
  switch (engine) {
    case "claude":
      // Claude CLI: -p <prompt> --print --output-format stream-json --no-color
      return ["-p", prompt, "--print", "--output-format", "stream-json", "--no-color"];
    case "codex":
      // Codex CLI: exec - (reads prompt from stdin)
      return ["exec", "-"];
    case "copilot":
      // Copilot CLI: -p <prompt> --allow-all-tools (prompt as argv, not stdin)
      return ["-p", prompt, "--allow-all-tools"];
    default:
      return [engine, prompt];
  }
}

export function agentPrompt(unit: WorkUnit): string {
  const lines = [
    "You are a code implementation agent.",
    `\n## Task: ${unit.name}`,
    unit.spec ? `\n### Spec\n${unit.spec}` : "",
    unit.scope?.length ? `\n### Files to modify\n${unit.scope.join("\n")}` : "",
    "\n## Output format",
    'Reply with a single JSON object: {"confidence": number 0-1, "output": "summary", "evidence": ["list", "of", "strings"]}',
  ];
  return lines.filter(Boolean).join("\n");
}

export function persistAgentOutput(base: string, unitName: string, outcome: AgentOutcome): string {
  const evidenceDir = join(base, CTX_DIR, "workunits", unitName, "evidence");
  if (!existsSync(evidenceDir)) {
    mkdirSync(evidenceDir, { recursive: true });
  }
  const outPath = join(evidenceDir, `${outcome.status}-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(outcome, null, 2));
  return outPath;
}
