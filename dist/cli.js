#!/usr/bin/env node
import { createRequire } from "node:module";
var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: (newValue) => all[name] = () => newValue
    });
};
var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// src/core.ts
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
function readVersion() {
  try {
    let dir = dirname(fileURLToPath(import.meta.url));
    for (let i = 0;i < 5; i++) {
      const pkg = join(dir, "package.json");
      if (existsSync(pkg)) {
        const v = JSON.parse(readFileSync(pkg, "utf8")).version;
        if (v)
          return v;
      }
      const up = dirname(dir);
      if (up === dir)
        break;
      dir = up;
    }
  } catch {}
  return "0.0.0";
}
function cwd() {
  return process.cwd();
}
function ctxPath(...parts) {
  return join(cwd(), CTX_DIR, ...parts);
}
function ctxPathIn(base, ...parts) {
  return join(base, CTX_DIR, ...parts);
}
function statePath(base = cwd()) {
  return ctxPathIn(base, "WORKFLOW_STATE.json");
}
function readState(base = cwd()) {
  const p = statePath(base);
  if (!existsSync(p))
    return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}
function writeState(base, state) {
  writeFileSafe(statePath(base), JSON.stringify(state, null, 2));
}
function writeFileSafe(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content.endsWith(`
`) ? content : `${content}
`);
}
function strArray(v) {
  return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
}
function appendFileSafe(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, content);
}
function journalPath(base) {
  return base ? ctxPathIn(base, "knowledge", "log.md") : ctxPath("knowledge", "log.md");
}
function indexPath(base) {
  return base ? ctxPathIn(base, "knowledge", "index.md") : ctxPath("knowledge", "index.md");
}
function recomputeTotals(s) {
  s.totals = {
    units: s.work_units.length,
    done: s.work_units.filter((u) => u.status === "done").length,
    tokens: s.work_units.reduce((a, u) => a + u.resources.tokens, 0),
    cost_usd: Number(s.work_units.reduce((a, u) => a + u.resources.cost_usd, 0).toFixed(4)),
    wall_seconds: s.work_units.reduce((a, u) => a + u.resources.wall_seconds, 0)
  };
  return s;
}
function hasCommand(cmd) {
  if (!/^[A-Za-z0-9._-]+$/.test(cmd))
    return false;
  const probe = process.platform === "win32" ? `where ${cmd}` : `command -v ${cmd}`;
  const r = spawnSync(probe, { stdio: "ignore", shell: true });
  return r.status === 0;
}
function isGitRepo() {
  return existsSync(join(cwd(), ".git")) || existsSync(resolve(cwd(), ".git"));
}
function parseFlags(args) {
  const positionals = [];
  const flags = {};
  for (let i = 0;i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("-")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(a);
    }
  }
  return { positionals, flags };
}
var VERSION, CTX_DIR = ".vibeflow", ENGINES, useColor, wrap = (code) => (s) => useColor ? `\x1B[${code}m${s}\x1B[0m` : s, c;
var init_core = __esm(() => {
  VERSION = readVersion();
  ENGINES = ["claude", "codex", "copilot"];
  useColor = process.stdout.isTTY && !process.env.NO_COLOR;
  c = {
    bold: wrap(1),
    dim: wrap(2),
    red: wrap(31),
    green: wrap(32),
    yellow: wrap(33),
    blue: wrap(34),
    cyan: wrap(36)
  };
});

// src/settings.ts
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
function isTier(v) {
  return v === "codegraph" || v === "lsp" || v === "native";
}
function defaults() {
  return {
    tools: { ...DEFAULT_SETTINGS.tools },
    toolPriority: [...DEFAULT_SETTINGS.toolPriority],
    failureProtection: { ...DEFAULT_FAILURE_PROTECTION },
    updatedAt: DEFAULT_SETTINGS.updatedAt
  };
}
function settingsPath(base) {
  return ctxPathIn(base ?? cwd(), "SETTINGS.json");
}
function normalizePriority(raw) {
  if (!Array.isArray(raw) || raw.length === 0)
    return [...TIERS];
  if (!raw.every(isTier))
    return [...TIERS];
  const seen = new Set(raw);
  const ordered = [...seen];
  for (const tier of TIERS) {
    if (!seen.has(tier))
      ordered.push(tier);
  }
  return ordered;
}
function coerceFailureProtection(raw) {
  const out = { ...DEFAULT_FAILURE_PROTECTION };
  if (!raw || typeof raw !== "object")
    return out;
  const obj = raw;
  if (typeof obj.timeoutSeconds === "number" && Number.isFinite(obj.timeoutSeconds)) {
    out.timeoutSeconds = Math.max(0, obj.timeoutSeconds);
  }
  if (typeof obj.autoWip === "boolean")
    out.autoWip = obj.autoWip;
  if (typeof obj.rollbackOnFail === "boolean")
    out.rollbackOnFail = obj.rollbackOnFail;
  if (typeof obj.requireGit === "boolean")
    out.requireGit = obj.requireGit;
  return out;
}
function coerce(raw) {
  const out = defaults();
  if (!raw || typeof raw !== "object")
    return out;
  const obj = raw;
  const tools = obj.tools;
  if (tools && typeof tools === "object") {
    const t = tools;
    if (typeof t.codegraph === "boolean")
      out.tools.codegraph = t.codegraph;
    if (typeof t.lsp === "boolean")
      out.tools.lsp = t.lsp;
  }
  out.toolPriority = normalizePriority(obj.toolPriority);
  out.failureProtection = coerceFailureProtection(obj.failureProtection);
  if (Array.isArray(obj.lspServers)) {
    const servers = obj.lspServers.filter((s) => typeof s === "string" && s.length > 0);
    if (servers.length)
      out.lspServers = servers;
  }
  if (typeof obj.updatedAt === "string")
    out.updatedAt = obj.updatedAt;
  return out;
}
function readSettings(base) {
  const p = settingsPath(base);
  if (!existsSync2(p))
    return defaults();
  try {
    return coerce(JSON.parse(readFileSync2(p, "utf8")));
  } catch {
    return defaults();
  }
}
function writeSettings(base, next, opts) {
  const now = opts?.now ?? (() => new Date().toISOString());
  const current = readSettings(base);
  const merged = {
    tools: { ...current.tools, ...next.tools ?? {} },
    toolPriority: next.toolPriority ? normalizePriority(next.toolPriority) : current.toolPriority,
    failureProtection: { ...current.failureProtection, ...next.failureProtection ?? {} },
    updatedAt: now()
  };
  const servers = next.lspServers ?? current.lspServers;
  if (servers?.length)
    merged.lspServers = [...servers];
  writeFileSafe(settingsPath(base), JSON.stringify(merged, null, 2));
  return merged;
}
function priorityRank(settings) {
  const order = normalizePriority(settings.toolPriority);
  const rank = {};
  const top = order.length;
  for (let i = 0;i < order.length; i++) {
    rank[order[i]] = top - i;
  }
  return rank;
}
var TIERS, DEFAULT_TIMEOUT_SECONDS = 600, DEFAULT_FAILURE_PROTECTION, DEFAULT_SETTINGS;
var init_settings = __esm(() => {
  init_core();
  TIERS = ["codegraph", "lsp", "native"];
  DEFAULT_FAILURE_PROTECTION = {
    timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
    autoWip: false,
    rollbackOnFail: false,
    requireGit: false
  };
  DEFAULT_SETTINGS = {
    tools: { codegraph: false, lsp: false },
    toolPriority: [...TIERS],
    failureProtection: { ...DEFAULT_FAILURE_PROTECTION },
    updatedAt: ""
  };
});

// src/adapters.ts
import { spawnSync as spawnSync2 } from "node:child_process";
import { basename } from "node:path";
function navigationPolicy(settings) {
  if (!settings)
    return null;
  const enabled = NAV_TIERS.filter((t) => settings.tools[t]);
  if (enabled.length === 0)
    return null;
  const rank = priorityRank(settings);
  const ordered = [...[...enabled].sort((a, b) => rank[b] - rank[a]), "native"];
  const labels = ordered.map((t) => TIER_LABEL[t]);
  const parts = [`prefer ${labels[0]} first`];
  for (let i = 1;i < labels.length - 1; i++) {
    parts.push(`if unavailable or returns nothing, use ${labels[i]}`);
  }
  parts.push(`only fall back to ${labels[labels.length - 1]} if the others are unavailable`);
  return `For code navigation (definitions, references, callers, impact): ${parts.join("; ")}.`;
}
function defaultContext() {
  return {
    name: basename(cwd()),
    goal: `Describe the task in ${CTX_DIR}/TASK_CONTEXT.md before dispatching an engine.`,
    summary: `Project context is generated by VibeFlow. Edit ${CTX_DIR}/PROJECT_CONTEXT.md to refine it.`
  };
}
function aiGenerate(prompt, fallback) {
  const cmd = process.env.VIBEFLOW_AI;
  if (!cmd)
    return fallback();
  const r = spawnSync2(cmd, { input: prompt, shell: true, encoding: "utf8" });
  if (r.status === 0 && r.stdout.trim())
    return r.stdout;
  return fallback();
}
function canonicalFiles(ctx) {
  const sources = [
    `- Documentation source: ${ctx.docSource ?? "TODO"}`,
    `- Task/issue source: ${ctx.taskSource ?? "TODO"}`,
    ctx.fileTypes?.length ? `- File types in scope: ${ctx.fileTypes.join(", ")}` : null
  ].filter(Boolean).join(`
`);
  const requirements = ctx.expectedResult ? `- Expected result: ${ctx.expectedResult}
` : `- TODO: capture business and technical requirements.
`;
  const sample = ctx.sample ? `- Reference/sample: ${ctx.sample}
` : "";
  const stack = ctx.stack ? `
## Detected stack

${ctx.stack}
` : "";
  const nav = navigationPolicy(ctx.settings);
  const navBlock = nav ? `
## Code Navigation Priority
- ${nav}
` : "";
  return {
    [`${CTX_DIR}/PROJECT_CONTEXT.md`]: `# Project Context

- Name: ${ctx.name}
- Summary: ${ctx.summary}
${sources}
${stack}`,
    [`${CTX_DIR}/REQUIREMENTS.md`]: `# Requirements

${requirements}${sample}`,
    [`${CTX_DIR}/TASK_CONTEXT.md`]: `# Task Context

- Goal: ${ctx.goal}
- Definition of Done: ${ctx.expectedResult ?? "TODO"}
- Must not change: TODO
`,
    [`${CTX_DIR}/WORKFLOW_POLICY.md`]: `# Workflow Policy

- No evidence, no conclusion. No verification, no completion.
- Generate the fewest files possible; every generated file is AI-composed from this context.
- Ask approval only for side effects or high-risk actions.

${VF_COMMANDS}

${VF_WORKFLOW}

## Incremental File Authoring
- Never write a large file in a single operation — it causes request timeouts. Create the file with a small first part, then append/edit the remaining parts in separate steps.
- When merging generated content into an existing file, edit/append the specific section rather than rewriting the whole file.

## Knowledge
- Read curated guidance in \`${CTX_DIR}/knowledge/\` before knowledge-heavy or research tasks. Treat it as input you maintain (cross-reference and keep current); never overwrite a source the human curated.
- Read \`${CTX_DIR}/knowledge/index.md\` first to find the relevant pages.
- After each task, append a dated entry to \`${CTX_DIR}/knowledge/log.md\` (\`## [YYYY-MM-DD] <op> | <title>\`), append-only — never rewrite past entries.
- File durable findings as their own linked page and add a one-line entry to \`index.md\`.
- Periodically lint for stale, contradictory, or orphaned notes.

## Tool Error & Execution Policy
- If any terminal command or test execution times out or returns an error code, do not give up immediately.
- Autonomously analyze the error output or partial logs, fix the scripts or parameters, and retry the command up to 3 times.
- Only prompt the user for feedback if the execution consistently fails after 3 distinct self-correction attempts.
${navBlock}`,
    [`${CTX_DIR}/SKILL_INDEX.md`]: `# Skill Index

| skill | status | capabilities |
|-------|--------|--------------|
`
  };
}
function engineBody(engine, ctx) {
  const nav = navigationPolicy(ctx.settings);
  const navLine = nav ? `- ${nav}
` : "";
  const shared = `Project: ${ctx.name}
Goal: ${ctx.goal}

Policy:
- Use verified skills when a task matches one; do not invent manual steps.
- Back every factual claim with a file path, command output, or test result.
- No verification, no completion.
- Read curated guidance in ${CTX_DIR}/knowledge/ before knowledge-heavy tasks; keep it cross-referenced and current, never overwrite a human-curated source.
- After acting, append a dated note to \`${CTX_DIR}/knowledge/log.md\` and keep \`${CTX_DIR}/knowledge/index.md\` current (append-only; never rewrite human-curated pages).
- Author files incrementally: never write a large file in one operation (it times out) — create a small first part, then append/edit the rest in separate steps; when merging into an existing file, edit the specific section rather than rewriting the whole file.
${navLine}
${VF_COMMANDS}

${VF_WORKFLOW}

# Tool Error & Execution Policy
- If any terminal command or test execution times out or returns an error code, do not give up immediately.
- Autonomously analyze the error output or partial logs, fix the scripts or parameters, and retry the command up to 3 times.
- Only prompt the user for feedback if the execution consistently fails after 3 distinct self-correction attempts.
`;
  if (engine === "claude") {
    return `# CLAUDE.md

${shared}
The block between the \`vibeflow:start\`/\`vibeflow:end\` markers is generated by VibeFlow from ${CTX_DIR}/* and is replaced on \`vf init\`. Edit freely OUTSIDE the markers; that content is preserved across re-init.
`;
  }
  return `# AGENTS.md

${shared}
The block between the \`vibeflow:start\`/\`vibeflow:end\` markers is generated by VibeFlow from ${CTX_DIR}/* and is replaced on \`vf init\`. Edit freely OUTSIDE the markers; that content is preserved across re-init.
`;
}
function engineFiles(engine, ctx, useAi = true) {
  const compose = (prompt2, fallback) => useAi ? aiGenerate(prompt2, fallback) : fallback();
  const prompt = `Compose the ${engine} instruction file for project "${ctx.name}" from this context:
${JSON.stringify(ctx)}`;
  const body = compose(prompt, () => engineBody(engine, ctx));
  const agentInstructionsBody = compose(`Compose .agents/instructions.md for "${ctx.name}".`, () => `# Agent Instructions

${engineBody(engine, ctx)}`);
  switch (engine) {
    case "claude":
      return { "CLAUDE.md": body, ".agents/instructions.md": agentInstructionsBody };
    case "codex":
      return { "AGENTS.md": body, ".agents/instructions.md": agentInstructionsBody };
    case "copilot":
      return {
        "AGENTS.md": body,
        ".github/copilot-instructions.md": compose(`Compose .github/copilot-instructions.md for "${ctx.name}".`, () => `# Copilot Instructions

${engineBody("copilot", ctx)}
Path-specific rules live in .github/instructions/*.instructions.md.
`),
        ".agents/instructions.md": agentInstructionsBody
      };
  }
}
function briefName(u) {
  return typeof u === "string" ? u : u.name;
}
function dispatchPrompt(engine, ctx, units) {
  const names = units.map(briefName);
  const objs = units.filter((u) => typeof u !== "string");
  const specs = objs.filter((u) => Boolean(u.spec?.trim()) || Boolean(u.scope?.length) || Boolean(u.skills?.length));
  const lines = [
    `# VibeFlow dispatch → ${engine}`,
    "",
    `Goal: ${ctx.goal}`,
    `Work units: ${names.length ? names.join(", ") : "(none — running the whole task)"}`,
    ""
  ];
  if (specs.length) {
    lines.push("Work unit details:");
    for (const u of specs) {
      lines.push(`- ${u.name}`);
      if (u.scope?.length)
        lines.push(`  scope: ${u.scope.join(", ")}`);
      if (u.spec?.trim())
        lines.push(`  spec: ${u.spec.trim()}`);
      if (u.skills?.length)
        lines.push(`  skills: ${u.skills.join(", ")}`);
    }
    lines.push("");
  }
  const matched = objs.flatMap((u) => u.skills ?? []);
  const gaps = objs.filter((u) => u.skillGap).map((u) => u.name);
  if (matched.length || gaps.length) {
    lines.push("Skills:");
    if (matched.length) {
      lines.push(`- Follow these verified skills before improvising: ${[...new Set(matched)].join(", ")}.`);
    }
    if (gaps.length) {
      lines.push(`- NO verified skill matched for: ${gaps.join(", ")}. Do NOT freelance knowledge-heavy work (especially UX/UI) — follow the spec exactly, mirror existing patterns in the repo, and flag in your uncertainty that no skill backed this.`);
    }
    lines.push("");
  }
  const enabledTools = [];
  if (ctx.settings?.tools?.codegraph)
    enabledTools.push("codegraph (code-graph MCP)");
  if (ctx.settings?.tools?.lsp)
    enabledTools.push("lsp (language-server MCP)");
  if (enabledTools.length) {
    lines.push("Code navigation:", `- Prefer these MCP tools over raw grep/find for definitions, references, and callers: ${enabledTools.join(", ")}.`, "- Priority order: codegraph > lsp > native search. Fall back to native only if the tool is unavailable.", "");
  }
  lines.push("Constraints:", "- Stay within the declared scope of your work unit.", "- Use selected skills; do not invent manual steps when a verified skill exists.", "- Return a JSON summary: skills used, files changed, commands run, tests run, confidence, uncertainty.", "");
  return lines.join(`
`);
}
var TIER_LABEL, NAV_TIERS, VF_COMMANDS, VF_WORKFLOW;
var init_adapters = __esm(() => {
  init_core();
  init_settings();
  TIER_LABEL = {
    codegraph: "the codegraph_* MCP tools",
    lsp: "the language-server (LSP) MCP tools",
    native: "grep/find/read"
  };
  NAV_TIERS = ["codegraph", "lsp"];
  VF_COMMANDS = `## VibeFlow commands (use these)
- \`vf doctor [--probe]\` — check engine readiness before dispatching.
- \`vf init\` — regenerate context/engine files after editing ${CTX_DIR}/*.
- \`vf units status|add <name>|update <name>|delete <name>\` — track work units.
- \`vf orchestrate --engine <e> [--yes]\` — plan + dispatch work units in parallel with the confidence gate.
- \`vf verify\` — run typecheck/lint/test + confidence/evidence/scope gates BEFORE claiming done (no verification, no completion).
- \`vf tools status|enable codegraph|lsp\` — code-navigation tools (prefer codegraph > lsp > native).
- \`vf hooks status|install\` — guardrails (block destructive cmds, secret reads).
- \`vf skills resolve\` / \`vf discover docs <lib> --yes\` — skill needs + Context7 docs.
- \`vf workflow delete|import\` — manage/combine workflows.
- \`${CTX_DIR}/knowledge/log.md\` + \`index.md\` — the work journal (append-only log + page catalog); read before, append after.`;
  VF_WORKFLOW = `## Working with vf (the loop)
Drive every task through this loop instead of free-handing it:
1. **Sync context.** After editing ${CTX_DIR}/*, run \`vf init\` to regenerate this file and the engine context from canonical sources. Don't hand-edit generated files.
2. **Shape the work.** A single-concern task runs as-is — no ceremony. When the task splits into parallel slices with distinct file scopes, model each as a work unit (\`vf units add <name>\`); status, confidence, and evidence are tracked per unit in the ledger.
3. **Dispatch.** \`vf orchestrate\` plans and dispatches the units, runs an independent review, and records evidence. Work units with overlapping file scopes are serialized automatically so lanes never clobber each other; non-overlapping ones run in parallel.
4. **Verify before claiming done.** \`vf verify\` runs typecheck/lint/test plus the policy gates.

**Confidence gate — nothing is "done" until \`vf verify\` passes.** A unit only closes at confidence = 1.0 WITH recorded evidence (command output, file path, or test result) and within its declared scope. Below the bar, the unit is investigated, not silently closed. No verification, no completion; no evidence, no conclusion.

**Guardrails (hooks) are safety, not bureaucracy.** \`vf hooks\` routes risky actions — destructive commands (\`rm -rf\`, force-push), reads of secret files, edits to protected configs — through a decision layer that can warn, require approval, or block. Keep them on.

**Skills & knowledge before manual steps.** Prefer a verified skill over inventing steps (\`vf skills\` to list/resolve). Read curated guidance in ${CTX_DIR}/knowledge/ before knowledge-heavy work, and pull external library docs on demand with \`vf discover docs <lib> --yes\`. After acting, record what you did or learned: append an entry to \`${CTX_DIR}/knowledge/log.md\` (\`## [YYYY-MM-DD] note | <title>\`, append-only) and keep \`${CTX_DIR}/knowledge/index.md\` current.

**Tools.** \`vf tools enable codegraph|lsp\` turns on richer code navigation (definitions, references, callers) — prefer it over grep/find when available.`;
});

// src/dispatch.ts
import { spawn, spawnSync as spawnSync3 } from "node:child_process";
import { join as join2 } from "node:path";
function makeAsyncSpawner(opts = {}) {
  const { timeoutMs, graceMs = DEFAULT_GRACE_MS, shell = false } = opts;
  return (cmd, args, input) => new Promise((resolve2) => {
    const child = spawn(cmd, args, {
      stdio: ["pipe", "pipe", "inherit"],
      detached: timeoutMs != null,
      shell
    });
    let stdout = "";
    let timedOut = false;
    let term;
    let kill;
    const clear = () => {
      if (term)
        clearTimeout(term);
      if (kill)
        clearTimeout(kill);
    };
    const killGroup = (signal) => {
      try {
        if (child.pid)
          process.kill(-child.pid, signal);
      } catch {}
    };
    if (timeoutMs != null) {
      term = setTimeout(() => {
        timedOut = true;
        killGroup("SIGTERM");
        kill = setTimeout(() => killGroup("SIGKILL"), graceMs);
        kill.unref();
      }, timeoutMs);
      term.unref();
    }
    child.stdout.on("data", (d) => {
      stdout += String(d);
    });
    child.on("error", () => {
      clear();
      resolve2({ status: 1, stdout, timedOut: false });
    });
    child.on("close", (code) => {
      clear();
      resolve2({ status: timedOut ? TIMEOUT_STATUS : code ?? 1, stdout, timedOut });
    });
    child.stdin.end(input);
  });
}
function isUnavailable(r) {
  return "unavailable" in r;
}
function copilotVersion(cmd = "copilot") {
  try {
    const r = spawnSync3(cmd, ["--version"], { encoding: "utf8" });
    if (r.status === 0 && r.stdout?.trim())
      return r.stdout.trim();
  } catch {}
  return;
}
function engineCommand(engine, probe = {}) {
  switch (engine) {
    case "claude":
      return { cmd: "claude", args: ["-p", "--output-format", "json"] };
    case "codex":
      return { cmd: "codex", args: ["exec", "-"] };
    case "copilot": {
      const has = probe.has ?? hasCommand;
      if (!has("copilot")) {
        return {
          unavailable: "copilot CLI not found — install GitHub Copilot CLI then re-run"
        };
      }
      const version = (probe.version ?? copilotVersion)("copilot");
      const warning = version ? undefined : "could not determine `copilot --version`; verify `copilot -p` still works (github/copilot-cli#1606)";
      return { cmd: "copilot", args: ["-p", "--allow-all-tools"], promptMode: "arg", warning };
    }
  }
}
function buildEnginePrompt(engine, ctx, units) {
  return [
    dispatchPrompt(engine, ctx, units),
    "When finished, emit a single fenced JSON block as the LAST thing you output:",
    "```json",
    '{ "skills_used": [], "files_changed": [], "commands_run": [], "tests_run": [], "confidence": 0.0, "uncertainty": "" }',
    "```",
    ""
  ].join(`
`);
}
function extractJsonObjects(s) {
  const objs = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0;i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc)
        esc = false;
      else if (ch === "\\")
        esc = true;
      else if (ch === '"')
        inStr = false;
      continue;
    }
    if (ch === '"')
      inStr = true;
    else if (ch === "{") {
      if (depth === 0)
        start = i;
      depth++;
    } else if (ch === "}" && depth > 0) {
      depth--;
      if (depth === 0 && start !== -1) {
        objs.push(s.slice(start, i + 1));
        start = -1;
      }
    }
  }
  return objs;
}
function asSummary(parsed) {
  if (!parsed || typeof parsed !== "object")
    return;
  const obj = parsed;
  if (typeof obj.result === "string") {
    const inner = parseEngineSummary(obj.result);
    if (inner)
      return inner;
  }
  if (obj.structured_output && typeof obj.structured_output === "object") {
    return obj.structured_output;
  }
  if (obj.result && typeof obj.result === "object")
    return obj.result;
  return obj;
}
function tryParseSummary(block) {
  try {
    return asSummary(JSON.parse(block.trim()));
  } catch {
    return;
  }
}
function parseEngineSummary(stdout) {
  if (!stdout)
    return;
  const fences = [...stdout.matchAll(/```json\s*([\s\S]*?)```/g)].map((m) => m[1] ?? "");
  for (const block of fences.reverse()) {
    const s = tryParseSummary(block);
    if (s)
      return s;
  }
  for (const block of extractJsonObjects(stdout).reverse()) {
    const s = tryParseSummary(block);
    if (s)
      return s;
  }
  return;
}
function resolveCli(engine, hasSpawner, has = hasCommand) {
  const invocation = engineCommand(engine, hasSpawner ? { has: () => true } : { has });
  if (isUnavailable(invocation))
    return { ok: false, reason: invocation.unavailable };
  if (!hasSpawner && !has(invocation.cmd)) {
    return { ok: false, reason: `${invocation.cmd} CLI not found` };
  }
  return {
    ok: true,
    cmd: invocation.cmd,
    args: invocation.args,
    promptMode: invocation.promptMode,
    warning: invocation.warning
  };
}
function bridgeCommand(opts) {
  return opts.bridgeCmd ?? process.env.VIBEFLOW_AI;
}
function materializePrompt(cli, prompt) {
  if (cli.promptMode !== "arg")
    return { cmd: cli.cmd, args: cli.args, input: prompt };
  const promptFlag = cli.args.findIndex((arg) => arg === "-p" || arg === "--prompt");
  if (promptFlag === -1)
    return { cmd: cli.cmd, args: [...cli.args, prompt], input: "" };
  const args = [...cli.args];
  args.splice(promptFlag + 1, 0, prompt);
  return { cmd: cli.cmd, args, input: "" };
}
function buildResult(opts, r, failReason, warning) {
  const ok = r.status === 0;
  return {
    engine: opts.engine,
    mode: opts.mode,
    ok,
    raw: r.stdout,
    summary: parseEngineSummary(r.stdout),
    reason: ok ? undefined : r.timedOut ? "timeout" : failReason,
    warning
  };
}
async function runDispatchAsync(opts) {
  const { engine, prompt, mode } = opts;
  const spawn2 = opts.spawner ?? defaultAsyncSpawner;
  if (mode === "dry")
    return { engine, mode, ok: true, raw: "" };
  if (mode === "bridge") {
    const cmd = bridgeCommand(opts);
    if (!cmd)
      return { engine, mode, ok: false, raw: "", reason: "VIBEFLOW_AI is not set" };
    const bridgeSpawn = opts.spawner ?? makeAsyncSpawner({ shell: true });
    return buildResult(opts, await bridgeSpawn(cmd, [], prompt), "bridge command failed");
  }
  const cli = resolveCli(engine, Boolean(opts.spawner), opts.has);
  if (!cli.ok)
    return { engine, mode, ok: false, raw: "", reason: cli.reason };
  const invocation = materializePrompt(cli, prompt);
  return buildResult(opts, await spawn2(invocation.cmd, invocation.args, invocation.input), `${cli.cmd} failed`, cli.warning);
}
function persistDispatch(unitDir, result) {
  const rel = `evidence/${result.engine}.result.json`;
  writeFileSafe(join2(unitDir, rel), JSON.stringify(result, null, 2));
  return rel;
}
var TIMEOUT_STATUS = 124, DEFAULT_GRACE_MS = 3000, defaultAsyncSpawner;
var init_dispatch = __esm(() => {
  init_adapters();
  init_core();
  defaultAsyncSpawner = makeAsyncSpawner();
});

