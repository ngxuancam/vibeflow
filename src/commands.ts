import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
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
  CTX_DIR,
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
import { lookupDocsHttp, searchSkillsHttp } from "./discovery/context7.js";
import {
  type AsyncSpawner,
  buildEnginePrompt,
  engineCommand,
  isUnavailable,
  persistDispatch,
  runDispatchAsync,
} from "./dispatch.js";
import { findScopeConflicts, policyGates } from "./gates.js";
import { downgradeBannerText, engineHookFiles } from "./hooks/adapters.js";
import { evaluateHook, parseHookInput, presentDecision } from "./hooks/runner.js";
import {
  type AsyncResearcher,
  type RiskClass,
  type UnitInvestigationOutcome,
  investigateUnit,
} from "./orchestrator/investigate.js";
import {
  DEFAULT_CONCURRENCY,
  type Reviewer,
  type UnitDispatcher,
  goalEval,
  orchestrateUnits,
} from "./orchestrator/run.js";
import { type EngineReadiness, anyReady, preflightAll, readyEngines } from "./preflight.js";
import { scanRepo, summarizeProfile } from "./scanner.js";
import {
  type ToolTier,
  type VibeSettings,
  priorityRank,
  readSettings,
  settingsPath,
  writeSettings,
} from "./settings.js";
import { discoverSkills, matchSkillsForTask, renderSkillIndex } from "./skills/registry.js";
import { renderSkillNeeds, resolveSkillNeeds, skillForFile } from "./skills/resolver.js";
import { TOOLS, type ToolName, resolveTools } from "./tools/index.js";
import type { JsonMcpEntry, StdioServer, TomlMcpEntry } from "./tools/index.js";

export { skillForFile };

/** Color a readiness level for the doctor table. */
function readinessMark(level: EngineReadiness["level"]): string {
  if (level === "ready") return c.green("✓");
  if (level === "no-binary") return c.dim("•");
  return c.yellow("!");
}

/**
 * Print per-engine readiness under the presence table. Without --probe this is a fast
 * presence/auth check; with --probe it runs the live round-trip. Informational only —
 * the hard gate lives in applyIntake/run, not here.
 */
function printReadiness(probe: boolean): void {
  const list = preflightAll(ENGINES, { probe });
  console.log(c.bold(`\nEngine readiness${probe ? " (live probe)" : " (presence/auth)"}:`));
  for (const r of list) {
    console.log(`  ${readinessMark(r.level)} ${r.engine}: ${c.dim(r.detail)}`);
  }
  if (!probe) console.log(c.dim("  (run `vf doctor --probe` for a live engine round-trip)"));
}

