import { describe, expect, test } from "bun:test";
import type { Engine } from "../src/core.js";
import * as codegraph from "../src/tools/codegraph.js";
import {
  type JsonMcpEntry,
  type McpEntry,
  TOOLS,
  TOOL_ORDER,
  type TomlMcpEntry,
  resolveTools,
} from "../src/tools/index.js";
import * as lsp from "../src/tools/lsp.js";

const WORKSPACE = "/abs/repo";

function asJson(entry: McpEntry): JsonMcpEntry {
  if (entry.engine === "codex") throw new Error("expected JSON entry, got codex TOML");
  return entry;
}

describe("codegraph tool", () => {
  test("detect honors the injected PATH probe", () => {
    expect(codegraph.detect({ has: () => true })).toBe(true);
    expect(codegraph.detect({ has: () => false })).toBe(false);
  });

  test("installPlan uses the portable npm global install + per-repo index", () => {
    const { steps } = codegraph.installPlan();
    const npm = steps.find((s) => s.cmd === "npm");
    expect(npm).toBeDefined();
    expect(npm?.args).toEqual(["i", "-g", "@colbymchenry/codegraph"]);
    const init = steps.find((s) => s.cmd === "codegraph");
    expect(init?.args).toEqual(["init", "-i"]);
  });

  test("mcpConfigFor(claude) wires the stdio server and exposes codegraph_* tools", () => {
    const entry = asJson(codegraph.mcpConfigFor("claude"));
    expect(entry.configPath).toBe(".mcp.json");
    expect(entry.servers.codegraph).toEqual({
      command: "codegraph",
      args: ["serve", "--mcp"],
      env: {},
    });
    expect(entry.tools).toContain("codegraph_explore");
    expect(entry.tools).toContain("codegraph_impact");
  });

  test("mcpConfigFor(codex) yields a disabled_tools-capable TOML section", () => {
    const entry = codegraph.mcpConfigFor("codex") as TomlMcpEntry;
    expect(entry.engine).toBe("codex");
    expect(entry.section).toBe("mcp_servers.codegraph");
    expect(entry.command).toBe("codegraph");
    expect(entry.args).toEqual(["serve", "--mcp"]);
    expect("disabledTools" in entry).toBe(true);
    expect(entry.tools).toContain("codegraph_search");
  });

  test("mcpConfigFor(copilot) uses mcpServers with a tools filter (VERIFIED schema)", () => {
    const entry = asJson(codegraph.mcpConfigFor("copilot"));
    expect(entry.configPath).toBe("~/.copilot/mcp-config.json");
    expect(entry.servers.codegraph?.command).toBe("codegraph");
    expect(entry.servers.codegraph?.tools).toEqual(["*"]);
  });
});