// src/orchestrator/marker.ts
var exports_marker = {};
__export(exports_marker, {
  updateMarker: () => updateMarker,
  tryLock: () => tryLock,
  releaseLock: () => releaseLock,
  readMarker: () => readMarker,
  markerDir: () => markerDir,
  listMarkers: () => listMarkers,
  createMarker: () => createMarker,
  cleanupMarker: () => cleanupMarker
});
import { existsSync as existsSync4, mkdirSync as mkdirSync2, readFileSync as readFileSync3, unlinkSync, writeFileSync as writeFileSync2 } from "node:fs";
import { homedir } from "node:os";
import { join as join4 } from "node:path";
function markerDir() {
  const dir = join4(homedir(), ".vibeflow", "markers");
  if (!existsSync4(dir))
    mkdirSync2(dir, { recursive: true });
  return dir;
}
function markerPath(unitName) {
  return join4(markerDir(), `${unitName}.json`);
}
function lockPath(unitName) {
  return join4(markerDir(), `${unitName}.lock`);
}
function createMarker(unit, agent) {
  const marker = {
    unit,
    status: "pending",
    startedAt: Date.now(),
    updatedAt: Date.now(),
    confidence: 0,
    evidence: [],
    agent
  };
  writeFileSync2(markerPath(unit), JSON.stringify(marker, null, 2));
  return marker;
}
function updateMarker(unit, update) {
  const path = markerPath(unit);
  if (!existsSync4(path))
    return null;
  const current = JSON.parse(readFileSync3(path, "utf8"));
  const marker = {
    ...current,
    ...update,
    updatedAt: Date.now(),
    evidence: update.evidence ? [...new Set([...current.evidence, ...update.evidence])] : current.evidence
  };
  if (update.status)
    marker.status = update.status;
  if (update.confidence !== undefined)
    marker.confidence = update.confidence;
  if (update.exitCode !== undefined)
    marker.exitCode = update.exitCode;
  writeFileSync2(path, JSON.stringify(marker, null, 2));
  return marker;
}
function readMarker(unit) {
  const path = markerPath(unit);
  if (!existsSync4(path))
    return null;
  try {
    const marker = JSON.parse(readFileSync3(path, "utf8"));
    if (Date.now() - marker.startedAt > MARKER_TTL_MS) {
      removeIfExists(path);
      return null;
    }
    return marker;
  } catch {
    return null;
  }
}
function listMarkers() {
  const markers = [];
  const dir = markerDir();
  let entries;
  try {
    entries = __require("node:fs").readdirSync(dir);
  } catch {
    return [];
  }
  const now = Date.now();
  for (const entry of entries) {
    if (!entry.endsWith(".json"))
      continue;
    try {
      const marker = JSON.parse(readFileSync3(join4(dir, entry), "utf8"));
      if (now - marker.startedAt <= MARKER_TTL_MS) {
        markers.push(marker);
      }
    } catch {}
  }
  return markers.sort((a, b) => b.updatedAt - a.updatedAt);
}
function cleanupMarker(unit) {
  removeIfExists(markerPath(unit));
  removeIfExists(lockPath(unit));
}
function tryLock(unit) {
  const lock = lockPath(unit);
  if (existsSync4(lock)) {
    try {
      const data = JSON.parse(readFileSync3(lock, "utf8"));
      const age = Date.now() - (data.ts || 0);
      if (age < MARKER_TTL_MS && data.pid && isProcessAlive(data.pid)) {
        return false;
      }
      unlinkSync(lock);
    } catch {
      return false;
    }
  }
  writeFileSync2(lock, JSON.stringify({ pid: process.pid, ts: Date.now() }));
  return true;
}
function releaseLock(unit) {
  removeIfExists(lockPath(unit));
}
function removeIfExists(p) {
  try {
    if (existsSync4(p))
      unlinkSync(p);
  } catch {}
}
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
var MARKER_TTL_MS;
var init_marker = __esm(() => {
  MARKER_TTL_MS = 4 * 60 * 60 * 1000;
});

// src/preflight.ts
import { spawn as spawn2, spawnSync as spawnSync4 } from "node:child_process";
function probeTimeoutMs(engine) {
  return engine === "copilot" ? COPILOT_PROBE_TIMEOUT_MS : PROBE_TIMEOUT_MS;
}
function defaultSpawner(cmd, args, input, timeout = PROBE_TIMEOUT_MS) {
  const r = spawnSync4(cmd, args, { input, encoding: "utf8", timeout });
  return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}
function probeInvocation(engine, prompt = PROBE_PROMPT) {
  switch (engine) {
    case "claude":
      return { cmd: "claude", args: ["-p", "--output-format", "json"], input: prompt };
    case "codex":
      return { cmd: "codex", args: ["doctor"], input: prompt };
    case "copilot":
      return { cmd: "copilot", args: ["-p", prompt, "--allow-all-tools", "--silent"], input: "" };
  }
}
function installHint(engine) {
  if (engine === "copilot")
    return "copilot CLI not found — install GitHub Copilot CLI";
  return `${engine} CLI not found — install the ${engine} CLI`;
}
function checkAuth(engine, has, spawner) {
  if (engine !== "copilot" || !has("gh"))
    return;
  const r = spawner("gh", ["auth", "status"], "");
  if (r.status === 0)
    return;
  return "log in with `gh auth login`";
}
function probeSucceeded(engine, status, stdout) {
  if (status !== 0)
    return false;
  if (engine === "codex")
    return /\b0 fail ok\b/i.test(stdout) || /\b0 fail\b/i.test(stdout);
  if (engine === "claude") {
    const fromJson = claudeResultText(stdout);
    if (fromJson !== undefined)
      return containsToken(fromJson);
  }
  return containsToken(stdout);
}
function claudeResultText(stdout) {
  try {
    const parsed = JSON.parse(stdout.trim());
    if (parsed && typeof parsed === "object") {
      const result = parsed.result;
      if (typeof result === "string")
        return result;
    }
  } catch {}
  return;
}
function containsToken(s) {
  return s.toLowerCase().includes(EXPECTED_TOKEN.toLowerCase());
}
function runProbe(engine, spawner) {
  const { cmd, args, input } = probeInvocation(engine);
  try {
    const { status, stdout } = spawner(cmd, args, input);
    if (probeSucceeded(engine, status, stdout))
      return { level: "ready", detail: "ready" };
    const reason = status !== 0 ? `nonzero exit ${status}` : `missing token ${EXPECTED_TOKEN}`;
    return { level: "probe-failed", detail: `${engine}: probe failed (${reason})` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { level: "probe-failed", detail: `${engine}: probe failed (${msg})` };
  }
}
function checkEngine(engine, opts = {}) {
  const has = opts.has ?? hasCommand;
  const spawner = opts.spawner ?? ((cmd2, args, input) => defaultSpawner(cmd2, args, input, probeTimeoutMs(engine)));
  const now = opts.now ?? (() => new Date().toISOString());
  const stamp = (level, detail) => ({
    engine,
    level,
    detail,
    checkedAt: now()
  });
  const { cmd } = probeInvocation(engine);
  if (!has(cmd))
    return stamp("no-binary", installHint(engine));
  const authFix = checkAuth(engine, has, spawner);
  if (authFix)
    return stamp("no-auth", authFix);
  if (opts.probe === false)
    return stamp("ready", `${engine}: installed (probe skipped)`);
  const probe = runProbe(engine, spawner);
  return stamp(probe.level, probe.detail);
}
function normalizeEngines(engines) {
  const requested = new Set(engines);
  return ENGINES.filter((e) => requested.has(e));
}
function preflightAll(engines, opts = {}) {
  return normalizeEngines(engines).map((e) => checkEngine(e, opts));
}
function checkEngineAsync(engine, opts = {}) {
  const has = opts.has ?? hasCommand;
  const now = opts.now ?? (() => new Date().toISOString());
  const stamp = (level, detail) => ({
    engine,
    level,
    detail,
    checkedAt: now()
  });
  const { cmd, args, input } = probeInvocation(engine);
  if (!has(cmd))
    return Promise.resolve(stamp("no-binary", installHint(engine)));
  const spawner = opts.spawner;
  if (engine === "copilot" && has("gh")) {
    const r = (spawner ?? defaultSpawner)("gh", ["auth", "status"], "");
    if (r.status !== 0)
      return Promise.resolve(stamp("no-auth", "log in with `gh auth login`"));
  }
  if (opts.probe === false)
    return Promise.resolve(stamp("ready", `${engine}: installed (probe skipped)`));
  if (spawner !== undefined) {
    const probe = runProbe(engine, spawner);
    return Promise.resolve(stamp(probe.level, probe.detail));
  }
  return new Promise((resolve3) => {
    const child = spawn2(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    const timeout = setTimeout(() => {
      child.kill();
      resolve3(stamp("probe-failed", `${engine}: probe timed out`));
    }, probeTimeoutMs(engine));
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      const status = code ?? 1;
      if (probeSucceeded(engine, status, stdout)) {
        resolve3(stamp("ready", "ready"));
      } else {
        const reason = status !== 0 ? `nonzero exit ${status}` : `missing token ${EXPECTED_TOKEN}`;
        resolve3(stamp("probe-failed", `${engine}: probe failed (${reason})`));
      }
    });
    child.on("error", (err) => {
      clearTimeout(timeout);
      resolve3(stamp("probe-failed", `${engine}: probe failed (${err.message})`));
    });
    child.stdin.end(input);
  });
}
function preflightAllAsync(engines, opts = {}) {
  return Promise.all(normalizeEngines(engines).map((e) => checkEngineAsync(e, opts)));
}
function anyReady(list) {
  return list.some((r) => r.level === "ready");
}
function readyEngines(list) {
  return list.filter((r) => r.level === "ready").map((r) => r.engine);
}
var PROBE_TIMEOUT_MS = 20000, COPILOT_PROBE_TIMEOUT_MS = 60000, PROBE_PROMPT = "Reply with the single word READY and nothing else.", EXPECTED_TOKEN = "READY";
var init_preflight = __esm(() => {
  init_core();
});

// src/scanner.ts
var exports_scanner = {};
__export(exports_scanner, {
  summarizeProfile: () => summarizeProfile,
  scanRepo: () => scanRepo
});
import { existsSync as existsSync6, readFileSync as readFileSync4, readdirSync, statSync as statSync2 } from "node:fs";
import { basename as basename2, extname, join as join6 } from "node:path";
function readJson(path) {
  try {
    return JSON.parse(readFileSync4(path, "utf8"));
  } catch {
    return null;
  }
}
function readmeSummary(repo) {
  for (const n of ["README.md", "README.MD", "readme.md", "README"]) {
    const p = join6(repo, n);
    if (!existsSync6(p))
      continue;
    try {
      const lines2 = readFileSync4(p, "utf8").split(`
`);
      for (const raw of lines2) {
        const line = raw.trim();
        if (!line || line.startsWith("#") || line.startsWith("![") || line.startsWith("<"))
          continue;
        return line.replace(/^[*_>-]+\s*/, "").slice(0, 240);
      }
    } catch {}
    return;
  }
  return;
}
function detectLanguages(repo) {
  const counts = new Map;
  let seen = 0;
  const markers = new Set;
  for (const [file, lang] of MARKER_LANG) {
    if (existsSync6(join6(repo, file)))
      markers.add(lang);
  }
  const walk = (dir, depth) => {
    if (depth > 6 || seen > 4000)
      return;
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.startsWith(".") || SKIP_DIRS.has(entry))
        continue;
      const full = join6(dir, entry);
      let st;
      try {
        st = statSync2(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full, depth + 1);
      } else {
        seen++;
        const lang = EXT_LANG[extname(entry).toLowerCase()];
        if (lang)
          counts.set(lang, (counts.get(lang) ?? 0) + 1);
      }
    }
  };
  walk(repo, 0);
  const byCount = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([lang]) => lang);
  const ordered = [...markers, ...byCount.filter((l) => !markers.has(l))];
  return ordered;
}
function detectPackageManager(repo) {
  if (existsSync6(join6(repo, "bun.lock")) || existsSync6(join6(repo, "bun.lockb")))
    return "bun";
  if (existsSync6(join6(repo, "pnpm-lock.yaml")))
    return "pnpm";
  if (existsSync6(join6(repo, "yarn.lock")))
    return "yarn";
  if (existsSync6(join6(repo, "package-lock.json")))
    return "npm";
  if (existsSync6(join6(repo, "poetry.lock")))
    return "poetry";
  if (existsSync6(join6(repo, "Cargo.lock")))
    return "cargo";
  if (existsSync6(join6(repo, "go.sum")))
    return "go";
  return;
}
function hasCI(repo) {
  return existsSync6(join6(repo, ".github", "workflows")) || existsSync6(join6(repo, ".gitlab-ci.yml")) || existsSync6(join6(repo, ".circleci")) || existsSync6(join6(repo, "azure-pipelines.yml"));
}
function scanRepo(repo) {
  const manifests = [];
  const frameworks = new Set;
  let packageManager = detectPackageManager(repo);
  let buildCommand;
  let testCommand;
  let lintCommand;
  let name = basename2(repo);
  const pkgPath = join6(repo, "package.json");
  if (existsSync6(pkgPath)) {
    manifests.push("package.json");
    const pkg = readJson(pkgPath);
    if (pkg) {
      if (typeof pkg.name === "string" && pkg.name)
        name = pkg.name;
      const scripts = pkg.scripts ?? {};
      const runner = packageManager ?? "npm";
      const run = (s) => runner === "npm" ? `npm run ${s}` : `${runner} run ${s}`;
      if (scripts.build)
        buildCommand = run("build");
      if (scripts.test)
        testCommand = run("test");
      if (scripts.lint)
        lintCommand = run("lint");
      const deps = {
        ...pkg.dependencies ?? {},
        ...pkg.devDependencies ?? {}
      };
      for (const [dep, fw] of FRAMEWORK_HINTS)
        if (deps[dep])
          frameworks.add(fw);
      packageManager = packageManager ?? "npm";
    }
  }
  for (const [file, lang] of [
    ["pyproject.toml", "Python"],
    ["requirements.txt", "Python"],
    ["go.mod", "Go"],
    ["Cargo.toml", "Rust"],
    ["pom.xml", "Java"],
    ["build.gradle", "Java"],
    ["build.gradle.kts", "Kotlin"],
    ["settings.gradle.kts", "Kotlin"],
    ["Gemfile", "Ruby"]
  ]) {
    if (existsSync6(join6(repo, file))) {
      manifests.push(file);
      const txt = (() => {
        try {
          return readFileSync4(join6(repo, file), "utf8");
        } catch {
          return "";
        }
      })();
      for (const [dep, fw] of FRAMEWORK_HINTS)
        if (txt.includes(dep))
          frameworks.add(fw);
    }
  }
  const gradleRoot = existsSync6(join6(repo, "gradlew")) || existsSync6(join6(repo, "gradlew.bat"));
  const gradleBuild = existsSync6(join6(repo, "build.gradle.kts"));
  const versionCatalog = existsSync6(join6(repo, "gradle", "libs.versions.toml"));
  if (gradleRoot)
    packageManager = packageManager ?? "gradle";
  if (gradleBuild) {
    buildCommand = buildCommand ?? "./gradlew assembleDebug";
    testCommand = testCommand ?? "./gradlew check";
    lintCommand = lintCommand ?? "./gradlew lint";
    if (!packageManager)
      packageManager = "gradle";
  }
  if (versionCatalog) {
    try {
      const catalog = readFileSync4(join6(repo, "gradle", "libs.versions.toml"), "utf8");
      if (catalog.includes("compose-multiplatform"))
        frameworks.add("Compose Multiplatform");
      if (catalog.includes("koin"))
        frameworks.add("Koin");
      if (catalog.includes("firebase"))
        frameworks.add("Firebase");
      if (catalog.includes("kotlinx-serialization"))
        frameworks.add("Kotlinx Serialization");
    } catch {}
  }
  const webPkg = join6(repo, "web", "package.json");
  if (existsSync6(webPkg)) {
    try {
      const pkg = JSON.parse(readFileSync4(webPkg, "utf8"));
      const scripts = pkg.scripts ?? {};
      if (scripts.build && !buildCommand)
        buildCommand = `cd web && ${typeof packageManager === "string" && packageManager === "bun" ? "bun run build" : "npm run build"}`;
      if (scripts.test && !testCommand)
        testCommand = `cd web && ${typeof packageManager === "string" && packageManager === "bun" ? "bun test" : "npm test"}`;
    } catch {}
  }
  return {
    name,
    summary: readmeSummary(repo),
    languages: detectLanguages(repo),
    packageManager,
    buildCommand,
    testCommand,
    lintCommand,
    frameworks: [...frameworks],
    hasCI: hasCI(repo),
    manifests
  };
}
function summarizeProfile(p) {
  const lines2 = [];
  if (p.languages.length)
    lines2.push(`- Languages: ${p.languages.join(", ")}`);
  if (p.frameworks.length)
    lines2.push(`- Frameworks: ${p.frameworks.join(", ")}`);
  if (p.packageManager)
    lines2.push(`- Package manager: ${p.packageManager}`);
  if (p.buildCommand)
    lines2.push(`- Build: \`${p.buildCommand}\``);
  if (p.testCommand)
    lines2.push(`- Test: \`${p.testCommand}\``);
  if (p.lintCommand)
    lines2.push(`- Lint: \`${p.lintCommand}\``);
  if (p.manifests.length)
    lines2.push(`- Manifests: ${p.manifests.join(", ")}`);
  lines2.push(`- CI configured: ${p.hasCI ? "yes" : "no"}`);
  return lines2.join(`
`);
}
var EXT_LANG, MARKER_LANG, FRAMEWORK_HINTS, SKIP_DIRS;
var init_scanner = __esm(() => {
  EXT_LANG = {
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".py": "Python",
    ".go": "Go",
    ".rs": "Rust",
    ".java": "Java",
    ".kt": "Kotlin",
    ".rb": "Ruby",
    ".php": "PHP",
    ".cs": "C#",
    ".swift": "Swift",
    ".c": "C",
    ".cpp": "C++",
    ".sh": "Shell"
  };
  MARKER_LANG = [
    ["build.gradle.kts", "Kotlin"],
    ["settings.gradle.kts", "Kotlin"],
    ["build.gradle", "Java"],
    ["pom.xml", "Java"],
    ["go.mod", "Go"],
    ["Cargo.toml", "Rust"],
    ["Package.swift", "Swift"],
    ["pyproject.toml", "Python"],
    ["requirements.txt", "Python"],
    ["Gemfile", "Ruby"],
    ["composer.json", "PHP"],
    ["tsconfig.json", "TypeScript"]
  ];
  FRAMEWORK_HINTS = [
    ["next", "Next.js"],
    ["react", "React"],
    ["vue", "Vue"],
    ["svelte", "Svelte"],
    ["@angular/core", "Angular"],
    ["express", "Express"],
    ["fastify", "Fastify"],
    ["nestjs", "NestJS"],
    ["@nestjs/core", "NestJS"],
    ["django", "Django"],
    ["flask", "Flask"],
    ["fastapi", "FastAPI"],
    ["gin-gonic", "Gin"],
    ["actix", "Actix"],
    ["spring-boot", "Spring Boot"]
  ];
  SKIP_DIRS = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    "out",
    ".next",
    "target",
    "vendor",
    "__pycache__",
    ".venv",
    "coverage"
  ]);
});

// src/ai-init.ts
var exports_ai_init = {};
__export(exports_ai_init, {
  selectBestEngine: () => selectBestEngine,
  runAiInit: () => runAiInit,
  buildAiInitPrompt: () => buildAiInitPrompt
});
import { existsSync as existsSync10, mkdirSync as mkdirSync4, readFileSync as readFileSync7, readdirSync as readdirSync3, statSync as statSync4, writeFileSync as writeFileSync4 } from "node:fs";
import { join as join10 } from "node:path";
function selectBestEngine(readiness) {
  const ready = new Set(readiness.filter((r) => r.level === "ready").map((r) => r.engine));
  for (const e of ENGINE_PRIORITY) {
    if (ready.has(e))
      return e;
  }
  return null;
}
function dirListing(base, maxDepth = 2) {
  const skip = new Set([
    ".git",
    "node_modules",
    "dist",
    "build",
    CTX_DIR,
    ".kiro",
    "__pycache__",
    ".gradle",
    "target"
  ]);
  const lines2 = [];
  const walk = (dir, depth, prefix) => {
    if (depth > maxDepth)
      return;
    let entries;
    try {
      entries = readdirSync3(dir);
    } catch {
      return;
    }
    for (const entry of entries.slice(0, 60)) {
      if (skip.has(entry))
        continue;
      const full = join10(dir, entry);
      let isDir = false;
      try {
        isDir = statSync4(full).isDirectory();
      } catch {
        continue;
      }
      const marker = isDir ? "/" : "";
      lines2.push(`${prefix}${entry}${marker}`);
      if (isDir && depth < maxDepth) {
        walk(full, depth + 1, `${prefix}  `);
      }
    }
    if (entries.length > 60)
      lines2.push(`${prefix}... (${entries.length - 60} more entries)`);
  };
  walk(base, 0, "  ");
  return lines2.join(`
`);
}
function writeContextFiles(base, profile) {
  const ctxDir = join10(base, AI_CONTEXT_DIR);
  try {
    mkdirSync4(ctxDir, { recursive: true });
  } catch {}
  const written = [];
  for (const f of INSTRUCTION_FILES) {
    const src = join10(base, f);
    const dst = join10(ctxDir, f);
    try {
      if (existsSync10(src)) {
        writeFileSync4(dst, readFileSync7(src, "utf8"));
        written.push(`${AI_CONTEXT_DIR}/${f}`);
      }
    } catch {}
  }
  const ctxPath2 = join10(base, CTX_DIR, "PROJECT_CONTEXT.md");
  if (existsSync10(ctxPath2)) {
    try {
      writeFileSync4(join10(ctxDir, "PROJECT_CONTEXT.md"), readFileSync7(ctxPath2, "utf8"));
      written.push(`${AI_CONTEXT_DIR}/PROJECT_CONTEXT.md`);
    } catch {}
  }
  try {
    writeFileSync4(join10(ctxDir, "project-profile.json"), JSON.stringify(profile, null, 2));
    written.push(`${AI_CONTEXT_DIR}/project-profile.json`);
  } catch {}
  try {
    writeFileSync4(join10(ctxDir, "directory-listing.txt"), dirListing(base));
    written.push(`${AI_CONTEXT_DIR}/directory-listing.txt`);
  } catch {}
  return written;
}
function buildAiInitPrompt(profile, base) {
  const contextFiles = writeContextFiles(base, profile);
  const langList = profile.languages.length ? profile.languages.join(", ") : "unknown";
  const fwList = profile.frameworks.length ? profile.frameworks.join(", ") : "none detected";
  const pkgMgr = profile.packageManager ?? "unknown";
  const build = profile.buildCommand ?? "(not found)";
  const test = profile.testCommand ?? "(not found)";
  const lint = profile.lintCommand ?? "(not found)";
  const hasCI2 = profile.hasCI ? "yes" : "no";
  const summary = profile.summary ?? "(no README summary)";
  const manifests = profile.manifests.length ? profile.manifests.join(", ") : "none";
  const contextFileList = contextFiles.map((f) => `- ${f}`).join(`
`);
  return [
    "## VibeFlow AI-Powered Project Initialization",
    "",
    "You are an AI agent performing project initialization for VibeFlow (`vf init --ai`).",
    "Your working directory IS the project root. You have full access to read and write files using your tools.",
    "",
    "## Project Detection",
    `- Name: ${profile.name}`,
    `- Summary: ${summary}`,
    `- Languages: ${langList}`,
    `- Frameworks: ${fwList}`,
    `- Package manager: ${pkgMgr}`,
    `- Build: ${build}`,
    `- Test: ${test}`,
    `- Lint: ${lint}`,
    `- CI: ${hasCI2}`,
    `- Manifests: ${manifests}`,
    "",
    "## Context Files (READ THESE FIRST — full content, no truncation)",
    "The following files contain the complete, untruncated project context.",
    "Read them with the Read tool before making any edits:",
    "",
    contextFileList,
    "",
    `- \`${AI_CONTEXT_DIR}/project-profile.json\` — structured project metadata (JSON)`,
    `- \`${AI_CONTEXT_DIR}/directory-listing.txt\` — project tree (top 2 levels)`,
    "",
    "For existing instruction files (CLAUDE.md, AGENTS.md, etc.), read BOTH:",
    "- The actual file at the repo root (may have human content outside fences)",
    `- The full copy under \`${AI_CONTEXT_DIR}/\` (exact current state at init time)`,
    "",
    "## Your Tasks",
    "",
    "### 0. Pre-flight Check",
    "Before ANY work, verify environment:",
    "- Run `npx ctx7 whoami` — if not logged in, WARN the user:",
    '  "⚠ ctx7 not logged in. Run: npx ctx7 login. Skill discovery will be limited without login."',
    "- Run `git rev-parse --git-dir` — confirm you are in a git repo",
    "- List existing instruction files at repo root",
    "",
    "### 1. Analyze the Project (INVESTIGATE until confidence = 1.0)",
    "",
    "**CONFIDENCE GATE: You MUST reach confidence = 1.0 on every finding BEFORE writing anything.**",
    "Confidence < 1 means you are GUESSING. GUESSING is FORBIDDEN. Investigate instead.",
    "",
    "To reach confidence 1.0, read these files exhaustively:",
    "- package.json (scripts, dependencies, devDependencies, engines)",
    "- tsconfig.json / jsconfig.json (compiler options, paths, strictness)",
    "- biome.json / .eslintrc.* / .prettierrc* (lint/format rules)",
    "- CI config (.github/workflows/*.yml, .gitlab-ci.yml, etc.)",
    "- Source directory structure (top 3 levels, all directories)",
    "- Sample source files (pick 5-10 files across different modules, read their imports and patterns)",
    "- Existing docs (README.md, docs/*.md, ARCHITECTURE.md)",
    "- Test directory structure and sample test files (test framework, patterns)",
    "",
    "**If confidence is still < 1 on any aspect:**",
    "- Read MORE files — don't stop at the first 2 files",
    "- Search the internet for the framework/library conventions if unfamiliar",
    '- Web-search: "<framework> project structure conventions 2026"',
    '- Web-search: "<library> best practices testing patterns"',
    "- Cross-reference: does the actual code match what the docs claim?",
    '- If still unsure after 3 rounds of investigation → note it as "uncertain: <topic>" and move on',
    "",
    "**Evidence checklist (all must be checked before confidence reaches 1.0):**",
    "☐ Build command verified by reading package.json scripts",
    "☐ Test command verified by reading package.json scripts + test config",
    "☐ Lint command verified by reading package.json scripts + lint config",
    "☐ Package manager identified (check lockfile: bun.lockb, package-lock.json, yarn.lock, pnpm-lock.yaml)",
    "☐ At least 5 source files read across different modules",
    "☐ At least 2 test files read to understand test patterns",
    "☐ Framework versions confirmed from package.json dependencies",
    "☐ CI pipeline understood (if .github/workflows exists)",
    "",
    "### 2. Write/Update Instruction Files",
    "",
    "These target locations MUST be written (all 4 — no skipping):",
    "- `CLAUDE.md` (root) — Claude Code instructions",
    "- `AGENTS.md` (root) — generic AI agent instructions",
    "- `.github/copilot-instructions.md` — GitHub Copilot instructions",
    "- `.agents/instructions.md` — standard agent instructions (Claude Code convention)",
    "",
    "If `.agents/` directory does not exist, CREATE it with `mkdir -p .agents` first.",
    "",
    "For EACH file:",
    "- FIND `<!-- vibeflow:start -->` / `<!-- vibeflow:end -->` markers",
    "- REPLACE only content BETWEEN markers with project-specific guidance",
    "- PRESERVE everything OUTSIDE markers exactly as-is",
    "- If no markers exist, the file may be human-authored → APPEND markers + generated block at end",
    "",
    "Inside the generated block, include:",
    "- **Build/Test/Lint** — exact commands from package.json",
    "- **Code conventions** — discovered from actual code (not guessed)",
    "- **Architecture** — key modules and data flow (from reading source files)",
    "- **Tech stack** — versions, libraries, frameworks with versions",
    "- **Gotchas** — non-obvious constraints discovered during investigation",
    "",
    "### 3. Discover and Install Skills",
    "",
    "**Skill sources are verified by ctx7. NEVER invent skills.**",
    "",
    "**3a. Check ctx7 login:**",
    "  `npx ctx7 whoami`",
    "  If NOT logged in → print warning, skip to 3c (manual discovery via docs).",
    "",
    "**3b. Install skills HEADLESS (non-interactive) via ctx7:**",
    "  These commands work headless (no TUI):",
    "  - `npx ctx7 library <tech>` → resolve library ID",
    "  - `npx ctx7 docs <libraryId> <query>` → fetch documentation",
    "  - `npx ctx7 skills install --yes --all --claude <repo>` → install skills to .claude/skills/",
    "  - `npx ctx7 skills list` → verify what's installed",
    "",
    "  IMPORTANT: The `--yes --all` flags are MANDATORY for headless mode. Without them, ctx7 opens an interactive TUI that will hang forever.",
    "",
    "  Use `--claude` (NOT `--all-agents`) — only 3 dirs matter: .claude/ .agents/ .github/",
    "  `--all-agents` creates .agent/ (Codex-specific) and .cursor/ which are NOT needed.",
    "",
    "  After --claude install, COPY skills to .agents/ and .github/:",
    "  for d in .claude/skills/*/; do",
    '    name=$(basename "$d")',
    '    [ "$name" = "README.md" ] && continue',
    '    mkdir -p ".agents/skills/$name" ".github/skills/$name"',
    '    cp "$d/SKILL.md" ".agents/skills/$name/SKILL.md"',
    '    cp "$d/SKILL.md" ".github/skills/$name/SKILL.md"',
    "  done",
    "",
    "  VERIFY after install: all 3 dirs (.claude/skills/, .agents/skills/, .github/skills/) must have skills.",
    "  - `ls .claude/skills/ | wc -l` ≥ 2",
    "  - `ls .agents/skills/ | wc -l` ≥ 2",
    "  - `ls .github/skills/ | wc -l` ≥ 2 (minus README.md)",
    "",
    "**3c. Manual skill creation (if ctx7 cannot install directly):**",
    "  Use `npx ctx7 library <tech>` to get library ID, then:",
    '  `npx ctx7 docs <libraryId> "getting started"`',
    '  `npx ctx7 docs <libraryId> "patterns"`',
    '  `npx ctx7 docs <libraryId> "testing"`',
    "",
    "  Write a COMPLETE SKILL.md to `.vibeflow/skills/<name>/SKILL.md`:",
    "  ```markdown",
    "  ---",
    "  name: <kebab-case>",
    "  description: <from ctx7 docs>",
    "  version: 1.0.0",
    "  status: experimental",
    "  capabilities:",
    "    - <concrete capability>",
    "  triggers:",
    "    - <when to invoke>",
    "  ---",
    "",
    "  # <Title>",
    "",
    "  ## Steps",
    "  1. <actionable step from ctx7 docs>",
    "  2. <actionable step from ctx7 docs>",
    "  ```",
    "",
    "**3d. VERIFY every skill:**",
    "  `npx ctx7 skills list` — check installed",
    "  Read each SKILL.md → if empty or no body, DELETE and RE-WRITE",
    "  Empty SKILL.md = BUG. Never proceed with empty skills.",
    "",
    "**3e. Update index:**",
    "  Write `.vibeflow/SKILL_INDEX.md` with entries for each installed skill.",
    "",
    "### 4. Update Project Context",
    "- Edit `.vibeflow/PROJECT_CONTEXT.md`",
    "- Update detected stack, architecture insights, conventions",
    "- Preserve human-authored sections outside generated markers",
    "",
    "## Confidence Gate Protocol (MANDATORY)",
    "",
    "You are NOT allowed to finish with confidence < 1.0.",
    "",
    "If confidence < 1.0 on ANY task:",
    "1. Identify what you're uncertain about (be specific)",
    "2. Investigate: read more files, search the internet, run commands",
    "3. Re-evaluate confidence after each investigation round",
    "4. Repeat until confidence = 1.0 or you have exhausted all investigative paths",
    "5. If truly stuck after 5+ rounds → document the uncertainty in the JSON output",
    "",
    "  Example investigation round:",
    '  "Confidence on test framework = 0.6. I see vitest imports but no vitest.config.ts.',
    '  Investigating: reading package.json scripts → found `"test": "bun test"`.',
    '  Reading sample test file → uses `from "bun:test"` imports.',
    '  Confidence now 1.0: project uses bun test, NOT vitest."',
    "",
    "When confidence hits 1.0 on ALL findings, write the JSON summary.",
    "",
    "## Critical Constraints",
    "- NEVER delete or truncate any file",
    "- NEVER modify content OUTSIDE `<!-- vibeflow:start -->`/`<!-- vibeflow:end -->` markers",
    "- Use Edit tool for instruction file modifications — never Write whole files that have human content",
    "- BE CONCISE in instruction files — AI agents read them, keep them scannable",
    "- Skills from ctx7: use `ctx7 skills install --yes --claude` (headless) or write manually from `ctx7 docs`",
    "- After every action, update your internal confidence score for that finding",
    "",
    "## Output (LAST thing — only when ALL tasks done at confidence 1.0)",
    "",
    "```json",
    "{",
    '  "files_edited": ["CLAUDE.md", "AGENTS.md", ".github/copilot-instructions.md", ".agents/instructions.md"],',
    '  "skills_installed": ["<name>"],',
    '  "skills_source": ["ctx7:<repo>", "manual-from-ctx7-docs"],',
    '  "key_findings": ["<concrete finding>"],',
    '  "investigation_rounds": <number of investigation rounds needed>,',
    '  "project_type": "<type>",',
    '  "confidence": 1.0',
    "}",
    "```",
    "",
    "REMEMBER: confidence must be EXACTLY 1.0. If it's 0.9, you're not done. Go back and investigate."
  ].join(`
`);
}
async function runAiInit(opts) {
  const {
    base,
    timeoutMs = AI_INIT_TIMEOUT_MS,
    dryRun = false,
    spawner,
    forceEngine,
    preflight
  } = opts;
  const probe = preflight ?? ((engines, pg) => preflightAll(engines, pg));
  let engine = null;
  if (forceEngine) {
    const readiness = probe(ENGINES, { probe: true });
    const match = readiness.find((r) => r.engine === forceEngine && r.level === "ready");
    engine = match ? forceEngine : null;
  } else {
    const readiness = probe(ENGINES, { probe: true });
    engine = selectBestEngine(readiness);
  }
  if (!engine) {
    return {
      ok: false,
      reason: forceEngine ? `forced engine ${forceEngine} is not ready — run \`vf doctor --probe\` to diagnose` : "no ready engine found — run `vf doctor --probe` to check engine status"
    };
  }
  const profile = scanRepo(base);
  const prompt = buildAiInitPrompt(profile, base);
  if (dryRun) {
    return { ok: true, engine, prompt, reason: "dry run — prompt ready for inspection" };
  }
  const invocation = engineCommand(engine);
  if (isUnavailable(invocation)) {
    return { ok: false, engine, reason: invocation.unavailable, prompt };
  }
  const args = invocation.promptMode === "arg" ? [...invocation.args, prompt] : invocation.args;
  const input = invocation.promptMode === "arg" ? "" : prompt;
  const asyncSpawn = spawner ?? makeAsyncSpawner({ timeoutMs });
  const result = await asyncSpawn(invocation.cmd, args, input);
  if (result.timedOut) {
    return {
      ok: false,
      engine,
      reason: `${engine} AI analysis timed out after ${timeoutMs / 1000}s — deterministic context files are in place`,
      raw: result.stdout
    };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      engine,
      reason: `${engine} exited with status ${result.status} — deterministic context files are in place`,
      raw: result.stdout
    };
  }
  return { ok: true, engine, raw: result.stdout };
}
var ENGINE_PRIORITY, INSTRUCTION_FILES, AI_INIT_TIMEOUT_MS = 600000, AI_CONTEXT_DIR;
var init_ai_init = __esm(() => {
  init_core();
  init_dispatch();
  init_preflight();
  init_scanner();
  ENGINE_PRIORITY = ["claude", "copilot", "codex"];
  INSTRUCTION_FILES = [
    "CLAUDE.md",
    "AGENTS.md",
    ".github/copilot-instructions.md",
    ".agents/instructions.md"
  ];
  AI_CONTEXT_DIR = `${CTX_DIR}/ai-context`;
});