export function doctor(flags: Record<string, string | boolean> = {}): number {
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
  printReadiness(Boolean(flags.probe));
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

const SKILL_BY_EXT_REMOVED = true;
void SKILL_BY_EXT_REMOVED;

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

/** Injectable readiness check so the creation gate is testable without spawning engines. */
export type PreflightFn = (engines: Engine[]) => EngineReadiness[];

export interface ApplyIntakeOpts {
  dry?: boolean;
  useAi?: boolean;
  base?: string;
  /** Opt out of the hard creation gate (web `/api/init` and dry/offline paths). */
  skipPreflight?: boolean;
  /** Override the readiness check (tests inject a fake; default is a live probe). */
  preflight?: PreflightFn;
}

export interface ApplyIntakeResult {
  files: string[];
  state: WorkflowState;
  /** Per-engine readiness from the gate (present whenever the gate ran). */
  readiness?: EngineReadiness[];
  /** True when the gate refused creation because no engine was ready. */
  refused?: boolean;
}

/**
 * Resolve which engines to generate for. When the gate is active (not dry, not skipped) it
 * runs a live preflight and keeps only ready engines; refusing entirely if none are ready.
 * The default skip ties the offline/browser path (useAi:false) to "no gate" so a browser
 * request never blocks on a live probe — Wave C may also pass skipPreflight explicitly.
 */
function gateEngines(
  answers: IntakeAnswers,
  opts: ApplyIntakeOpts,
): { engines: Engine[]; readiness?: EngineReadiness[]; refused: boolean } {
  const chosen = chosenEngines(answers.engines);
  const skip = opts.skipPreflight ?? opts.useAi === false;
  if (skip || opts.dry) return { engines: chosen, refused: false };
  const probe = opts.preflight ?? ((e: Engine[]) => preflightAll(e, { probe: true }));
  const readiness = probe(chosen);
  if (!anyReady(readiness)) return { engines: [], readiness, refused: true };
  return { engines: readyEngines(readiness), readiness, refused: false };
}

/**
 * Shared workflow generator used by both `vf init` (CLI) and the web intake wizard.
 * `useAi` is false for web-initiated init so a browser request never shells out to
 * $VIBEFLOW_AI; the CLI keeps the AI bridge enabled. When a workflow already exists in
 * `base`, its work units and attachments are preserved so re-submitting acts as an edit.
 *
 * Hard creation gate: for a real CLI init (not dry, not skipped) we preflight the chosen
 * engines and refuse creation when none is ready, generating only for ready engines
 * otherwise. The gate is parameterized via {@link ApplyIntakeOpts} so callers opt out.
 */
export function applyIntake(answers: IntakeAnswers, opts: ApplyIntakeOpts = {}): ApplyIntakeResult {
  const base = opts.base ?? resolveRepo(answers.repoPath);
  const ctx = contextFrom(answers);
  ctx.settings = readSettings(base);
  // Enrich context with an evidence-based scan of the target repo (PROJECT_CONTEXT.md).
  try {
    const profile = scanRepo(base);
    ctx.stack = summarizeProfile(profile);
    if (profile.summary && ctx.summary === defaultContext().summary) ctx.summary = profile.summary;
  } catch {
    /* scanning is best-effort; never block init */
  }
  const gate = gateEngines(answers, opts);
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
  if (gate.refused) return { files: [], state, readiness: gate.readiness, refused: true };

  const useAi = opts.useAi !== false;
  const files: Record<string, string> = { ...canonicalFiles(ctx) };
  for (const engine of gate.engines) {
    Object.assign(files, engineFiles(engine, ctx, useAi));
  }
  files[`${CTX_DIR}/WORKFLOW_STATE.json`] = JSON.stringify(state, null, 2);
  const written: string[] = [];
  for (const [rel, content] of Object.entries(files)) {
    if (!opts.dry) writeFileSafe(join(base, rel), content);
    written.push(rel);
  }
  // Keep MCP config in lockstep with the instructions: if any optional tool is enabled,
  // (re)write the engine MCP registrations so the injected "prefer codegraph > LSP" block
  // references servers that are actually registered. Skipped on dry runs.
  if (!opts.dry && (ctx.settings?.tools.codegraph || ctx.settings?.tools.lsp)) {
    writeToolConfigs(base, ctx.settings);
  }
  return { files: written, state, readiness: gate.readiness, refused: false };
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
  const rel = `${CTX_DIR}/dispatch/${engine}.md`;
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

/** Resolve the dispatch mode: --yes → real CLI, --dry → preview, else bridge or dry. */
function resolveMode(flags: Record<string, string | boolean>): "cli" | "bridge" | "dry" {
  if (flags.yes) return "cli";
  if (flags.dry) return "dry";
  return process.env.VIBEFLOW_AI ? "bridge" : "dry";
}

function resolveEngine(flags: Record<string, string | boolean>): Engine {
  return typeof flags.engine === "string" && (ENGINES as string[]).includes(flags.engine)
    ? (flags.engine as Engine)
    : "claude";
}

function resolveRisk(flags: Record<string, string | boolean>): RiskClass {
  const valid: RiskClass[] = [
    "docs",
    "simple-code",
    "feature",
    "architecture",
    "security",
    "deploy",
  ];
  return typeof flags.risk === "string" && (valid as string[]).includes(flags.risk)
    ? (flags.risk as RiskClass)
    : "feature";
}

/**
 * Before launching a non-native engine, warn the user their guardrails are detection-only and
 * resolve the engine command. Returns `skip:true` when the engine CLI is genuinely unavailable
 * (so we never spawn a bogus command). Pure-stdout for "dry"/"bridge" (nothing to launch).
 */
function announceLaunch(engine: Engine, mode: "cli" | "bridge" | "dry"): { skip: boolean } {
  if (mode !== "cli") return { skip: false };
  const banner = downgradeBannerText(engine);
  if (banner) console.log(c.yellow(banner));
  const invocation = engineCommand(engine);
  if (isUnavailable(invocation)) {
    console.log(c.yellow(`\n${engine} unavailable: ${invocation.unavailable}`));
    return { skip: true };
  }
  if (invocation.warning) console.log(c.yellow(`! ${engine}: ${invocation.warning}`));
  return { skip: false };
}

/** A synthetic "ready" readiness used when a caller injects its own dispatch spawner. */
function readyStub(engine: Engine): EngineReadiness {
  return { engine, level: "ready", detail: "ready (injected)", checkedAt: "" };
}

/**
 * The stronger pre-dispatch gate: a live preflight probe of the single chosen engine. Returns
 * true only when the engine is fully ready; otherwise prints the actionable detail and returns
 * false so the caller can refuse to dispatch. Dry/bridge modes skip the probe (nothing launches).
 * Injectable via `preflight` so tests never spawn a real engine.
 */
function engineReady(
  engine: Engine,
  mode: "cli" | "bridge" | "dry",
  preflight?: PreflightFn,
): boolean {
  if (mode !== "cli") return true;
  const probe = preflight ?? ((e: Engine[]) => preflightAll(e, { probe: true }));
  const [readiness] = probe([engine]);
  if (readiness?.level === "ready") return true;
  const detail = readiness?.detail ?? "engine not ready";
  console.log(c.red(`\n${engine} not ready: ${detail}`));
  return false;
}

/**
 * A read-only research step backed by the real dispatcher: each round dispatches a research
 * prompt (never writes) and reports the engine's self-assessed confidence. Used by
 * {@link investigateUnit} to raise confidence on a unit below the bar before we block it.
 */
function makeResearcher(
  engine: Engine,
  ctx: ProjectContext,
  mode: "cli" | "bridge" | "dry",
  spawner?: AsyncSpawner,
): AsyncResearcher {
  return async (round, question) => {
    const prompt = buildEnginePrompt(engine, { ...ctx, goal: question }, [
      `research round ${round}`,
    ]);
    const result = await runDispatchAsync({ engine, prompt, mode, spawner });
    const confidence = result.summary?.confidence ?? 0;
    const findings = result.summary?.uncertainty
      ? [result.summary.uncertainty]
      : result.ok
        ? [`round ${round}: research dispatched`]
        : [];
    return { findings, confidence, blocked: !result.ok };
  };
}

/** Persist an investigation outcome as auditable evidence inside the unit's evidence/ folder. */
function persistInvestigation(unitDir: string, outcome: UnitInvestigationOutcome): string {
  const rel = "evidence/investigation.json";
  writeFileSafe(
    join(unitDir, rel),
    JSON.stringify(
      {
        proceed: outcome.proceed,
        finalConfidence: outcome.finalConfidence,
        threshold: outcome.threshold,
        stoppedBy: outcome.stoppedBy,
        recommendation: outcome.recommendation,
        rounds: outcome.rounds,
      },
      null,
      2,
    ),
  );
  return rel;
}

/**
 * Build the per-unit dispatcher: write the unit's CONTEXT.md, dispatch the prompt (async so
 * the bounded pool truly overlaps), persist the result as evidence, and — for real runs whose
 * reported confidence is below 1.0 — run a bounded investigation, recording its rounds +
 * recommendation as evidence rather than emitting a dead "investigate/debate" string.
 */
function makeDispatcher(
  engine: Engine,
  ctx: ProjectContext,
  base: string,
  mode: "cli" | "bridge" | "dry",
  riskClass: RiskClass,
  spawner?: AsyncSpawner,
): UnitDispatcher {
  return async (u) => {
    const prompt = buildEnginePrompt(engine, ctx, [u.name]);
    const unitRel = `${CTX_DIR}/workunits/${u.name}`;
    const unitDir = join(base, unitRel);
    writeFileSafe(join(unitDir, "CONTEXT.md"), prompt);
    const result = await runDispatchAsync({ engine, prompt, mode, spawner });
    const evidence = [`${unitRel}/${persistDispatch(unitDir, result)}`];
    let confidence = result.summary?.confidence ?? 0;
    const status: WorkUnit["status"] =
      mode === "dry" ? "verifying" : result.ok ? "verifying" : "blocked";

    // confidence<1 on a real run → investigate before blocking (never silently close).
    if (mode !== "dry" && confidence < 1) {
      const research = makeResearcher(engine, ctx, mode, spawner);
      const outcome = await investigateUnit(
        { name: u.name, confidence, owner_agent: u.owner_agent },
        { riskClass, research },
      );
      evidence.push(`${unitRel}/${persistInvestigation(unitDir, outcome)}`);
      confidence = Math.max(confidence, outcome.finalConfidence);
    }

    return {
      status,
      confidence,
      evidence,
      gates: { build: "pending", lint: "pending", test: "pending", review: "pending" },
    };
  };
}

/**
 * Independent reviewer. A dry run is a PREVIEW, not a verdict — it passes review neutrally so
 * the goal lands `partial` (exit 0), not `blocked`. A real run only passes at confidence 1.0
 * with evidence; anything less blocks (no completion on a guess).
 */
function makeReviewer(mode: "cli" | "bridge" | "dry"): Reviewer {
  return (_u, outcome) => {
    if (mode === "dry") {
      return { pass: true, reason: "dry preview — not evaluated (re-run with --yes)" };
    }
    if (outcome.confidence < 1) {
      return {
        pass: false,
        reason: `confidence ${outcome.confidence} < 1 — investigated, still blocked`,
      };
    }
    if (!outcome.evidence.length) return { pass: false, reason: "no recorded evidence" };
    return { pass: true, reason: "confidence 1.0 with evidence" };
  };
}

/**
 * Orchestrate the saved workflow: dispatch every work unit in parallel (bounded), run an
 * independent reviewer, record evidence, then evaluate the overarching goal. Mode is
 * `cli` (--yes, real engine), `bridge` ($VIBEFLOW_AI), or `dry` (prompts only, default).
 * Overlapping work-unit scopes are NOT dispatched concurrently — parallel dispatch is refused
 * (serialized) so independent lanes never clobber each other's files.
 */
export async function orchestrate(
  flags: Record<string, string | boolean>,
  base: string = cwd(),
  inject: { spawner?: AsyncSpawner; preflight?: PreflightFn } = {},
): Promise<number> {
  const state = readState(base);
  if (!state) {
    console.error(c.yellow("No workflow. Run `vf init` first."));
    return 1;
  }
  const engine = resolveEngine(flags);
  const mode = resolveMode(flags);
  const riskClass = resolveRisk(flags);
  const ctx: ProjectContext = { ...defaultContext(), goal: state.goal };

  // Run the whole task as one unit when none were planned (minimal-footprint principle).
  const units: WorkUnit[] =
    state.work_units.length > 0
      ? state.work_units
      : [normalizeUnit({ name: "task", status: "pending", confidence: 0 })];

  const launch = announceLaunch(engine, mode);
  if (launch.skip) return 1;
  // Stronger gate: a real (cli) dispatch requires a live-ready engine. When the caller injects
  // its own dispatch spawner (tests/headless), that spawner IS the engine round-trip, so we
  // trust it rather than probing the real binary — unless an explicit preflight is supplied.
  const preflight = inject.preflight ?? (inject.spawner ? () => [readyStub(engine)] : undefined);
  if (!engineReady(engine, mode, preflight)) return 1;

  // Scope-conflict gate: refuse to dispatch overlapping scopes in parallel — serialize them.
  const conflicts = findScopeConflicts(units);
  const requested =
    typeof flags.concurrency === "string" ? Number(flags.concurrency) : DEFAULT_CONCURRENCY;
  let concurrency = Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_CONCURRENCY;
  if (conflicts.length) {
    concurrency = 1;
    console.log(
      c.yellow(
        `! ${conflicts.length} overlapping scope(s) — serializing dispatch (parallel refused):`,
      ),
    );
    for (const [a, b] of conflicts) console.log(c.dim(`  - ${a} ⨯ ${b}`));
  }

  console.log(
    c.cyan(
      `Orchestrating ${units.length} unit(s) → ${engine} (${mode}, concurrency ${concurrency})`,
    ),
  );

  const { units: ran, reviews } = await orchestrateUnits({
    units,
    concurrency,
    dispatcher: makeDispatcher(engine, ctx, base, mode, riskClass, inject.spawner),
    reviewer: makeReviewer(mode),
  });

  state.work_units = ran;
  recomputeTotals(state);
  writeState(base, state);

  for (const r of reviews) {
    console.log(`${r.pass ? c.green("✓") : c.yellow("•")} review ${r.unit}: ${r.reason}`);
  }
  const verdict = goalEval(state);
  const color =
    verdict.verdict === "met" ? c.green : verdict.verdict === "blocked" ? c.red : c.yellow;
  console.log(color(`\ngoal: ${verdict.verdict}`));
  for (const reason of verdict.reasons) console.log(c.dim(`  - ${reason}`));
  if (mode === "dry") {
    console.log(
      c.dim(
        `\nDry run: prompts written under ${CTX_DIR}/workunits/*. Re-run with --yes to launch the engine.`,
      ),
    );
  }
  return verdict.verdict === "blocked" ? 1 : 0;
}

/** Print per-engine readiness hints, then a clear refusal line. Returns the nonzero exit code. */
function reportPreflightRefusal(readiness: EngineReadiness[] | undefined): number {
  console.error(c.red("\nNo engine is ready — refusing to generate engine files."));
  for (const r of readiness ?? []) {
    console.error(`  ${c.yellow("!")} ${r.engine}: ${c.dim(r.detail)}`);
  }
  console.error(c.dim("Fix an engine above (or use `--dry-run` for an offline preview)."));
  return 1;
}

export function init(
  flags: Record<string, string | boolean>,
  inject: { preflight?: PreflightFn } = {},
): number {
  const engines = typeof flags.engine === "string" ? [flags.engine] : undefined;
  const dry = Boolean(flags["dry-run"]);
  const result = applyIntake({ engines }, { dry, skipPreflight: dry, preflight: inject.preflight });
  if (result.refused) return reportPreflightRefusal(result.readiness);
  const dropped = (result.readiness ?? []).filter((r) => r.level !== "ready");
  for (const r of dropped) {
    console.log(c.yellow(`• skipped ${r.engine}: ${c.dim(r.detail)}`));
  }
  for (const rel of result.files) {
    console.log(dry ? c.dim(`would write ${rel}`) : `${c.green("+")} ${rel}`);
  }
  if (!dry) console.log(c.bold(`\nGenerated ${result.files.length} files from canonical context.`));
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
  const result = applyIntake({
    goal,
    engines,
    docSource,
    taskSource,
    fileTypes,
    expectedResult,
  });
  if (result.refused) return reportPreflightRefusal(result.readiness);
  for (const rel of result.files) console.log(`${c.green("+")} ${rel}`);
  console.log(c.bold(`\nGenerated ${result.files.length} files from canonical context.`));
  return 0;
}

export function run(
  engineArg: string | undefined,
  flags: Record<string, string | boolean>,
  inject: { preflight?: PreflightFn } = {},
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
  console.log(`${c.green("+")} ${CTX_DIR}/dispatch/${engine}.md`);

  const invocation = engineCommand(engine);
  if (isUnavailable(invocation)) {
    console.log(
      c.yellow(`\n${invocation.unavailable}. Dispatch prompt written; install then re-run.`),
    );
    return 0;
  }
  if (invocation.warning) console.log(c.yellow(`! ${engine}: ${invocation.warning}`));
  if (!flags.yes) {
    console.log(c.dim(`\nDry run. Re-run with --yes to launch ${engine}.`));
    return 0;
  }
  // Stronger gate: confirm a live-ready engine before a real launch (never dispatch a dud).
  if (!engineReady(engine, "cli", inject.preflight)) return 1;
  // Detection + downgrade banner: warn before launching an engine without native blocking.
  const banner = downgradeBannerText(engine);
  if (banner) console.log(c.yellow(banner));
  console.log(c.cyan(`\nLaunching ${engine}…`));
  const r = spawnSync(invocation.cmd, invocation.args, { stdio: "inherit" });
  return r.status ?? 0;
}

export function units(sub: string | undefined, rest: string[]): number {
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

export function skills(sub: string | undefined, rest: string[] = []): number {
  const repo = cwd();
  const found = discoverSkills(repo);
  if (sub === undefined || sub === "list") {
    if (!found.length) {
      console.log(
        c.dim(`No skills discovered under ${CTX_DIR}/skills, .kiro/skills, or .claude/skills.`),
      );
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
    // Demand-driven: derive skill NEEDS from the repo scan + saved intake, then report
    // which are satisfied locally and which must be acquired on demand (never pre-installed).
    const state = readState(repo);
    const profile = scanRepo(repo);
    const attachments = (state?.attachments ?? []).map((a) => a.name);
    const needs = resolveSkillNeeds({
      repo,
      attachments,
      task: state?.goal,
      profile,
    });
    process.stdout.write(renderSkillNeeds(needs));
    return 0;
  }
  console.log(
    c.dim(`vf skills ${sub} — registry operations are configured via providers (see docs).`),
  );
  return 0;
}

/**
 * External docs/skill discovery via Context7 — network only with explicit approval.
 * Rides the stdlib `fetch` HTTP path (zero-install); `inject.fetchFn` is a test-only seam so
 * suites never hit the wire. Discovery results are experimental at most and skill names are
 * sanitized to a path-safe slug before they are surfaced.
 */
export async function discover(
  sub: string | undefined,
  rest: string[],
  flags: Record<string, string | boolean>,
  inject: { fetchFn?: typeof fetch } = {},
): Promise<number> {
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
  const outcome =
    sub === "docs" ? await lookupDocsHttp(query, opts) : await searchSkillsHttp(query, opts);
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
  if (!outcome.results.length) console.log(c.dim("(no results)"));
  return 0;
}

/** Hook entry: read a JSON event from stdin, score risk, print a decision, set exit code. */
export async function hook(): Promise<number> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const input = parseHookInput(Buffer.concat(chunks).toString("utf8"));
  if (!input) {
    console.error(c.red("invalid hook input"));
    return 2;
  }
  const result = evaluateHook(input);
  // presentDecision emits the structured Claude "ask" envelope for PreToolUse approvals while
  // keeping the exit-code veto (2) correct for block / require_approval on every engine.
  const { json, exitCode } = presentDecision(result, input);
  console.log(json);
  return exitCode;
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
    case "emit": {
      // Write per-engine hook configs into the active repo, all delegating to `vf hook`.
      for (const [rel, content] of Object.entries(engineHookFiles())) {
        writeFileSafe(join(cwd(), rel), content);
        console.log(`${c.green("+")} ${rel}`);
      }
      return 0;
    }
    default:
      console.error(c.red(`Unknown: vf hooks ${sub}`));
      return 2;
  }
}

export function verify(): number {
  const runner = hasCommand("bun") ? "bun" : "npm";
  let failed = 0;

  // Toolchain gates (typecheck / lint / test) when a package.json declares them.
  const pkgPath = join(cwd(), "package.json");
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, string> };
    const scripts = pkg.scripts ?? {};
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
  } else {
    console.log(c.dim("No package.json — skipping toolchain gates."));
  }

  // Policy gates (confidence / evidence / scope) over the workflow ledger.
  const report = policyGates(readState());
  for (const ok of report.passed) console.log(c.green(`✓ ${ok}`));
  for (const f of report.failures) {
    failed++;
    console.log(c.red(`✗ ${f}`));
  }

  if (failed > 0) {
    console.log(c.red(`\n${failed} gate(s) failed.`));
    return 1;
  }
  console.log(c.green("\nAll configured gates passed."));
  return 0;
}

