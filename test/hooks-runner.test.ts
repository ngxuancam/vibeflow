import { describe, expect, test } from "bun:test"
import type { HookInput, HookResult } from "../src/core.js"
import { parseHookInput, presentDecision } from "../src/hooks/runner.js"

// --- mapClaudeEvent branch coverage (reached via parseHookInput → parseClaudeNative) ---
describe("runner: mapClaudeEvent branch coverage", () => {
  test("PostToolUse maps to post-tool-use", () => {
    const parsed = parseHookInput(
      JSON.stringify({ hook_event_name: "PostToolUse", tool_name: "Bash" }),
    )
    expect(parsed?.event).toBe("post-tool-use")
  })

  test("SubagentStop maps to stop", () => {
    const parsed = parseHookInput(JSON.stringify({ hook_event_name: "SubagentStop" }))
    expect(parsed?.event).toBe("stop")
  })

  test("unknown Claude event falls through to pre-tool-use (no-op gate)", () => {
    const parsed = parseHookInput(JSON.stringify({ hook_event_name: "Notification" }))
    expect(parsed?.event).toBe("pre-tool-use")
  })
})

// --- presentDecision: pre-tool-use branches ---
describe("runner: presentDecision pre-tool-use branches", () => {
  test("block decision → permissionDecision=deny", () => {
    const r: HookResult = { decision: "block", risk: "critical", reasons: ["rm -rf /"] }
    const p = presentDecision(r, { event: "pre-tool-use", tool: "Bash" })
    expect(p.exitCode).toBe(0)
    expect(p.json).toContain('"permissionDecision":"deny"')
    expect(p.json).toContain('"hookEventName":"PreToolUse"')
    expect(p.json).toContain("rm -rf /")
  })

  test("require_approval → permissionDecision=ask", () => {
    const r: HookResult = { decision: "require_approval", risk: "high", reasons: ["secrets"] }
    const p = presentDecision(r, { event: "pre-tool-use", tool: "Write" })
    expect(p.exitCode).toBe(0)
    expect(p.json).toContain('"permissionDecision":"ask"')
  })

  test("allow → permissionDecision=allow", () => {
    const r: HookResult = { decision: "allow", risk: "none", reasons: [] }
    const p = presentDecision(r, { event: "pre-tool-use", tool: "Bash" })
    expect(p.exitCode).toBe(0)
    expect(p.json).toContain('"permissionDecision":"allow"')
  })

  test("warn → permissionDecision=allow (default branch)", () => {
    const r: HookResult = { decision: "warn", risk: "low", reasons: ["minor"] }
    const p = presentDecision(r, { event: "pre-tool-use", tool: "Bash" })
    expect(p.exitCode).toBe(0)
    expect(p.json).toContain('"permissionDecision":"allow"')
  })
})

// --- presentDecision: stop branches ---
describe("runner: presentDecision stop branches", () => {
  test("block decision → top-level decision:block with reason", () => {
    const r: HookResult = { decision: "block", risk: "critical", reasons: ["destructive rm"] }
    const p = presentDecision(r, { event: "stop" })
    expect(p.exitCode).toBe(0)
    expect(p.json).toContain('"decision":"block"')
    expect(p.json).toContain("destructive rm")
  })

  test("non-block with real risks → additionalContext feedback", () => {
    const r: HookResult = { decision: "warn", risk: "medium", reasons: ["suspicious pattern"] }
    const p = presentDecision(r, { event: "stop" })
    expect(p.exitCode).toBe(0)
    expect(p.json).toContain('"hookEventName":"Stop"')
    expect(p.json).toContain('"additionalContext":"suspicious pattern"')
  })

  test("require_approval with real risks → additionalContext feedback", () => {
    const r: HookResult = {
      decision: "require_approval",
      risk: "high",
      reasons: ["needs review"],
    }
    const p = presentDecision(r, { event: "stop" })
    expect(p.exitCode).toBe(0)
    expect(p.json).toContain('"hookEventName":"Stop"')
    expect(p.json).toContain("needs review")
  })

  test("non-block with no reasons → empty JSON", () => {
    const r: HookResult = { decision: "allow", risk: "none", reasons: [] }
    const p = presentDecision(r, { event: "stop" })
    expect(p.exitCode).toBe(0)
    expect(p.json).toBe("{}")
  })

  test("non-block with 'no risk signals detected' placeholder → empty JSON", () => {
    const r: HookResult = {
      decision: "allow",
      risk: "none",
      reasons: ["no risk signals detected"],
    }
    const p = presentDecision(r, { event: "stop" })
    expect(p.exitCode).toBe(0)
    expect(p.json).toBe("{}")
  })
})

// --- presentDecision: post-tool-use branches ---
describe("runner: presentDecision post-tool-use branches", () => {
  test("no feedback (empty reasons) → empty JSON", () => {
    const r: HookResult = { decision: "allow", risk: "none", reasons: [] }
    const p = presentDecision(r, { event: "post-tool-use" })
    expect(p.exitCode).toBe(0)
    expect(p.json).toBe("{}")
  })

  test("no feedback ('no risk signals detected' placeholder) → empty JSON", () => {
    const r: HookResult = {
      decision: "allow",
      risk: "none",
      reasons: ["no risk signals detected"],
    }
    const p = presentDecision(r, { event: "post-tool-use" })
    expect(p.exitCode).toBe(0)
    expect(p.json).toBe("{}")
  })

  test("real feedback → additionalContext with reasons", () => {
    const r: HookResult = { decision: "warn", risk: "medium", reasons: ["tool warning"] }
    const p = presentDecision(r, { event: "post-tool-use" })
    expect(p.exitCode).toBe(0)
    expect(p.json).toContain('"hookEventName":"PostToolUse"')
    expect(p.json).toContain('"additionalContext":"tool warning"')
  })
})

// --- presentDecision: workspace passthrough from parseClaudeNative → pre-tool-use ---
describe("runner: parseHookInput Claude-native workspace passthrough", () => {
  test("workspace and cwd fallbacks populate workspace field", () => {
    const parsed = parseHookInput(
      JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "ls" },
        workspace: "/repo",
      }),
    )
    expect((parsed as HookInput).workspace).toBe("/repo")
    // cwd fallback
    const parsed2 = parseHookInput(
      JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "ls" },
        cwd: "/alt",
      }),
    )
    expect((parsed2 as HookInput).workspace).toBe("/alt")
  })
})