// src/discovery/context7.ts
var exports_context7 = {};
__export(exports_context7, {
  searchSkillsHttp: () => searchSkillsHttp,
  searchSkills: () => searchSkills,
  lookupDocsHttp: () => lookupDocsHttp,
  lookupDocs: () => lookupDocs,
  discoveryAvailable: () => discoveryAvailable,
  CONTEXT7_BASE: () => CONTEXT7_BASE
});
function discoveryAvailable() {
  return typeof fetch === "function";
}
function safeSkillName(raw) {
  if (typeof raw !== "string")
    return;
  const s = raw.trim();
  return SKILL_NAME_RE.test(s) ? s : undefined;
}
function rowsFrom(body) {
  if (Array.isArray(body))
    return body;
  if (body && typeof body === "object") {
    const o = body;
    for (const key of ["results", "libraries", "docs", "items"]) {
      if (Array.isArray(o[key]))
        return o[key];
    }
  }
  return [];
}
async function getJson(url, opts) {
  const fetchFn = opts.fetchFn ?? fetch;
  const apiKey = opts.apiKey ?? process.env.CONTEXT7_API_KEY;
  const headers = { accept: "application/json" };
  if (apiKey)
    headers.authorization = `Bearer ${apiKey}`;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  try {
    const res = await fetchFn(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok)
      return { ok: false, reason: `context7 request failed (HTTP ${res.status})` };
    const text = await res.text();
    try {
      const body = JSON.parse(text);
      return { ok: true, rows: rowsFrom(body) };
    } catch {
      const rows = parseMarkdownContext(text);
      return { ok: true, rows };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `context7 lookup failed: ${msg}` };
  }
}
async function lookupDocsHttp(library, opts = {}) {
  if (!opts.approved) {
    return {
      ok: false,
      approvalRequired: true,
      reason: `Network lookup for "${library}" requires approval.`,
      results: []
    };
  }
  const searchUrl = `${CONTEXT7_BASE}/api/v2/libs/search?query=${encodeURIComponent(library)}`;
  const searchResult = await getJson(searchUrl, opts);
  const libId = searchResult.ok && searchResult.rows.length > 0 ? searchResult.rows[0]?.id : undefined;
  if (!libId) {
    return {
      ok: false,
      reason: `No Context7 library found for "${library}".`,
      results: []
    };
  }
  const url = `${CONTEXT7_BASE}/api/v2/context?libraryId=${encodeURIComponent(libId)}&query=${encodeURIComponent(library)}`;
  const r = await getJson(url, opts);
  if (!r.ok)
    return { ok: false, reason: r.reason, results: [] };
  const results = r.rows.map((row) => ({
    kind: "docs",
    title: row.title ?? row.name ?? library,
    snippet: row.snippet ?? row.text ?? row.description ?? "",
    source: "context7"
  }));
  return { ok: true, results };
}
async function searchSkillsHttp(query, opts = {}) {
  if (!opts.approved) {
    return {
      ok: false,
      approvalRequired: true,
      reason: `Skill search for "${query}" requires approval.`,
      results: []
    };
  }
  const url = `${CONTEXT7_BASE}/api/v2/libs/search?query=${encodeURIComponent(query)}`;
  const r = await getJson(url, opts);
  if (!r.ok)
    return { ok: false, reason: r.reason, results: [] };
  const results = r.rows.map((row) => {
    const name = safeSkillName(row.name ?? row.title);
    return {
      kind: "skill",
      title: row.name ?? row.title ?? "skill",
      snippet: row.description ?? row.snippet ?? "",
      status: "experimental",
      name,
      source: "context7"
    };
  });
  return { ok: true, results };
}
function notWired(query) {
  return {
    ok: false,
    reason: `Context7 HTTP discovery is async; use lookupDocs/searchSkills *Http for "${query}".`,
    results: []
  };
}
function lookupDocs(library, opts = {}) {
  if (!opts.approved) {
    return {
      ok: false,
      approvalRequired: true,
      reason: `Network lookup for "${library}" requires approval.`,
      results: []
    };
  }
  if (!opts.runner)
    return notWired(library);
  const r = opts.runner("ctx7", ["docs", library]);
  if (r.status !== 0)
    return { ok: false, reason: "docs lookup failed", results: [] };
  return { ok: true, results: parseDocs(r.stdout, library) };
}
function searchSkills(query, opts = {}) {
  if (!opts.approved) {
    return {
      ok: false,
      approvalRequired: true,
      reason: `Skill search for "${query}" requires approval.`,
      results: []
    };
  }
  if (!opts.runner)
    return notWired(query);
  const r = opts.runner("ctx7", ["skills", "search", query]);
  if (r.status !== 0)
    return { ok: false, reason: "skill search failed", results: [] };
  return { ok: true, results: parseSkills(r.stdout) };
}
function parseDocs(stdout, library) {
  return parseLines(stdout).map((line) => ({
    kind: "docs",
    title: line.title ?? library,
    snippet: line.snippet ?? line.text ?? "",
    source: "context7"
  }));
}
function parseSkills(stdout) {
  return parseLines(stdout).map((line) => ({
    kind: "skill",
    title: line.name ?? line.title ?? "skill",
    snippet: line.description ?? line.snippet ?? "",
    status: "experimental",
    name: safeSkillName(line.name ?? line.title),
    source: "context7"
  }));
}
function parseMarkdownContext(text) {
  const rows = [];
  const sections = text.split(/^### /m).filter(Boolean);
  for (const section of sections) {
    const lines2 = section.split(`
`);
    const title = lines2[0]?.trim() ?? "";
    const body = lines2.slice(1).join(`
`).trim();
    const cleaned = body.replace(/^Source:.*$/m, "").trim();
    const codeMatch = cleaned.match(/```[\s\S]*?```/);
    const snippet = codeMatch ? codeMatch[0].replace(/```\w*\n?/g, "").replace(/```$/, "").trim().slice(0, 500) : cleaned.slice(0, 500);
    if (title || snippet) {
      rows.push({ title: title || "docs", snippet });
    }
  }
  return rows.length > 0 ? rows : [{ title: "docs", snippet: text.slice(0, 500) }];
}
function parseLines(stdout) {
  const out = [];
  for (const raw of stdout.split(`
`)) {
    const line = raw.trim();
    if (!line)
      continue;
    try {
      const obj = JSON.parse(line);
      out.push(obj);
    } catch {
      out.push({ text: line });
    }
  }
  return out;
}
var CONTEXT7_BASE = "https://context7.com", DEFAULT_TIMEOUT_MS = 8000, SKILL_NAME_RE;
var init_context7 = __esm(() => {
  SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
});

// src/cli.ts
import { spawn as spawn3 } from "node:child_process";
import { createInterface as createInterface2 } from "node:readline";

// src/commands.ts
init_adapters();
init_core();
init_dispatch();
import { spawnSync as spawnSync6 } from "node:child_process";
import { chmodSync, existsSync as existsSync11, readFileSync as readFileSync8, rmSync as rmSync2, statSync as statSync5 } from "node:fs";
import { isAbsolute as isAbsolute2, join as join11, resolve as resolve4 } from "node:path";
import { createInterface } from "node:readline";

// src/gates.ts
init_core();
function normPrefix(s) {
  return s.replace(/\*+$/, "").replace(/\/+$/, "");
}
function prefixesOverlap(a, b) {
  if (a === "" || b === "")
    return true;
  return a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`) || a.startsWith(b) || b.startsWith(a);
}
function findScopeConflicts(units) {
  const conflicts = [];
  for (let i = 0;i < units.length; i++) {
    for (let j = i + 1;j < units.length; j++) {
      const a = units[i];
      const b = units[j];
      const sa = (a?.scope ?? []).map(normPrefix);
      const sb = (b?.scope ?? []).map(normPrefix);
      if (!sa.length || !sb.length)
        continue;
      if (sa.some((pa) => sb.some((pb) => prefixesOverlap(pa, pb)))) {
        conflicts.push([a?.name ?? "?", b?.name ?? "?"]);
      }
    }
  }
  return conflicts;
}
function policyGates(state) {
  const failures = [];
  const passed = [];
  const warnings = [];
  if (!state) {
    return {
      ok: true,
      failures: [],
      passed: ["no workflow state — nothing to gate"],
      warnings: []
    };
  }
  const units = state.work_units ?? [];
  const lowConf = units.filter((u) => (u.confidence ?? 0) < 1);
  if (lowConf.length) {
    for (const u of lowConf) {
      failures.push(`confidence<1: "${u.name}" at ${u.confidence} — investigate/debate before close`);
    }
  } else {
    passed.push("confidence: all units at 1.0");
  }
  const noEvidence = units.filter((u) => u.status === "done" && !u.evidence?.length);
  if (noEvidence.length) {
    for (const u of noEvidence) {
      failures.push(`no-evidence: "${u.name}" is done but has no recorded evidence`);
    }
  } else {
    passed.push("evidence: every done unit has recorded evidence");
  }
  let overlapFound = false;
  for (let i = 0;i < units.length; i++) {
    for (let j = i + 1;j < units.length; j++) {
      const a = units[i];
      const b = units[j];
      const sa = (a?.scope ?? []).map(normPrefix);
      const sb = (b?.scope ?? []).map(normPrefix);
      if (!sa.length || !sb.length)
        continue;
      const clash = sa.some((pa) => sb.some((pb) => prefixesOverlap(pa, pb)));
      if (clash) {
        overlapFound = true;
        failures.push(`scope-overlap: "${a?.name}" and "${b?.name}" declare overlapping scopes`);
      }
    }
  }
  if (!overlapFound)
    passed.push("scope: no overlapping work-unit scopes");
  const khDone = units.filter((u) => u.knowledge_heavy === true && u.status === "done");
  let waived = 0;
  for (const u of khDone) {
    if (u.skill_waiver?.reason) {
      waived++;
      passed.push(`skills: "${u.name}" closed under waiver (${u.skill_waiver.reason})`);
      continue;
    }
    if (u.knowledge_heavy_source === "regex") {
      warnings.push(`skills(warn): "${u.name}" flagged knowledge-heavy by heuristic; verify manually`);
      continue;
    }
    const required = strArray(u.skills_required);
    if (!required.length) {
      warnings.push(`skills(warn): "${u.name}" knowledge-heavy but no verified skill matched — author one or record a waiver (vf units waiver "${u.name}" --reason ...)`);
      continue;
    }
    const used = new Set(strArray(u.skills_used));
    if (required.some((r) => used.has(r))) {
      passed.push(`skills: "${u.name}" applied a required skill`);
    } else {
      warnings.push(`skills(warn): "${u.name}" did not report using a required skill (required: ${required.join(", ")}; used: ${[...used].join(", ") || "none"}) — reviewer should confirm from the diff`);
    }
  }
  if (!khDone.length)
    passed.push("skills: no knowledge-heavy completed units to check");
  if (waived)
    warnings.push(`skills: ${waived} unit(s) closed under skill waiver`);
  return { ok: failures.length === 0, failures, passed, warnings };
}

// src/hooks/adapters.ts
import { dirname as dirname2, join as join3 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
function cliPath() {
  const self = fileURLToPath2(import.meta.url);
  if (self.endsWith("/dist/cli.js"))
    return self;
  const root = join3(dirname2(self), "..", "..");
  return join3(root, "dist", "cli.js");
}
var ENFORCEMENT = {
  claude: { preActionBlocking: "native" },
  codex: { preActionBlocking: "post-hoc-only" },
  copilot: { preActionBlocking: "post-hoc-only" }
};
function engineEnforcement(engine) {
  return ENFORCEMENT[engine];
}
function downgradeBannerText(engine) {
  if (engineEnforcement(engine).preActionBlocking === "native")
    return "";
  return `! ${engine}: detection-only guardrails. This engine has no vetoing pre-action hook, so VibeFlow can only flag risky actions after they happen (post-command/post-write/verify-result), not block them beforehand. Use Claude Code for native blocking.`;
}
function claudeHookConfig() {
  const cmd = cliPath();
  const delegate = [{ type: "command", command: `node ${cmd} hook` }];
  const config = {
    hooks: {
      PreToolUse: [
        { matcher: "Edit|Write", hooks: delegate },
        { matcher: "Bash", hooks: delegate }
      ],
      PostToolUse: [{ matcher: "Edit|Write", hooks: delegate }],
      Stop: [{ matcher: "", hooks: delegate }]
    }
  };
  return JSON.stringify(config, null, 2);
}
function codexHookConfig() {
  const cmd = cliPath();
  const config = {
    detectionOnly: true,
    hooks: {
      "post-command": `node ${cmd} hook`,
      "post-write": `node ${cmd} hook`,
      "verify-result": `node ${cmd} hook`
    }
  };
  return JSON.stringify(config, null, 2);
}
function copilotHookConfig() {
  const cmd = cliPath();
  const config = {
    detectionOnly: true,
    events: ["post-command", "post-write", "verify-result"],
    command: `node ${cmd} hook`
  };
  return JSON.stringify(config, null, 2);
}
function gitPreCommit() {
  const cmd = cliPath();
  return [
    "#!/usr/bin/env sh",
    "# VibeFlow guardrail: route staged changes through the universal hook decision.",
    "# Fails closed — if the hook cannot decide, the commit is blocked.",
    "# Bypass intentionally with `git commit --no-verify` only when you know why.",
    "set -eu",
    `files=$(git diff --cached --name-only --diff-filter=ACM | sed 's/.*/"&"/' | paste -sd, -)`,
    `event=$(printf '{"event":"pre-write","files":[%s]}' "$files")`,
    "# Capture the decision; if node fails to run, fail closed.",
    `if ! decision=$(printf "%s" "$event" | node ${cmd} hook); then`,
    '  echo "vibeflow hook: could not evaluate changes — blocking (fail-closed)" >&2',
    "  exit 1",
    "fi",
    'echo "$decision"',
    'case "$decision" in',
    '  *\\"decision\\":\\"block\\"*) echo "blocked by VibeFlow hook" >&2; exit 1 ;;',
    '  *\\"decision\\":\\"require_approval\\"*) echo "VibeFlow hook needs approval — blocking commit; review then --no-verify if intended" >&2; exit 1 ;;',
    '  "") echo "vibeflow hook: empty decision — blocking (fail-closed)" >&2; exit 1 ;;',
    "esac",
    'echo "vibeflow hook: allowed"',
    ""
  ].join(`
`);
}
function gitPostCheckout() {
  const cmd = cliPath();
  return [
    "#!/usr/bin/env sh",
    "# VibeFlow: keep the code-navigation index in sync on branch change.",
    "# Args: $1=prev-HEAD $2=new-HEAD $3=branch-flag (1 = branch checkout).",
    '[ "${3:-0}" = "1" ] || exit 0',
    `node ${cmd} tools sync >/dev/null 2>&1 || true`,
    ""
  ].join(`
`);
}
function gitPostMerge() {
  const cmd = cliPath();
  return [
    "#!/usr/bin/env sh",
    "# VibeFlow: refresh the code-navigation index after a merge pulls in new code.",
    `node ${cmd} tools sync >/dev/null 2>&1 || true`,
    ""
  ].join(`
`);
}
function engineHookFiles() {
  return {
    ".claude/settings.json": claudeHookConfig(),
    ".codex/hooks.json": codexHookConfig(),
    ".github/copilot-hooks.json": copilotHookConfig(),
    ".githooks/pre-commit": gitPreCommit(),
    ".githooks/post-checkout": gitPostCheckout(),
    ".githooks/post-merge": gitPostMerge()
  };
}

// src/hooks/risk.ts
import { isAbsolute, resolve as resolve2 } from "node:path";
var DANGEROUS_COMMAND = [
  /\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f|branch\s+-D)\b/,
  /\b(drop\s+(database|table)|truncate\s+table)\b/i,
  /\b(mkfs|dd\s+if=|:\(\)\s*\{)/,
  /\bchmod\s+-R\s+777\b/,
  /\bcurl\b.*\|\s*(sh|bash)\b/,
  /\bsudo\b/
];
var INSTALL_COMMAND = [
  /\b(npm|pnpm|yarn|bun)\s+(install|add|i)\b/,
  /\bpip\s+install\b/,
  /\b(go\s+get|cargo\s+add|gem\s+install)\b/
];
var SECRET_CRITICAL = [/(^|[\s/])\.env(\.[\w-]+)?($|[\s/])/, /\bid_rsa\b/, /\bid_ed25519\b/];
var SECRET_HIGH = [/\.pem\b/, /(^|\/)\.ssh\//, /\bsecrets?\b/i, /\bcredentials?\b/i];
var PROTECTED_PATH = [
  /(^|\/)\.env(\.|$)/,
  /(^|\/)\.git\//,
  /(^|\/)(id_rsa|id_ed25519|.*\.pem)$/,
  /(^|\/)\.ssh\//,
  /(^|\/)secrets?\b/i,
  /(^|\/)credentials?\b/i
];
var CONFIG_PROTECTED = [
  /(^|\/)tsconfig[\w.-]*\.json$/,
  /(^|\/)biome\.jsonc?$/,
  /(^|\/)\.githooks\//,
  /(^|\/)\.eslintrc[\w.-]*$/,
  /(^|\/)\.prettierrc[\w.-]*$/
];
var RISK_ORDER = ["none", "low", "medium", "high", "critical"];
function anyMatch(patterns, value) {
  return patterns.some((re) => re.test(value));
}
function tokenize(cmd) {
  return cmd.trim().split(/\s+/).filter(Boolean);
}
function programName(token) {
  if (!token)
    return "";
  const parts = token.split("/");
  return parts[parts.length - 1] ?? "";
}
function isRecursiveRm(tokens) {
  if (programName(tokens[0]) !== "rm")
    return false;
  return tokens.slice(1).some((t) => {
    if (t === "--recursive")
      return true;
    return /^-[a-z]*[rR][a-z]*$/i.test(t);
  });
}
function gitPushForce(tokens) {
  if (programName(tokens[0]) !== "git" || tokens[1] !== "push")
    return "none";
  const rest = tokens.slice(2);
  if (rest.some((t) => t === "--force-with-lease"))
    return "lease";
  if (rest.some((t) => t === "-f" || t === "--force" || /^-[a-z]*f[a-z]*$/i.test(t)))
    return "force";
  return "none";
}
function pathArgs(tokens) {
  return tokens.slice(1).filter((t) => !t.startsWith("-") && (t.includes("/") || t.startsWith("~") || isAbsolute(t)));
}
function escapesWorkspace(path, workspace) {
  if (path.startsWith("~"))
    return true;
  const target = resolve2(workspace, path);
  const root = resolve2(workspace);
  return target !== root && !target.startsWith(`${root}/`);
}
function expandIfs(cmd) {
  return cmd.replace(/\$\{IFS\}/g, " ").replace(/\$IFS\b/g, " ");
}
function splitOperators(cmd) {
  const segments = [];
  let buf = "";
  let quote = null;
  for (let i = 0;i < cmd.length; i++) {
    const ch = cmd[i];
    if (quote) {
      buf += ch;
      if (ch === quote)
        quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === ";" || ch === "|" || ch === "&") {
      segments.push(buf);
      buf = "";
      if (cmd[i + 1] === ch)
        i++;
      continue;
    }
    buf += ch;
  }
  segments.push(buf);
  return segments.map((s) => s.trim()).filter(Boolean);
}
function stripQuotedContent(cmd) {
  let out = "";
  let quote = null;
  for (const ch of cmd) {
    if (quote) {
      if (ch === quote) {
        quote = null;
        out += " ";
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += " ";
      continue;
    }
    out += ch;
  }
  return out;
}
function stripQuoteChars(cmd) {
  return cmd.replace(/['"]/g, " ");
}
function unwrapDashC(segment) {
  const out = [];
  for (const m of segment.matchAll(/(?:^|\s)-c\s+(['"])([\s\S]*?)\1/g)) {
    if (m[2])
      out.push(m[2]);
  }
  return out;
}
function unwrapSubshell(segment) {
  const out = [];
  for (const m of segment.matchAll(/\$\(([^()]*)\)/g)) {
    const inner = m[1]?.trim();
    if (inner)
      out.push(inner);
  }
  for (const m of segment.matchAll(/`([^`]*)`/g)) {
    const inner = m[1]?.trim();
    if (inner)
      out.push(inner);
  }
  return out;
}
var MAX_UNWRAP_DEPTH = 4;
function expandSubCommands(raw) {
  const collected = new Set;
  const visit = (cmd, depth) => {
    for (const segment of splitOperators(cmd)) {
      collected.add(segment);
      if (depth >= MAX_UNWRAP_DEPTH)
        continue;
      for (const inner of [...unwrapDashC(segment), ...unwrapSubshell(segment)]) {
        visit(inner, depth + 1);
      }
    }
  };
  visit(expandIfs(raw), 0);
  return [...collected];
}
function scoreRisk(input) {
  const reasons = [];
  let risk = "none";
  const bump = (level) => {
    if (RISK_ORDER.indexOf(level) > RISK_ORDER.indexOf(risk))
      risk = level;
  };
  scoreCommand(input, bump, reasons);
  scoreFiles(input, bump, reasons);
  if (reasons.length === 0)
    reasons.push("no risk signals detected");
  return { risk, reasons };
}
function scoreCommand(input, bump, reasons) {
  const cmd = input.command ?? "";
  if (!cmd)
    return;
  const subs = expandSubCommands(cmd);
  const subTokens = subs.map((s) => tokenize(stripQuoteChars(s)));
  scoreDestructive(cmd, subs, subTokens, bump, reasons);
  scoreForcePush(subTokens, bump, reasons);
  if (anyMatch(SECRET_CRITICAL, cmd)) {
    bump("critical");
    reasons.push("command reads/writes a sensitive secret");
  } else if (anyMatch(SECRET_HIGH, cmd)) {
    bump("high");
    reasons.push("command touches secret material");
  }
  scoreWorkspaceCommand(input, subTokens, bump, reasons);
  if (anyMatch(INSTALL_COMMAND, cmd)) {
    bump("medium");
    reasons.push("package install has side effects");
  } else {
    bump("low");
  }
}
function scoreDestructive(rawCmd, subs, subTokens, bump, reasons) {
  const destructiveText = [stripQuotedContent(rawCmd), ...subs.map(stripQuotedContent)];
  const recursiveRm = subTokens.some(isRecursiveRm);
  const dangerous = destructiveText.some((s) => anyMatch(DANGEROUS_COMMAND, s));
  if (recursiveRm || dangerous) {
    bump("critical");
    reasons.push(`destructive command: ${rawCmd.slice(0, 80)}`);
  }
}
function scoreForcePush(subTokens, bump, reasons) {
  let kind = "none";
  for (const tokens of subTokens) {
    const force = gitPushForce(tokens);
    if (force === "force")
      kind = "force";
    else if (force === "lease" && kind !== "force")
      kind = "lease";
  }
  if (kind === "force") {
    bump("critical");
    reasons.push("force push overwrites remote history");
  } else if (kind === "lease") {
    bump("high");
    reasons.push("force-with-lease push needs approval");
  }
}
function scoreWorkspaceCommand(input, subTokens, bump, reasons) {
  const ws = input.workspace;
  if (!ws)
    return;
  const escaped = new Set;
  for (const tokens of subTokens) {
    for (const p of pathArgs(tokens))
      if (escapesWorkspace(p, ws))
        escaped.add(p);
  }
  if (escaped.size) {
    bump("medium");
    reasons.push(`command reads outside workspace: ${[...escaped].join(", ")}`);
  }
}
function scoreFiles(input, bump, reasons) {
  const files = input.files ?? [];
  const protectedHits = files.filter((f) => anyMatch(PROTECTED_PATH, f));
  if (protectedHits.length) {
    bump("high");
    reasons.push(`touches protected path(s): ${protectedHits.join(", ")}`);
  }
  const configHits = files.filter((f) => anyMatch(CONFIG_PROTECTED, f));
  if (configHits.length) {
    bump("high");
    reasons.push(`edits build/lint/hook config (path-protected): ${configHits.join(", ")}`);
  }
  const escaped = outOfScope(files, input.scope);
  if (escaped.length) {
    bump("high");
    reasons.push(`out of declared scope: ${escaped.join(", ")}`);
  }
  if (input.workspace) {
    const outside = files.filter((f) => escapesWorkspace(f, input.workspace));
    if (outside.length) {
      bump("high");
      reasons.push(`write escapes workspace: ${outside.join(", ")}`);
    }
  }
}
function outOfScope(files, scope) {
  if (!scope || !scope.length)
    return [];
  const prefixes = scope.map((s) => s.replace(/\*+$/, "").replace(/\/$/, ""));
  return files.filter((f) => !prefixes.some((p) => p === "" || f.startsWith(p)));
}

// src/hooks/runner.ts
function decisionFor(risk) {
  switch (risk) {
    case "critical":
      return "block";
    case "high":
      return "require_approval";
    case "medium":
      return "warn";
    default:
      return "allow";
  }
}
var HOOKS_OFF_VALUES = new Set(["off", "0"]);
function hooksDisabled(env) {
  const raw = env.VIBEFLOW_HOOKS;
  return typeof raw === "string" && HOOKS_OFF_VALUES.has(raw.trim().toLowerCase());
}
function disabledResult() {
  return { decision: "allow", risk: "none", reasons: ["hooks disabled via VIBEFLOW_HOOKS"] };
}
function evaluateHook(input, getEnv = () => process.env) {
  if (hooksDisabled(getEnv()))
    return disabledResult();
  const { risk, reasons } = scoreRisk(input);
  return { decision: decisionFor(risk), risk, reasons };
}
var HOOK_EVENTS = [
  "pre-tool-use",
  "post-tool-use",
  "pre-write",
  "post-write",
  "pre-command",
  "post-command",
  "stop",
  "skill-compliance",
  "verify-result"
];
function mapClaudeEvent(name) {
  switch (name) {
    case "PreToolUse":
      return "pre-tool-use";
    case "PostToolUse":
      return "post-tool-use";
    case "Stop":
    case "SubagentStop":
      return "stop";
    default:
      return "pre-tool-use";
  }
}
function parseClaudeNative(obj) {
  const eventName = obj.hook_event_name;
  if (typeof eventName !== "string")
    return null;
  const asStr = (v) => typeof v === "string" ? v : undefined;
  const toolInput = obj.tool_input ?? {};
  const filePath = typeof toolInput.file_path === "string" ? [toolInput.file_path] : undefined;
  const fileList = Array.isArray(toolInput.files) ? toolInput.files.map(String) : undefined;
  const files = filePath || fileList ? [...filePath ?? [], ...fileList ?? []] : undefined;
  return {
    event: mapClaudeEvent(eventName),
    tool: asStr(obj.tool_name),
    workspace: asStr(obj.workspace ?? obj.cwd),
    command: asStr(toolInput.command),
    files
  };
}
function parseHookInput(raw) {
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  const event = obj.event;
  if (typeof event === "string" && HOOK_EVENTS.includes(event)) {
    const asStr = (v) => typeof v === "string" ? v : undefined;
    const asStrArr = (v) => Array.isArray(v) ? v.map(String) : undefined;
    return {
      event,
      tool: asStr(obj.tool),
      workspace: asStr(obj.workspace),
      command: asStr(obj.command),
      files: asStrArr(obj.files),
      agent: asStr(obj.agent),
      taskId: asStr(obj.taskId),
      scope: asStrArr(obj.scope),
      intent: asStr(obj.intent)
    };
  }
  return parseClaudeNative(obj);
}
function presentDecision(result, input) {
  if (input.event === "pre-tool-use") {
    const permissionDecision = result.decision === "block" ? "deny" : result.decision === "require_approval" ? "ask" : "allow";
    return {
      json: JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision,
          permissionDecisionReason: result.reasons.join("; ")
        }
      }),
      exitCode: 0
    };
  }
  if (input.event === "stop") {
    const hasRisks = result.reasons.length > 0 && result.reasons[0] !== "no risk signals detected";
    if (result.decision === "block") {
      return {
        json: JSON.stringify({ decision: "block", reason: result.reasons.join("; ") }),
        exitCode: 0
      };
    }
    if (hasRisks) {
      return {
        json: JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "Stop",
            additionalContext: result.reasons.join("; ")
          }
        }),
        exitCode: 0
      };
    }
    return { json: "{}", exitCode: 0 };
  }
  if (input.event === "post-tool-use") {
    const hasFeedback = result.reasons.length > 0 && result.reasons[0] !== "no risk signals detected";
    if (!hasFeedback) {
      return { json: JSON.stringify({ suppressOutput: true }), exitCode: 0 };
    }
    return {
      json: JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: result.reasons.join("; ")
        }
      }),
      exitCode: 0
    };
  }
  return { json: JSON.stringify(result), exitCode: 0 };
}