/** Spawn seam for tool installs — defaults to a real spawnSync, injectable for tests. */
export type StepSpawner = (cmd: string, args: string[]) => { status: number };
const VALID_TOOLS: ToolName[] = ["codegraph", "lsp"];

function isToolName(v: string | undefined): v is ToolName {
  return v === "codegraph" || v === "lsp";
}

/** Languages detected in the active repo, used to build LSP install plans + entries. */
function repoLanguages(base: string): string[] {
  try {
    return scanRepo(base).languages;
  } catch {
    return [];
  }
}

/** Render the priority ladder (highest first) from settings for `vf tools status`. */
function renderPriority(settings: VibeSettings): string {
  const rank = priorityRank(settings);
  const tiers: ToolTier[] = ["codegraph", "lsp", "native"];
  return [...tiers].sort((a, b) => rank[b] - rank[a]).join(" > ");
}

/** `vf tools status` — show enabled/installed/priority for each optional tool. */
function toolsStatus(base: string): number {
  const settings = readSettings(base);
  const languages = repoLanguages(base);
  console.log(c.bold("Optional developer tools\n"));
  for (const name of VALID_TOOLS) {
    const tool = TOOLS[name];
    const enabled = settings.tools[name];
    const installed = tool.detect();
    const en = enabled ? c.green("enabled") : c.dim("disabled");
    const inst = installed ? c.green("installed") : c.yellow("not installed");
    console.log(`  ${c.bold(tool.title)} [${en}, ${inst}]`);
    console.log(`    ${c.dim(tool.description)}`);
  }
  console.log(`\n  priority: ${c.cyan(renderPriority(settings))}`);
  if (languages.length) console.log(`  detected languages: ${c.dim(languages.join(", "))}`);
  console.log(c.dim("\n  Re-run `vf init` after changing tools to regenerate instructions."));
  return 0;
}

