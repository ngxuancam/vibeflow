<!-- vibeflow:start -->
# Copilot Instructions — VibeFlow (Self-Hosted)

Project: `@magicpro97/vibeflow` (v0.3.9)
This repo IS VibeFlow itself — a local-first npm CLI orchestrator for Claude Code, Codex CLI, and GitHub Copilot CLI.

## Build / Test / Lint

- Install: `bun install`
- Typecheck: `tsc --noEmit` (TypeScript 5.7, strict mode, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`)
- Lint: `biome check src test` (Biome 1.9.4: double quotes, semicolons required, 2-space indent, lineWidth=100)
- Test: `bun test` (uses `bun:test` — NOT vitest or jest)
- Build: `bun run build` → Bun esbuild to `dist/cli.js` + copies `server.html` + `assets/`
- Full gate: `bun run check` (typecheck + lint + test sequential)
- E2E: `bun run test:e2e` (Playwright 1.60, Chromium, port 5317, throwaway `.e2e-workspace/`)

## Architecture

4-layer pipeline:
```
CLI entry (src/cli.ts) → Web UI (src/server.ts) → Orchestrator Core → Tool Adapters (src/adapters.ts)
```

Key modules:
- `src/core.ts` — Canonical types: `Engine`, `WorkUnit`, `WorkflowState`, `Skill`, `CTX_DIR=".vibeflow"`
- `src/adapters.ts` — Generates per-engine instruction files from canonical context
- `src/dispatch.ts` — Real engine dispatch: spawns AI CLIs, captures `EngineSummary`
- `src/orchestrator/` — Agent lifecycle: `plan.ts` → `debate.ts` → `investigate.ts` → `agent.ts`
- `src/hooks/` — Guardrail system: `risk.ts` (scoring), `runner.ts` (evaluation), `adapters.ts` (engine configs)
- `src/skills/` — Skill registry + resolver + maintainer (SKILL.md frontmatter parsing)
- `src/settings.ts` — `.vibeflow/SETTINGS.json` defaults: tools OFF, timeout=600s
- `src/gates.ts` — Policy gates: confidence≥1.0, evidence, scope-no-overlap
- `src/journal.ts` — Append-only `.vibeflow/knowledge/log.md` journal
- `src/discovery/context7.ts` — Zero-install Context7 HTTP client (native `fetch`)
- `src/workflow/lifecycle.ts` — Delete plan, merge, scope conflict detection

## Code Conventions

- **ESM**: `"type": "module"` — all imports use `node:` prefix for stdlib
- **Strict TS**: `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`
- **Injection seams**: Preflight, spawn, file I/O are injectable params for testability
- **Tests**: `bun:test` (`describe`, `expect`, `test`), isolated tmpdir repos, injectable stub functions
- **Format**: double quotes, semicolons, 2-space indent (Biome 1.9.4)
- **No runtime deps**: Zero npm dependencies at runtime — stdlib + Bun only

## Tech Stack

| Tool | Version |
|------|---------|
| Runtime | Node.js ≥18 |
| Package manager | Bun (latest) |
| TypeScript | 5.7 |
| Lint/Format | Biome 1.9.4 |
| Unit test | `bun:test` (built-in) |
| E2E test | Playwright 1.60 |
| CI | GitHub Actions (ubuntu-latest) |

## Gotchas

- **`.vibeflow/` is canonical, `.viteflow/` is legacy** — prefer `.vibeflow/`
- **Build copies UI**: `dist/server.html` + `dist/assets/` needed for web UI
- **`bun test`, not vitest**: `import { describe, expect, test } from "bun:test"`
- **Smoke test**: `scripts/smoke.mjs` spawns real AI CLIs — needs engines installed
- **Settings defaults OFF**: `codegraph:false, lsp:false` — must opt-in explicitly

Path-specific rules live in .github/instructions/*.instructions.md.

<!-- vibeflow:end -->
