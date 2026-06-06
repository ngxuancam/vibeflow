import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import {
  type ProjectContext,
  canonicalFiles,
  defaultContext,
  dispatchPrompt,
  engineFiles,
} from "./adapters.js";
import {
  ENGINES,
  type Engine,
  VERSION,
  type WorkUnit,
  type WorkflowState,
  c,
  ctxPath,
  cwd,
  hasCommand,
  isGitRepo,
  readState,
  recomputeTotals,
  writeFileSafe,
  writeState,
} from "./core.js";

export function doctor(): number {
  const checks: Array<[string, boolean, "required" | "optional"]> = [
    ["node", hasCommand("node"), "required"],
    ["git", hasCommand("git"), "required"],
    ["bun", hasCommand("bun"), "optional"],
    ["claude", hasCommand("claude"), "optional"],
    ["codex", hasCommand("codex"), "optional"],
    ["copilot", hasCommand("copilot") || hasCommand("gh"), "optional"],
    ["docker", hasCommand("docker"), "optional"],
  ];
  console.log(c.bold("VibeFlow environment check\n"));
  let missingRequired = 0;
  for (const [name, ok, kind] of checks) {
    const mark = ok ? c.green("✓") : kind === "required" ? c.red("✗") : c.yellow("•");
    const note = ok ? "" : kind === "required" ? c.red(" (required)") : c.dim(" (optional)");
    if (!ok && kind === "required") missingRequired++;
    console.log(`  ${mark} ${name}${note}`);
  }
  console.log(`\n  git repo: ${isGitRepo() ? c.green("yes") : c.yellow("no — run `git init`")}`);
  if (missingRequired > 0) {
    console.log(c.red(`\n${missingRequired} required tool(s) missing.`));
    return 1;
  }
  console.log(c.green("\nReady."));
  return 0;
}

export interface IntakeAnswers {
  goal?: string;
  engines?: string[];
  docSource?: string;
  taskSource?: string;
  fileTypes?: string[];
  expectedResult?: string;
  sample?: string;
  repoPath?: string;
}

function chosenEngines(engines?: string[]): Engine[] {
  const valid = (engines ?? []).filter((e): e is Engine => (ENGINES as string[]).includes(e));
  return valid.length ? valid : [...ENGINES];
}

/** Validate and resolve a user-supplied repo path to an absolute existing directory. */
export function resolveRepo(path?: string): string {
  if (!path || !path.trim()) return cwd();
  const abs = isAbsolute(path) ? path : resolve(cwd(), path);
  try {
    if (statSync(abs).isDirectory()) return abs;
  } catch {
    /* fall through */
  }
  return cwd();
}

const SKILL_BY_EXT: Record<string, string> = {
  md: "markdown-reader",
  markdown: "markdown-reader",
  txt: "text-reader",
  doc: "docx-reader",
  docx: "docx-reader",
  xls: "xlsx-reader",
  xlsx: "xlsx-reader",
  csv: "csv-reader",
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
  webp: "image-ocr",
};

/** Map a file name to the reader skill an AI agent should use to ingest it. */
export function skillForFile(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return SKILL_BY_EXT[ext] ?? "generic-file-reader";
}

export interface RepoDetection {
  repo: string;
  isGit: boolean;
  engines: Record<Engine, boolean>;
  clis: Record<Engine, boolean>;
}

/** Detect which engines a repo already carries (by marker files) and which CLIs are present. */
export function detectRepo(path?: string): RepoDetection {
  const repo = resolveRepo(path);
  const has = (rel: string) => existsSync(join(repo, rel));
  return {
    repo,
    isGit: has(".git"),
    engines: {
      claude: has("CLAUDE.md") || has(".claude"),
      codex: has("AGENTS.md") || has(".codex"),
      copilot: has(".github/copilot-instructions.md"),
    },
    clis: {
      claude: hasCommand("claude"),
      codex: hasCommand("codex"),
      copilot: hasCommand("copilot") || hasCommand("gh"),
    },
  };
}