/** Repo-relative MCP config files VibeFlow owns and may safely read+rewrite. */
const CLAUDE_MCP_FILE = ".mcp.json";
const CODEX_MCP_FILE = join(".codex", "config.toml");

/** Claude `.mcp.json` shape (only the slice we touch). */
interface ClaudeMcpFile {
  mcpServers: Record<string, StdioServer>;
}

/** Every MCP server name VibeFlow manages, across BOTH tools — the keys we may remove. */
function managedClaudeServerNames(base: string, languages: string[]): string[] {
  const ctx = { workspace: base, languages };
  const all = resolveTools({ codegraph: true, lsp: true }, "claude", ctx);
  const names: string[] = [];
  for (const entry of all.entries) {
    for (const name of Object.keys((entry as JsonMcpEntry).servers)) names.push(name);
  }
  return names;
}

/** Read the repo-owned `.mcp.json` (safe: no secrets). `corrupt` is set when an existing file
 * cannot be parsed, so callers can refuse to overwrite it and avoid losing unrelated servers. */
function readClaudeMcp(path: string): ClaudeMcpFile & { corrupt: boolean } {
  if (!existsSync(path)) return { mcpServers: {}, corrupt: false };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<ClaudeMcpFile>;
    return { mcpServers: parsed.mcpServers ?? {}, corrupt: false };
  } catch {
    return { mcpServers: {}, corrupt: true };
  }
}