// src/hooks/selftest.ts
var ATTACK_COMMANDS = [
  'bash -c "rm -rf /"',
  'sh -c "rm -rf /"',
  "$(rm -rf /)",
  "`rm -rf /`",
  "rm${IFS}-rf${IFS}/",
  "git status; rm -rf x",
  "a && rm -rf x",
  "a | rm -rf x",
  'bash -c "git push --force"'
];
var BENIGN_COMMANDS = [
  'echo "rm -rf is dangerous"',
  "grep -rf pattern file",
  'git commit -m "drop table users"',
  "git log --oneline",
  "git status",
  "ls -la",
  "bun test"
];
var CONFIG_FILES = ["tsconfig.json", "biome.json", ".githooks/pre-commit"];
function selftestCases() {
  const cases = [];
  for (const command of ATTACK_COMMANDS) {
    cases.push({ input: { event: "pre-command", command }, expected: "blocked" });
  }
  for (const command of BENIGN_COMMANDS) {
    cases.push({ input: { event: "pre-command", command }, expected: "allowed" });
  }
  for (const f of CONFIG_FILES) {
    cases.push({ input: { event: "pre-write", files: [f] }, expected: "blocked" });
  }
  cases.push({ input: { event: "pre-write", files: ["src/foo.ts"] }, expected: "allowed" });
  return cases;
}
function caseLabel(input) {
  return input.command ?? (input.files ?? []).join(", ");
}
function runSelftest(now) {
  const forceHooksOn = () => ({});
  const cases = selftestCases().map(({ input, expected }) => {
    const result = evaluateHook(input, forceHooksOn);
    const blocking = result.decision === "block" || result.decision === "require_approval";
    const actual = blocking ? "blocked" : "allowed";
    return {
      input: caseLabel(input),
      event: input.event,
      expected,
      actual,
      decision: result.decision,
      risk: result.risk,
      pass: actual === expected
    };
  });
  const failed = cases.filter((c2) => !c2.pass).length;
  return { timestamp: now(), passed: cases.length - failed, failed, cases };
}

// src/journal.ts
init_core();
import { existsSync as existsSync3 } from "node:fs";
function formatEntry(op, title, lines) {
  const date = new Date().toISOString().slice(0, 10);
  const safeTitle = title.replace(/[\r\n]+/g, " ").trim();
  const header = `## [${date}] ${op} | ${safeTitle}`;
  const body = lines && lines.length > 0 ? `${lines.join(`
`)}
` : "";
  return `
${header}
${body}`;
}
function appendJournal(base, op, title, lines) {
  appendFileSafe(journalPath(base), formatEntry(op, title, lines));
}
function ensureIndex(base) {
  const p = indexPath(base);
  if (existsSync3(p))
    return false;
  writeFileSafe(p, `# Knowledge Index

Catalog of knowledge pages — one entry per line.
`);
  return true;
}

// src/orchestrator/investigate.ts
var THRESHOLDS = {
  docs: 0.7,
  "simple-code": 0.8,
  feature: 0.85,
  architecture: 0.9,
  security: 0.95,
  deploy: 0.95
};
var DEFAULT_MAX_ROUNDS = 4;
function thresholdFor(rc) {
  return THRESHOLDS[rc];
}
function stopReason(prev, current, findings, blocked, threshold) {
  if (current >= threshold)
    return "threshold-met";
  if (blocked)
    return "blocked-by-missing-input";
  if (findings.length === 0)
    return "no-new-evidence";
  if (current <= prev)
    return "no-progress";
  return;
}
function recommend(met, confidence, threshold) {
  return met ? `Confidence ${confidence.toFixed(2)} ≥ ${threshold} — proceed with the investigated decision.` : `Confidence ${confidence.toFixed(2)} < ${threshold} — escalate: recommend the best-supported option and log uncertainty (do not merge/close).`;
}
async function investigateUnit(unit, opts) {
  const riskClass = opts.riskClass ?? "feature";
  const threshold = thresholdFor(riskClass);
  const maxRounds = opts.maxRounds ?? DEFAULT_MAX_ROUNDS;
  const question = `Raise confidence for work unit "${unit.name}" to ${threshold}`;
  const rounds = [];
  let confidence = unit.confidence ?? 0;
  let stoppedBy = "max-rounds";
  for (let r = 1;r <= maxRounds; r++) {
    const { findings, confidence: c2, blocked } = await opts.research(r, question);
    rounds.push({ round: r, question, findings, confidence: c2 });
    const prev = confidence;
    confidence = Math.max(confidence, c2);
    const reason = stopReason(prev, confidence, findings, Boolean(blocked), threshold);
    if (reason) {
      stoppedBy = reason;
      break;
    }
  }
  const met = confidence >= threshold;
  return {
    unit: unit.name,
    question,
    threshold,
    rounds,
    finalConfidence: confidence,
    met,
    proceed: met,
    stoppedBy,
    recommendation: recommend(met, confidence, threshold)
  };
}

// src/orchestrator/run.ts
init_core();
init_marker();
var DEFAULT_CONCURRENCY = 3;
async function runParallel(items, worker, concurrency = DEFAULT_CONCURRENCY) {
  const results = new Array(items.length);
  let next = 0;
  const lanes = Math.max(1, Math.min(concurrency, items.length || 1));
  const lane = async () => {
    while (true) {
      const i = next++;
      if (i >= items.length)
        return;
      results[i] = await worker(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: lanes }, lane));
  return results;
}
function applyOutcome(unit, outcome) {
  const evidence = [...new Set([...unit.evidence ?? [], ...outcome.evidence ?? []])];
  return {
    ...unit,
    status: outcome.status,
    confidence: outcome.confidence,
    evidence,
    gates: { ...unit.gates, ...outcome.gates ?? {} },
    resources: { ...unit.resources, ...outcome.resources ?? {} },
    knowledge_heavy: outcome.knowledge_heavy !== undefined ? outcome.knowledge_heavy : unit.knowledge_heavy,
    knowledge_heavy_source: outcome.knowledge_heavy_source !== undefined ? outcome.knowledge_heavy_source : unit.knowledge_heavy_source,
    skills_injected: outcome.skills_injected !== undefined ? strArray(outcome.skills_injected) : unit.skills_injected,
    skills_required: outcome.skills_required !== undefined ? strArray(outcome.skills_required) : unit.skills_required,
    skills_used: outcome.skills_used !== undefined ? strArray(outcome.skills_used) : unit.skills_used
  };
}
async function orchestrateUnits(opts) {
  const reviews = new Array(opts.units.length);
  for (const u of opts.units)
    createMarker(u.name, opts.agent);
  const units = await runParallel(opts.units, async (u, i) => {
    updateMarker(u.name, { status: "running" });
    const outcome = await opts.dispatcher(u);
    const reviewed = applyOutcome(u, outcome);
    const review = opts.reviewer(reviewed, outcome);
    reviews[i] = { unit: u.name, pass: review.pass, reason: review.reason };
    if (!review.pass) {
      reviewed.status = "blocked";
      reviewed.gates = { ...reviewed.gates, review: "fail" };
      updateMarker(u.name, {
        status: "blocked",
        confidence: reviewed.confidence,
        evidence: reviewed.evidence
      });
    } else {
      reviewed.gates = { ...reviewed.gates, review: "pass" };
      updateMarker(u.name, {
        status: "done",
        confidence: reviewed.confidence,
        evidence: reviewed.evidence
      });
    }
    return reviewed;
  }, opts.concurrency ?? DEFAULT_CONCURRENCY);
  return { units, reviews };
}
function goalEval(state) {
  const units = state.work_units ?? [];
  const reasons = [];
  if (!units.length)
    return { verdict: "partial", reasons: ["no work units to evaluate"] };
  const blocked = units.filter((u) => u.status === "blocked");
  if (blocked.length) {
    for (const u of blocked)
      reasons.push(`blocked: ${u.name}`);
    return { verdict: "blocked", reasons };
  }
  const incomplete = units.filter((u) => u.status !== "done" || u.confidence < 1 || !u.evidence?.length);
  if (incomplete.length) {
    for (const u of incomplete) {
      reasons.push(`incomplete: ${u.name} (status=${u.status}, conf=${u.confidence}, evidence=${u.evidence?.length ?? 0})`);
    }
    return { verdict: "partial", reasons };
  }
  reasons.push("all units done at confidence 1.0 with evidence");
  return { verdict: "met", reasons };
}

// src/commands.ts
init_preflight();

// src/safety/checkpoint.ts
init_core();
import { spawnSync as spawnSync5 } from "node:child_process";
import { copyFileSync, existsSync as existsSync5, mkdirSync as mkdirSync3, statSync, writeFileSync as writeFileSync3 } from "node:fs";
import { dirname as dirname3, join as join5 } from "node:path";
var SIZE_CAP = 5 * 1024 * 1024;
var BACKUP_SUBDIR = join5(CTX_DIR, "backup");
var PROTECTED_PREFIXES = [".git/", "node_modules/", `${BACKUP_SUBDIR}/`];
function defaultGit(base) {
  return (args) => {
    const r = spawnSync5("git", args, { cwd: base, encoding: "utf8" });
    return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  };
}
function defaultFs() {
  return {
    exists: existsSync5,
    copyFile: (src, dest) => {
      mkdirSync3(dirname3(dest), { recursive: true });
      copyFileSync(src, dest);
    },
    mkdirp: (p) => mkdirSync3(p, { recursive: true }),
    size: (p) => statSync(p).size,
    isDir: (p) => {
      try {
        return statSync(p).isDirectory();
      } catch {
        return false;
      }
    },
    writeFile: (p, content) => {
      mkdirSync3(dirname3(p), { recursive: true });
      writeFileSync3(p, content);
    }
  };
}
function lines(stdout) {
  return stdout.split(`
`).map((l) => l.trim()).filter((l) => l.length > 0);
}
function gitState(base, git = defaultGit(base)) {
  const isRepo = git(["rev-parse", "--is-inside-work-tree"]).status === 0;
  if (!isRepo) {
    return { isRepo: false, hasCommits: false, dirty: false, untracked: [], ignoredDirty: [] };
  }
  const hasCommits = git(["rev-parse", "--verify", "HEAD"]).status === 0;
  const dirty = lines(git(["status", "--porcelain"]).stdout).length > 0;
  const untracked = lines(git(["ls-files", "--others", "--exclude-standard"]).stdout);
  const ignoredDirty = lines(git(["ls-files", "--others", "--ignored", "--exclude-standard"]).stdout);
  return { isRepo, hasCommits, dirty, untracked, ignoredDirty };
}
function isProtected(rel) {
  return PROTECTED_PREFIXES.some((p) => rel === p.slice(0, -1) || rel.startsWith(p));
}
function makeWip(base, runId, hasCommits, git) {
  const baseRef = hasCommits ? lines(git(["rev-parse", "--verify", "HEAD"]).stdout)[0] ?? null : null;
  git(["add", "-A"]);
  git(["commit", "-m", `vibeflow WIP ${runId}`, "--no-verify"]);
  const head = git(["rev-parse", "HEAD"]);
  const wipSha = head.status === 0 ? lines(head.stdout)[0] ?? null : null;
  return { wipSha, baseRef };
}
function backupIgnored(base, runId, ignoredDirty, fs, sizeCap) {
  const candidates = ignoredDirty.filter((rel) => !isProtected(rel));
  if (candidates.length === 0)
    return { backupDir: null, backedUp: [], skipped: [] };
  const backupDir = join5(base, BACKUP_SUBDIR, runId);
  const backedUp = [];
  const skipped = [];
  for (const rel of candidates) {
    const src = join5(base, rel);
    try {
      if (fs.isDir(src)) {
        skipped.push(`${rel} (ignored directory — not backed up)`);
        continue;
      }
      if (fs.size(src) > sizeCap) {
        skipped.push(`${rel} (> ${sizeCap} bytes size cap)`);
        continue;
      }
      fs.copyFile(src, join5(backupDir, rel));
      backedUp.push(rel);
    } catch (err) {
      const code = err?.code;
      skipped.push(`${rel} (${code === "ENOENT" ? "stale — no longer exists" : code ?? "copy failed"})`);
    }
  }
  return { backupDir, backedUp, skipped };
}
function ensureCtxIgnored(base, fs) {
  const ignore = join5(base, CTX_DIR, ".gitignore");
  if (fs.exists(ignore))
    return;
  const body = [
    "# Ignore transient + secret artifacts; keep curated knowledge and canonical context.",
    "*",
    "!.gitignore",
    "!knowledge/",
    "!knowledge/**",
    "!*.md",
    "!SETTINGS.json",
    "backup/",
    "dispatch/",
    "workunits/",
    "WORKFLOW_STATE.json",
    ""
  ].join(`
`);
  fs.writeFile(ignore, body);
}
function createCheckpoint(base, runId, opts = {}) {
  const git = opts.git ?? defaultGit(base);
  const fs = opts.fs ?? defaultFs();
  const sizeCap = opts.sizeCapBytes ?? SIZE_CAP;
  const empty = {
    isRepo: false,
    hasCommits: false,
    wipSha: null,
    backupDir: null,
    backedUp: [],
    skipped: [],
    baseRef: null
  };
  const state = gitState(base, git);
  if (!state.isRepo)
    return empty;
  ensureCtxIgnored(base, fs);
  const wip = opts.autoWip ? makeWip(base, runId, state.hasCommits, git) : { wipSha: null, baseRef: null };
  const backup = backupIgnored(base, runId, state.ignoredDirty, fs, sizeCap);
  return {
    isRepo: true,
    hasCommits: state.hasCommits,
    wipSha: wip.wipSha,
    backupDir: backup.backupDir,
    backedUp: backup.backedUp,
    skipped: backup.skipped,
    baseRef: wip.baseRef
  };
}
function recoveryHint(cp) {
  if (!cp.isRepo) {
    return "no git — engine edits are irreversible; no checkpoint was taken";
  }
  const parts = [];
  if (cp.wipSha) {
    const target = cp.baseRef ?? cp.wipSha;
    parts.push(`To undo engine edits: git reset --hard ${target}`);
    parts.push(`(WIP commit ${cp.wipSha} holds your pre-dispatch state)`);
  }
  if (cp.backupDir) {
    parts.push(`Ignored files are restorable from ${cp.backupDir}`);
  }
  if (parts.length === 0) {
    return "no checkpoint snapshot taken — review `git status` before keeping engine edits";
  }
  return parts.join(`
`);
}
function restoreIgnored(cp, base, fs = defaultFs()) {
  if (!cp.backupDir)
    return [];
  const restored = [];
  for (const rel of cp.backedUp) {
    fs.copyFile(join5(cp.backupDir, rel), join5(base, rel));
    restored.push(rel);
  }
  return restored;
}

// src/safety/quota.ts
var MS_PER_SECOND = 1000;
var KIND_BY_TOKEN = {
  rate_limit: "rate-limit",
  rate_limit_error: "rate-limit",
  overloaded: "overloaded",
  overloaded_error: "overloaded",
  insufficient_quota: "quota-exhausted",
  billing_error: "quota-exhausted",
  resource_exhausted: "quota-exhausted",
  quota_exceeded: "quota-exhausted"
};
var KIND_BY_STATUS = {
  "429": "rate-limit",
  "529": "overloaded"
};
var PROSE_PATTERNS = [
  { re: /too many requests|rate[ _-]?limit/, kind: "rate-limit" },
  { re: /overloaded/, kind: "overloaded" },
  {
    re: /quota (?:exceeded|exhausted)|resource_exhausted|insufficient_quota/,
    kind: "quota-exhausted"
  }
];
function isObject(v) {
  return typeof v === "object" && v !== null;
}
function parseJsonObjects(stdout) {
  const out = [];
  const whole = tryParse(stdout);
  if (whole !== undefined) {
    if (isObject(whole))
      out.push(whole);
    return out;
  }
  for (const line of stdout.split(`
`)) {
    const trimmed = line.trim();
    if (!trimmed)
      continue;
    const v = tryParse(trimmed);
    if (isObject(v))
      out.push(v);
  }
  return out;
}
function tryParse(s) {
  try {
    return JSON.parse(s.trim());
  } catch {
    return;
  }
}
function tokenFromObject(obj) {
  const err = obj.error;
  if (typeof err === "string" && KIND_BY_TOKEN[err])
    return err;
  if (isObject(err) && typeof err.type === "string" && KIND_BY_TOKEN[err.type])
    return err.type;
  if (typeof obj.subtype === "string" && KIND_BY_TOKEN[obj.subtype])
    return obj.subtype;
  if (typeof obj.type === "string" && KIND_BY_TOKEN[obj.type])
    return obj.type;
  return;
}
function retryFromObject(obj) {
  const ms = obj.retry_delay_ms ?? obj.retryAfterMs;
  if (typeof ms === "number" && Number.isFinite(ms))
    return ms;
  const secs = obj.retry_after ?? obj.retry_delay;
  if (typeof secs === "number" && Number.isFinite(secs))
    return secs * MS_PER_SECOND;
  return;
}
function fromTypedJson(stdout) {
  const objs = parseJsonObjects(stdout);
  for (const obj of [...objs].reverse()) {
    const token = tokenFromObject(obj);
    if (!token)
      continue;
    const kind = KIND_BY_TOKEN[token];
    return {
      limited: true,
      kind,
      retryAfterMs: retryFromObject(obj),
      confidence: "high",
      evidence: `typed error ${token} -> ${kind}`
    };
  }
  return;
}
function parseRetryAfter(stdout) {
  const m = stdout.match(/retry-after:\s*([^\n\r]+)/i);
  if (!m?.[1])
    return;
  const raw = m[1].trim();
  if (/^\d+$/.test(raw))
    return Number(raw) * MS_PER_SECOND;
  const when = Date.parse(raw);
  if (Number.isNaN(when))
    return;
  return Math.max(0, when - Date.now());
}
function fromHttpStatus(stdout) {
  for (const [code, kind] of Object.entries(KIND_BY_STATUS)) {
    const structured = new RegExp(`(?:"status"\\s*:\\s*${code}\\b|http[ /]?${code}\\b)`, "i");
    if (!structured.test(stdout))
      continue;
    return {
      limited: true,
      kind,
      retryAfterMs: parseRetryAfter(stdout),
      confidence: "high",
      evidence: `http ${code} -> ${kind}`
    };
  }
  return;
}
function fromProse(stdout) {
  const text = stdout.toLowerCase();
  for (const { re, kind } of PROSE_PATTERNS) {
    if (!re.test(text))
      continue;
    return {
      limited: true,
      kind,
      confidence: "low",
      evidence: `prose heuristic -> ${kind} (advisory)`
    };
  }
  return;
}
function detectQuota(r) {
  const text = [r.stdout, r.stderr, r.reason].filter(Boolean).join(`
`);
  const typed = fromTypedJson(text);
  if (typed)
    return typed;
  const http = fromHttpStatus(text);
  if (http)
    return http;
  if (r.status !== 0) {
    const prose = fromProse(text);
    if (prose)
      return prose;
  }
  return { limited: false, confidence: "high", evidence: "no quota signal" };
}

// src/commands.ts
init_scanner();
init_settings();

// src/skills/registry.ts
init_core();
import { existsSync as existsSync7, readFileSync as readFileSync5, readdirSync as readdirSync2, statSync as statSync3 } from "node:fs";
import { join as join7 } from "node:path";