function contextFrom(answers: IntakeAnswers): ProjectContext {
  const base = defaultContext();
  const clean = (s?: string) => (s?.trim() ? s.trim() : undefined);
  return {
    ...base,
    goal: clean(answers.goal) ?? base.goal,
    docSource: clean(answers.docSource),
    taskSource: clean(answers.taskSource),
    fileTypes: answers.fileTypes?.map((s) => s.trim()).filter(Boolean),
    expectedResult: clean(answers.expectedResult),
    sample: clean(answers.sample),
  };
}

/**
 * Shared workflow generator used by both `vf init` (CLI) and the web intake wizard.
 * `useAi` is false for web-initiated init so a browser request never shells out to
 * $VIBEFLOW_AI; the CLI keeps the AI bridge enabled. When a workflow already exists in
 * `base`, its work units and attachments are preserved so re-submitting acts as an edit.
 */
export function applyIntake(
  answers: IntakeAnswers,
  opts: { dry?: boolean; useAi?: boolean; base?: string } = {},
): { files: string[]; state: WorkflowState } {
  const base = opts.base ?? resolveRepo(answers.repoPath);
  const ctx = contextFrom(answers);
  const useAi = opts.useAi !== false;
  const files: Record<string, string> = { ...canonicalFiles(ctx) };
  for (const engine of chosenEngines(answers.engines)) {
    Object.assign(files, engineFiles(engine, ctx, useAi));
  }
  const prev = readState(base);
  const state = recomputeTotals({
    task_id: prev?.task_id ?? "TASK-1",
    goal: ctx.goal,
    success_criteria: ctx.expectedResult ? [ctx.expectedResult] : (prev?.success_criteria ?? []),
    work_units: prev?.work_units ?? [],
    totals: { units: 0, done: 0, tokens: 0, cost_usd: 0, wall_seconds: 0 },
    repo_path: base,
    attachments: prev?.attachments ?? [],
  });
  files["vibeflow/WORKFLOW_STATE.json"] = JSON.stringify(state, null, 2);
  const written: string[] = [];
  for (const [rel, content] of Object.entries(files)) {
    if (!opts.dry) writeFileSafe(join(base, rel), content);
    written.push(rel);
  }
  return { files: written, state };
}

/** Generate (and persist) the dispatch prompt for an engine using the saved goal. */
export function applyDispatch(
  engineName: string,
  base: string = cwd(),
): { file: string; prompt: string } | null {
  if (!(ENGINES as string[]).includes(engineName)) return null;
  const engine = engineName as Engine;
  const state = readState(base);
  const ctx: ProjectContext = { ...defaultContext(), goal: state?.goal ?? defaultContext().goal };
  const units = state ? state.work_units.map((u) => u.name) : [];
  const prompt = dispatchPrompt(engine, ctx, units);
  const rel = `vibeflow/dispatch/${engine}.md`;
  writeFileSafe(join(base, rel), prompt);
  return { file: rel, prompt };
}

const VALID_STATUS: WorkUnit["status"][] = ["pending", "running", "verifying", "done", "blocked"];

function normalizeUnit(input: Partial<WorkUnit> & { name: string }): WorkUnit {
  const g: Partial<WorkUnit["gates"]> = input.gates ?? {};
  const r: Partial<WorkUnit["resources"]> = input.resources ?? {};
  return {
    name: String(input.name),
    status: VALID_STATUS.includes(input.status as WorkUnit["status"])
      ? (input.status as WorkUnit["status"])
      : "pending",
    confidence: typeof input.confidence === "number" ? input.confidence : 0,
    owner_agent: input.owner_agent,
    skills_used: input.skills_used,
    scope: input.scope,
    gates: {
      build: g.build ?? "pending",
      lint: g.lint ?? "pending",
      test: g.test ?? "pending",
      review: g.review ?? "pending",
    },
    resources: {
      agents: r.agents ?? 0,
      tokens: r.tokens ?? 0,
      cost_usd: r.cost_usd ?? 0,
      wall_seconds: r.wall_seconds ?? 0,
    },
    evidence: input.evidence,
  };
}

