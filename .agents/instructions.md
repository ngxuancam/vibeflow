<!-- vibeflow:start -->
# Agent Instructions — VibeFlow (Self-Hosted)

Project: `@magicpro97/vibeflow` (v0.3.9)
Self-hosted: this repo IS VibeFlow — the local-first npm CLI orchestrator for AI coding engines.

## Build / Test / Lint

- Install: `bun install`
- Typecheck: `tsc --noEmit` (TypeScript 5.7, strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`)
- Lint: `biome check src test` (Biome 1.9.4: double quotes, semicolons, 2-space indent)
- Test: `bun test` (native `bun:test` — NOT vitest or jest)
- Build: `bun run build` → esbuild to `dist/cli.js` + `server.html` + `assets/`
- Full gate: `bun run check` (typecheck + lint + test)
- E2E: `bun run test:e2e` (Playwright 1.60, Chromium, port 5317)

## Architecture

```
src/cli.ts → src/server.ts → Orchestrator → Adapters (Claude/Codex/Copilot)
```

Core modules:
- `src/core.ts` — Types: `Engine`, `WorkUnit`, `WorkflowState`, `Skill`; `CTX_DIR=".vibeflow"`
- `src/adapters.ts` — Canonical context → engine instruction files
- `src/dispatch.ts` — Real engine dispatch via `child_process.spawn`
- `src/orchestrator/agent.ts` — Agent lifecycle: plan → debate → investigate → TDD run
- `src/hooks/runner.ts` — Guardrail evaluation: risk → decision (allow/warn/require_approval/block)
- `src/skills/registry.ts` — SKILL.md frontmatter parser, provenance enforcement
- `src/settings.ts` — `.vibeflow/SETTINGS.json` with tool tiers and failure protection
- `src/gates.ts` — Policy gates: confidence=1.0, evidence required, scope-no-overlap
- `src/discovery/context7.ts` — Zero-install Context7 HTTP client (native `fetch`)

## Conventions

- ESM only, `node:` prefix for stdlib imports
- Strict TypeScript: `noUncheckedIndexedAccess`, `noImplicitOverride`
- Tests: `bun:test` (`describe`, `expect`, `test`), tmpdir isolation, injectable stubs
- Format: double quotes, semicolons, 2-space indent (Biome 1.9.4)
- No runtime npm dependencies — stdlib + Bun only

## Key Facts

| Item | Detail |
|------|--------|
| Runtime | Node.js ≥18 |
| Package manager | Bun (latest) |
| TypeScript | 5.7 (strict) |
| Lint | Biome 1.9.4 |
| Unit test | `bun:test` (not vitest) |
| E2E test | Playwright 1.60 |
| CI | GitHub Actions (ubuntu-latest) |
| Context dir | `.vibeflow/` (canonical), `.viteflow/` (legacy — ignore) |

## Gotchas

- Build copies `src/server.html` + `src/assets/` to `dist/` — web UI needs them
- `bun test` uses `bun:test`, NOT vitest — don't import from vitest
- Settings default OFF: `codegraph:false, lsp:false`
- Smoke test (`scripts/smoke.mjs`) needs real AI engines installed

<!-- vibeflow:end -->
