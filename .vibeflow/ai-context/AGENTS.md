<!-- vibeflow:start -->
# AGENTS.md — VibeFlow (Self-Hosted)

Project: `@magicpro97/vibeflow` (v0.3.9)
This repo IS VibeFlow — the local-first npm CLI that orchestrates Claude Code, Codex CLI, and GitHub Copilot CLI.

## Build / Test / Lint

- Install: `bun install`
- Typecheck: `tsc --noEmit` (TypeScript 5.7, strict, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`)
- Lint: `biome check src test` (Biome 1.9.4: double quotes, semicolons, 2-space indent)
- Test: `bun test` (native `bun:test` runner, NOT vitest/jest)
- Build: `bun run build` → esbuild to `dist/cli.js` + `server.html` + `assets/`
- Full gate: `bun run check` (typecheck + lint + test)
- E2E: `bun run test:e2e` (Playwright 1.60, Chromium, port 5317, throwaway `.e2e-workspace/`)

## Architecture

4-layer orchestration system:
```
src/cli.ts (CLI entry) → src/server.ts (Web UI) → Orchestrator Core → Tool Adapters
```

Key source modules:
- `src/core.ts` — Canonical types (`Engine`, `WorkUnit`, `WorkflowState`, `Skill`), constants (`CTX_DIR=".vibeflow"`)
- `src/adapters.ts` — Generates engine instruction files (CLAUDE.md, AGENTS.md, copilot-instructions.md, `.codex/config.toml`)
- `src/dispatch.ts` — Real engine dispatch: spawns Claude/Codex/Copilot CLI, captures `EngineSummary`
- `src/orchestrator/` — Agent lifecycle: `plan.ts` → `debate.ts` → `investigate.ts` → `agent.ts` (TDD loop, confidence=1.0 gate)
- `src/hooks/` — Guardrail scoring (`risk.ts`), evaluation (`runner.ts`), engine configs (`adapters.ts`)
- `src/skills/` — Skill registry (`registry.ts`), resolver (`resolver.ts`), maintainer (`maintainer.ts`)
- `src/settings.ts` — `.vibeflow/SETTINGS.json`: tool tiers, failure protection defaults
- `src/gates.ts` — Policy gates: confidence≥1.0, evidence, scope-no-overlap (`policyGates`)
- `src/journal.ts` — Append-only journal to `.vibeflow/knowledge/log.md`
- `src/discovery/context7.ts` — Zero-install Context7 HTTP client (uses native `fetch`)
- `src/workflow/lifecycle.ts` — Delete plan, merge, scope management

## Code Conventions

- ESM only (`"type": "module"`)
- `node:` prefix for all stdlib imports
- Strict TS: `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`
- Injection seams: Preflight, spawn, file I/O are injectable functions for testability
- Test framework: `bun:test` (`describe`, `expect`, `test` from `"bun:test"`)
- Test pattern: `mkdtempSync` per-test isolated repos, injectable stubs for engines/settings
- Format: double quotes, semicolons, 2-space indent, 100-char line width (Biome)

## Tech Stack

| Tool | Version |
|------|---------|
| Runtime | Node.js ≥18 |
| Package manager | Bun (latest) |
| TypeScript | 5.7 (strict) |
| Lint/Format | Biome 1.9.4 |
| Unit test | `bun:test` (built-in) |
| E2E test | Playwright 1.60 |
| CI | GitHub Actions (ubuntu-latest, `oven-sh/setup-bun@v2`) |

## Gotchas

- **Dual context dirs**: `.vibeflow/` (canonical) + `.viteflow/` (legacy). Use `.vibeflow/`.
- **Build copies UI assets**: `bun run build` copies `src/server.html` + `src/assets/` to `dist/` — web UI needs them.
- **`bun test` ≠ vitest**: Tests use `bun:test` imports. `expect` is global but imported explicitly.
- **Smoke requires real engines**: `scripts/smoke.mjs` spawns actual AI CLIs — can fail without them installed.
- **Context7 discovery**: Uses native `fetch` to context7.com — keyless (rate-limited), optional API key.
- **No runtime deps**: Zero npm dependencies at runtime. Only stdlib + Bun.

<!-- vibeflow:end -->