// src/frontmatter.ts
function coerce2(raw) {
  const s = raw.trim();
  if (s === "")
    return "";
  if (s.startsWith('"') && s.endsWith('"') || s.startsWith("'") && s.endsWith("'")) {
    return s.slice(1, -1);
  }
  if (s === "true")
    return true;
  if (s === "false")
    return false;
  if (s === "null" || s === "~")
    return null;
  if (/^-?\d+(\.\d+)?$/.test(s))
    return Number(s);
  return s;
}
function parseInlineList(s) {
  const inner = s.slice(1, -1).trim();
  if (!inner)
    return [];
  return inner.split(",").map((x) => coerce2(x));
}
function indentOf(line) {
  return line.length - line.replace(/^ +/, "").length;
}
var FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
function emptyMap() {
  return Object.create(null);
}
function parseBlock(lines2) {
  const result = emptyMap();
  let i = 0;
  while (i < lines2.length) {
    const line = lines2[i];
    if (line === undefined) {
      i++;
      continue;
    }
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      i++;
      continue;
    }
    const m = trimmed.match(/^([A-Za-z0-9_-]+):(.*)$/);
    if (!m || m[1] === undefined) {
      i++;
      continue;
    }
    const key = m[1];
    const valuePart = (m[2] ?? "").trim();
    const baseIndent = indentOf(line);
    const forbidden = FORBIDDEN_KEYS.has(key);
    if (valuePart === "") {
      const child = [];
      let j = i + 1;
      while (j < lines2.length) {
        const l = lines2[j];
        if (l === undefined) {
          j++;
          break;
        }
        if (l.trim() === "") {
          child.push(l);
          j++;
          continue;
        }
        if (indentOf(l) <= baseIndent)
          break;
        child.push(l);
        j++;
      }
      if (!forbidden) {
        const firstReal = child.find((l) => l.trim() !== "");
        if (firstReal?.trim().startsWith("- ")) {
          result[key] = child.filter((l) => l.trim().startsWith("- ")).map((l) => coerce2(l.trim().slice(2)));
        } else if (firstReal) {
          result[key] = parseBlock(child);
        } else {
          result[key] = "";
        }
      }
      i = j;
    } else if (valuePart.startsWith("[") && valuePart.endsWith("]")) {
      if (!forbidden)
        result[key] = parseInlineList(valuePart);
      i++;
    } else {
      if (!forbidden)
        result[key] = coerce2(valuePart);
      i++;
    }
  }
  return result;
}
function parseFrontmatter(text) {
  const norm = text.replace(/\r\n/g, `
`);
  const lines2 = norm.split(`
`);
  if (lines2[0]?.trim() !== "---")
    return { data: {}, body: norm };
  let endIdx = -1;
  for (let i = 1;i < lines2.length; i++) {
    if (lines2[i]?.trim() === "---") {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1)
    return { data: {}, body: norm };
  const data = parseBlock(lines2.slice(1, endIdx));
  const body = lines2.slice(endIdx + 1).join(`
`).replace(/^\n+/, "");
  return { data, body };
}

// src/skills/registry.ts
var SKILL_ROOTS = [join7(CTX_DIR, "skills"), join7(".kiro", "skills"), join7(".claude", "skills")];
var VALID_STATUS = [
  "verified",
  "unverified",
  "experimental",
  "draft",
  "deprecated"
];
var STATUS_RANK = {
  verified: 4,
  experimental: 3,
  draft: 2,
  unverified: 1,
  deprecated: 0
};
function asStringArray(v) {
  if (!Array.isArray(v))
    return;
  const out = v.map((x) => String(x)).filter(Boolean);
  return out.length ? out : undefined;
}
function asRequires(v) {
  if (!v || typeof v !== "object")
    return;
  const r = v;
  const fs = r.filesystem;
  const requires = {};
  if (fs === "read" || fs === "write" || fs === "none")
    requires.filesystem = fs;
  if (typeof r.network === "boolean")
    requires.network = r.network;
  if (typeof r.shell === "boolean")
    requires.shell = r.shell;
  return Object.keys(requires).length ? requires : undefined;
}
function parseSkill(skillMdPath, dir, opts = {}) {
  let text;
  try {
    text = readFileSync5(skillMdPath, "utf8");
  } catch {
    return null;
  }
  const { data } = parseFrontmatter(text);
  const ownStatus = Object.prototype.hasOwnProperty.call(data, "status") ? data.status : undefined;
  const name = typeof data.name === "string" ? data.name.trim() : "";
  const description = typeof data.description === "string" ? data.description.trim() : "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name))
    return null;
  if (!description || description.length > 1024)
    return null;
  const statusRaw = typeof ownStatus === "string" ? ownStatus : "";
  let status = VALID_STATUS.includes(statusRaw) ? statusRaw : "unverified";
  const provenance = opts.provenance ?? "local";
  if (provenance !== "local" && status === "verified") {
    status = "experimental";
  }
  return {
    name,
    description,
    version: typeof data.version === "string" ? data.version : undefined,
    status,
    capabilities: asStringArray(data.capabilities),
    triggers: asStringArray(data.triggers),
    requires: asRequires(data.requires),
    dir,
    path: skillMdPath
  };
}
function discoverSkills(repo) {
  const byName = new Map;
  for (const root of SKILL_ROOTS) {
    const base = join7(repo, root);
    if (!existsSync7(base))
      continue;
    let entries;
    try {
      entries = readdirSync2(base);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const dir = join7(base, entry);
      try {
        if (!statSync3(dir).isDirectory())
          continue;
      } catch {
        continue;
      }
      const skillMd = join7(dir, "SKILL.md");
      if (!existsSync7(skillMd))
        continue;
      const skill = parseSkill(skillMd, dir);
      if (skill && !byName.has(skill.name))
        byName.set(skill.name, skill);
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}
function matchSkillsForFile(skills, filename) {
  const lower = filename.toLowerCase();
  const ext = lower.split(".").pop() ?? "";
  const matches = [];
  for (const skill of skills) {
    if (skill.status === "deprecated")
      continue;
    const triggers = (skill.triggers ?? []).map((t) => t.toLowerCase());
    if (triggers.includes(ext)) {
      matches.push({ skill, reason: `extension .${ext} matches a declared trigger`, score: 1 });
    } else if (triggers.some((t) => lower.includes(t))) {
      matches.push({ skill, reason: "filename contains a declared trigger", score: 0.6 });
    }
  }
  return matches.sort(byScoreThenStatus);
}
function matchSkillsForTask(skills, task) {
  const text = task.toLowerCase();
  const matches = [];
  for (const skill of skills) {
    if (skill.status === "deprecated")
      continue;
    const terms = [...skill.triggers ?? [], ...skill.capabilities ?? []].map((t) => t.toLowerCase());
    let hits = 0;
    const hit = [];
    for (const term of terms) {
      if (!term)
        continue;
      const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
      if (re.test(text)) {
        hits++;
        hit.push(term);
      }
    }
    if (hits > 0) {
      matches.push({
        skill,
        reason: `task mentions: ${hit.join(", ")}`,
        score: Math.min(1, hits / 3)
      });
    }
  }
  return matches.sort(byScoreThenStatus);
}
function byScoreThenStatus(a, b) {
  if (b.score !== a.score)
    return b.score - a.score;
  return STATUS_RANK[b.skill.status] - STATUS_RANK[a.skill.status];
}
function renderSkillIndex(skills) {
  const header = `# Skill Index

| skill | status | capabilities |
|-------|--------|--------------|
`;
  if (!skills.length)
    return header;
  const rows = skills.map((s) => `| ${s.name} | ${s.status} | ${(s.capabilities ?? []).join(", ")} |`).join(`
`);
  return `${header}${rows}
`;
}

// src/skills/resolver.ts
var READER_SKILL_BY_EXT = {
  md: "markdown-reader",
  markdown: "markdown-reader",
  txt: "text-reader",
  doc: "docx-reader",
  docx: "docx-reader",
  xls: "xlsx-reader",
  xlsx: "xlsx-reader",
  csv: "csv-reader",
  tsv: "csv-reader",
  ppt: "pptx-reader",
  pptx: "pptx-reader",
  pdf: "pdf-reader",
  json: "json-reader",
  yaml: "yaml-reader",
  yml: "yaml-reader",
  png: "image-ocr",
  jpg: "image-ocr",
  jpeg: "image-ocr",
  gif: "image-ocr",
  webp: "image-ocr"
};
function skillForFile(name) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return READER_SKILL_BY_EXT[ext] ?? "generic-file-reader";
}
function satisfier(local, reader, filename) {
  const verified = local.filter((s) => s.status === "verified");
  const byName = verified.find((s) => s.name === reader);
  if (byName)
    return byName;
  const match = matchSkillsForFile(verified, filename)[0]?.skill;
  return match;
}
function resolveSkillNeeds(input) {
  const local = discoverSkills(input.repo);
  const needs = new Map;
  const addReaderNeed = (filename, ext, why) => {
    const reader = skillForFile(filename);
    if (needs.has(reader))
      return;
    const hit = satisfier(local, reader, filename);
    needs.set(reader, {
      need: reader,
      reason: why,
      status: hit ? "satisfied" : "missing",
      satisfiedBy: hit?.name,
      acquire: hit ? undefined : `vf discover skills ${ext} --yes`
    });
  };
  for (const name of input.attachments ?? []) {
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    addReaderNeed(name, ext, `attachment ${name}`);
  }
  for (const ext of input.fileTypes ?? []) {
    const clean = ext.trim().toLowerCase().replace(/^\./, "");
    if (clean)
      addReaderNeed(`x.${clean}`, clean, `declared file type .${clean}`);
  }
  for (const fw of input.profile?.frameworks ?? []) {
    const key = `docs:${fw.toLowerCase()}`;
    if (needs.has(key))
      continue;
    needs.set(key, {
      need: `${fw} docs`,
      reason: `detected framework ${fw} — prefer current docs over stale model knowledge`,
      status: "missing",
      acquire: `vf discover docs ${fw} --yes`
    });
  }
  return [...needs.values()].sort((a, b) => {
    if (a.status !== b.status)
      return a.status === "missing" ? -1 : 1;
    return a.need.localeCompare(b.need);
  });
}
function renderSkillNeeds(needs) {
  if (!needs.length)
    return `No skill needs derived from the current context.
`;
  return `${needs.map((n) => {
    const mark = n.status === "satisfied" ? "✓" : "•";
    const tail = n.status === "satisfied" ? `satisfied by ${n.satisfiedBy}` : `missing — ${n.acquire}`;
    return `${mark} ${n.need}  (${n.reason}) — ${tail}`;
  }).join(`
`)}
`;
}

// src/tools/index.ts
import { existsSync as existsSync8 } from "node:fs";
import { join as join8 } from "node:path";

// src/tools/codegraph.ts
init_core();
var BINARY = "codegraph";
var NPM_PACKAGE = "@colbymchenry/codegraph";
var SERVE_ARGS = ["serve", "--mcp"];
var INIT_ARGS = ["init", "-i"];
var CODEGRAPH_TOOLS = [
  "codegraph_explore",
  "codegraph_search",
  "codegraph_callers",
  "codegraph_callees",
  "codegraph_impact",
  "codegraph_node",
  "codegraph_files",
  "codegraph_status"
];
function detect(opts) {
  const has = opts?.has ?? hasCommand;
  return has(BINARY);
}
var INDEX_DIR = ".codegraph";
function indexBuildStep() {
  return {
    cmd: BINARY,
    args: [...INIT_ARGS],
    description: "Build the per-repo CodeGraph index into .codegraph/."
  };
}
function installPlan() {
  return {
    steps: [
      {
        cmd: "npm",
        args: ["i", "-g", NPM_PACKAGE],
        description: `Install CodeGraph globally via npm (${NPM_PACKAGE}).`
      },
      {
        cmd: BINARY,
        args: INIT_ARGS,
        description: "Build the per-repo CodeGraph index into .codegraph/."
      }
    ]
  };
}
function mcpConfigFor(engine) {
  const server = { command: BINARY, args: [...SERVE_ARGS], env: {} };
  return buildStdioEntry(engine, BINARY, server, [...CODEGRAPH_TOOLS]);
}

// src/tools/lsp.ts
init_core();
var BRIDGE = "mcp-language-server";
var BRIDGE_GO_PKG = "github.com/isaacphi/mcp-language-server@latest";
var WORKSPACE_FLAG = "--workspace";
var LSP_FLAG = "--lsp";
var ARG_SEPARATOR = "--";
var NPM_GLOBAL = ["i", "-g"];
var SERVERS = {
  typescript: {
    key: "typescript",
    serverCmd: "typescript-language-server",
    serverArgs: ["--stdio"],
    install: {
      cmd: "npm",
      args: [...NPM_GLOBAL, "typescript-language-server", "typescript"],
      description: "Install the TypeScript/JavaScript language server."
    }
  },
  python: {
    key: "python",
    serverCmd: "pyright-langserver",
    serverArgs: ["--stdio"],
    install: {
      cmd: "npm",
      args: [...NPM_GLOBAL, "pyright"],
      description: "Install the Python language server (pyright)."
    }
  },
  go: {
    key: "go",
    serverCmd: "gopls",
    serverArgs: [],
    install: {
      cmd: "go",
      args: ["install", "golang.org/x/tools/gopls@latest"],
      description: "Install the Go language server (gopls)."
    }
  },
  rust: {
    key: "rust",
    serverCmd: "rust-analyzer",
    serverArgs: [],
    install: {
      cmd: "rustup",
      args: ["component", "add", "rust-analyzer"],
      description: "Install the Rust language server (rust-analyzer)."
    }
  },
  kotlin: {
    key: "kotlin",
    serverCmd: "kotlin-language-server",
    serverArgs: [],
    install: {
      cmd: "brew",
      args: ["install", "kotlin-language-server"],
      description: "Install the Kotlin language server (or build fwcd/kotlin-language-server manually)."
    }
  },
  java: {
    key: "java",
    serverCmd: "jdtls",
    serverArgs: [],
    install: {
      cmd: "brew",
      args: ["install", "jdtls"],
      description: "Install the Eclipse JDT language server (jdtls)."
    }
  }
};
function normalizeLanguage(language) {
  const lower = language.toLowerCase();
  if (lower === "javascript")
    return "typescript";
  return lower in SERVERS ? lower : null;
}
function serverKeysFor(languages) {
  const keys = [];
  for (const language of languages) {
    const key = normalizeLanguage(language);
    if (key && !keys.includes(key))
      keys.push(key);
  }
  return keys;
}
function detect2(opts) {
  const has = opts?.has ?? hasCommand;
  return has(BRIDGE);
}
function installPlan2(languages) {
  const steps = [
    {
      cmd: "go",
      args: ["install", BRIDGE_GO_PKG],
      description: "Install the mcp-language-server MCP↔LSP bridge."
    }
  ];
  for (const key of serverKeysFor(languages)) {
    const server = SERVERS[key];
    if (server)
      steps.push(server.install);
  }
  return { steps };
}
function bridgeArgs(workspace, server) {
  const args = [WORKSPACE_FLAG, workspace, LSP_FLAG, server.serverCmd];
  if (server.serverArgs.length > 0)
    args.push(ARG_SEPARATOR, ...server.serverArgs);
  return args;
}
function mcpServersFor(engine, ctx) {
  const entries = [];
  for (const key of serverKeysFor(ctx.languages)) {
    const server = SERVERS[key];
    if (!server)
      continue;
    const name = `lsp-${server.key}`;
    const stdio = { command: BRIDGE, args: bridgeArgs(ctx.workspace, server), env: {} };
    entries.push(buildStdioEntry(engine, name, stdio, [name]));
  }
  return entries;
}

// src/tools/index.ts
var CLAUDE_CONFIG = ".mcp.json";
var COPILOT_CONFIG = "~/.copilot/mcp-config.json";
var CODEX_CONFIG = "~/.codex/config.toml";
function buildStdioEntry(engine, name, server, tools) {
  if (engine === "codex") {
    return {
      engine,
      configPath: CODEX_CONFIG,
      section: `mcp_servers.${name}`,
      command: server.command,
      args: server.args,
      disabledTools: [],
      tools
    };
  }
  if (engine === "copilot") {
    return {
      engine,
      configPath: COPILOT_CONFIG,
      servers: { [name]: { ...server, tools: ["*"] } },
      tools
    };
  }
  return { engine, configPath: CLAUDE_CONFIG, servers: { [name]: server }, tools };
}
var TOOLS = {
  codegraph: {
    name: "codegraph",
    title: "CodeGraph",
    description: "100% local code graph (tree-sitter + SQLite) exposed as an MCP server.",
    detect: (opts) => detect(opts),
    installPlan: () => installPlan(),
    mcpEntries: (engine) => [mcpConfigFor(engine)],
    indexPresent: (base) => existsSync8(join8(base, INDEX_DIR)),
    indexPlan: () => ({ steps: [indexBuildStep()] })
  },
  lsp: {
    name: "lsp",
    title: "LSP Bridge",
    description: "Language-server navigation via the mcp-language-server MCP↔LSP bridge.",
    detect: (opts) => detect2(opts),
    installPlan: (ctx) => installPlan2(ctx.languages),
    mcpEntries: (engine, ctx) => mcpServersFor(engine, ctx)
  }
};
var TOOL_ORDER = ["codegraph", "lsp"];
function resolveTools(enabled, engine, ctx) {
  const entries = [];
  const priority = [];
  for (const name of TOOL_ORDER) {
    if (!enabled[name])
      continue;
    const toolEntries = TOOLS[name].mcpEntries(engine, ctx);
    entries.push(...toolEntries);
    for (const entry of toolEntries) {
      for (const tool of entry.tools)
        if (!priority.includes(tool))
          priority.push(tool);
    }
  }
  return { entries, priority };
}

// src/ui.ts
init_core();
import { isatty } from "node:tty";
var TTY = isatty(2);
var SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

class Spinner {
  i = 0;
  timer = null;
  msg = "";
  running = false;
  start(msg) {
    this.msg = msg;
    if (!TTY) {
      console.error(`  ${msg}...`);
      return;
    }
    this.running = true;
    this.timer = setInterval(() => {
      this.i = (this.i + 1) % SPINNER_FRAMES.length;
      this.line(`${c.cyan(SPINNER_FRAMES[this.i] ?? "")} ${this.msg}`);
    }, 80);
    this.line(`${c.cyan(SPINNER_FRAMES[0] ?? "")} ${this.msg}`);
  }
  succeed(msg) {
    this.stop();
    if (msg)
      this.msg = msg;
    if (TTY)
      this.line(`${c.green("✔")} ${this.msg}`);
    else
      console.error(`${c.green("✔")} ${this.msg}`);
  }
  fail(msg) {
    this.stop();
    if (msg)
      this.msg = msg;
    if (TTY)
      this.line(`${c.red("✖")} ${this.msg}`);
    else
      console.error(`${c.red("✖")} ${this.msg}`);
  }
  text(msg) {
    this.msg = msg;
    if (TTY && this.running)
      this.line(`${c.cyan(SPINNER_FRAMES[this.i] ?? "")} ${this.msg}`);
  }
  stop() {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
  line(text) {
    process.stderr.write(`\r\x1B[K${text}`);
  }
}
function table(headers, rows) {
  const colW = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]?.length ?? 0)));
  const sep = colW.map((w) => "─".repeat(w)).join("─┬─");
  const line = (row) => ` ${row.map((cell, i) => cell.padEnd(colW[i] ?? 0)).join(" │ ")} `;
  const hdr = line(headers);
  const div = `─${sep}─`;
  const body = rows.map(line).join(`
`);
  return `┌${div}┐
${hdr}
├${div}┤
${body}
└${div}┘`;
}
function panel(title, body, color = c.cyan) {
  const lines2 = body.split(`
`);
  const w = Math.max(...lines2.map((l) => l.length), title.length + 4);
  const top = color(`┌─ ${title} ${"─".repeat(Math.max(0, w - title.length - 2))}`);
  const mid = lines2.map((l) => color(`│ ${l.padEnd(w)}`)).join(`
`);
  const bot = color(`└${"─".repeat(w + 2)}┘`);
  return `${top}
${mid}
${bot}`;
}

// src/workflow/lifecycle.ts
init_core();
import { existsSync as existsSync9, readFileSync as readFileSync6, rmSync } from "node:fs";
import { join as join9, resolve as resolve3 } from "node:path";
var defaultRm = (p) => rmSync(p, { recursive: true, force: true });
var defaultExists = (p) => existsSync9(p);
var MANAGED_ENGINE_FILES = [
  "CLAUDE.md",
  "AGENTS.md",
  ".github/copilot-instructions.md",
  ".mcp.json",
  ".codex/config.toml"
];
var GIT_DIR = ".git";
var GENERATION_MARKERS = ["generated by vibeflow", "managed by vibeflow"];
function isManagedGenerated(content) {
  const lower = content.toLowerCase();
  return GENERATION_MARKERS.some((m) => lower.includes(m));
}
function describeWorkflow(repo, state) {
  if (!state)
    return `no workflow in ${repo}`;
  const names = state.work_units.map((u) => u.name);
  const unitLine = names.length ? `${names.length} work unit(s): ${names.join(", ")}` : "0 work units";
  return `workflow in ${repo}
  goal: ${state.goal}
  ${unitLine}`;
}
function classifyManagedFiles(repo, exists) {
  const targets = [];
  const notes = [];
  for (const rel of MANAGED_ENGINE_FILES) {
    const abs = join9(repo, rel);
    if (!exists(abs))
      continue;
    try {
      if (isManagedGenerated(readFileSync6(abs, "utf8"))) {
        targets.push(abs);
      } else {
        notes.push(rel);
      }
    } catch (e) {
      if (e?.code === "ENOENT")
        continue;
      notes.push(rel);
    }
  }
  return { targets, notes };
}
function planDelete(base, opts = {}, exists = defaultExists) {
  const repo = resolve3(base);
  const ctxDir = join9(repo, CTX_DIR);
  const state = readState(repo);
  if (!exists(ctxDir)) {
    return { repo, ctxDir, targets: [], preserved: [], summary: `no workflow in ${repo}` };
  }
  const targets = [ctxDir];
  const preserved = [];
  let summary = describeWorkflow(repo, state);
  if (!opts.all) {
    for (const rel of MANAGED_ENGINE_FILES) {
      if (exists(join9(repo, rel)))
        preserved.push(join9(repo, rel));
    }
    return { repo, ctxDir, targets, preserved, summary };
  }
  const { targets: managed, notes } = classifyManagedFiles(repo, exists);
  targets.push(...managed);
  for (const rel of notes)
    preserved.push(join9(repo, rel));
  if (notes.length)
    summary += `
  preserved (hand-edited): ${notes.join(", ")}`;
  return { repo, ctxDir, targets, preserved, summary };
}
function applyDelete(plan, rm = defaultRm) {
  const removed = [];
  for (const target of plan.targets) {
    if (target.endsWith(GIT_DIR) || target.includes(`${GIT_DIR}/`))
      continue;
    rm(target);
    removed.push(target);
  }
  return removed;
}
function deleteUnit(base, name) {
  const repo = resolve3(base);
  const state = readState(repo);
  if (!state)
    return null;
  const target = name.trim();
  if (!target || target.includes("..") || target.includes("/"))
    return null;
  const idx = state.work_units.findIndex((u) => u.name === target);
  if (idx === -1)
    return null;
  state.work_units.splice(idx, 1);
  recomputeTotals(state);
  writeState(repo, state);
  const unitDir = join9(repo, CTX_DIR, "workunits", target);
  if (existsSync9(unitDir))
    rmSync(unitDir, { recursive: true, force: true });
  return state;
}
function resetImported(unit, srcLabel) {
  return {
    ...unit,
    status: "pending",
    confidence: 0,
    evidence: [],
    gates: { build: "pending", lint: "pending", test: "pending", review: "pending" },
    imported_from: srcLabel
  };
}
function reconcileCriteria(dest, src) {
  const merged = [...dest.success_criteria, ...src.success_criteria, src.goal];
  return [...new Set(merged.filter((s) => s.trim().length > 0))];
}
function placeUnit(units, src, opts, out) {
  const idx = units.findIndex((u) => u.name === src.name);
  if (idx === -1) {
    units.push(resetImported(src, opts.srcLabel));
    out.added.push(src.name);
    return;
  }
  if (opts.onNameCollision === "skip")
    return;
  if (opts.onNameCollision === "replace") {
    units[idx] = resetImported(src, opts.srcLabel);
    out.added.push(src.name);
    return;
  }
  const newName = `${src.name}:${opts.srcLabel}`;
  units.push(resetImported({ ...src, name: newName }, opts.srcLabel));
  out.renamed.push([src.name, newName]);
  out.added.push(newName);
}
function mergeStates(dest, src, opts) {
  const units = dest.work_units.map((u) => ({ ...u }));
  const out = { added: [], renamed: [] };
  for (const unit of src.work_units)
    placeUnit(units, unit, opts, out);
  const conflicts = findScopeConflicts(units).map(([a, b]) => ({
    unit: a,
    kind: "scope-overlap",
    detail: `"${a}" and "${b}" declare overlapping scopes`
  }));
  const merged = recomputeTotals({
    ...dest,
    work_units: units,
    success_criteria: reconcileCriteria(dest, src)
  });
  const goalReconciliation = `kept dest goal "${dest.goal}"; folded src goal "${src.goal}" into success criteria`;
  return { merged, added: out.added, renamed: out.renamed, conflicts, goalReconciliation };
}
function importWorkflow(destBase, srcPath, opts) {
  const dest = readState(destBase);
  const src = readState(resolve3(srcPath));
  if (!dest || !src)
    return null;
  const srcLabel = opts.srcLabel?.trim() || resolve3(srcPath);
  return mergeStates(dest, src, { onNameCollision: opts.onNameCollision, srcLabel });
}

// src/workflow/merge.ts
var ENGINE_INSTRUCTION_FILES = [
  "CLAUDE.md",
  "AGENTS.md",
  ".github/copilot-instructions.md",
  ".agents/instructions.md"
];
var VF_BLOCK_START = "<!-- vibeflow:start -->";
var VF_BLOCK_END = "<!-- vibeflow:end -->";
function fence(generated) {
  return `${VF_BLOCK_START}
${generated.trim()}
${VF_BLOCK_END}
`;
}
function mergeManagedBlock(existing, generated) {
  const block = fence(generated);
  if (existing == null)
    return { content: block, mode: "fresh", backup: false };
  const start = existing.indexOf(VF_BLOCK_START);
  const end = existing.indexOf(VF_BLOCK_END);
  if (start !== -1 && end !== -1 && end > start) {
    const before = existing.slice(0, start);
    const after = existing.slice(end + VF_BLOCK_END.length);
    const merged = `${before}${block.trimEnd()}${after}`;
    return {
      content: merged.endsWith(`
`) ? merged : `${merged}
`,
      mode: "block-update",
      backup: false
    };
  }
  if (isManagedGenerated(existing)) {
    return { content: block, mode: "replace-managed", backup: false };
  }
  const base = existing.endsWith(`
`) ? existing : `${existing}
`;
  return { content: `${base}
${block}`, mode: "preserve-merge", backup: true };
}