/**
 * Merge enabled-tool servers into the repo's `.mcp.json` (claude). Managed keys are first
 * stripped (so disabling removes them), then re-added for currently-enabled tools. Unrelated
 * servers are preserved. Returns true when the file changed.
 */
function writeClaudeMcp(base: string, settings: VibeSettings, languages: string[]): boolean {
  const path = join(base, CLAUDE_MCP_FILE);
  const file = readClaudeMcp(path);
  if (file.corrupt) {
    console.log(
      c.yellow(`! ${CLAUDE_MCP_FILE} is not valid JSON — left untouched. Fix it, then re-run.`),
    );
    return false;
  }
  for (const name of managedClaudeServerNames(base, languages)) delete file.mcpServers[name];
  const ctx = { workspace: base, languages };
  const merged = resolveTools(settings.tools, "claude", ctx);
  for (const entry of merged.entries) {
    Object.assign(file.mcpServers, (entry as JsonMcpEntry).servers);
  }
  const hasServers = Object.keys(file.mcpServers).length > 0;
  if (!hasServers && !existsSync(path)) return false;
  writeFileSafe(path, JSON.stringify({ mcpServers: file.mcpServers }, null, 2));
  return true;
}

/** Serialize one codex `[mcp_servers.x]` section (minimal, only the shapes we emit). */
function tomlSection(entry: TomlMcpEntry): string {
  const lines = [`[${entry.section}]`, `command = ${JSON.stringify(entry.command)}`];
  lines.push(`args = ${JSON.stringify(entry.args)}`);
  if (entry.disabledTools && entry.disabledTools.length > 0) {
    lines.push(`disabled_tools = ${JSON.stringify(entry.disabledTools)}`);
  }
  return lines.join("\n");
}