/** Add, update, or delete a work unit in the workflow ledger at `base`. */
export function mutateUnits(
  base: string,
  action: "add" | "update" | "delete",
  unit: Partial<WorkUnit> & { name?: string },
): WorkflowState | null {
  const state = readState(base);
  if (!state) return null;
  const name = unit.name?.trim();
  if (!name) return null;
  const idx = state.work_units.findIndex((u) => u.name === name);
  if (action === "delete") {
    if (idx === -1) return null;
    state.work_units.splice(idx, 1);
  } else if (action === "add") {
    if (idx !== -1) return null; // name must be unique
    state.work_units.push(normalizeUnit({ ...unit, name }));
  } else {
    if (idx === -1) return null;
    state.work_units[idx] = normalizeUnit({ ...state.work_units[idx], ...unit, name });
  }
  recomputeTotals(state);
  writeState(base, state);
  return state;
}

export function init(flags: Record<string, string | boolean>): number {
  const engines = typeof flags.engine === "string" ? [flags.engine] : undefined;
  const dry = Boolean(flags["dry-run"]);
  const { files } = applyIntake({ engines }, { dry });
  for (const rel of files) {
    console.log(dry ? c.dim(`would write ${rel}`) : `${c.green("+")} ${rel}`);
  }
  if (!dry) console.log(c.bold(`\nGenerated ${files.length} files from canonical context.`));
  return 0;
}

/** Interactive `vf init --interactive` — asks the intake questions in the terminal. */
export async function initInteractive(_flags: Record<string, string | boolean>): Promise<number> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string, def = ""): Promise<string> =>
    new Promise((res) =>
      rl.question(`${q}${def ? ` [${def}]` : ""}: `, (a) => res(a.trim() || def)),
    );
  console.log(c.bold("VibeFlow — new workflow\n"));
  const goal = await ask("Goal / task");
  const engines = (await ask("Engines (comma)", ENGINES.join(","))).split(",");
  const docSource = await ask("Project docs source (path/URL)");
  const taskSource = await ask("Task / issue source");
  const fileTypes = (await ask("File types (comma)")).split(",");
  const expectedResult = await ask("Expected result (Definition of Done)");
  rl.close();
  const { files } = applyIntake({
    goal,
    engines,
    docSource,
    taskSource,
    fileTypes,
    expectedResult,
  });
  for (const rel of files) console.log(`${c.green("+")} ${rel}`);
  console.log(c.bold(`\nGenerated ${files.length} files from canonical context.`));
  return 0;
}

export function run(
  engineArg: string | undefined,
  flags: Record<string, string | boolean>,
): number {
  if (!engineArg || !(ENGINES as string[]).includes(engineArg)) {
    console.error(c.red(`Usage: vf run <${ENGINES.join("|")}>`));
    return 2;
  }
  const engine = engineArg as Engine;
  const ctx = defaultContext();
  const state = readState();
  const units = state ? state.work_units.map((u) => u.name) : [];
  const prompt = dispatchPrompt(engine, ctx, units);
  const dispatchFile = ctxPath("dispatch", `${engine}.md`);
  writeFileSafe(dispatchFile, prompt);
  console.log(`${c.green("+")} vibeflow/dispatch/${engine}.md`);

  const available =
    engine === "copilot" ? hasCommand("copilot") || hasCommand("gh") : hasCommand(engine);
  if (!available) {
    console.log(
      c.yellow(
        `\n${engine} CLI not found. Dispatch prompt written; install the engine then re-run.`,
      ),
    );
    return 0;
  }
  if (!flags.yes) {
    console.log(c.dim(`\nDry run. Re-run with --yes to launch ${engine}.`));
    return 0;
  }
  console.log(c.cyan(`\nLaunching ${engine}…`));
  const r = spawnSync(engine === "copilot" && !hasCommand("copilot") ? "gh" : engine, [], {
    stdio: "inherit",
  });
  return r.status ?? 0;
}