describe("lsp tool", () => {
  test("installPlan includes the Go bridge + the TS language server", () => {
    const { steps } = lsp.installPlan(["typescript"]);
    const bridge = steps.find((s) =>
      s.args.includes("github.com/isaacphi/mcp-language-server@latest"),
    );
    expect(bridge?.cmd).toBe("go");
    const ts = steps.find((s) => s.args.includes("typescript-language-server"));
    expect(ts?.cmd).toBe("npm");
  });

  test("mcpServersFor(claude) emits one bridge instance per language", () => {
    const entries = lsp
      .mcpServersFor("claude", { workspace: WORKSPACE, languages: ["typescript", "go"] })
      .map(asJson);
    expect(entries).toHaveLength(2);

    const ts = entries.find((e) => "lsp-typescript" in e.servers);
    const tsArgs = ts?.servers["lsp-typescript"]?.args ?? [];
    expect(tsArgs).toContain("--workspace");
    expect(tsArgs).toContain(WORKSPACE);
    expect(tsArgs).toContain("--lsp");
    expect(tsArgs).toContain("typescript-language-server");
    expect(tsArgs).toContain("--stdio");

    const go = entries.find((e) => "lsp-go" in e.servers);
    const goArgs = go?.servers["lsp-go"]?.args ?? [];
    expect(goArgs).toContain("--lsp");
    expect(goArgs).toContain("gopls");
  });

  test("normalizes JavaScript to the TypeScript server and dedupes", () => {
    const entries = lsp.mcpServersFor("claude", {
      workspace: WORKSPACE,
      languages: ["JavaScript", "TypeScript"],
    });
    expect(entries).toHaveLength(1);
  });

  test("wires the Kotlin language server for KMP repos (dogfood gap)", () => {
    const entries = lsp
      .mcpServersFor("claude", { workspace: WORKSPACE, languages: ["Kotlin"] })
      .map(asJson);
    expect(entries).toHaveLength(1);
    const kotlin = entries[0];
    expect(kotlin && "lsp-kotlin" in kotlin.servers).toBe(true);
    const args = kotlin?.servers["lsp-kotlin"]?.args ?? [];
    expect(args).toContain("--lsp");
    expect(args).toContain("kotlin-language-server");
  });

  test("emits one bridge per language across Kotlin, TypeScript, Python", () => {
    const entries = lsp
      .mcpServersFor("claude", {
        workspace: WORKSPACE,
        languages: ["Kotlin", "TypeScript", "Python"],
      })
      .map(asJson);
    expect(entries).toHaveLength(3);
    expect(entries.some((e) => "lsp-kotlin" in e.servers)).toBe(true);
    expect(entries.some((e) => "lsp-typescript" in e.servers)).toBe(true);
    expect(entries.some((e) => "lsp-python" in e.servers)).toBe(true);
  });

  test("wires the Java language server (jdtls)", () => {
    const entries = lsp
      .mcpServersFor("claude", { workspace: WORKSPACE, languages: ["Java"] })
      .map(asJson);
    expect(entries).toHaveLength(1);
    const args = entries[0]?.servers["lsp-java"]?.args ?? [];
    expect(args).toContain("--lsp");
    expect(args).toContain("jdtls");
  });

  test("skips unknown languages without throwing", () => {
    const entries = lsp.mcpServersFor("claude", {
      workspace: WORKSPACE,
      languages: ["Brainfuck", "Kotlin"],
    });
    expect(entries).toHaveLength(1);
  });

  test("installPlan(Kotlin) includes the kotlin-language-server install step", () => {
    const { steps } = lsp.installPlan(["Kotlin"]);
    const bridge = steps.find((s) =>
      s.args.includes("github.com/isaacphi/mcp-language-server@latest"),
    );
    expect(bridge?.cmd).toBe("go");
    const kotlin = steps.find((s) => s.args.includes("kotlin-language-server"));
    expect(kotlin).toBeDefined();
  });
});

describe("tools registry", () => {
  test("registry iterates both tools uniformly", () => {
    expect(TOOL_ORDER).toEqual(["codegraph", "lsp"]);
    for (const name of TOOL_ORDER) {
      const tool = TOOLS[name];
      expect(typeof tool.detect).toBe("function");
      expect(typeof tool.installPlan).toBe("function");
      expect(tool.name).toBe(name);
    }
  });

  test("resolveTools skips disabled tools and merges priority", () => {
    const ctx = { workspace: WORKSPACE, languages: ["typescript"] };
    const both = resolveTools({ codegraph: true, lsp: true }, "claude" as Engine, ctx);
    expect(both.priority[0]).toBe("codegraph_explore");
    expect(both.priority).toContain("lsp-typescript");

    const onlyLsp = resolveTools({ codegraph: false, lsp: true }, "claude" as Engine, ctx);
    expect(onlyLsp.priority).not.toContain("codegraph_explore");
    expect(onlyLsp.entries.every((e) => !e.tools.includes("codegraph_explore"))).toBe(true);

    const none = resolveTools({}, "claude" as Engine, ctx);
    expect(none.entries).toHaveLength(0);
  });
});