/**
 * Apply structural gating on codex: when codegraph is enabled, disable the lower-priority
 * LSP servers' tools so the priority is structural, not just advisory in the instructions.
 */
function gateCodexEntries(entries: TomlMcpEntry[], settings: VibeSettings): TomlMcpEntry[] {
  if (!settings.tools.codegraph) return entries;
  return entries.map((entry) =>
    entry.section.startsWith("mcp_servers.lsp-") ? { ...entry, disabledTools: entry.tools } : entry,
  );
}

/**
 * Write a repo-local `.codex/config.toml` for the enabled tools. We DO NOT merge the user's
 * `~/.codex/config.toml`: a zero-dep TOML round-trip of an arbitrary user file risks
 * corruption, so VibeFlow owns this scoped file instead. Returns true when written.
 */
function writeCodexMcp(base: string, settings: VibeSettings, languages: string[]): boolean {
  const ctx = { workspace: base, languages };
  const merged = resolveTools(settings.tools, "codex", ctx);
  const entries = gateCodexEntries(merged.entries as TomlMcpEntry[], settings);
  const path = join(base, CODEX_MCP_FILE);
  if (entries.length === 0) {
    if (existsSync(path)) rmSync(path);
    return false;
  }
  const header =
    "# Managed by VibeFlow (`vf tools`). Repo-local codex MCP config — merge into\n" +
    "# ~/.codex/config.toml or point codex at it. Edit `vf tools enable/disable` to regenerate.";
  writeFileSafe(path, `${header}\n\n${entries.map(tomlSection).join("\n\n")}`);
  return true;
}

