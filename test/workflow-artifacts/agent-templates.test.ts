/**
 * Coverage tests for agent-templates.ts + phase-specs.ts (PR #308 backfill).
 *
 * PR #308 added agent-templates.ts (template-driven wrapper over phase-specs)
 * without tests, dropping agent-templates.ts to 97.76% and phase-specs.ts to
 * 31.82% and turning main RED on the per-file 100% coverage gate.
 *
 * Strategy:
 * - agent-templates PRESENT: render functions use shipped templates (happy path).
 * - agent-templates ABSENT: spyOn(node:fs existsSync)→false triggers fallback
 *   (lines 57/93/128 → buildOrchestratorSpec / buildPhaseSpec).
 * - phase-specs direct: call every export with realistic fixtures.
 */
import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AgentEngine } from "../../src/agents/render.js";
import type { WorkflowPhase } from "../../src/ai-init-workflow.js";
import {
  copyPhaseAgentTemplates,
  readAgentTemplate,
  renderOrchestratorBody,
  renderOrchestratorFull,
  renderPhaseAgentBody,
  renderPhaseAgentFull,
} from "../../src/workflow-artifacts/agent-templates.js";
import {
  appendToManagedBlock,
  buildOrchestratorSpec,
  buildPhaseSpec,
  orchestratorAgentName,
  orchestratorAgentPath,
  orchestratorSnippet,
  phaseAgentName,
  renderPhaseListLine,
} from "../../src/workflow-artifacts/phase-specs.js";
import { VF_BLOCK_END, VF_BLOCK_START } from "../../src/workflow/merge.js";

// ── Fixtures ────────────────────────────────────────────────────────────────

const PHASE_PLAN: WorkflowPhase = {
  name: "Plan",
  description: "Outline the work",
  dod: "Plan reviewed",
};

const PHASE_BUILD: WorkflowPhase = {
  name: "Build Feature",
  description: "Implement code",
  inputs: ["requirements.md", "design.md"],
  outputs: ["feature.ts", "feature.test.ts"],
  template: "Use TDD: test first, then implement",
};

const PHASE_MINIMAL: WorkflowPhase = { name: "Minimal", description: "" };

const ENGINES_SINGLE: AgentEngine[] = ["claude"];
const ENGINES_MULTI: AgentEngine[] = ["claude", "codex"];
const PROJECT = "testproj";
const SKILL_PATH = ".claude/skills/plan/SKILL.md";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "vf-at-test-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

// ── agent-templates: PRESENT path (templates exist in repo) ─────────────────

describe("renderOrchestratorBody (templates present)", () => {
  test("renders body with phase rows", () => {
    const body = renderOrchestratorBody([PHASE_PLAN], ENGINES_SINGLE, PROJECT);
    expect(body).toContain("# Workflow Orchestrator — testproj");
    expect(body).toContain("### 1. Plan");
    expect(body).toContain("Outline the work");
    expect(body).toContain("No dependencies");
    expect(body).toContain("- Definition of Done: Plan reviewed");
    expect(body).toContain(".claude/agents/phase-plan.md");
    expect(body).not.toMatch(/^---$/m); // table separators contain --- too
  });

  test("renders multi-phase with dependencies", () => {
    const body = renderOrchestratorBody([PHASE_PLAN, PHASE_BUILD], ENGINES_SINGLE, PROJECT);
    expect(body).toContain("### 1. Plan");
    expect(body).toContain("### 2. Build Feature");
    expect(body).toContain("Depends on: Plan");
    expect(body).toContain("phase-build-feature");
  });

  test("renders multi-engine agent and skill paths", () => {
    const body = renderOrchestratorBody([PHASE_PLAN], ENGINES_MULTI, PROJECT);
    expect(body).toContain(".claude/agents/phase-plan.md");
    expect(body).toContain(".codex/agents/phase-plan.toml");
    expect(body).toContain(".claude/skills/plan/SKILL.md");
    expect(body).toContain(".agents/skills/plan/SKILL.md");
  });
});

describe("renderOrchestratorFull (templates present)", () => {
  test("renders full template with frontmatter", () => {
    const full = renderOrchestratorFull([PHASE_PLAN], ENGINES_SINGLE, PROJECT);
    expect(full).toContain("---");
    expect(full).toContain("name: workflow-orchestrator");
    expect(full).toContain("### 1. Plan");
  });
});