// src/commands.ts
function readinessMark(level) {
  if (level === "ready")
    return c.green("✓");
  if (level === "no-binary")
    return c.dim("•");
  return c.yellow("!");
}
function printReadiness(probe, list = preflightAll(ENGINES, { probe })) {
  console.log(c.bold(`
Engine readiness${probe ? " (live probe)" : " (presence/auth)"}:`));
  for (const r of list) {
    console.log(`  ${readinessMark(r.level)} ${r.engine}: ${c.dim(r.detail)}`);
  }
  if (!probe)
    console.log(c.dim("  (run `vf doctor --probe` for a live engine round-trip)"));
  return list;
}
async function doctor(flags = {}, inject = {}) {
  const checks = [
    ["node", hasCommand("node"), "required"],
    ["git", hasCommand("git"), "required"],
    ["bun", hasCommand("bun"), "optional"],
    ["claude", hasCommand("claude"), "optional"],
    ["codex", hasCommand("codex"), "optional"],
    ["copilot", hasCommand("copilot") || hasCommand("gh"), "optional"],
    ["docker", hasCommand("docker"), "optional"]
  ];
  console.log(panel("VibeFlow", c.bold("environment check")));
  let missingRequired = 0;
  const toolRows = [];
  for (const [name, ok, kind] of checks) {
    const mark = ok ? c.green("✔") : kind === "required" ? c.red("✗") : c.yellow("•");
    const status = ok ? c.green("ok") : kind === "required" ? c.red("missing") : c.dim("missing");
    if (!ok && kind === "required")
      missingRequired++;
    toolRows.push([mark, name, status]);
  }
  console.log(table(["", "tool", "status"], toolRows));
  console.log(`
  git repository: ${isGitRepo() ? c.green("yes") : c.yellow("no")}`);
  console.log(`  ${liveGuardrailArmed(cwd()) ? c.green("live guardrail: ON") : guardrailOffNote()}`);
  const probe = Boolean(flags.probe);
  let readiness;
  if (inject.readiness) {
    readiness = inject.readiness;
  } else if (probe) {
    const spinner = new Spinner;
    spinner.start("Running engine probes (parallel)…");
    readiness = await preflightAllAsync(ENGINES, { probe: true });
    spinner.succeed("Engine probes complete");
  } else {
    readiness = preflightAll(ENGINES, { probe: false });
  }
  printReadiness(probe, readiness);
  if (missingRequired > 0) {
    console.log(c.red(`
${missingRequired} required tool(s) missing.`));
    return 1;
  }
  const probeFailed = probe ? readiness.filter((r) => r.level === "probe-failed") : [];
  if (probeFailed.length > 0) {
    console.log(c.yellow(`
${probeFailed.length} engine probe(s) failed: ${probeFailed.map((r) => r.engine).join(", ")}. Other tools are present.`));
    return 1;
  }
  console.log(c.green(`
Ready.`));
  return 0;
}
function chosenEngines(engines) {
  const valid = (engines ?? []).filter((e) => ENGINES.includes(e));
  return valid.length ? valid : [...ENGINES];
}
function resolveRepo(path) {
  if (!path || !path.trim())
    return cwd();
  const abs = isAbsolute2(path) ? path : resolve4(cwd(), path);
  try {
    if (statSync5(abs).isDirectory())
      return abs;
  } catch {}
  return cwd();
}
function detectRepo(path) {
  const repo = resolveRepo(path);
  const has = (rel) => existsSync11(join11(repo, rel));
  return {
    repo,
    isGit: has(".git"),
    engines: {
      claude: has("CLAUDE.md") || has(".claude"),
      codex: has("AGENTS.md") || has(".codex"),
      copilot: has(".github/copilot-instructions.md")
    },
    clis: {
      claude: hasCommand("claude"),
      codex: hasCommand("codex"),
      copilot: hasCommand("copilot") || hasCommand("gh")
    }
  };
}
function contextFrom(answers) {
  const base = defaultContext();
  const clean = (s) => s?.trim() ? s.trim() : undefined;
  return {
    ...base,
    goal: clean(answers.goal) ?? base.goal,
    docSource: clean(answers.docSource),
    taskSource: clean(answers.taskSource),
    fileTypes: answers.fileTypes?.map((s) => s.trim()).filter(Boolean),
    expectedResult: clean(answers.expectedResult),
    sample: clean(answers.sample)
  };
}
function gateEngines(answers, opts) {
  const chosen = chosenEngines(answers.engines);
  const skip = opts.skipPreflight ?? opts.useAi === false;
  if (skip || opts.dry || process.env.VIBEFLOW_AI)
    return { engines: chosen, refused: false };
  const probe = opts.preflight ?? ((e) => preflightAll(e, { probe: false }));
  const readiness = probe(chosen);
  if (!anyReady(readiness))
    return { engines: [], readiness, refused: true };
  return { engines: readyEngines(readiness), readiness, refused: false };
}
function applyIntake(answers, opts = {}) {
  const base = opts.base ?? resolveRepo(answers.repoPath);
  const ctx = contextFrom(answers);
  ctx.settings = readSettings(base);
  try {
    const profile = scanRepo(base);
    ctx.stack = summarizeProfile(profile);
    if (profile.summary && ctx.summary === defaultContext().summary)
      ctx.summary = profile.summary;
  } catch {}
  const gate = gateEngines(answers, opts);
  const prev = readState(base);
  const state = recomputeTotals({
    task_id: prev?.task_id ?? "TASK-1",
    goal: ctx.goal,
    success_criteria: ctx.expectedResult ? [ctx.expectedResult] : prev?.success_criteria ?? [],
    work_units: prev?.work_units ?? [],
    totals: { units: 0, done: 0, tokens: 0, cost_usd: 0, wall_seconds: 0 },
    repo_path: base,
    attachments: prev?.attachments ?? []
  });
  if (gate.refused)
    return { files: [], state, readiness: gate.readiness, refused: true };
  const useAi = opts.useAi !== false;
  const files = { ...canonicalFiles(ctx) };
  for (const engine of gate.engines) {
    Object.assign(files, engineFiles(engine, ctx, useAi));
  }
  files[`${CTX_DIR}/WORKFLOW_STATE.json`] = JSON.stringify(state, null, 2);
  const explicitGoal = Boolean(answers.goal?.trim());
  const PRESERVED_CONTEXT_FILES = new Set([
    "REQUIREMENTS.md",
    "PROJECT_CONTEXT.md",
    "WORKFLOW_POLICY.md",
    "SKILL_INDEX.md"
  ]);
  const written = [];
  const backedUp = [];
  const backupRun = join11(base, BACKUP_SUBDIR, `init-${Date.now()}`);
  const engineFileSet = new Set(ENGINE_INSTRUCTION_FILES);
  for (const [rel, content] of Object.entries(files)) {
    const filename = rel.split("/").pop() ?? "";
    const isPreserved = rel.endsWith("TASK_CONTEXT.md") || PRESERVED_CONTEXT_FILES.has(filename);
    if (isPreserved && !explicitGoal && existsSync11(join11(base, rel))) {
      continue;
    }
    const abs = join11(base, rel);
    if (engineFileSet.has(rel)) {
      const existing = existsSync11(abs) ? readFileSync8(abs, "utf8") : null;
      const merged = mergeManagedBlock(existing, content);
      if (!opts.dry) {
        if (merged.backup && existing != null) {
          writeFileSafe(join11(backupRun, rel), existing);
          backedUp.push(rel);
        }
        writeFileSafe(abs, merged.content);
      }
      written.push(rel);
      continue;
    }
    if (!opts.dry)
      writeFileSafe(abs, content);
    written.push(rel);
  }
  if (!opts.dry && !existsSync11(settingsPath(base))) {
    writeSettings(base, {});
    written.push(`${CTX_DIR}/SETTINGS.json`);
  }
  if (!opts.dry && (ctx.settings?.tools.codegraph || ctx.settings?.tools.lsp)) {
    writeToolConfigs(base, ctx.settings);
  }
  if (!opts.dry)
    ensureIndex(base);
  return { files: written, state, readiness: gate.readiness, refused: false, backedUp };
}
function applyDispatch(engineName, base = cwd()) {
  if (!ENGINES.includes(engineName))
    return null;
  const engine = engineName;
  const state = readState(base);
  const ctx = { ...defaultContext(), goal: state?.goal ?? defaultContext().goal };
  const units = state ? state.work_units.map((u) => u.name) : [];
  const prompt = dispatchPrompt(engine, ctx, units);
  const rel = `${CTX_DIR}/dispatch/${engine}.md`;
  writeFileSafe(join11(base, rel), prompt);
  return { file: rel, prompt };
}
var VALID_STATUS2 = ["pending", "running", "verifying", "done", "blocked"];
function normalizeUnit(input) {
  const g = input.gates ?? {};
  const r = input.resources ?? {};
  return {
    name: String(input.name),
    status: VALID_STATUS2.includes(input.status) ? input.status : "pending",
    confidence: typeof input.confidence === "number" ? input.confidence : 0,
    owner_agent: input.owner_agent,
    skills_used: input.skills_used,
    knowledge_heavy: typeof input.knowledge_heavy === "boolean" ? input.knowledge_heavy : undefined,
    knowledge_heavy_source: input.knowledge_heavy_source === "risk" || input.knowledge_heavy_source === "regex" ? input.knowledge_heavy_source : undefined,
    skills_injected: Array.isArray(input.skills_injected) ? input.skills_injected : undefined,
    skills_required: Array.isArray(input.skills_required) ? input.skills_required : undefined,
    skill_waiver: input.skill_waiver && typeof input.skill_waiver === "object" && typeof input.skill_waiver.reason === "string" ? input.skill_waiver : undefined,
    scope: input.scope,
    spec: input.spec,
    gates: {
      build: g.build ?? "pending",
      lint: g.lint ?? "pending",
      test: g.test ?? "pending",
      review: g.review ?? "pending"
    },
    resources: {
      agents: r.agents ?? 0,
      tokens: r.tokens ?? 0,
      cost_usd: r.cost_usd ?? 0,
      wall_seconds: r.wall_seconds ?? 0
    },
    evidence: input.evidence
  };
}
function mutateUnits(base, action, unit) {
  const state = readState(base);
  if (!state)
    return null;
  const name = unit.name?.trim();
  if (!name)
    return null;
  const idx = state.work_units.findIndex((u) => u.name === name);
  if (action === "delete") {
    if (idx === -1)
      return null;
    state.work_units.splice(idx, 1);
  } else if (action === "add") {
    if (idx !== -1)
      return null;
    state.work_units.push(normalizeUnit({ ...unit, name }));
  } else {
    if (idx === -1)
      return null;
    state.work_units[idx] = normalizeUnit({ ...state.work_units[idx], ...unit, name });
  }
  recomputeTotals(state);
  writeState(base, state);
  return state;
}
function resolveMode(flags) {
  if (flags.yes)
    return "cli";
  if (flags.dry)
    return "dry";
  return process.env.VIBEFLOW_AI ? "bridge" : "dry";
}
function resolveEngine(flags) {
  return typeof flags.engine === "string" && ENGINES.includes(flags.engine) ? flags.engine : "claude";
}
function resolveRisk(flags) {
  const valid = [
    "docs",
    "simple-code",
    "feature",
    "architecture",
    "security",
    "deploy"
  ];
  return typeof flags.risk === "string" && valid.includes(flags.risk) ? flags.risk : "feature";
}
function announceLaunch(engine, mode) {
  if (mode !== "cli")
    return { skip: false };
  const banner = downgradeBannerText(engine);
  if (banner)
    console.log(c.yellow(banner));
  const invocation = engineCommand(engine);
  if (isUnavailable(invocation)) {
    console.log(c.yellow(`
${engine} unavailable: ${invocation.unavailable}`));
    return { skip: true };
  }
  if (invocation.warning)
    console.log(c.yellow(`! ${engine}: ${invocation.warning}`));
  return { skip: false };
}
function readyStub(engine) {
  return { engine, level: "ready", detail: "ready (injected)", checkedAt: "" };
}
function engineReady(engine, mode, preflight) {
  if (mode !== "cli")
    return true;
  const probe = preflight ?? ((e) => preflightAll(e, { probe: true }));
  const [readiness] = probe([engine]);
  if (readiness?.level === "ready")
    return true;
  const detail = readiness?.detail ?? "engine not ready";
  console.log(c.red(`
${engine} not ready: ${detail}`));
  return false;
}
function makeResearcher(engine, ctx, mode, spawner) {
  return async (round, question) => {
    const prompt = buildEnginePrompt(engine, { ...ctx, goal: question }, [
      `research round ${round}`
    ]);
    const result = await runDispatchAsync({ engine, prompt, mode, spawner });
    const confidence = result.summary?.confidence ?? 0;
    const findings = result.summary?.uncertainty ? [result.summary.uncertainty] : result.ok ? [`round ${round}: research dispatched`] : [];
    return { findings, confidence, blocked: !result.ok };
  };
}
function persistInvestigation(unitDir, outcome) {
  const rel = "evidence/investigation.json";
  writeFileSafe(join11(unitDir, rel), JSON.stringify({
    proceed: outcome.proceed,
    finalConfidence: outcome.finalConfidence,
    threshold: outcome.threshold,
    stoppedBy: outcome.stoppedBy,
    recommendation: outcome.recommendation,
    rounds: outcome.rounds
  }, null, 2));
  return rel;
}
var MS_PER_SECOND2 = 1000;
function repoGit(base) {
  return (args) => {
    const r = spawnSync6("git", args, { cwd: base, encoding: "utf8" });
    return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  };
}
function resolveProtection(flags, fp) {
  return {
    timeoutSeconds: fp.timeoutSeconds,
    autoWip: fp.autoWip || Boolean(flags["auto-wip"]),
    requireGit: fp.requireGit || Boolean(flags["require-git"]),
    rollbackOnFail: fp.rollbackOnFail || Boolean(flags["rollback-on-fail"])
  };
}
function planProtection(base, runId, fp, git) {
  const state = gitState(base, git);
  if (!state.isRepo) {
    if (fp.requireGit) {
      return {
        refused: true,
        reason: "refusing: not a git repository (requireGit). Run `git init` then re-run.",
        checkpoint: null
      };
    }
    console.log(c.yellow("! no git — engine edits are irreversible; proceeding without a checkpoint"));
    return { refused: false, checkpoint: createCheckpoint(base, runId, { autoWip: false, git }) };
  }
  if (state.dirty && !fp.autoWip) {
    return {
      refused: true,
      reason: "refusing: uncommitted changes in the working tree. Commit/stash them, or pass --auto-wip.",
      checkpoint: null
    };
  }
  const cp = createCheckpoint(base, runId, { autoWip: state.dirty, git });
  if (cp.wipSha) {
    console.log(c.dim(`checkpoint: WIP snapshot ${cp.wipSha.slice(0, 8)} taken before dispatch`));
  }
  return { refused: false, checkpoint: cp };
}
function persistCheckpoint(unitDir, cp) {
  const rel = "evidence/checkpoint.json";
  writeFileSafe(join11(unitDir, rel), JSON.stringify({ ...cp, recovery: recoveryHint(cp) }, null, 2));
  return rel;
}
function persistQuota(unitDir, sig) {
  const rel = "evidence/quota.json";
  writeFileSafe(join11(unitDir, rel), JSON.stringify(sig, null, 2));
  return rel;
}
function recordQuota(prot, unitRel, unitDir, result, evidence) {
  const sig = detectQuota({ status: result.ok ? 0 : 1, stdout: result.raw, reason: result.reason });
  if (!sig.limited)
    return;
  evidence.push(`${unitRel}/${persistQuota(unitDir, sig)}`);
  if (sig.confidence === "high") {
    prot.quota.limited = true;
    prot.quota.signal = sig;
    console.log(c.yellow(`! quota signal (${sig.kind}) — stopping remaining units: ${sig.evidence}`));
  }
}
function rollbackCheckpoint(base, prot) {
  const cp = prot.checkpoint;
  if (!cp || prot.rolledBack)
    return;
  prot.rolledBack = true;
  const target = cp.baseRef ?? cp.wipSha;
  if (target)
    prot.git(["reset", "--hard", target]);
  const restored = restoreIgnored(cp, base);
  const ref = (target ?? "HEAD").slice(0, 8);
  const extra = restored.length ? ` (+${restored.length} ignored file(s) restored)` : "";
  console.log(c.yellow(`rolled back to ${ref}${extra}`));
}
function handleUnitFailure(prot, base) {
  if (prot.checkpoint)
    console.log(c.yellow(recoveryHint(prot.checkpoint)));
  if (prot.fp.rollbackOnFail)
    rollbackCheckpoint(base, prot);
}
function skippedByQuota() {
  return {
    status: "blocked",
    confidence: 0,
    evidence: [],
    gates: { build: "pending", lint: "pending", test: "pending", review: "pending" }
  };
}
function makeDispatcher(engine, ctx, base, mode, riskClass, spawner, prot) {
  return async (u) => {
    const unitRel = `${CTX_DIR}/workunits/${u.name}`;
    const unitDir = join11(base, unitRel);
    if (prot?.quota.limited) {
      const outcome = skippedByQuota();
      outcome.evidence = [`skipped: upstream rate limit (${prot.quota.signal?.kind ?? "quota"})`];
      return outcome;
    }
    const unitText = `${u.name} ${u.spec ?? ""}`;
    const skillMatches = matchSkillsForTask(discoverSkills(base), unitText);
    const skillNames = skillMatches.map((m) => m.skill.name);
    const looksUiUx = /\b(ui|ux|screen|layout|design|component|theme|accessib)/i.test(unitText);
    const knowledgeHeavy = riskClass === "feature" || riskClass === "architecture" || looksUiUx;
    const skillGap = knowledgeHeavy && skillNames.length === 0;
    const skillsInjected = skillNames;
    const skillsRequired = skillMatches.filter((m) => m.skill.status === "verified").map((m) => m.skill.name);
    const knowledgeHeavySource = !knowledgeHeavy ? undefined : riskClass === "feature" || riskClass === "architecture" ? "risk" : looksUiUx ? "regex" : undefined;
    const prompt = buildEnginePrompt(engine, ctx, [
      { name: u.name, spec: u.spec, scope: u.scope, skills: skillNames, skillGap }
    ]);
    writeFileSafe(join11(unitDir, "CONTEXT.md"), prompt);
    const evidence = [];
    if (prot?.checkpoint) {
      evidence.push(`${unitRel}/${persistCheckpoint(unitDir, prot.checkpoint)}`);
    }
    const result = await runDispatchAsync({ engine, prompt, mode, spawner });
    if (mode !== "dry") {
      evidence.push(`${unitRel}/${persistDispatch(unitDir, result)}`);
      if (prot)
        recordQuota(prot, unitRel, unitDir, result, evidence);
    }
    let confidence = result.summary?.confidence ?? 0;
    const status = mode === "dry" ? "verifying" : result.ok ? "verifying" : "blocked";
    if (mode !== "dry" && confidence < 1) {
      const research = makeResearcher(engine, ctx, mode, spawner);
      const outcome = await investigateUnit({ name: u.name, confidence, owner_agent: u.owner_agent }, { riskClass, research });
      evidence.push(`${unitRel}/${persistInvestigation(unitDir, outcome)}`);
      confidence = Math.max(confidence, outcome.finalConfidence);
    }
    if (mode === "cli" && status === "blocked" && prot)
      handleUnitFailure(prot, base);
    return {
      status,
      confidence,
      evidence,
      gates: { build: "pending", lint: "pending", test: "pending", review: "pending" },
      knowledge_heavy: knowledgeHeavy,
      knowledge_heavy_source: knowledgeHeavySource,
      skills_injected: skillsInjected,
      skills_required: skillsRequired,
      skills_used: result.summary?.skills_used ?? []
    };
  };
}
function makeReviewer(mode) {
  return (_u, outcome) => {
    if (mode === "dry") {
      return { pass: true, reason: "dry preview — not evaluated (re-run with --yes)" };
    }
    if (outcome.confidence < 1) {
      return {
        pass: false,
        reason: `confidence ${outcome.confidence} < 1 — investigated, still blocked`
      };
    }
    if (!outcome.evidence.length)
      return { pass: false, reason: "no recorded evidence" };
    return { pass: true, reason: "confidence 1.0 with evidence" };
  };
}
async function orchestrate(flags, base = cwd(), inject = {}) {
  const state = readState(base);
  if (!state) {
    console.error(c.yellow("No workflow. Run `vf init` first."));
    return 1;
  }
  const engine = resolveEngine(flags);
  const mode = resolveMode(flags);
  const riskClass = resolveRisk(flags);
  const ctx = {
    ...defaultContext(),
    goal: state.goal,
    settings: readSettings(base)
  };
  const allUnits = state.work_units.length > 0 ? state.work_units : [normalizeUnit({ name: "task", status: "pending", confidence: 0 })];
  const isComplete = (u) => u.status === "done" && u.confidence >= 1 && (u.evidence?.length ?? 0) > 0;
  const done = allUnits.filter(isComplete);
  const units = allUnits.filter((u) => !isComplete(u));
  if (done.length) {
    console.log(c.dim(`Skipping ${done.length} already-complete unit(s): ${done.map((u) => u.name).join(", ")}`));
  }
  if (units.length === 0) {
    console.log(c.green(`
All work units already complete — nothing to dispatch.`));
    const verdict2 = goalEval(state);
    const color2 = verdict2.verdict === "met" ? c.green : c.yellow;
    console.log(color2(`goal: ${verdict2.verdict}`));
    for (const reason of verdict2.reasons)
      console.log(c.dim(`  - ${reason}`));
    return verdict2.verdict === "met" ? 0 : 1;
  }
  const launch = announceLaunch(engine, mode);
  if (launch.skip)
    return 1;
  const preflight = inject.preflight ?? (inject.spawner ? () => [readyStub(engine)] : undefined);
  if (!engineReady(engine, mode, preflight))
    return 1;
  const settings = readSettings(base);
  const fp = resolveProtection(flags, settings.failureProtection);
  const git = inject.git ?? repoGit(base);
  let prot;
  if (mode === "cli") {
    const plan = planProtection(base, state.task_id, fp, git);
    if (plan.refused) {
      console.error(c.red(`
${plan.reason}`));
      return 1;
    }
    prot = { checkpoint: plan.checkpoint, fp, git, quota: { limited: false }, rolledBack: false };
  }
  const timeoutMs = fp.timeoutSeconds > 0 ? fp.timeoutSeconds * MS_PER_SECOND2 : undefined;
  const spawner = inject.spawner ?? makeAsyncSpawner({ timeoutMs, shell: mode === "bridge" });
  const conflicts = findScopeConflicts(units);
  const requested = typeof flags.concurrency === "string" ? Number(flags.concurrency) : DEFAULT_CONCURRENCY;
  let concurrency = Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_CONCURRENCY;
  if (conflicts.length) {
    concurrency = 1;
    console.log(c.yellow(`! ${conflicts.length} overlapping scope(s) — serializing dispatch (parallel refused):`));
    for (const [a, b] of conflicts)
      console.log(c.dim(`  - ${a} ⨯ ${b}`));
  }
  const spinner = new Spinner;
  spinner.start(`Orchestrating ${units.length} unit(s) → ${engine} (${mode}, concurrency ${concurrency})`);
  const { units: ran, reviews } = await orchestrateUnits({
    units,
    concurrency,
    dispatcher: makeDispatcher(engine, ctx, base, mode, riskClass, spawner, prot),
    reviewer: makeReviewer(mode)
  });
  spinner.succeed(`Dispatched ${ran.length} unit(s)`);
  state.work_units = done.length ? [...done, ...ran] : ran;
  recomputeTotals(state);
  if (mode !== "dry")
    writeState(base, state);
  for (const r of reviews) {
    console.log(`${r.pass ? c.green("✓") : c.yellow("•")} review ${r.unit}: ${r.reason}`);
  }
  const verdict = goalEval(state);
  const color = verdict.verdict === "met" ? c.green : verdict.verdict === "blocked" ? c.red : c.yellow;
  console.log(color(`
goal: ${verdict.verdict}`));
  for (const reason of verdict.reasons)
    console.log(c.dim(`  - ${reason}`));
  if (mode !== "dry") {
    appendJournal(base, "dispatch", `${engine} → goal ${verdict.verdict}`, [
      `${ran.length} unit(s) dispatched (${mode}, concurrency ${concurrency})`,
      ...ran.map((u) => `- ${u.name}: ${u.status} @ ${u.confidence}`),
      ...reviews.map((r) => `- review ${r.unit}: ${r.pass ? "pass" : "fail"} — ${r.reason}`)
    ]);
  }
  if (mode === "dry") {
    console.log(c.dim(`
Dry run: prompts written under ${CTX_DIR}/workunits/*. Re-run with --yes to launch the engine.`));
  }
  return verdict.verdict === "blocked" ? 1 : 0;
}
function reportPreflightRefusal(readiness) {
  console.error(c.red(`
No engine is ready — refusing to generate engine files.`));
  for (const r of readiness ?? []) {
    console.error(`  ${c.yellow("!")} ${r.engine}: ${c.dim(r.detail)}`);
  }
  console.error(c.dim("Fix an engine above (or use `--dry-run` for an offline preview)."));
  return 1;
}
async function init(flags, inject = {}) {
  const engines = typeof flags.engine === "string" ? [flags.engine] : undefined;
  const dry = Boolean(flags["dry-run"]);
  const ai = Boolean(flags.ai);
  const result = applyIntake({ engines }, { dry, skipPreflight: dry, preflight: inject.preflight, useAi: false });
  if (result.refused)
    return reportPreflightRefusal(result.readiness);
  const label = dry ? "dry run" : "init";
  console.log(panel("VibeFlow", c.bold(label)));
  const dropped = (result.readiness ?? []).filter((r) => r.level !== "ready");
  for (const r of dropped) {
    console.log(c.yellow(`• skipped ${r.engine}: ${c.dim(r.detail)}`));
  }
  for (const rel of result.files) {
    console.log(dry ? c.dim(`would write ${rel}`) : `${c.green("+")} ${rel}`);
  }
  if (!dry) {
    console.log(c.bold(`
Generated ${result.files.length} files from canonical context.`));
    for (const rel of result.backedUp ?? []) {
      console.log(c.dim(`  archived previous ${rel} under ${CTX_DIR}/backup/init-*`));
    }
    for (const rel of result.backedUp ?? []) {
      console.log(c.dim(`  archived previous ${rel} under ${CTX_DIR}/backup/init-*`));
    }
  }
  if (ai && !dry && !result.refused) {
    console.log();
    const { runAiInit: runAiInit2 } = await Promise.resolve().then(() => (init_ai_init(), exports_ai_init));
    const aiEngine = typeof flags.engine === "string" ? flags.engine : undefined;
    const aiResult = await runAiInit2({
      base: cwd(),
      dryRun: dry,
      spawner: inject.spawner,
      forceEngine: aiEngine
    });
    if (aiResult.ok) {
      console.log(c.green(`✔ AI analysis complete (${aiResult.engine})`));
    } else {
      console.log(c.yellow(`! AI analysis skipped: ${aiResult.reason ?? "unknown"}`));
      console.log(c.dim("  Deterministic context files are in place. Re-run with --ai when an engine is ready."));
    }
  } else if (ai && dry) {
    console.log(c.dim(`
--ai dry-run: prompt would be sent to the best available engine`));
    const { buildAiInitPrompt: buildAiInitPrompt2 } = await Promise.resolve().then(() => (init_ai_init(), exports_ai_init));
    const { scanRepo: scanRepo2 } = await Promise.resolve().then(() => (init_scanner(), exports_scanner));
    const base = cwd();
    const profile = scanRepo2(base);
    const prompt = buildAiInitPrompt2(profile, base);
    console.log(c.dim(`
${prompt.slice(0, 1500)}…`));
  }
  return 0;
}
async function initInteractive(_flags) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q, def = "") => new Promise((res) => rl.question(`${q}${def ? ` [${def}]` : ""}: `, (a) => res(a.trim() || def)));
  console.log(c.bold(`VibeFlow — new workflow
`));
  const goal = await ask("Goal / task");
  const engines = (await ask("Engines (comma)", ENGINES.join(","))).split(",");
  const docSource = await ask("Project docs source (path/URL)");
  const taskSource = await ask("Task / issue source");
  const fileTypes = (await ask("File types (comma)")).split(",");
  const expectedResult = await ask("Expected result (Definition of Done)");
  rl.close();
  const result = applyIntake({
    goal,
    engines,
    docSource,
    taskSource,
    fileTypes,
    expectedResult
  });
  if (result.refused)
    return reportPreflightRefusal(result.readiness);
  for (const rel of result.files)
    console.log(`${c.green("+")} ${rel}`);
  console.log(c.bold(`
Generated ${result.files.length} files from canonical context.`));
  for (const rel of result.backedUp ?? []) {
    console.log(c.dim(`  archived previous ${rel} under ${CTX_DIR}/backup/init-*`));
  }
  for (const rel of result.backedUp ?? []) {
    console.log(c.dim(`  archived previous ${rel} under ${CTX_DIR}/backup/init-*`));
  }
  return 0;
}
async function run(engineArg, flags, inject = {}) {
  if (!engineArg || !ENGINES.includes(engineArg)) {
    console.error(c.red(`Usage: vf run <${ENGINES.join("|")}>`));
    return 2;
  }
  const engine = engineArg;
  const base = inject.base ?? cwd();
  const ctx = defaultContext();
  const state = readState(base);
  const units = state ? state.work_units.map((u) => u.name) : [];
  const prompt = dispatchPrompt(engine, ctx, units);
  writeFileSafe(ctxPathIn(base, "dispatch", `${engine}.md`), prompt);
  console.log(`${c.green("+")} ${CTX_DIR}/dispatch/${engine}.md`);
  const invocation = engineCommand(engine);
  if (isUnavailable(invocation)) {
    console.log(c.yellow(`
${invocation.unavailable}. Dispatch prompt written; install then re-run.`));
    return 0;
  }
  if (invocation.warning)
    console.log(c.yellow(`! ${engine}: ${invocation.warning}`));
  if (!flags.yes) {
    console.log(c.dim(`
Dry run. Re-run with --yes to launch ${engine}.`));
    return 0;
  }
  return launchEngine(engine, prompt, flags, base, inject, state?.task_id ?? engine);
}
async function launchEngine(engine, prompt, flags, base, inject, runId) {
  const preflight = inject.preflight ?? (inject.spawner ? () => [readyStub(engine)] : undefined);
  if (!engineReady(engine, "cli", preflight))
    return 1;
  const fp = resolveProtection(flags, readSettings(base).failureProtection);
  const git = inject.git ?? repoGit(base);
  const plan = planProtection(base, runId, fp, git);
  if (plan.refused) {
    console.error(c.red(`
${plan.reason}`));
    return 1;
  }
  const prot = {
    checkpoint: plan.checkpoint,
    fp,
    git,
    quota: { limited: false },
    rolledBack: false
  };
  const banner = downgradeBannerText(engine);
  if (banner)
    console.log(c.yellow(banner));
  const spinner = new Spinner;
  spinner.start(`Launching ${engine}…`);
  const timeoutMs = fp.timeoutSeconds > 0 ? fp.timeoutSeconds * MS_PER_SECOND2 : undefined;
  const spawner = inject.spawner ?? makeAsyncSpawner({ timeoutMs });
  const result = await runDispatchAsync({ engine, prompt, mode: "cli", spawner });
  spinner.succeed(result.ok ? `${engine} finished` : `${engine} failed`);
  if (!result.ok) {
    handleUnitFailure(prot, base);
    return 1;
  }
  return 0;
}
function units(sub, rest, flags = {}) {
  const state = readState();
  if (!state) {
    console.error(c.yellow(`No ${CTX_DIR}/WORKFLOW_STATE.json. Run \`vf init\` first.`));
    return 1;
  }
  switch (sub) {
    case undefined:
    case "status": {
      if (state.work_units.length === 0) {
        console.log(c.dim("No work units. Single-concern tasks run without them."));
        return 0;
      }
      for (const u of state.work_units) {
        const g = u.gates;
        const gs = ["build", "lint", "test", "review"].map((k) => `${k}:${gateColor(g[k])}`).join(" ");
        console.log(`${c.bold(u.name)} ${c.dim(u.status)} conf ${u.confidence}
  ${gs}`);
      }
      return 0;
    }
    case "show": {
      const name = rest[0];
      if (!name) {
        console.error(c.yellow("Usage: vf units show <name>"));
        return 2;
      }
      const u = state.work_units.find((x) => x.name === name);
      if (!u) {
        console.error(c.red(`No such work unit: ${name}`));
        return 1;
      }
      console.log(JSON.stringify(u, null, 2));
      return 0;
    }
    case "resources": {
      const t = state.totals;
      console.log(`units ${t.done}/${t.units} · ${t.tokens} tokens · $${t.cost_usd} · ${t.wall_seconds}s`);
      return 0;
    }
    case "evidence": {
      const name = rest[0];
      if (!name) {
        console.error(c.yellow("Usage: vf units evidence <name>"));
        return 2;
      }
      const u = state.work_units.find((x) => x.name === name);
      if (!u) {
        console.error(c.red(`No such work unit: ${name}`));
        return 1;
      }
      if ("add" in flags) {
        const text = typeof flags.add === "string" ? flags.add.trim() : "";
        if (!text) {
          console.error(c.yellow('Usage: vf units evidence <name> --add "<text>"'));
          return 2;
        }
        const cur = u.evidence ?? [];
        const next = mutateUnits(cwd(), "update", { name, evidence: [...cur, text] });
        if (!next) {
          console.error(c.red(`No such work unit: ${name}`));
          return 1;
        }
        console.log(c.green(`+ evidence for ${c.bold(name)}: ${text}`));
        return 0;
      }
      for (const e of u.evidence ?? [])
        console.log(e);
      if (!u.evidence?.length)
        console.log(c.dim("(no recorded evidence)"));
      return 0;
    }
    case "add": {
      const name = rest[0]?.trim();
      if (!name) {
        console.error(c.red('Usage: vf units add <name> [--spec "<text>"] [--scope a,b]'));
        return 2;
      }
      const addPatch = { name };
      if (typeof flags.spec === "string")
        addPatch.spec = flags.spec;
      if (typeof flags.scope === "string") {
        addPatch.scope = flags.scope.split(",").map((s) => s.trim()).filter(Boolean);
      }
      const next = mutateUnits(cwd(), "add", addPatch);
      if (!next) {
        console.error(c.red(`Could not add "${name}" — a unit with that name already exists.`));
        return 1;
      }
      console.log(c.green(`+ added unit ${c.bold(name)}`));
      return 0;
    }
    case "update": {
      const name = rest[0]?.trim();
      if (!name) {
        console.error(c.red('Usage: vf units update <name> [--status s] [--confidence n] [--spec "<text>"] [--scope a,b]'));
        return 2;
      }
      const patch = { name };
      if (typeof flags.status === "string")
        patch.status = flags.status;
      if (typeof flags.confidence === "string")
        patch.confidence = Number(flags.confidence);
      if (typeof flags.spec === "string")
        patch.spec = flags.spec;
      if (typeof flags.scope === "string") {
        patch.scope = flags.scope.split(",").map((s) => s.trim()).filter(Boolean);
      }
      const next = mutateUnits(cwd(), "update", patch);
      if (!next) {
        console.error(c.red(`No such work unit: ${name}`));
        return 1;
      }
      console.log(c.green(`~ updated unit ${c.bold(name)}`));
      return 0;
    }
    case "delete": {
      const name = rest[0]?.trim();
      if (!name) {
        console.error(c.red("Usage: vf units delete <name>"));
        return 2;
      }
      const next = mutateUnits(cwd(), "delete", { name });
      if (!next) {
        console.error(c.red(`No such work unit: ${name}`));
        return 1;
      }
      console.log(c.green(`- deleted unit ${c.bold(name)}`));
      return 0;
    }
    case "waiver": {
      const name = rest[0]?.trim();
      const reason = typeof flags.reason === "string" ? flags.reason.trim() : "";
      if (!name || !reason) {
        console.error(c.red('Usage: vf units waiver <name> --reason "<why no verified skill>"'));
        return 2;
      }
      const patch = {
        name,
        skill_waiver: { reason, at: new Date().toISOString(), by: "human" }
      };
      const next = mutateUnits(cwd(), "update", patch);
      if (!next) {
        console.error(c.red(`No such work unit: ${name}`));
        return 1;
      }
      console.log(c.green(`~ waived skill gate for ${c.bold(name)} (${reason})`));
      return 0;
    }
    default:
      console.error(c.red(`Unknown: vf units ${sub}`));
      return 2;
  }
}
function gateColor(s) {
  if (s === "pass")
    return c.green(s);
  if (s === "fail")
    return c.red(s);
  if (s === "running")
    return c.yellow(s);
  return c.dim(s);
}
function skills(sub, rest = []) {
  const repo = cwd();
  const found = discoverSkills(repo);
  if (sub === undefined || sub === "list") {
    if (!found.length) {
      console.log(c.dim(`No skills discovered under ${CTX_DIR}/skills, .kiro/skills, or .claude/skills.`));
      return 0;
    }
    process.stdout.write(renderSkillIndex(found));
    return 0;
  }
  if (sub === "search") {
    const term = rest.join(" ").trim();
    if (!term) {
      console.error(c.red("Usage: vf skills search <term>"));
      return 2;
    }
    const matches = matchSkillsForTask(found, term);
    if (!matches.length) {
      console.log(c.dim(`No skill matched "${term}".`));
      return 0;
    }
    for (const m of matches) {
      console.log(`${c.bold(m.skill.name)} ${c.dim(`(${m.score.toFixed(2)})`)} — ${m.reason}`);
    }
    return 0;
  }
  if (sub === "resolve") {
    const state = readState(repo);
    const profile = scanRepo(repo);
    const attachments = (state?.attachments ?? []).map((a) => a.name);
    const needs = resolveSkillNeeds({
      repo,
      attachments,
      task: state?.goal,
      profile
    });
    process.stdout.write(renderSkillNeeds(needs));
    return 0;
  }
  if (sub === "init") {
    const name = rest[0]?.trim();
    if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
      console.error(c.red("Usage: vf skills init <name>  (lowercase-hyphen, e.g. compose-screen-ux)"));
      return 2;
    }
    const dir = join11(repo, CTX_DIR, "skills", name);
    const skillMd = join11(dir, "SKILL.md");
    if (existsSync11(skillMd)) {
      console.error(c.red(`Skill "${name}" already exists at ${skillMd}.`));
      return 1;
    }
    writeFileSafe(skillMd, skillTemplate(name));
    console.log(c.green(`+ scaffolded skill ${c.bold(name)} → ${skillMd}`));
    console.log(c.dim("Edit triggers/capabilities so `vf skills search <task>` matches it, then fill the steps."));
    return 0;
  }
  console.log(c.dim(`vf skills ${sub} — registry operations are configured via providers (see docs).`));
  return 0;
}
function skillTemplate(name) {
  return [
    "---",
    `name: ${name}`,
    "description: One-line summary of what this skill does and when to apply it.",
    "status: draft",
    "capabilities:",
    "  - capability-keyword",
    "triggers:",
    "  - trigger-keyword",
    "requires:",
    "  filesystem: read",
    "  network: false",
    "  shell: false",
    "---",
    "",
    `# ${name}`,
    "",
    "## When to use",
    "Describe the task shape that should invoke this skill.",
    "",
    "## Steps",
    "1. First concrete step.",
    "2. Next step.",
    "",
    "## Verification",
    "How to prove the skill was applied correctly (command output, file check, test).",
    ""
  ].join(`
`);
}
async function discover(sub, rest, flags, inject = {}) {
  const query = rest.join(" ").trim();
  const approved = Boolean(flags.yes);
  if (sub !== "docs" && sub !== "skills") {
    console.error(c.red("Usage: vf discover <docs|skills> <query> [--yes]"));
    return 2;
  }
  if (!query) {
    console.error(c.red(`Usage: vf discover ${sub} <query> [--yes]`));
    return 2;
  }
  const opts = { approved, fetchFn: inject.fetchFn };
  const { lookupDocsHttp: lookup, searchSkillsHttp: search } = await Promise.resolve().then(() => (init_context7(), exports_context7));
  const outcome = sub === "docs" ? await lookup(query, opts) : await search(query, opts);
  if (outcome.approvalRequired) {
    console.log(c.yellow(`${outcome.reason} Re-run with --yes to approve the network lookup.`));
    return 0;
  }
  if (!outcome.ok) {
    console.error(c.red(outcome.reason ?? "discovery failed"));
    return 1;
  }
  for (const r of outcome.results) {
    const tag = r.status ? c.yellow(`[${r.status}]`) : c.dim(`[${r.kind}]`);
    const slug = r.name ? c.dim(` name: ${r.name}`) : "";
    console.log(`${tag} ${c.bold(r.title)} — ${r.snippet}${slug}`);
  }
  if (!outcome.results.length)
    console.log(c.dim("(no results)"));
  return 0;
}
async function hook() {
  let raw = "";
  await new Promise((resolve5) => {
    const timer = setTimeout(() => {
      process.stdin.pause();
      resolve5();
    }, 5000);
    process.stdin.once("data", (chunk) => {
      clearTimeout(timer);
      raw = chunk.toString("utf8").trim();
      process.stdin.pause();
      resolve5();
    });
    process.stdin.resume();
  });
  const input = raw ? parseHookInput(raw) : null;
  if (!input) {
    console.log(JSON.stringify({
      decision: "allow",
      risk: "none",
      reasons: ["unrecognized hook input — allowing (fail-open on live tool gate)"]
    }));
    return 0;
  }
  const result = evaluateHook(input);
  const { json, exitCode } = presentDecision(result, input);
  console.log(json);
  return exitCode;
}
var SELFCHECK_REL = `${CTX_DIR}/knowledge/hook-selfcheck.json`;
function hookSelftest(inject = {}) {
  const base = inject.base ?? cwd();
  const now = inject.now ?? (() => new Date().toISOString());
  const report = runSelftest(now);
  writeFileSafe(join11(base, SELFCHECK_REL), JSON.stringify(report, null, 2));
  for (const c0 of report.cases) {
    const mark = c0.pass ? c.green("✓") : c.red("✗");
    console.log(`${mark} [${c0.expected}→${c0.actual}] ${c0.risk} · ${c0.input}`);
  }
  if (report.failed > 0) {
    console.log(c.red(`
${report.failed}/${report.cases.length} self-test case(s) regressed.`));
    return 1;
  }
  console.log(c.green(`
hook self-test: ${report.passed}/${report.cases.length} pass → ${SELFCHECK_REL}`));
  return 0;
}
function liveGuardrailArmed(base) {
  try {
    const raw = readFileSync8(join11(base, ".claude", "settings.json"), "utf8");
    const parsed = JSON.parse(raw);
    const pre = parsed.hooks?.PreToolUse;
    if (!Array.isArray(pre))
      return false;
    return pre.some((entry) => (entry.hooks ?? []).some((h) => typeof h.command === "string" && /\bvf\s+hook\b/.test(h.command)));
  } catch {
    return false;
  }
}
function guardrailOffNote() {
  return c.yellow("live guardrail: OFF — risky tool calls are NOT intercepted. Run `vf hooks emit --yes` to arm the PreToolUse gate.");
}
function hooks(sub, flags = {}) {
  switch (sub) {
    case "install": {
      const r = spawnSync6("git", ["config", "core.hooksPath", ".githooks"], { stdio: "inherit" });
      if (r.status === 0)
        console.log(c.green("Installed: core.hooksPath → .githooks"));
      return r.status ?? 0;
    }
    case undefined:
    case "status": {
      const r = spawnSync6("git", ["config", "--get", "core.hooksPath"], { encoding: "utf8" });
      const path = r.stdout.trim();
      console.log(path ? `core.hooksPath = ${path}` : c.yellow("core.hooksPath not set — run `vf hooks install`"));
      console.log(liveGuardrailArmed(cwd()) ? c.green("live guardrail: ON") : guardrailOffNote());
      return 0;
    }
    case "emit": {
      const files = engineHookFiles();
      if (!flags.yes || flags["dry-run"]) {
        for (const rel of Object.keys(files))
          console.log(`${c.dim("[dry-run]")} ${rel}`);
        console.log(c.yellow(".claude/settings.json installs a PreToolUse hook that affects the running agent."));
        console.log(c.dim("Re-run with --yes to write."));
        return 0;
      }
      for (const [rel, content] of Object.entries(files)) {
        const dest = join11(cwd(), rel);
        writeFileSafe(dest, content);
        if (rel.startsWith(".githooks/")) {
          try {
            chmodSync(dest, 493);
          } catch {}
        }
        console.log(`${c.green("+")} ${rel}`);
      }
      return 0;
    }
    default:
      console.error(c.red(`Unknown: vf hooks ${sub}`));
      return 2;
  }
}
function detectToolchain(base, opts = {}) {
  const exists = opts.exists ?? existsSync11;
  const runner = opts.runner ?? (hasCommand("bun") ? "bun" : "npm");
  const readScripts = opts.readScripts ?? ((p) => Object.keys(JSON.parse(readFileSync8(p, "utf8")).scripts ?? {}));
  const root = join11(base, "package.json");
  if (exists(root)) {
    const gates = readScripts(root).filter((s) => ["typecheck", "lint", "test"].includes(s));
    return { kind: "npm", runner, gates };
  }
  if (["build.gradle.kts", "build.gradle", "settings.gradle.kts"].some((f) => exists(join11(base, f)))) {
    return { kind: "gradle", cmd: exists(join11(base, "gradlew")) ? "./gradlew" : "gradle" };
  }
  for (const d of ["web", "app", "frontend"]) {
    const p = join11(base, d, "package.json");
    if (exists(p)) {
      const gates = readScripts(p).filter((s) => ["typecheck", "lint", "test", "build"].includes(s));
      return { kind: "monorepo", runner, dir: join11(base, d), gates };
    }
  }
  return { kind: "none" };
}
function verify() {
  let failed = 0;
  const base = cwd();
  const runGate = (label, cmd, args, dir = base) => {
    console.log(c.cyan(`▶ ${label}`));
    const r = spawnSync6(cmd, args, { stdio: "inherit", cwd: dir });
    if (r.status !== 0) {
      failed++;
      console.log(c.red(`✗ ${label} failed`));
    } else {
      console.log(c.green(`✓ ${label}`));
    }
  };
  const plan = detectToolchain(base);
  if (plan.kind === "npm") {
    for (const gate of plan.gates)
      runGate(`${plan.runner} run ${gate}`, plan.runner, ["run", gate]);
    if (plan.gates.length === 0)
      console.log(c.dim("package.json has no typecheck/lint/test scripts."));
  } else if (plan.kind === "gradle") {
    runGate(`${plan.cmd} check`, plan.cmd, ["check"]);
  } else if (plan.kind === "monorepo") {
    const label = plan.dir.split("/").pop();
    for (const gate of plan.gates)
      runGate(`(${label}) ${plan.runner} run ${gate}`, plan.runner, ["run", gate], plan.dir);
  } else {
    console.log(c.yellow("⚠ no package.json or Gradle build found — skipping toolchain gates (unsupported build system)"));
  }
  const report = policyGates(readState());
  for (const ok of report.passed)
    console.log(c.green(`✓ ${ok}`));
  for (const w of report.warnings)
    console.log(c.yellow(`⚠ ${w}`));
  for (const f of report.failures) {
    failed++;
    console.log(c.red(`✗ ${f}`));
  }
  if (failed > 0) {
    console.log(c.red(`
${failed} gate(s) failed.`));
    appendJournal(base, "verify", "fail", [
      `${failed} gate(s) failed`,
      ...report.failures.map((f) => `- ${f}`)
    ]);
    return 1;
  }
  console.log(c.green(`
All configured gates passed.`));
  appendJournal(base, "verify", "pass", [
    `${report.passed.length} gate(s) passed`,
    ...report.warnings.length ? [`${report.warnings.length} warning(s)`] : []
  ]);
  return 0;
}
var VALID_TOOLS = ["codegraph", "lsp"];
function isToolName(v) {
  return v === "codegraph" || v === "lsp";
}
function repoLanguages(base) {
  try {
    return scanRepo(base).languages;
  } catch {
    return [];
  }
}
function renderPriority(settings) {
  const rank = priorityRank(settings);
  const tiers = ["codegraph", "lsp", "native"];
  return [...tiers].sort((a, b) => rank[b] - rank[a]).join(" > ");
}
function toolsStatus(base, detectFn) {
  const settings = readSettings(base);
  const languages = repoLanguages(base);
  console.log(c.bold(`Optional developer tools
`));
  for (const name of VALID_TOOLS) {
    const tool = TOOLS[name];
    const enabled = settings.tools[name];
    const installed = (detectFn ?? tool.detect.bind(tool))(name);
    const en = enabled ? c.green("enabled") : c.dim("disabled");
    const inst = installed ? c.green("installed") : c.yellow("not installed");
    console.log(`  ${c.bold(tool.title)} [${en}, ${inst}]`);
    console.log(`    ${c.dim(tool.description)}`);
    if (enabled && !installed) {
      console.log(c.yellow(`    ! enabled but binary not on PATH — MCP server won't start. Run \`vf tools install ${name}\`.`));
    }
  }
  console.log(`
  priority: ${c.cyan(renderPriority(settings))}`);
  if (languages.length)
    console.log(`  detected languages: ${c.dim(languages.join(", "))}`);
  console.log(c.dim("\n  Re-run `vf init` after changing tools to regenerate instructions."));
  return 0;
}
var CLAUDE_MCP_FILE = ".mcp.json";
var CODEX_MCP_FILE = join11(".codex", "config.toml");
function managedClaudeServerNames(base, languages) {
  const ctx = { workspace: base, languages };
  const all = resolveTools({ codegraph: true, lsp: true }, "claude", ctx);
  const names = [];
  for (const entry of all.entries) {
    for (const name of Object.keys(entry.servers))
      names.push(name);
  }
  return names;
}
function readClaudeMcp(path) {
  if (!existsSync11(path))
    return { mcpServers: {}, corrupt: false };
  try {
    const parsed = JSON.parse(readFileSync8(path, "utf8"));
    return { mcpServers: parsed.mcpServers ?? {}, corrupt: false };
  } catch {
    return { mcpServers: {}, corrupt: true };
  }
}
function writeClaudeMcp(base, settings, languages) {
  const path = join11(base, CLAUDE_MCP_FILE);
  const file = readClaudeMcp(path);
  if (file.corrupt) {
    console.log(c.yellow(`! ${CLAUDE_MCP_FILE} is not valid JSON — left untouched. Fix it, then re-run.`));
    return false;
  }
  for (const name of managedClaudeServerNames(base, languages))
    delete file.mcpServers[name];
  const ctx = { workspace: base, languages };
  const merged = resolveTools(settings.tools, "claude", ctx);
  for (const entry of merged.entries) {
    Object.assign(file.mcpServers, entry.servers);
  }
  const hasServers = Object.keys(file.mcpServers).length > 0;
  if (!hasServers && !existsSync11(path))
    return false;
  writeFileSafe(path, JSON.stringify({ mcpServers: file.mcpServers }, null, 2));
  return true;
}
function tomlSection(entry) {
  const lines2 = [`[${entry.section}]`, `command = ${JSON.stringify(entry.command)}`];
  lines2.push(`args = ${JSON.stringify(entry.args)}`);
  if (entry.disabledTools && entry.disabledTools.length > 0) {
    lines2.push(`disabled_tools = ${JSON.stringify(entry.disabledTools)}`);
  }
  return lines2.join(`
`);
}
function gateCodexEntries(entries, settings) {
  if (!settings.tools.codegraph)
    return entries;
  return entries.map((entry) => entry.section.startsWith("mcp_servers.lsp-") ? { ...entry, disabledTools: entry.tools } : entry);
}
function writeCodexMcp(base, settings, languages) {
  const ctx = { workspace: base, languages };
  const merged = resolveTools(settings.tools, "codex", ctx);
  const entries = gateCodexEntries(merged.entries, settings);
  const path = join11(base, CODEX_MCP_FILE);
  if (entries.length === 0) {
    if (existsSync11(path))
      rmSync2(path);
    return false;
  }
  const header = "# Managed by VibeFlow (`vf tools`). Repo-local codex MCP config — merge into\n" + "# ~/.codex/config.toml or point codex at it. Edit `vf tools enable/disable` to regenerate.";
  writeFileSafe(path, `${header}

${entries.map(tomlSection).join(`

`)}`);
  return true;
}
function printCopilotMcp(base, settings, languages) {
  const ctx = { workspace: base, languages };
  const merged = resolveTools(settings.tools, "copilot", ctx);
  if (merged.entries.length === 0)
    return 0;
  console.log(c.bold(`
Copilot (run these — VibeFlow won't touch your secret ~/.copilot):`));
  let count = 0;
  for (const entry of merged.entries) {
    for (const [name, server] of Object.entries(entry.servers)) {
      const args = server.args.map((a) => JSON.stringify(a)).join(" ");
      console.log(c.cyan(`  copilot mcp add ${name} -- ${server.command} ${args}`.trim()));
      count++;
    }
  }
  return count;
}
function writeToolConfigs(base, settings) {
  const languages = repoLanguages(base);
  writeClaudeMcp(base, settings, languages);
  writeCodexMcp(base, settings, languages);
  printCopilotMcp(base, settings, languages);
}
function toolsToggle(base, name, on, opts = {}) {
  const settings = writeSettings(base, { tools: { ...readSettings(base).tools, [name]: on } });
  const word = on ? c.green("enabled") : c.yellow("disabled");
  console.log(`${word} ${c.bold(TOOLS[name].title)} in ${settingsPath(base)}`);
  writeToolConfigs(base, settings);
  console.log(`  wrote MCP config to ${join11(base, CLAUDE_MCP_FILE)}`);
  if (on && !(opts.detect ?? TOOLS[name].detect.bind(TOOLS[name]))(name)) {
    if (opts.approved && opts.spawner) {
      const rc = provisionTool(base, name, opts.spawner);
      if (rc !== 0) {
        console.error(c.yellow(`  note: ${name} stays enabled in ${settingsPath(base)} but is NOT provisioned — re-run \`vf tools enable ${name} --yes\` after fixing the failure, or \`vf tools disable ${name}\`.`));
        return rc;
      }
    } else {
      console.log(c.yellow(`  ! ${TOOLS[name].title} binary not found on PATH — the MCP server will not start until it is installed.`));
      console.log(c.dim(`    Run \`vf tools enable ${name} --yes\` to install + index it now, or \`vf tools install ${name}\` for the plan.`));
    }
  } else if (on && opts.approved && opts.spawner) {
    const rc = ensureToolIndex(base, name, opts.spawner);
    if (rc !== 0)
      return rc;
  }
  console.log(c.dim(settings.tools[name] === on ? "Re-run `vf init` to regenerate instructions." : "no change"));
  return 0;
}
function runToolSteps(steps, spawner) {
  for (const step of steps) {
    console.log(c.cyan(`
▶ ${step.cmd} ${step.args.join(" ")}`));
    const { status } = spawner(step.cmd, step.args);
    if (status !== 0) {
      console.error(c.red(`✗ step failed (${status}).`));
      return false;
    }
  }
  return true;
}
function provisionTool(base, name, spawner) {
  const tool = TOOLS[name];
  const ctx = { workspace: base, languages: repoLanguages(base) };
  if (!runToolSteps(tool.installPlan(ctx).steps, spawner)) {
    console.error(c.red(`  ${tool.title} is enabled but not provisioned.`));
    return 1;
  }
  console.log(c.green(`  ✓ ${tool.title} installed.`));
  return 0;
}
function ensureToolIndex(base, name, spawner) {
  const tool = TOOLS[name];
  if (!tool.indexPlan || !tool.indexPresent)
    return 0;
  if (tool.indexPresent(base)) {
    console.log(c.dim(`  ${tool.title} index present.`));
    return 0;
  }
  const ctx = { workspace: base, languages: repoLanguages(base) };
  if (!runToolSteps(tool.indexPlan(ctx).steps, spawner))
    return 1;
  console.log(c.green(`  ✓ built ${tool.title} index.`));
  return 0;
}
function toolsInstall(base, name, approved, spawner) {
  const ctx = { workspace: base, languages: repoLanguages(base) };
  const plan = TOOLS[name].installPlan(ctx);
  console.log(c.bold(`Install plan for ${TOOLS[name].title}:`));
  for (const step of plan.steps) {
    console.log(`  ${c.cyan(`${step.cmd} ${step.args.join(" ")}`)}
    ${c.dim(step.description)}`);
  }
  if (!approved) {
    console.log(c.yellow(`
No changes made. Re-run with --yes to execute the plan.`));
    return 0;
  }
  for (const step of plan.steps) {
    console.log(c.cyan(`
▶ ${step.cmd} ${step.args.join(" ")}`));
    const { status } = spawner(step.cmd, step.args);
    if (status !== 0) {
      console.error(c.red(`✗ step failed (${status}). Stopping.`));
      return 1;
    }
  }
  console.log(c.green(`
Installed ${TOOLS[name].title}. Run \`vf tools enable ${name}\` to wire it.`));
  return 0;
}
function tools(sub, rest, flags, inject = {}) {
  const base = inject.base ?? cwd();
  if (sub === undefined || sub === "status")
    return toolsStatus(base);
  const name = rest[0];
  if ((sub === "enable" || sub === "disable" || sub === "install") && !isToolName(name)) {
    console.error(c.red(`Usage: vf tools ${sub} <${VALID_TOOLS.join("|")}>`));
    return 2;
  }
  const spawner = inject.spawner ?? ((cmd, args) => ({ status: spawnSync6(cmd, args, { stdio: "inherit" }).status ?? 0 }));
  if (sub === "enable")
    return toolsToggle(base, name, true, {
      approved: Boolean(flags.yes),
      spawner,
      detect: inject.detect
    });
  if (sub === "disable")
    return toolsToggle(base, name, false, { detect: inject.detect });
  if (sub === "install") {
    return toolsInstall(base, name, Boolean(flags.yes), spawner);
  }
  if (sub === "sync")
    return toolsSync(base, spawner);
  console.error(c.red(`Unknown: vf tools ${sub}`));
  return 2;
}
function toolsSync(base, spawner, inject = {}) {
  const settings = readSettings(base);
  const detect3 = inject.detect ?? ((name) => TOOLS[name].detect());
  let synced = 0;
  for (const name of VALID_TOOLS) {
    const tool = TOOLS[name];
    if (!settings.tools[name])
      continue;
    if (!tool.indexPlan || !tool.indexPresent)
      continue;
    if (!detect3(name))
      continue;
    console.log(c.cyan(`▶ re-indexing ${tool.title}`));
    if (!runToolSteps(tool.indexPlan({ workspace: base, languages: [] }).steps, spawner)) {
      console.error(c.red(`✗ ${tool.title} re-index failed.`));
      return 1;
    }
    synced++;
  }
  console.log(synced ? c.green(`✓ synced ${synced} tool index(es).`) : c.dim("nothing to sync."));
  return 0;
}
function printVersion() {
  console.log(VERSION);
  return 0;
}
function printDeletePlan(plan, willApply) {
  console.log(c.bold(`Workflow delete plan
`));
  console.log(plan.summary);
  console.log(c.bold(`
Would remove:`));
  for (const t of plan.targets)
    console.log(`  ${c.red("-")} ${t}`);
  if (!plan.targets.length)
    console.log(c.dim("  (nothing)"));
  if (plan.preserved.length) {
    console.log(c.bold(`
Preserved:`));
    for (const p of plan.preserved)
      console.log(`  ${c.green("•")} ${p}`);
  }
  if (!willApply) {
    console.log(c.yellow(`
Dry run. Re-run with --yes to delete the targets above.`));
  }
}
function workflowDelete(flags) {
  const base = resolveRepo(typeof flags.repo === "string" ? flags.repo : undefined);
  const plan = planDelete(base, { all: Boolean(flags.all) });
  if (!plan.targets.length) {
    console.log(c.yellow(plan.summary));
    return 0;
  }
  const apply = Boolean(flags.yes);
  printDeletePlan(plan, apply);
  if (!apply)
    return 0;
  const removed = applyDelete(plan);
  console.log(c.green(`
Removed ${removed.length} target(s).`));
  return 0;
}
function workflowDeleteUnit(name, flags) {
  const base = resolveRepo(typeof flags.repo === "string" ? flags.repo : undefined);
  if (!name?.trim()) {
    console.error(c.red("Usage: vf workflow delete-unit <name> [--repo <path>]"));
    return 2;
  }
  const state = deleteUnit(base, name);
  if (!state) {
    const existing = readState(base);
    console.error(c.red(`No such unit "${name}".`));
    const names = existing?.work_units.map((u) => u.name) ?? [];
    console.log(names.length ? `Available: ${names.join(", ")}` : c.dim("(no work units)"));
    return 1;
  }
  console.log(c.green(`Removed unit "${name}". ${state.work_units.length} remaining.`));
  return 0;
}
function printMergeResult(result) {
  console.log(c.bold(`Import plan
`));
  console.log(`added: ${result.added.length ? result.added.join(", ") : "(none)"}`);
  for (const [from, to] of result.renamed)
    console.log(c.yellow(`renamed: ${from} → ${to}`));
  for (const conflict of result.conflicts)
    console.log(c.yellow(`conflict: ${conflict.detail}`));
  console.log(c.dim(result.goalReconciliation));
}
function workflowImport(src, flags) {
  const base = resolveRepo(typeof flags.repo === "string" ? flags.repo : undefined);
  if (!src?.trim()) {
    console.error(c.red("Usage: vf workflow import <srcPath> [--on-collision rename|skip|replace] [--yes]"));
    return 2;
  }
  const onNameCollision = resolveCollision(flags);
  const result = importWorkflow(base, src, { onNameCollision });
  if (!result) {
    console.error(c.red("Import failed: a workflow must exist in BOTH the source and this repo."));
    return 1;
  }
  printMergeResult(result);
  if (!flags.yes) {
    console.log(c.yellow(`
Dry run. Re-run with --yes to persist the merged workflow.`));
    return 0;
  }
  writeState(base, result.merged);
  console.log(c.green(`
Merged: ${result.merged.work_units.length} total unit(s).`));
  return 0;
}
function resolveCollision(flags) {
  const raw = flags["on-collision"];
  return raw === "skip" || raw === "replace" ? raw : "rename";
}
function workflow(sub, rest, flags) {
  if (sub === "delete")
    return workflowDelete(flags);
  if (sub === "delete-unit")
    return workflowDeleteUnit(rest[0], flags);
  if (sub === "import")
    return workflowImport(rest[0], flags);
  console.error(c.red("Usage: vf workflow <delete|delete-unit|import> …"));
  return 2;
}
function printHelp() {
  console.log(`${c.bold("VibeFlow")} v${VERSION} — orchestrate Claude Code, Codex & Copilot CLI

${c.bold("Usage:")} vf [command] [options]

${c.bold("Commands:")}
  ${c.cyan("(none)")}            open the local web UI
  ${c.cyan("ui")}                open the local web UI
  ${c.cyan("doctor")}            check required and optional tools (--probe for live engine readiness)
  ${c.cyan("init")}             generate canonical context + engine files (--engine, --interactive, --dry-run)
  ${c.cyan("run <engine>")}      dispatch claude | codex | copilot (--yes to launch)
  ${c.cyan("orchestrate")}       plan + dispatch work units in parallel, review, goal-eval (--engine, --yes, --concurrency)
  ${c.cyan("workflow [sub]")}    delete [--all] | delete-unit <name> | import <src> [--on-collision] (--yes to apply)
  ${c.cyan("units [sub]")}       status | show <name> | resources | evidence <name> | add <name> | update <name> [--status s] [--confidence n] | delete <name>
  ${c.cyan("skills [sub]")}      list | search <term> | resolve (demand-driven needs)
  ${c.cyan("tools [sub]")}       status | enable <tool> | disable <tool> | install <tool> (--yes)
  ${c.cyan("discover <kind>")}   docs|skills <query> via Context7 (--yes approves network)
  ${c.cyan("hook")}              evaluate a JSON hook event from stdin (allow/warn/require_approval/block)
  ${c.cyan("hooks [sub]")}       status | install | emit (write engine hook configs)
  ${c.cyan("verify")}            typecheck / lint / test + confidence / evidence / scope gates
  ${c.cyan("help, --version")}   show help / version

${c.dim("Run `vf <command> --help` for command-specific usage.")}
`);
  return 0;
}
var COMMAND_HELP = {
  ui: () => `${c.bold("vf ui")} ${c.dim("[--port <n>] [--no-open]")}
Open the local web UI (intake wizard + workflow console). This is also the default
command when you run \`vf\` with no arguments.

${c.bold("Options:")}
  --port <n>    bind to a specific port (default: an ephemeral free port)
  --no-open     start the server without launching a browser

${c.bold("Examples:")}
  vf
  vf ui --port 4173 --no-open`,
  doctor: () => `${c.bold("vf doctor")} ${c.dim("[--probe]")}
Check required (node, git) and optional (bun, engine CLIs, docker) tools, plus
per-engine readiness.

${c.bold("Options:")}
  --probe       run a live engine round-trip instead of a presence/auth check

${c.bold("Examples:")}
  vf doctor
  vf doctor --probe`,
  init: () => `${c.bold("vf init")} ${c.dim("[--engine <claude|codex|copilot>] [--interactive] [--dry-run]")}
Generate the canonical context + engine instruction files and a workflow ledger.
By default a hard creation gate refuses when no engine is ready; --dry-run previews
offline (writes nothing).

${c.bold("Options:")}
  --engine <e>   generate for a single engine instead of all three
  --interactive  ask the intake questions in the terminal (TTY only)
  --dry-run      read-only preview — print what would be written, change nothing

${c.bold("Examples:")}
  vf init --engine claude
  vf init --dry-run`,
  run: () => `${c.bold("vf run")} ${c.dim("<claude|codex|copilot> [--yes]")}
Write the dispatch prompt for one engine. Without --yes it is a read-only dry run;
--yes launches the engine CLI behind the source-protection gate.

${c.bold("Options:")}
  --yes               launch the engine (otherwise dry-run only)
  --auto-wip          snapshot a dirty tree before launching instead of refusing
  --require-git       refuse to launch outside a git repo
  --rollback-on-fail  reset the tree to the pre-dispatch checkpoint on failure

${c.bold("Examples:")}
  vf run claude
  vf run codex --yes`,
  orchestrate: () => `${c.bold("vf orchestrate")} ${c.dim("[--engine <e>] [--yes] [--concurrency <n>] [--risk <class>]")}
Dispatch every saved work unit (bounded-parallel), run an independent reviewer,
record evidence, then evaluate the goal. Default mode is a read-only dry run.

${c.bold("Options:")}
  --engine <e>        target engine (default: claude)
  --yes               real run — launch the engine (otherwise dry preview)
  --concurrency <n>   max units dispatched in parallel
  --risk <class>      docs | simple-code | feature | architecture | security | deploy
  --auto-wip / --require-git / --rollback-on-fail   source-protection toggles

${c.bold("Examples:")}
  vf orchestrate
  vf orchestrate --engine codex --yes --concurrency 2`,
  workflow: () => `${c.bold("vf workflow")} ${c.dim("<delete | delete-unit | import> …")}
Manage a saved workflow. Destructive paths are dry by default and print exactly what
they will touch before --yes applies them.

${c.bold("Subcommands:")}
  delete [--all] [--yes]                          remove the workflow (or everything with --all)
  delete-unit <name> [--repo <path>]              remove a single work unit
  import <src> [--on-collision rename|skip|replace] [--yes]   merge another workflow

${c.bold("Examples:")}
  vf workflow delete
  vf workflow import ../other-repo --yes`,
  units: () => `${c.bold("vf units")} ${c.dim("[status | show <name> | resources | evidence <name> | add <name> | update <name> | delete <name>]")}
Inspect and mutate work units in the workflow ledger.

${c.bold("Subcommands:")}
  status                                  list every unit and its gates (default)
  show <name>                             print one unit as JSON
  resources                               totals: units / tokens / cost / wall-seconds
  evidence <name>                         list a unit's recorded evidence
  evidence <name> --add "<text>"          append an evidence record to a unit
  add <name>                              add a new (pending) unit
  update <name> [--status s] [--confidence n]   patch a unit
  delete <name>                           remove a unit

${c.bold("Examples:")}
  vf units status
  vf units update auth --status done --confidence 1`,
  skills: () => `${c.bold("vf skills")} ${c.dim("[list | search <term> | resolve]")}
Inspect locally discovered skills and demand-driven skill needs.

${c.bold("Subcommands:")}
  list             list discovered skills (default)
  search <term>    rank skills matching a task description
  resolve          report which skill needs are satisfied locally vs. on demand

${c.bold("Examples:")}
  vf skills list
  vf skills search "read a pdf"`,
  tools: () => `${c.bold("vf tools")} ${c.dim("[status | enable <tool> | disable <tool> | install <tool> [--yes]]")}
Manage the optional code-navigation tools (codegraph, lsp).

${c.bold("Subcommands:")}
  status                  show enabled/installed/priority for each tool (default)
  enable <tool>           enable a tool and wire its MCP config
  disable <tool>          disable a tool and remove its MCP config
  install <tool> [--yes]  print the install plan; --yes executes it

${c.dim("tool = codegraph | lsp")}

${c.bold("Examples:")}
  vf tools status
  vf tools enable codegraph`,
  discover: () => `${c.bold("vf discover")} ${c.dim("<docs|skills> <query> [--yes]")}
Look up external docs or skills via Context7. The network is only touched with
explicit approval.

${c.bold("Options:")}
  --yes         approve the network lookup (otherwise prints an approval prompt)

${c.bold("Examples:")}
  vf discover docs react --yes
  vf discover skills "pdf reader" --yes`,
  hook: () => `${c.bold("vf hook")} ${c.dim("[--selftest]")}
Read a JSON hook event from stdin, score its risk, and print a decision
(allow / warn / require_approval / block) with the matching exit code.

${c.bold("Options:")}
  --selftest    run the fixed attack+benign corpus and write an audit report

${c.bold("Examples:")}
  echo '{"tool":"Bash","input":"rm -rf /"}' | vf hook
  vf hook --selftest`,
  hooks: () => `${c.bold("vf hooks")} ${c.dim("[status | install | emit [--yes] [--dry-run]]")}
Manage git/engine hook wiring (all hooks delegate to \`vf hook\`).

${c.bold("Subcommands:")}
  status     show the configured core.hooksPath (default)
  install    point git core.hooksPath at .githooks
  emit       write per-engine hook config files into the repo
             (dry-run by default; pass --yes to actually write)

${c.bold("Examples:")}
  vf hooks status
  vf hooks install
  vf hooks emit           ${c.dim("# dry-run: show what would be written")}
  vf hooks emit --yes`,
  verify: () => `${c.bold("vf verify")}
Run the project's toolchain gates (typecheck / lint / test, auto-detected for
npm/Gradle/monorepo) plus the policy gates (confidence / evidence / scope) over the
workflow ledger. Returns nonzero if any gate fails.

${c.bold("Examples:")}
  vf verify`
};
function hasCommandHelp(cmd) {
  return cmd !== undefined && cmd in COMMAND_HELP;
}
function printCommandHelp(cmd) {
  const render = COMMAND_HELP[cmd];
  if (!render)
    return printHelp();
  console.log(render());
  return 0;
}

