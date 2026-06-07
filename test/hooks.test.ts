import { describe, expect, test } from "bun:test";
import {
  claudeHookConfig,
  codexHookConfig,
  copilotHookConfig,
  downgradeBannerText,
  engineEnforcement,
  gitPreCommit,
} from "../src/hooks/adapters.js";
import { scoreRisk } from "../src/hooks/risk.js";
import { evaluateHook, exitCodeFor, parseHookInput, presentDecision } from "../src/hooks/runner.js";

// --- Defect 1: Codex/Copilot are detection-only (no false pre-action blocking) ---
describe("adapters: enforcement capability honesty (defect 1)", () => {
  test("codex/copilot configs emit ONLY post-hoc events, never pre-* vetoing events", () => {
    const codex = codexHookConfig();
    const copilot = copilotHookConfig();
    for (const cfg of [codex, copilot]) {
      expect(cfg).not.toContain("pre-command");
      expect(cfg).not.toContain("pre-write");
      expect(cfg).not.toContain("pre-tool-use");
    }
    // and they DO keep at least one post-hoc detection event
    expect(codex).toMatch(/post-command|post-write|verify-result|final-verify/);
    expect(copilot).toMatch(/post-command|post-write|verify-result|final-verify/);
  });

  test("engineEnforcement marks claude native, codex/copilot post-hoc-only", () => {
    expect(engineEnforcement("claude").preActionBlocking).toBe("native");
    expect(engineEnforcement("codex").preActionBlocking).toBe("post-hoc-only");
    expect(engineEnforcement("copilot").preActionBlocking).toBe("post-hoc-only");
  });

  test("downgradeBannerText warns for non-native engines and is empty for claude", () => {
    expect(downgradeBannerText("claude")).toBe("");
    const codexBanner = downgradeBannerText("codex");
    expect(codexBanner.length).toBeGreaterThan(0);
    expect(codexBanner.toLowerCase()).toContain("detection");
    expect(downgradeBannerText("copilot").length).toBeGreaterThan(0);
  });
});

// --- Defect 2: PreWrite is not a real Claude event; use PreToolUse + Edit|Write matcher ---
describe("adapters: claude uses real hook events (defect 2)", () => {
  test("no PreWrite key; a PreToolUse entry targets Edit|Write writes", () => {
    const cfg = JSON.parse(claudeHookConfig()) as {
      hooks: Record<string, Array<{ matcher: string }>>;
    };
    expect(cfg.hooks).not.toHaveProperty("PreWrite");
    expect(cfg.hooks).toHaveProperty("PreToolUse");
    const matchers = (cfg.hooks.PreToolUse ?? []).map((h) => h.matcher);
    expect(matchers).toContain("Edit|Write");
  });
});

// --- Defect 5: git pre-commit fails CLOSED ---
describe("adapters: git pre-commit fails closed (defect 5)", () => {
  test("no `|| true` fail-open, matches block AND require_approval, non-zero on empty", () => {
    const sh = gitPreCommit();
    expect(sh).not.toContain("|| true");
    expect(sh).toContain("block");
    expect(sh).toContain("require_approval");
    // empty/error decision must be treated as a block (non-zero exit)
    expect(sh).toMatch(/empty|no decision|fail.?closed|""\)/i);
  });
});

// --- Defect 3 + 6: exit-code mapping / decision presentation ---
describe("runner: require_approval actually blocks (defect 3)", () => {
  test("exitCodeFor: allow/warn => 0, require_approval => 2 (blocks), block => 2", () => {
    expect(exitCodeFor("allow")).toBe(0);
    expect(exitCodeFor("warn")).toBe(0);
    expect(exitCodeFor("require_approval")).toBe(2);
    expect(exitCodeFor("block")).toBe(2);
  });

  test("presentDecision yields a non-zero exit for require_approval (no silent proceed)", () => {
    const r = evaluateHook({ event: "pre-write", files: [".env"] });
    const p = presentDecision(r, { event: "pre-write", files: [".env"] });
    expect(p.exitCode).not.toBe(0);
  });
});

describe("runner: parseHookInput threads intent and workspace (defect 6)", () => {
  test("intent and workspace survive parsing", () => {
    const raw = JSON.stringify({
      event: "pre-command",
      command: "ls",
      intent: "list files",
      workspace: "/repo",
    });
    const parsed = parseHookInput(raw);
    expect(parsed?.intent).toBe("list files");
    expect(parsed?.workspace).toBe("/repo");
  });
});

// --- Defect 4: destructive bypasses, secret reads, workspace escape ---
describe("risk: destructive rm bypass variants (defect 4)", () => {
  const variants = [
    "rm -rf /tmp/x",
    "rm -fr /tmp/x",
    "rm -r -f /tmp/x",
    "rm --recursive --force /tmp/x",
    "rm -R /tmp/x",
    "/bin/rm -rf /tmp/x",
  ];
  for (const cmd of variants) {
    test(`blocks destructive rm: ${cmd}`, () => {
      expect(scoreRisk({ event: "pre-command", command: cmd }).risk).toBe("critical");
    });
  }
});

describe("risk: git force-push variants (defect 4)", () => {
  test("git push -f and --force block", () => {
    expect(scoreRisk({ event: "pre-command", command: "git push -f origin main" }).risk).toBe(
      "critical",
    );
    expect(scoreRisk({ event: "pre-command", command: "git push origin main --force" }).risk).toBe(
      "critical",
    );
  });

  test("git push --force-with-lease is downgraded to require_approval (safer)", () => {
    const r = scoreRisk({
      event: "pre-command",
      command: "git push --force-with-lease origin main",
    });
    expect(r.risk).toBe("high");
  });
});

describe("risk: reading secrets via command string (defect 4)", () => {
  test("cat .env and id_rsa block; ~/.ssh requires approval at least", () => {
    expect(scoreRisk({ event: "pre-command", command: "cat .env" }).risk).toBe("critical");
    expect(scoreRisk({ event: "pre-command", command: "cat ~/.ssh/id_rsa" }).risk).toBe("critical");
    const pem = scoreRisk({ event: "pre-command", command: "cat server.pem" }).risk;
    expect(["high", "critical"]).toContain(pem);
  });
});

describe("risk: workspace escape (defect 4)", () => {
  test("absolute path outside workspace blocks for commands", () => {
    const r = scoreRisk({
      event: "pre-command",
      command: "cat /etc/passwd",
      workspace: "/repo",
    });
    expect(["high", "critical"]).toContain(r.risk);
  });

  test("relative ../ escape blocks for writes", () => {
    const r = scoreRisk({
      event: "pre-write",
      files: ["../../etc/cron.d/evil"],
      workspace: "/repo",
    });
    expect(["high", "critical"]).toContain(r.risk);
  });

  test("write inside workspace is allowed", () => {
    const r = scoreRisk({
      event: "pre-write",
      files: ["/repo/src/a.ts"],
      workspace: "/repo",
    });
    expect(r.risk).toBe("none");
  });
});

describe("risk: no over-blocking of safe commands (defect 4)", () => {
  const safe = ["git log --oneline", "ls -la", "git status", "bun test", "git push origin main"];
  for (const cmd of safe) {
    test(`allows/low-risk: ${cmd}`, () => {
      const r = scoreRisk({ event: "pre-command", command: cmd });
      expect(["none", "low"]).toContain(r.risk);
    });
  }
});