/**
 * Copilot's MCP config (`~/.copilot/mcp-config.json`) holds a live secret, so VibeFlow NEVER
 * reads or writes it. Instead we PRINT the exact `copilot mcp add` command per enabled server
 * for the user to run themselves. Returns the printed command count.
 */
function printCopilotMcp(base: string, settings: VibeSettings, languages: string[]): number {
  const ctx = { workspace: base, languages };
  const merged = resolveTools(settings.tools, "copilot", ctx);
  if (merged.entries.length === 0) return 0;
  console.log(c.bold("\nCopilot (run these — VibeFlow won't touch your secret ~/.copilot):"));
  let count = 0;
  for (const entry of merged.entries) {
    for (const [name, server] of Object.entries((entry as JsonMcpEntry).servers)) {
      const args = server.args.map((a) => JSON.stringify(a)).join(" ");
      console.log(c.cyan(`  copilot mcp add ${name} -- ${server.command} ${args}`.trim()));
      count++;
    }
  }
  return count;
}

/**
 * Wire enabled tools into every engine's MCP config: merge claude's `.mcp.json`, write the
 * repo-local codex `config.toml` (with structural gating), and print copilot's add commands.
 * Pure tool modules build the entries; the WRITING lives here. Languages drive LSP entries.
 */
function writeToolConfigs(base: string, settings: VibeSettings): void {
  const languages = repoLanguages(base);
  writeClaudeMcp(base, settings, languages);
  writeCodexMcp(base, settings, languages);
  printCopilotMcp(base, settings, languages);
}