export function units(sub: string | undefined, rest: string[]): number {
  const state = readState();
  if (!state) {
    console.error(c.yellow("No vibeflow/WORKFLOW_STATE.json. Run `vf init` first."));
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
        const gs = (["build", "lint", "test", "review"] as const)
          .map((k) => `${k}:${gateColor(g[k])}`)
          .join(" ");
        console.log(`${c.bold(u.name)} ${c.dim(u.status)} conf ${u.confidence}\n  ${gs}`);
      }
      return 0;
    }
    case "show": {
      const name = rest[0];
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
      console.log(
        `units ${t.done}/${t.units} · ${t.tokens} tokens · $${t.cost_usd} · ${t.wall_seconds}s`,
      );
      return 0;
    }
    case "evidence": {
      const u = state.work_units.find((x) => x.name === rest[0]);
      if (!u) {
        console.error(c.red(`No such work unit: ${rest[0]}`));
        return 1;
      }
      for (const e of u.evidence ?? []) console.log(e);
      if (!u.evidence?.length) console.log(c.dim("(no recorded evidence)"));
      return 0;
    }
    default:
      console.error(c.red(`Unknown: vf units ${sub}`));
      return 2;
  }
}

function gateColor(s: string): string {
  if (s === "pass") return c.green(s);
  if (s === "fail") return c.red(s);
  if (s === "running") return c.yellow(s);
  return c.dim(s);
}

export function skills(sub: string | undefined): number {
  const idx = ctxPath("SKILL_INDEX.md");
  if (sub === undefined || sub === "list") {
    if (!existsSync(idx)) {
      console.error(c.yellow("No vibeflow/SKILL_INDEX.md. Run `vf init`."));
      return 1;
    }
    process.stdout.write(readFileSync(idx, "utf8"));
    return 0;
  }
  console.log(
    c.dim(`vf skills ${sub} — registry operations are configured via providers (see docs).`),
  );
  return 0;
}

export function hooks(sub: string | undefined): number {
  switch (sub) {
    case "install": {
      const r = spawnSync("git", ["config", "core.hooksPath", ".githooks"], { stdio: "inherit" });
      if (r.status === 0) console.log(c.green("Installed: core.hooksPath → .githooks"));
      return r.status ?? 0;
    }
    case undefined:
    case "status": {
      const r = spawnSync("git", ["config", "--get", "core.hooksPath"], { encoding: "utf8" });
      const path = r.stdout.trim();
      console.log(
        path
          ? `core.hooksPath = ${path}`
          : c.yellow("core.hooksPath not set — run `vf hooks install`"),
      );
      return 0;
    }
    default:
      console.error(c.red(`Unknown: vf hooks ${sub}`));
      return 2;
  }
}

export function verify(): number {
  const pkgPath = join(cwd(), "package.json");
  if (!existsSync(pkgPath)) {
    console.error(c.yellow("No package.json — nothing to verify here."));
    return 0;
  }
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, string> };
  const scripts = pkg.scripts ?? {};
  const runner = hasCommand("bun") ? "bun" : "npm";
  let failed = 0;
  for (const gate of ["typecheck", "lint", "test"]) {
    if (!scripts[gate]) continue;
    console.log(c.cyan(`▶ ${runner} run ${gate}`));
    const r = spawnSync(runner, ["run", gate], { stdio: "inherit" });
    if (r.status !== 0) {
      failed++;
      console.log(c.red(`✗ ${gate} failed`));
    } else {
      console.log(c.green(`✓ ${gate}`));
    }
  }
  if (failed > 0) {
    console.log(c.red(`\n${failed} gate(s) failed.`));
    return 1;
  }
  console.log(c.green("\nAll configured gates passed."));
  return 0;
}

export function printVersion(): number {
  console.log(VERSION);
  return 0;
}

export function printHelp(): number {
  console.log(`${c.bold("VibeFlow")} v${VERSION} — orchestrate Claude Code, Codex & Copilot CLI

${c.bold("Usage:")} vf [command] [options]

${c.bold("Commands:")}
  ${c.cyan("(none)")}            open the local web UI
  ${c.cyan("ui")}                open the local web UI
  ${c.cyan("doctor")}            check required and optional tools
  ${c.cyan("init")}             generate canonical context + engine files (--engine, --interactive, --dry-run)
  ${c.cyan("run <engine>")}      dispatch claude | codex | copilot (--yes to launch)
  ${c.cyan("units [sub]")}       status | show <name> | resources | evidence <name>
  ${c.cyan("skills [list]")}     list registered skills
  ${c.cyan("hooks [sub]")}       status | install
  ${c.cyan("verify")}            run typecheck / lint / test gates
  ${c.cyan("help, --version")}   show help / version
`);
  return 0;
}