// src/cli.ts
init_core();

// src/server.ts
import { randomUUID } from "node:crypto";
import {
  createWriteStream,
  existsSync as existsSync12,
  mkdirSync as mkdirSync5,
  readFileSync as readFileSync9,
  readdirSync as readdirSync4,
  statSync as statSync6,
  unlinkSync as unlinkSync2
} from "node:fs";
import { createServer } from "node:http";
import { basename as basename3, join as join12, resolve as resolve5, sep } from "node:path";
init_core();
init_context7();
init_preflight();
init_scanner();
init_settings();
var LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
var ASSETS_DIR = new URL("./assets/", import.meta.url);
var ASSET_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".svg": "image/svg+xml"
};
function serveAsset(res, url) {
  const rel = url.slice("/assets/".length);
  if (!rel || rel.includes("..") || rel.includes("\x00"))
    return false;
  const fileUrl = new URL(rel, ASSETS_DIR);
  if (!fileUrl.href.startsWith(ASSETS_DIR.href))
    return false;
  const ext = rel.slice(rel.lastIndexOf("."));
  const type = ASSET_TYPES[ext];
  if (!type)
    return false;
  let body;
  try {
    body = readFileSync9(fileUrl);
  } catch {
    return false;
  }
  res.writeHead(200, {
    "content-type": type,
    "x-content-type-options": "nosniff",
    "cache-control": "no-cache"
  });
  res.end(body);
  return true;
}
function hostAllowed(req) {
  const host = (req.headers.host || "").replace(/:\d+$/, "");
  return LOOPBACK.has(host);
}
function originAllowed(req) {
  const o = req.headers.origin || req.headers.referer;
  if (!o)
    return true;
  try {
    return LOOPBACK.has(new URL(o).hostname);
  } catch {
    return false;
  }
}
function readJsonBody(req, cap = 65536) {
  return new Promise((resolve6, reject) => {
    let body = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > cap) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      body += chunk.toString("utf8");
    });
    req.on("end", () => {
      try {
        resolve6(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("invalid json"));
      }
    });
    req.on("error", reject);
  });
}
function sendJson(res, status, data) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
}
var ATTACH_CAP = 50 * 1024 * 1024;
function attachDir(repo) {
  return join12(repo, CTX_DIR, "attachments");
}
function safeAttachName(raw) {
  const base = basename3(String(raw || "").trim());
  if (!base || base === "." || base === "..")
    return null;
  if (base.startsWith("."))
    return null;
  if (/[\\/\0]/.test(base))
    return null;
  if (/[\u0000-\u001f]/.test(base))
    return null;
  if (base.length > 200)
    return null;
  return base;
}
function listAttachments(repo) {
  const dir = attachDir(repo);
  if (!existsSync12(dir))
    return [];
  return readdirSync4(dir).filter((n) => !n.startsWith(".")).map((n) => {
    let size = 0;
    try {
      size = statSync6(join12(dir, n)).size;
    } catch {}
    return {
      name: n,
      size,
      type: n.split(".").pop()?.toLowerCase() ?? "",
      skill: skillForFile(n)
    };
  });
}
function syncAttachments(repo) {
  const items = listAttachments(repo);
  const state = readState(repo);
  if (state) {
    state.attachments = items;
    writeState(repo, state);
  }
  return items;
}
function saveUpload(req, repo, rawName) {
  return new Promise((resolvePromise, reject) => {
    const safe = safeAttachName(rawName);
    if (!safe) {
      reject(new Error("invalid filename"));
      return;
    }
    const dir = attachDir(repo);
    mkdirSync5(dir, { recursive: true });
    const dest = join12(dir, safe);
    if (!resolve5(dest).startsWith(resolve5(dir) + sep)) {
      reject(new Error("invalid path"));
      return;
    }
    let size = 0;
    let aborted = false;
    const out = createWriteStream(dest);
    const fail = (msg) => {
      if (aborted)
        return;
      aborted = true;
      out.destroy();
      try {
        unlinkSync2(dest);
      } catch {}
      reject(new Error(msg));
    };
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > ATTACH_CAP) {
        fail("file too large");
        req.destroy();
        return;
      }
      out.write(chunk);
    });
    req.on("end", () => {
      if (aborted)
        return;
      out.end(() => resolvePromise({
        name: safe,
        size,
        type: safe.split(".").pop()?.toLowerCase() ?? "",
        skill: skillForFile(safe)
      }));
    });
    req.on("error", () => fail("upload error"));
    out.on("error", () => fail("write error"));
  });
}
function requestedEngines(payload) {
  const raw = payload.engines;
  if (!Array.isArray(raw))
    return [...ENGINES];
  const want = new Set(raw.filter((e) => typeof e === "string"));
  const picked = ENGINES.filter((e) => want.has(e));
  return picked.length ? picked : [...ENGINES];
}
function runPreflight(payload) {
  const opts = { probe: payload.probe !== false };
  const readiness = preflightAll(requestedEngines(payload), opts);
  return { ok: true, readiness, anyReady: anyReady(readiness) };
}
function repoLanguages2(repo) {
  try {
    return scanRepo(repo).languages;
  } catch {
    return [];
  }
}
function toolViews(repo) {
  const languages = repoLanguages2(repo);
  return TOOL_ORDER.map((name) => {
    const tool = TOOLS[name];
    const plan = tool.installPlan({ workspace: repo, languages });
    return {
      name,
      title: tool.title,
      description: tool.description,
      installed: tool.detect(),
      plan: plan.steps.map((s) => `${s.cmd} ${s.args.join(" ")}`),
      command: `vf tools install ${name} --yes`
    };
  });
}
function settingsView(repo) {
  return { settings: readSettings(repo), tools: toolViews(repo) };
}
function applySettings(repo, payload) {
  const raw = payload.tools ?? {};
  const tools2 = { ...readSettings(repo).tools };
  if (typeof raw.codegraph === "boolean")
    tools2.codegraph = raw.codegraph;
  if (typeof raw.lsp === "boolean")
    tools2.lsp = raw.lsp;
  return writeSettings(repo, { tools: tools2 });
}
function startServer(port = 0) {
  const token = randomUUID();
  const pageHtml = readFileSync9(new URL("./server.html", import.meta.url), "utf8");
  const html = pageHtml.replace(/__CSRF__/g, token);
  let activeRepo = cwd();
  const guarded = (req) => hostAllowed(req) && originAllowed(req) && req.headers["x-vibeflow-token"] === token;
  const server = createServer(async (req, res) => {
    const method = req.method || "GET";
    const fullUrl = req.url || "/";
    const url = fullUrl.split("?")[0] || "/";
    const query = new URLSearchParams(fullUrl.split("?")[1] || "");
    if (method === "GET" && (url === "/" || url.startsWith("/index"))) {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'",
        "x-content-type-options": "nosniff"
      });
      res.end(html);
      return;
    }
    if (method === "GET" && url === "/state") {
      sendJson(res, 200, readState(activeRepo));
      return;
    }
    if (method === "GET" && url === "/api/markers") {
      Promise.resolve().then(() => (init_marker(), exports_marker)).then((m) => sendJson(res, 200, { markers: m.listMarkers() }), () => sendJson(res, 200, { markers: [] }));
      return;
    }
    if (method === "GET" && url === "/api/attachments") {
      sendJson(res, 200, { attachments: listAttachments(activeRepo) });
      return;
    }
    if (method === "GET" && url === "/api/skills") {
      const state = readState(activeRepo);
      const needs = resolveSkillNeeds({
        repo: activeRepo,
        attachments: (state?.attachments ?? []).map((a) => a.name),
        task: state?.goal,
        profile: scanRepo(activeRepo)
      });
      sendJson(res, 200, { skills: discoverSkills(activeRepo), needs });
      return;
    }
    if (method === "GET" && url === "/api/settings") {
      sendJson(res, 200, settingsView(activeRepo));
      return;
    }
    if (method === "GET" && url === "/events") {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive"
      });
      let last = "";
      const tick = () => {
        const state = readState(activeRepo);
        const json = JSON.stringify(state);
        if (json !== last) {
          last = json;
          res.write(`data: ${json}

`);
        }
      };
      tick();
      const timer = setInterval(tick, 1000);
      req.on("close", () => clearInterval(timer));
      return;
    }
    const isWrite = method === "POST" && (url === "/api/init" || url === "/api/dispatch" || url === "/api/detect" || url === "/api/units" || url === "/api/orchestrate" || url === "/api/discover" || url === "/api/preflight" || url === "/api/settings" || url === "/api/upload") || method === "DELETE" && url === "/api/upload";
    if (isWrite) {
      if (!guarded(req)) {
        sendJson(res, 403, { error: "forbidden" });
        return;
      }
      try {
        if (method === "POST" && url === "/api/upload") {
          const att = await saveUpload(req, activeRepo, query.get("name") || "");
          const attachments = syncAttachments(activeRepo);
          sendJson(res, 200, { ok: true, attachment: att, attachments });
          return;
        }
        if (method === "DELETE" && url === "/api/upload") {
          const safe = safeAttachName(query.get("name") || "");
          if (!safe) {
            sendJson(res, 400, { error: "invalid filename" });
            return;
          }
          const target = join12(attachDir(activeRepo), safe);
          if (existsSync12(target))
            unlinkSync2(target);
          const attachments = syncAttachments(activeRepo);
          sendJson(res, 200, { ok: true, attachments });
          return;
        }
        const payload = await readJsonBody(req);
        if (url === "/api/detect") {
          const det = detectRepo(typeof payload.path === "string" ? payload.path : undefined);
          activeRepo = det.repo;
          sendJson(res, 200, {
            ok: true,
            ...det,
            state: readState(activeRepo)
          });
        } else if (url === "/api/init") {
          if (typeof payload.repoPath === "string")
            activeRepo = resolveRepo(payload.repoPath);
          const { files, state } = applyIntake(payload, {
            useAi: false,
            base: activeRepo
          });
          sendJson(res, 200, { ok: true, files, state });
        } else if (url === "/api/dispatch") {
          const result = applyDispatch(String(payload.engine ?? ""), activeRepo);
          if (!result) {
            sendJson(res, 400, { error: "invalid engine" });
            return;
          }
          sendJson(res, 200, { ok: true, ...result });
        } else if (url === "/api/orchestrate") {
          const engine = typeof payload.engine === "string" ? payload.engine : "claude";
          await orchestrate({ engine, dry: true }, activeRepo);
          sendJson(res, 200, { ok: true, state: readState(activeRepo) });
        } else if (url === "/api/discover") {
          const kind = payload.kind === "skills" ? "skills" : "docs";
          const query2 = String(payload.query ?? "").trim();
          const approved = payload.approved === true;
          if (!query2) {
            sendJson(res, 400, { error: "query required" });
            return;
          }
          const outcome = kind === "docs" ? await lookupDocsHttp(query2, { approved }) : await searchSkillsHttp(query2, { approved });
          sendJson(res, 200, { ...outcome });
        } else if (url === "/api/units") {
          const action = String(payload.action ?? "");
          if (action !== "add" && action !== "update" && action !== "delete") {
            sendJson(res, 400, { error: "invalid action" });
            return;
          }
          const unit = payload.unit ?? {};
          const state = mutateUnits(activeRepo, action, unit);
          if (!state) {
            sendJson(res, 400, { error: "no workflow or unit not found" });
            return;
          }
          sendJson(res, 200, { ok: true, state });
        } else if (url === "/api/preflight") {
          sendJson(res, 200, runPreflight(payload));
        } else if (url === "/api/settings") {
          applySettings(activeRepo, payload);
          sendJson(res, 200, { ok: true, ...settingsView(activeRepo) });
        }
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
      return;
    }
    if (method === "GET" && url.startsWith("/assets/")) {
      if (serveAsset(res, url))
        return;
    }
    res.writeHead(404);
    res.end("not found");
  });
  const nextPort = () => 41000 + Math.floor(Math.random() * 20000);
  return new Promise((resolvePromise, reject) => {
    let attempts = 0;
    const listen = (targetPort) => {
      const onError = (err) => {
        server.off("error", onError);
        if (port === 0 && err.code === "EADDRINUSE" && attempts < 20) {
          attempts++;
          listen(nextPort());
          return;
        }
        reject(err);
      };
      server.once("error", onError);
      server.listen(targetPort, "127.0.0.1", () => {
        server.off("error", onError);
        const addr = server.address();
        const boundPort = typeof addr === "object" && addr ? addr.port : targetPort;
        const url = `http://127.0.0.1:${boundPort}`;
        console.log(`${c.cyan("VibeFlow UI")} → ${c.bold(url)}  ${c.dim("(Ctrl+C to stop)")}`);
        resolvePromise({ server, url });
      });
    };
    listen(port === 0 ? nextPort() : port);
  });
}

