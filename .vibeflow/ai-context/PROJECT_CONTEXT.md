<!-- vibeflow:start -->
# Project Context

- **Name**: `@magicpro97/vibeflow`
- **Version**: 0.3.9
- **Summary**: VibeFlow is a local-first npm CLI tool that opens a visual web UI and helps users run AI-assisted software development workflows using Claude Code, Codex CLI, and GitHub Copilot CLI out-of-the-box.
- **Repository**: https://github.com/magicpro97/vibeflow
- **Documentation source**: `docs/` directory (ARCHITECTURE.md, USER_GUIDE.md, COMMAND_REFERENCE.md, etc.)
- **Task/issue source**: GitHub Issues

## Detected stack

- **Languages**: TypeScript
- **Package manager**: bun (latest)
- **Runtime**: Node.js ≥18
- **Build**: `bun run build` → Bun esbuild to `dist/cli.js` + copies `server.html` + `assets/`
- **Test**: `bun run test` → native `bun:test` runner (NOT vitest/jest)
- **Lint**: `bun run lint` → Biome 1.9.4
- **Typecheck**: `tsc --noEmit`
- **Format**: Biome (double quotes, semicolons, 2-space indent, 100 line width)
- **E2E**: Playwright 1.60 (Chromium, port 5317)
- **Manifests**: package.json
- **CI**: GitHub Actions (ubuntu-latest, `oven-sh/setup-bun@v2`)
- **No runtime deps**: Zero npm dependencies at runtime — stdlib + Bun only

## Architecture

4-layer orchestration pipeline:
```
CLI entry (src/cli.ts) → Web UI (src/server.ts) → Orchestrator Core → Tool Adapters
```

**Key modules:**
- `src/core.ts` — Canonical types: `Engine`, `WorkUnit`, `WorkflowState`, `Skill`, constants
- `src/adapters.ts` — Canonical context → engine instruction files (CLAUDE.md, AGENTS.md, copilot-instructions.md, `.codex/config.toml`)
- `src/dispatch.ts` — Real engine dispatch: spawns AI CLIs, captures `EngineSummary`
- `src/orchestrator/` — Agent lifecycle: plan → debate → investigate → agent (TDD loop, confidence=1.0 gate)
- `src/hooks/` — Guardrail system: risk scoring, event evaluation, engine config generation
- `src/skills/` — Skill registry, resolver, maintainer (SKILL.md frontmatter parsing)
- `src/settings.ts` — `.vibeflow/SETTINGS.json`: tool tiers (codegraph/lsp/native), failure protection
- `src/gates.ts` — Policy gates: confidence≥1.0, evidence required, scope-no-overlap
- `src/journal.ts` — Append-only journal to `.vibeflow/knowledge/log.md`
- `src/discovery/context7.ts` — Zero-install Context7 HTTP client (native `fetch`)

## Code conventions

- ESM only (`"type": "module"`), `node:` prefix for stdlib imports
- Strict TypeScript: `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`
- Injection seams: Preflight, spawn, file I/O are injectable function parameters for testability
- Tests: `bun:test` imports (`describe`, `expect`, `test`), tmpdir-isolated repos, injectable stubs
<!-- vibeflow:end -->