/** `vf tools enable|disable <tool>` — flip the flag in SETTINGS.json and report. */
function toolsToggle(base: string, name: ToolName, on: boolean): number {
  const settings = writeSettings(base, { tools: { ...readSettings(base).tools, [name]: on } });
  const word = on ? c.green("enabled") : c.yellow("disabled");
  console.log(`${word} ${c.bold(TOOLS[name].title)} in ${settingsPath(base)}`);
  writeToolConfigs(base, settings);
  console.log(`  wrote MCP config to ${join(base, CLAUDE_MCP_FILE)}`);
  console.log(
    c.dim(
      settings.tools[name] === on ? "Re-run `vf init` to regenerate instructions." : "no change",
    ),
  );
  return 0;
}

/** `vf tools install <tool>` — print the plan; only execute steps when `--yes` is passed. */
function toolsInstall(
  base: string,
  name: ToolName,
  approved: boolean,
  spawner: StepSpawner,
): number {
  const ctx = { workspace: base, languages: repoLanguages(base) };
  const plan = TOOLS[name].installPlan(ctx);
  console.log(c.bold(`Install plan for ${TOOLS[name].title}:`));
  for (const step of plan.steps) {
    console.log(
      `  ${c.cyan(`${step.cmd} ${step.args.join(" ")}`)}\n    ${c.dim(step.description)}`,
    );
  }
  if (!approved) {
    console.log(c.yellow("\nNo changes made. Re-run with --yes to execute the plan."));
    return 0;
  }
  for (const step of plan.steps) {
    console.log(c.cyan(`\n▶ ${step.cmd} ${step.args.join(" ")}`));
    const { status } = spawner(step.cmd, step.args);
    if (status !== 0) {
      console.error(c.red(`✗ step failed (${status}). Stopping.`));
      return 1;
    }
  }
  console.log(
    c.green(`\nInstalled ${TOOLS[name].title}. Run \`vf tools enable ${name}\` to wire it.`),
  );
  return 0;
}

/**
 * `vf tools` — manage the optional code-navigation tools (codegraph, lsp). Subcommands:
 * status (default), enable/disable <tool>, install <tool> (--yes to execute). The install
 * path mirrors the discovery/hooks approval gate: print-only without --yes, never auto-run.
 */
export function tools(
  sub: string | undefined,
  rest: string[],
  flags: Record<string, string | boolean>,
  inject: { spawner?: StepSpawner; base?: string } = {},
): number {
  const base = inject.base ?? cwd();
  if (sub === undefined || sub === "status") return toolsStatus(base);
  const name = rest[0];
  if ((sub === "enable" || sub === "disable" || sub === "install") && !isToolName(name)) {
    console.error(c.red(`Usage: vf tools ${sub} <${VALID_TOOLS.join("|")}>`));
    return 2;
  }
  if (sub === "enable") return toolsToggle(base, name as ToolName, true);
  if (sub === "disable") return toolsToggle(base, name as ToolName, false);
  if (sub === "install") {
    const spawner: StepSpawner =
      inject.spawner ??
      ((cmd, args) => ({ status: spawnSync(cmd, args, { stdio: "inherit" }).status ?? 0 }));
    return toolsInstall(base, name as ToolName, Boolean(flags.yes), spawner);
  }
  console.error(c.red(`Unknown: vf tools ${sub}`));
  return 2;
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
  ${c.cyan("doctor")}            check required and optional tools (--probe for live engine readiness)
  ${c.cyan("init")}             generate canonical context + engine files (--engine, --interactive, --dry-run)
  ${c.cyan("run <engine>")}      dispatch claude | codex | copilot (--yes to launch)
  ${c.cyan("orchestrate")}       plan + dispatch work units in parallel, review, goal-eval (--engine, --yes, --concurrency)
  ${c.cyan("units [sub]")}       status | show <name> | resources | evidence <name>
  ${c.cyan("skills [sub]")}      list | search <term> | resolve (demand-driven needs)
  ${c.cyan("tools [sub]")}       status | enable <tool> | disable <tool> | install <tool> (--yes)
  ${c.cyan("discover <kind>")}   docs|skills <query> via Context7 (--yes approves network)
  ${c.cyan("hook")}              evaluate a JSON hook event from stdin (allow/warn/require_approval/block)
  ${c.cyan("hooks [sub]")}       status | install | emit (write engine hook configs)
  ${c.cyan("verify")}            typecheck / lint / test + confidence / evidence / scope gates
  ${c.cyan("help, --version")}   show help / version
`);
  return 0;
}