describe("renderPhaseAgentBody (templates present)", () => {
  test("renders body from phase-default template", () => {
    const body = renderPhaseAgentBody(PHASE_PLAN, PROJECT, SKILL_PATH);
    expect(body).toContain("# Plan");
    expect(body).toContain("Outline the work");
    expect(body).toContain(SKILL_PATH);
    expect(body).not.toMatch(/^---$/m); // table separators contain --- too
  });

  test("renders body for phase with longer name", () => {
    const body = renderPhaseAgentBody(
      PHASE_BUILD,
      PROJECT,
      ".claude/skills/build-feature/SKILL.md",
    );
    expect(body).toContain("# Build Feature");
    expect(body).toContain("Implement code");
  });
});

describe("renderPhaseAgentFull (templates present)", () => {
  test("renders full template with frontmatter", () => {
    const full = renderPhaseAgentFull(PHASE_PLAN, PROJECT, SKILL_PATH);
    expect(full).not.toBeNull();
    expect(full as string).toContain("---");
    expect(full as string).toContain("name: phase-plan");
    expect(full as string).toContain("# Plan");
  });
});

describe("copyPhaseAgentTemplates (templates present)", () => {
  test("writes orchestrator and phase agent files to canon dir", () => {
    const written = copyPhaseAgentTemplates(dir, [PHASE_PLAN], ENGINES_SINGLE, PROJECT);
    expect(written.length).toBe(2);
    expect(written[0]).toContain("workflow-orchestrator.md");
    expect(written[1]).toContain("phase-plan.md");

    const orcPath = join(dir, ".vibeflow", "agents", "workflow-orchestrator.md");
    // existsSync is spied to false; verify file exists via readFileSync
    expect(() => readFileSync(orcPath, "utf8")).not.toThrow();
    const orcContent = readFileSync(orcPath, "utf8");
    expect(orcContent).toContain("name: workflow-orchestrator");

    const phasePath = join(dir, ".vibeflow", "agents", "phase-plan.md");
    expect(existsSync(phasePath)).toBe(true);
  });

  test("writes per-engine agent files for multi-engine", () => {
    const written = copyPhaseAgentTemplates(dir, [PHASE_PLAN], ENGINES_MULTI, PROJECT);
    expect(written.length).toBeGreaterThanOrEqual(2);
    expect(written[0]).toContain("workflow-orchestrator.md");
    expect(written[1]).toContain("phase-plan.md");
  });
});

describe("readAgentTemplate", () => {
  test("reads existing template", () => {
    const tmpl = readAgentTemplate("workflow-orchestrator");
    expect(tmpl).not.toBeNull();
    expect(tmpl as string).toContain("name: workflow-orchestrator");
  });

  test("returns null for non-existent template", () => {
    expect(readAgentTemplate("nonexistent-template-xyz")).toBeNull();
  });
});

// ── agent-templates: ABSENT path (spy existsSync → fallback) ────────────────

describe("agent-templates fallback (templates absent)", () => {
  let existsSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    existsSpy = spyOn(fs, "existsSync").mockReturnValue(false);
  });

  afterEach(() => {
    existsSpy.mockRestore();
  });

  test("renderOrchestratorBody falls back to buildOrchestratorSpec", () => {
    const body = renderOrchestratorBody([PHASE_PLAN], ENGINES_SINGLE, PROJECT);
    // Fallback path (line 57): buildOrchestratorSpec body
    expect(body).toContain("# Workflow Orchestrator — testproj");
    expect(body).toContain("### 1. Plan");
    expect(body).toContain("- Agent:");
    expect(body).toContain("- Skill:");
    // Template-driven markers NOT present
    expect(body).not.toContain("Execution Rules");
  });

  test("renderOrchestratorFull falls back to buildOrchestratorSpec", () => {
    const full = renderOrchestratorFull([PHASE_PLAN], ENGINES_SINGLE, PROJECT);
    // Fallback path (line 93): buildOrchestratorSpec body
    expect(full).toContain("# Workflow Orchestrator — testproj");
    expect(full).toContain("### 1. Plan");
  });

  test("renderPhaseAgentBody falls back to buildPhaseSpec", () => {
    const body = renderPhaseAgentBody(PHASE_PLAN, PROJECT, SKILL_PATH);
    // Fallback path (line 128): buildPhaseSpec body
    expect(body).toContain("# Plan");
    expect(body).toContain("## Inputs");
    expect(body).toContain("## Skill");
    expect(body).toContain(SKILL_PATH);
  });

  test("renderPhaseAgentFull returns null when template absent", () => {
    const full = renderPhaseAgentFull(PHASE_PLAN, PROJECT, SKILL_PATH);
    expect(full).toBeNull();
  });

  test("copyPhaseAgentTemplates writes orchestrator but skips null phase agents", () => {
    const written = copyPhaseAgentTemplates(dir, [PHASE_PLAN], ENGINES_SINGLE, PROJECT);
    // Orchestrator written via fallback, phase agent skipped (null)
    expect(written.length).toBe(1);
    expect(written[0]).toContain("workflow-orchestrator.md");

    const orcPath = join(dir, ".vibeflow", "agents", "workflow-orchestrator.md");
    // existsSync is spied to false; verify file exists via readFileSync
    expect(() => readFileSync(orcPath, "utf8")).not.toThrow();
  });
});

