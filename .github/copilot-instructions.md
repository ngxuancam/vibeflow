# Copilot Instructions for @magicpro97/vibeflow

## What this repository is

This repo is **`@magicpro97/vibeflow`** — a local-first CLI (command `vf`) that opens a web UI and
orchestrates Claude Code, Codex CLI, and GitHub Copilot CLI through shared context,
Anthropic-style skills, hooks, and verification. It is a working **Bun + TypeScript** project
with **zero runtime dependencies** (Node stdlib only), so the published CLI runs anywhere
`node` does. The `docs/` folder holds the full specification this code implements; start with
`docs/MASTER_SPEC.md`.

## Build / test / lint

Bun is the dev toolchain; the shipped artifact is Node-compatible.

```bash
bun install          # installs dev tooling; prepare script sets core.hooksPath → .githooks
bun run dev          # run the CLI from source (src/cli.ts)
bun run typecheck    # tsc --noEmit (strict, moduleResolution bundler)
bun run lint         # biome check src test   (run `bunx biome check --write src test` to fix)
bun run test         # bun test (test/cli.test.ts)
bun test test/cli.test.ts -t "init"   # run a single test by name pattern
bun run build        # bun build → dist/cli.js (Node target, shebang banner)
bun run fix          # biome check --write src test (format + safe lint fixes)
bun run check        # typecheck + lint + test
```

The pre-commit hook (`.githooks/pre-commit`) runs `fix` (re-staging reformatted files), then
typecheck, lint, test, and build. CI (`.github/workflows/ci.yml`)
runs the same gates plus a built-CLI smoke test. Pushing a `v*` tag triggers
`release.yml`, which publishes to npm (needs the `NPM_TOKEN` secret).

## Architecture (the big picture)

Five small source files, each one concern — keep this lean shape:

- `src/core.ts` — shared types (`WorkUnit`, `WorkflowState`, `Engine`), paths (the canonical
  context dir is **`vibeflow/`**), ledger read/`recomputeTotals`, `hasCommand`, a tiny no-dep
  flag parser, and ANSI helpers. No deps beyond `node:*`.
- `src/adapters.ts` — **canonical-context → per-engine generation**. `canonicalFiles()` is the
  single source of truth (`vibeflow/*`); `engineFiles()` projects it into `CLAUDE.md` /
  `AGENTS.md` / `.github/copilot-instructions.md`. `aiGenerate(prompt, fallback)` shells out to
  `$VIBEFLOW_AI` when set, else uses the deterministic fallback — this is how "AI-generated,
  not static templates" stays usable offline. Adding an engine = extend `ENGINES` + the
  `engineFiles` switch.
- `src/commands.ts` — one exported function per command (`doctor`, `init`, `run`, `units`,
  `skills`, `hooks`, `verify`, help/version). Each returns a numeric exit code. The shared
  `applyIntake(answers, opts)` / `applyDispatch(engine, base)` helpers back both the CLI and the
  web endpoints; `init` is sync (CLI) and `initInteractive` handles `vf init --interactive`.
  `detectRepo(path)` reports which engines a repo already carries + which CLIs exist;
  `skillForFile(name)` maps an extension to a reader skill; `mutateUnits(base, action, unit)`
  is the add/update/delete primitive for the work-unit ledger; all take an optional `base` repo.
- `src/server.ts` — local web UI on `127.0.0.1` via `node:http`. `startServer(port)` returns
  `{ server, url }`. Read routes: `GET /` (intake wizard + dashboard HTML), `GET /state`
  (ledger JSON), `GET /events` (SSE), `GET /api/attachments`. Write routes (all guarded by a
  per-process CSRF token `x-vibeflow-token`, exact-match Host/Origin loopback allowlist, body
  caps): `POST /api/detect` (set active repo + engine detection), `POST /api/init`
  (`useAi:false`), `POST /api/dispatch`, `POST /api/units` (CRUD), and `POST`/`DELETE`
  `/api/upload` (binary attachments streamed to `<repo>/vibeflow/attachments/`, sanitized
  filenames, 50 MB cap). A module-level `activeRepo` (default cwd, set by `/api/detect`) scopes
  all writes. The page ships **no third-party JS** (inline taste-skill motion only) under a
  strict CSP `'self'`.
- `src/cli.ts` — the bin entry: parses argv, routes to a command, `ui`/default starts the
  server and opens the browser.

Data flow: the web intake wizard (or `vf init`) picks a target repo, optionally attaches
sample files (each mapped to a reader skill), and writes `vibeflow/*` (canonical) + engine
files + a seeded `vibeflow/WORKFLOW_STATE.json` ledger into that repo → the UI and `vf units`
read that ledger (work units are editable from the board: add/update/delete) → the web dispatch
control (or `vf run <engine>`) writes `vibeflow/dispatch/<engine>.md`.

## Conventions specific to this codebase

- **Imports use `.js` extensions** on relative paths (e.g. `from "./core.js"`) even though the
  files are `.ts` — required by `moduleResolution: bundler` + `verbatimModuleSyntax`. Bun
  bundles them; tsc typechecks them. Keep this.
- **No runtime dependencies.** Use `node:*` builtins only in `src/`. Dev-only deps
  (typescript, biome, @types/*) are fine. Don't add a runtime dep without strong reason — it
  undermines `npx` portability.
- **Commands return exit codes; `cli.ts` sets `process.exitCode`.** Don't call
  `process.exit()` inside command handlers.
- **The canonical context directory is `vibeflow/`** (renamed from the spec's original
  `ai-workflow/`). Use `ctxPath()`/`CTX_DIR`, never hardcode the name.
- **Minimal-footprint + AI-generated output** is a product principle (`docs/MASTER_SPEC.md`):
  generate the fewest files possible, on demand, composed from canonical context — never ship
  static template files as the source of generated output. `init` seeds only the ledger; work
  units under `vibeflow/workunits/*` are created on demand.
- **Security posture** (`docs/SECURITY_MODEL.md`): the server binds to `127.0.0.1` only — never
  expose it publicly; no silent installs; read-only by default.
- Formatting/lint is **Biome** (`biome.json`): double quotes, semicolons, 2-space indent, 100
  cols. Run `bunx biome check --write` rather than hand-formatting.

## The specification (docs/)

`docs/*` is the design this code implements; when changing behavior, keep the relevant spec in
sync. Policy vs mechanism is split: `docs/AGENT_ORCHESTRATION_POLICY.md` (policy) vs
`docs/WORK_UNIT_ORCHESTRATION.md` (file-backed work units, quality gates, resource ledger).
Several facts are intentionally repeated across specs and must stay in sync when changed:
skill/provider priority order; the canonical `vibeflow/*` set vs the generated per-engine set;
approval-required actions and protected paths; the hook decision vocabulary
`allow|warn|require_approval|block`; and the name/package/command **VibeFlow / @magicpro97/vibeflow /
vf**. `docs/GENERATED_FILES.md` is the authoritative map of emitted files.