// src/cli.ts
function openBrowser(url) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    spawn3(cmd, [url], {
      stdio: "ignore",
      detached: true,
      shell: process.platform === "win32"
    }).unref();
  } catch {}
}
function promptYesNo(question) {
  if (!process.stdin.isTTY)
    return Promise.resolve(false);
  const rl = createInterface2({ input: process.stdin, output: process.stdout });
  return new Promise((resolve6) => {
    rl.question(question, (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      resolve6(a === "y" || a === "yes");
    });
  });
}
async function startServerResilient(port) {
  try {
    return await startServer(port);
  } catch (err) {
    const e = err;
    if (e.code === "EADDRINUSE" && port !== 0) {
      console.error(c.yellow(`Port ${port} is already in use by another process.`));
      const change = await promptYesNo("Switch to a different port? (y/N) ");
      if (change)
        return await startServer(0);
      console.error(c.dim("Stopped."));
      process.exit(1);
    }
    throw err;
  }
}
async function ui(flags) {
  const port = typeof flags.port === "string" ? Number(flags.port) : 0;
  let { server, url } = await startServerResilient(Number.isFinite(port) ? port : 0);
  if (!flags["no-open"])
    openBrowser(url);
  const stdin = process.stdin;
  let rawOk = false;
  let restarting = false;
  if (stdin.isTTY && typeof stdin.setRawMode === "function") {
    try {
      stdin.setRawMode(true);
      rawOk = true;
    } catch {}
  }
  if (rawOk) {
    stdin.resume();
    stdin.setEncoding("utf8");
    console.log(c.dim("  press r to restart · q to quit"));
    stdin.on("data", (key) => {
      if (key === "r" || key === "R") {
        if (restarting)
          return;
        restarting = true;
        const prev = server;
        prev.closeAllConnections?.();
        prev.close();
        process.stdout.write("\x1B[2J\x1B[3J\x1B[H");
        startServer(Number.isFinite(port) ? port : 0).then((next) => {
          ({ server, url } = next);
          console.log(c.dim("  press r to restart · q to quit"));
        }).catch((err) => {
          console.error(c.dim(`restart failed: ${err.message}`));
        }).finally(() => {
          restarting = false;
        });
      } else if (key === "q" || key === "\x03") {
        process.exit(0);
      }
    });
  }
  return await new Promise(() => {});
}
async function main(argv) {
  const [cmd, ...rest] = argv;
  const { positionals, flags } = parseFlags(rest);
  if (flags.version || cmd === "--version" || cmd === "-v")
    return printVersion();
  const wantsHelp = flags.help === true || rest.includes("-h") || rest.includes("--help");
  if (wantsHelp && hasCommandHelp(cmd))
    return printCommandHelp(cmd);
  if (cmd === "help" || cmd === "--help" || cmd === "-h" || wantsHelp)
    return printHelp();
  switch (cmd) {
    case undefined:
      return await ui({
        port: "7799",
        dev: true
      });
    case "ui":
      return await ui(flags);
    case "doctor":
      return await doctor(flags);
    case "init":
      if (flags.interactive && process.stdin.isTTY)
        return await initInteractive(flags);
      return await init(flags);
    case "run":
      return await run(positionals[0], flags);
    case "orchestrate":
      return await orchestrate(flags);
    case "workflow":
      return workflow(positionals[0], positionals.slice(1), flags);
    case "units":
      return units(positionals[0], positionals.slice(1), flags);
    case "skills":
      return skills(positionals[0], positionals.slice(1));
    case "tools":
      return tools(positionals[0], positionals.slice(1), flags);
    case "discover":
      return await discover(positionals[0], positionals.slice(1), flags);
    case "hook":
      if (flags.selftest)
        return hookSelftest();
      return await hook();
    case "hooks":
      return hooks(positionals[0], flags);
    case "verify":
      return verify();
    default:
      console.error(c.red(`Unknown command: ${cmd}`));
      printHelp();
      return 2;
  }
}
main(process.argv.slice(2)).then((code) => {
  if (code)
    process.exitCode = code;
}).catch((err) => {
  console.error(c.red(String(err?.stack ?? err)));
  process.exitCode = 1;
});