// ── phase-specs: direct tests ───────────────────────────────────────────────

describe("phaseAgentName", () => {
  test("returns phase-<slug>", () => {
    expect(phaseAgentName(PHASE_PLAN)).toBe("phase-plan");
    expect(phaseAgentName(PHASE_BUILD)).toBe("phase-build-feature");
  });
});

describe("orchestratorAgentName", () => {
  test("returns workflow-orchestrator", () => {
    expect(orchestratorAgentName()).toBe("workflow-orchestrator");
  });
});

describe("orchestratorAgentPath", () => {
  test("claude returns .claude/agents/", () => {
    expect(orchestratorAgentPath("claude")).toBe(".claude/agents/workflow-orchestrator.md");
  });
  test("codex returns .codex/agents/", () => {
    expect(orchestratorAgentPath("codex")).toBe(".codex/agents/workflow-orchestrator.toml");
  });
  test("copilot returns .github/agents/", () => {
    expect(orchestratorAgentPath("copilot")).toBe(".github/agents/workflow-orchestrator.md");
  });
});

describe("buildOrchestratorSpec", () => {
  test("returns RoleSpec with body, tools, model — single engine", () => {
    const spec = buildOrchestratorSpec([PHASE_PLAN], ENGINES_SINGLE, PROJECT);
    expect(spec.name).toBe("workflow-orchestrator");
    expect(spec.body).toContain("# Workflow Orchestrator — testproj");
    expect(spec.body).toContain("### 1. Plan");
    expect(spec.body).toContain("- Agent: `.claude/agents/phase-plan.md`");
    expect(spec.body).toContain("- Skill: `.claude/skills/plan/SKILL.md`");
    expect(spec.tools).toEqual(["read", "write", "edit", "bash", "grep", "glob"]);
    expect(spec.model).toBe("sonnet");
  });

  test("multi-engine renders separate Agent/Skill lines per engine", () => {
    const spec = buildOrchestratorSpec([PHASE_PLAN], ENGINES_MULTI, PROJECT);
    expect(spec.body).toContain("- Agent (claude): `.claude/agents/phase-plan.md`");
    expect(spec.body).toContain("- Agent (codex): `.codex/agents/phase-plan.toml`");
    expect(spec.body).toContain("- Skill (claude): `.claude/skills/plan/SKILL.md`");
    expect(spec.body).toContain("- Skill (codex): `.agents/skills/plan/SKILL.md`");
  });

  test("renders dependency chain across phases", () => {
    const spec = buildOrchestratorSpec([PHASE_PLAN, PHASE_BUILD], ENGINES_SINGLE, PROJECT);
    expect(spec.body).toContain("Depends on: Plan");
    expect(spec.body).toContain("No dependencies");
  });

  test("includes template, dod, and original paths when present", () => {
    const spec = buildOrchestratorSpec([PHASE_BUILD], ENGINES_SINGLE, PROJECT);
    expect(spec.body).toContain("requirements.md");
    expect(spec.body).toContain("feature.ts");
    expect(spec.body).toContain("Template: Use TDD");
  });

  test("empty phases renders minimal body with usage footer", () => {
    const spec = buildOrchestratorSpec([], ENGINES_SINGLE, PROJECT);
    expect(spec.body).toContain("Total: 0 phase(s)");
    expect(spec.body).toContain("## Usage");
    expect(spec.body).toContain("`vf orchestrate`");
  });
});

