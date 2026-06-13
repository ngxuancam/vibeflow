import { describe, expect, test } from "bun:test";
import {
  agentFilePath,
  renderClaudeAgent,
  renderCodexAgent,
  renderCopilotAgent,
  renderForEngine,
  safeAgentName,
  yamlQuote,
} from "../src/agents/render.js";
import type { RoleSpec } from "../src/agents/role.js";

const SPEC: RoleSpec = {
  name: "cli-engine",
  description: "CLI specialist. Use proactively for any CLI flag.",
  body: "# CLI Engine\n\nYou handle command-line work.",
  tools: ["read", "write", "edit", "bash", "grep", "glob"],
  model: "sonnet",
  sandbox: "workspace-write",
};

describe("renderClaudeAgent", () => {
  test("emits YAML frontmatter + markdown body", () => {
    const out = renderClaudeAgent(SPEC);
    expect(out).toMatch(/^---/);
    expect(out).toMatch(/^name:\s+cli-engine/m);
    expect(out).toMatch(/^description:\s+CLI specialist/m);
    expect(out).toMatch(/^tools:\s+Read,\s+Write/m);
    expect(out).toMatch(/^model:\s+sonnet/m);
    expect(out).toContain("# CLI Engine");
  });
});

describe("renderCodexAgent", () => {
  test("emits TOML with name/description/developer_instructions", () => {
    const out = renderCodexAgent(SPEC);
    expect(out).toMatch(/^name = "cli-engine"/m);
    expect(out).toMatch(/^description = "CLI specialist/m);
    expect(out).toMatch(/^developer_instructions = """/m);
    expect(out).toMatch(/sandbox_mode = "workspace-write"/);
    expect(out).toMatch(/model = "gpt-5.4"/);
  });

  test("does not include Claude-only fields (tools list)", () => {
    const out = renderCodexAgent(SPEC);
    expect(out).not.toContain("tools = ");
    expect(out).not.toContain("permissionMode");
  });
});

describe("renderCopilotAgent", () => {
  test("emits Markdown + YAML frontmatter (different from Claude)", () => {
    const out = renderCopilotAgent(SPEC);
    expect(out).toMatch(/^---/);
    expect(out).toMatch(/^name:\s+cli-engine/m);
    expect(out).toMatch(/^description:\s+CLI specialist/m);
    expect(out).not.toMatch(/^model:\s+sonnet/m);
    expect(out).toContain("# CLI Engine");
  });
});

describe("escaping", () => {
  const tricky: RoleSpec = {
    name: "cli",
    description: 'CLI: a "dangerous" thing. With colon, hash #, and ---',
    body: 'Contains a triple: """ in the body, and backslash \\ here.',
    tools: ["read"],
    model: "sonnet",
  };
  test("claude YAML quoting escapes `:` and `#` so frontmatter is valid", () => {
    const out = renderClaudeAgent(tricky);
    // The first `---` must be the closing fence, not inside the description.
    const fences = [...out.matchAll(/^---$/gm)];
    expect(fences.length).toBe(2);
    // The description must be wrapped in quotes.
    expect(out).toMatch(/^description: "CLI: a \\"dangerous\\" thing/m);
  });
  test("yamlQuote rejects control chars in scalar (defect: frontmatter break)", () => {
    // Defect: the old SAFE class included \\s which matches \\n, so a
    // description with a newline emitted broken YAML frontmatter.
    // New: explicitly throw on any control char (caller must pre-clean).
    expect(() => yamlQuote("a\nb")).toThrow();
    expect(() => yamlQuote("line1\r\nline2")).toThrow();
    expect(() => yamlQuote("tab\there")).toThrow();
  });
  test("yamlQuote rejects DEL (0x7F) and C1 controls (0x80-0x9F)", () => {
    // Per YAML 1.2 §7.3.3, printable char set excludes C0 + DEL + C1.
    // Defect 1st pass: only `< 0x20` was checked, accepting DEL and C1.
    expect(() => yamlQuote("foo\u007fbar")).toThrow(); // DEL
    expect(() => yamlQuote("foo\u0085bar")).toThrow(); // NEL (C1)
    expect(() => yamlQuote("foo\u009fbar")).toThrow(); // APC (C1, end of C1)
  });
  test("yamlQuote returns unquoted when value is safe (no special chars)", () => {
    // Single space is safe in a YAML scalar; only quote when needed.
    expect(yamlQuote("foo bar")).toBe("foo bar");
    expect(yamlQuote("simple-name")).toBe("simple-name");
    expect(yamlQuote("v1.0.0")).toBe("v1.0.0");
  });
  test("codex TOML body with triple-quote and backslash round-trips (defect: 2-pass backslash)", () => {
    // Defect: old code did \`replace(/\\\\/g, "\\\\\\\\").replace(/\"\"\"/g, '\\\\\"\\\\\"\\\\\"')\`.
    // The first replace turned \`\\\` into \`\\\\\` (4 chars in source = 2 chars
    // in output: \\\\). The second replace then saw \`\\\\\\\\\"\"\"\` and produced
    // \`\\\\\"\\\\\"\\\\\"\"\\` — which in a TOML multi-line basic string is
    // interpreted as \"quote, backslash, quote, quote, quote\" → 5 chars
    // → the string is closed early, dropping the rest of the body.
    //
    // Per TOML spec, inside a multi-line basic string, the only way to
    // embed the closing delimiter is to use FOUR double quotes, which
    // decodes to THREE. Single backslashes are literal.
    const spec: RoleSpec = {
      name: "x",
      description: "x",
      body: 'aaa"""bbb\\ccc ddd',
      tools: ["read"],
      model: "sonnet",
    };
    const out = renderCodexAgent(spec);
    // Opener is plain `"""` followed by a newline. The TOML parser
    // auto-trims the first newline after the opener (per spec), so the
    // body in the file is exactly what the caller passed.
    const openerIdx = out.indexOf('developer_instructions = """');
    const closerIdx = out.lastIndexOf('"""');
    expect(openerIdx).toBeGreaterThan(-1);
    expect(closerIdx).toBeGreaterThan(openerIdx);
    const body = out.slice(openerIdx, closerIdx);
    // The body substring (between opener and closer) does NOT get
    // truncated. Original input "aaa"""bbb\ccc ddd" should round-trip.
    expect(body).toContain("aaa");
    expect(body).toContain("bbb");
    expect(body).toContain("ccc ddd");
  });
  test("codex TOML escapes newlines in name/description (basic string)", () => {
    const bad: RoleSpec = { ...SPEC, description: "line1\nline2" };
    expect(() => renderCodexAgent(bad)).toThrow();
  });
  test("safeAgentName sanitizes name but preserves legit dot-runs", () => {
    expect(safeAgentName("a/b\\c")).toBe("a_b_c");
    expect(safeAgentName("foo.bar")).toBe("foo.bar");
    expect(safeAgentName("cli-engine")).toBe("cli-engine");
  });
  test("agentFilePath uses safeAgentName (no traversal)", () => {
    // ../etc/passwd → segments ["..", "etc", "passwd"] → filter out ".."
    // → result "etc_passwd" (no `..` survives; not the original name)
    expect(agentFilePath("claude", "../etc/passwd")).toBe(".claude/agents/etc_passwd.md");
  });
  test("safeAgentName preserves legit dotted names", () => {
    expect(safeAgentName("foo.bar")).toBe("foo.bar");
    expect(safeAgentName("a-b-c")).toBe("a-b-c");
    expect(safeAgentName("1.0.0")).toBe("1.0.0");
  });
  test("safeAgentName collapses only path-traversal, not legit dot-runs", () => {
    expect(safeAgentName("a..b")).toBe("a..b");
    expect(safeAgentName("a...b")).toBe("a...b");
    expect(safeAgentName("role..v1")).toBe("role..v1");
  });
  test("safeAgentName neutralizes traversal-only inputs", () => {
    expect(safeAgentName("a/../../b")).not.toContain("..");
    expect(safeAgentName("a/../../b")).toBe("a_b");
  });
  test("safeAgentName returns _invalid for empty/dot-only inputs", () => {
    expect(safeAgentName(".")).toBe("_invalid");
    expect(safeAgentName("..")).toBe("_invalid");
    expect(safeAgentName("")).toBe("_invalid");
    expect(safeAgentName("///")).toBe("_invalid");
  });
  test("safeAgentName preserves adjacent underscores in legit names", () => {
    // NUL sentinel means we don't split on the original input's _.
    expect(safeAgentName("foo__bar")).toBe("foo__bar");
    expect(safeAgentName("a___b")).toBe("a___b");
    expect(safeAgentName("__init__")).toBe("__init__");
  });
  test("safeAgentName disambiguates legit _invalid from placeholder", () => {
    // Without this, a legit role literally named "_invalid" would be
    // indistinguishable from the placeholder returned for empty input.
    expect(safeAgentName("_invalid")).toBe("u_invalid");
  });
  test("agentFilePath throws on name that sanitises to _invalid", () => {
    expect(() => agentFilePath("claude", "")).toThrow();
    expect(() => agentFilePath("claude", ".")).toThrow();
    expect(() => agentFilePath("codex", "..")).toThrow();
    expect(() => agentFilePath("copilot", "///")).toThrow();
  });
  test("agentFilePath preserves adjacent underscores in legit names", () => {
    expect(agentFilePath("claude", "foo__bar")).toBe(".claude/agents/foo__bar.md");
  });
});

describe("renderCodexAgent parse round-trip", () => {
  // Regression: the old 2-pass backslash-then-triple-quote replace
  // produced unparseable TOML for any body containing both \ and """.
  // Verified with smol-toml 1.6.1.
  test("body with leading whitespace round-trips (defect: line-continuation ate it)", async () => {
    // Defect found in cross-debate review: the previous opener
    // `"""\\<newline>` is a line-continuation per TOML spec, eating the
    // newline AND all leading whitespace on the next line. Bodies that
    // started with a blank line or `# Heading` were silently corrupted.
    // Fix: drop the line-continuation; let TOML auto-trim just the first
    // newline (not the leading whitespace).
    const { parse: parseToml } = await import("smol-toml");
    const cases = [
      "   hello", // leading spaces
      "\thello", // leading tab
      " hello", // single leading space
      "# heading", // markdown heading (no leading whitespace)
      "  body", // 2 leading spaces
    ];
    for (const body of cases) {
      const spec: RoleSpec = {
        name: "x",
        description: "x",
        body,
        tools: ["read"],
        model: "sonnet",
      };
      const out = renderCodexAgent(spec);
      const parsed = parseToml(out);
      expect(parsed.developer_instructions).toBe(body);
    }
  });
  test('body with " and \\\\ round-trips through smol-toml', async () => {
    const { parse: parseToml } = await import("smol-toml");
    const cases = [
      "plain body",
      'with """ triple quote',
      "with \\ backslash",
      'aaa"""bbb\\ccc ddd',
      "Has \\n newline char",
    ];
    for (const body of cases) {
      const spec: RoleSpec = {
        name: "x",
        description: "x",
        body,
        tools: ["read"],
        model: "sonnet",
      };
      const out = renderCodexAgent(spec);
      const parsed = parseToml(out);
      expect(parsed.developer_instructions).toBe(body);
    }
  });
});