describe("buildPhaseSpec", () => {
  test("returns RoleSpec with body, tools, model", () => {
    const spec = buildPhaseSpec(PHASE_PLAN, PROJECT, SKILL_PATH);
    expect(spec.name).toBe("phase-plan");
    expect(spec.body).toContain("# Plan");
    expect(spec.body).toContain("Outline the work");
    expect(spec.body).toContain("## Inputs");
    expect(spec.body).toContain("## Skill");
    expect(spec.body).toContain(SKILL_PATH);
    expect(spec.tools).toEqual(["read", "write", "edit", "bash", "grep", "glob"]);
    expect(spec.model).toBe("sonnet");
  });

  test("includes original paths when phase has inputs/outputs", () => {
    const spec = buildPhaseSpec(PHASE_BUILD, PROJECT, ".claude/skills/build-feature/SKILL.md");
    expect(spec.body).toContain("requirements.md");
    expect(spec.body).toContain("feature.ts");
  });

  test("shows no-paths message when phase has no I/O", () => {
    const spec = buildPhaseSpec(PHASE_PLAN, PROJECT, SKILL_PATH);
    expect(spec.body).toContain("_No concrete paths provided during init._");
  });

  test("falls back description when phase has empty description", () => {
    const spec = buildPhaseSpec(PHASE_MINIMAL, PROJECT, SKILL_PATH);
    expect(spec.description).toContain("Execute Minimal phase");
  });
});

describe("orchestratorSnippet", () => {
  test("returns snippet with phase count and agent paths", () => {
    const snippet = orchestratorSnippet([PHASE_PLAN], ENGINES_SINGLE);
    expect(snippet).not.toBeNull();
    expect(snippet as string).toContain("## Workflow");
    expect(snippet as string).toContain("1 defined workflow phase");
    expect(snippet as string).toContain(".claude/agents/workflow-orchestrator.md");
  });

  test("multi-engine lists all orchestrator agent paths", () => {
    const snippet = orchestratorSnippet([PHASE_PLAN], ENGINES_MULTI);
    expect(snippet as string).toContain(".claude/agents/workflow-orchestrator.md");
    expect(snippet as string).toContain(".codex/agents/workflow-orchestrator.toml");
  });

  test("returns null for empty phases", () => {
    expect(orchestratorSnippet([], ENGINES_SINGLE)).toBeNull();
  });
});

describe("appendToManagedBlock", () => {
  test("creates managed block when file has none", () => {
    const filePath = join(dir, "test.md");
    writeFileSync(filePath, "# Header\n\nSome content\n");
    appendToManagedBlock(filePath, "New section");
    const content = readFileSync(filePath, "utf8");
    expect(content).toContain(VF_BLOCK_START);
    expect(content).toContain("New section");
    expect(content).toContain(VF_BLOCK_END);
  });

  test("appends to existing managed block", () => {
    const filePath = join(dir, "test.md");
    writeFileSync(filePath, `# Header\n\n${VF_BLOCK_START}\nExisting\n${VF_BLOCK_END}\n`);
    appendToManagedBlock(filePath, "Appended");
    const content = readFileSync(filePath, "utf8");
    expect(content).toContain("Existing");
    expect(content).toContain("Appended");
  });

  test("no-ops when file does not exist", () => {
    const filePath = join(dir, "nonexistent.md");
    expect(() => appendToManagedBlock(filePath, "stuff")).not.toThrow();
  });
});

describe("renderPhaseListLine", () => {
  test("renders phase line with agent, skill, and dod", () => {
    const line = renderPhaseListLine(PHASE_PLAN, ENGINES_SINGLE);
    expect(line).toContain("Plan");
    expect(line).toContain(".claude/agents/phase-plan.md");
    expect(line).toContain(".claude/skills/plan/SKILL.md");
    expect(line).toContain("DoD: Plan reviewed");
  });

  test("multi-engine renders comma-separated paths", () => {
    const line = renderPhaseListLine(PHASE_PLAN, ENGINES_MULTI);
    expect(line).toContain(".claude/agents/phase-plan.md");
    expect(line).toContain(".codex/agents/phase-plan.toml");
    expect(line).toContain(".claude/skills/plan/SKILL.md");
    expect(line).toContain(".agents/skills/plan/SKILL.md");
  });

  test("omits DoD when absent", () => {
    const line = renderPhaseListLine(PHASE_BUILD, ENGINES_SINGLE);
    expect(line).toContain("Build Feature");
    expect(line).not.toContain("DoD:");
  });
});
