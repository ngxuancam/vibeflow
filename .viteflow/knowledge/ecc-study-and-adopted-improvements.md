# Knowledge: ecc study → adopted improvements (for future AI maintainers)

> Source studied: https://github.com/affaan-m/ecc (MIT) — "agent harness performance
> optimization system": skills/instincts/memory/security pack for Claude Code, Codex, Cursor,
> OpenCode. NOT a runtime. We mined it for transferable techniques, debated them
> (proposer ⚔️ challenger → judge), and ported only the high-value-new, zero-runtime-dep ones.
>
> This file records WHAT we adopted and WHY we rejected the rest, so a future maintainer doesn't
> re-litigate the same ideas. Companion artifact: `hook-selfcheck.json` (the live verification
> run on this repo).

## Adopted (implemented, verified on this repo — 302 tests green)

1. **Command tokenizer hardening** (`src/hooks/risk.ts`). ecc's gateguard strips quotes and
   explodes subshells before risk-scoring. VibeFlow's `tokenize` was whitespace-split, so
   `bash -c "rm -rf /"`, `$(rm -rf /)`, backticks, `rm${IFS}-rf`, and `;`/`&&`/`|`-chained
   destructive commands EVADED detection. Fixed: `expandSubCommands` expands `$IFS`, splits on
   unquoted operators, unwraps `-c "<payload>"`, surfaces `$(...)`/backtick bodies (bounded depth),
   and scores each sub-command (max). The destructive regex now runs on quote-stripped text so a
   commit message `"drop table users"` no longer false-positives. Zero false positives on the
   benign corpus (echo/grep -rf/quoted commit msg) — the judge's 1.0 acceptance criterion.

2. **Config-protection paths** (`src/hooks/risk.ts`). ecc blocks agents from weakening
   lint/build configs to make checks pass. Added `CONFIG_PROTECTED` (tsconfig*.json, biome.json(c),
   .githooks/, .eslintrc*, .prettierrc*) → `require_approval`. Path-level only: HookInput carries
   no diff content, so semantic "weakening" detection is intentionally deferred.

3. **Hook env kill-switch** (`src/hooks/runner.ts`). `VIBEFLOW_HOOKS=off|0` disables hooks;
   unset or any unknown value → hooks ON (fail-safe — never fail open on garbage). The git
   pre-commit stays independently fail-closed.

4. **Dogfood self-test** (`src/hooks/selftest.ts`, `vf hook --selftest`). Runs the attack+benign
   corpus through the real decision path and writes `hook-selfcheck.json` here. Deterministic, no
   engine spawn. Re-run it after touching `risk.ts` to catch regressions in command safety.

## Rejected / deferred (do NOT re-port without new evidence)

- **bun:sqlite state ledger** — REJECTED, decisive: build target is `bun build --target=node`;
  `bun:sqlite` is Bun-only and would crash the shipped `dist/cli.js` under node. JSON state stays.
- **GateGuard "grand gate"** — ~80% already exists: `runner.ts` require_approval→exit 2 is a
  blocking gate; `gates.ts` confidence/evidence/scope gates demand facts before close;
  `investigate.ts` is the mark→retry loop. Only the narrow "first-edit demands an evidence note"
  was genuinely new, and its marginal value over the existing gates was judged low. Skipped.
- **agent-eval / GAN engine-benchmark loop** — DEFERRED (rabbit hole): assumes headless one-shot
  engines (`claude -p`) reliably mutate a git worktree a grader then checks — unproven; large new
  subsystem; the confidence gate + investigate loop already provide bounded termination.
- **Outcome health scoring / loop-stall detection (7d/30d trend)** — DEFERRED: requires a
  persistent run-outcome time-series/log substrate VibeFlow doesn't have (only transient stdout +
  per-unit evidence). The "save results for maintainers" need is met by one-shot files in
  `.viteflow/knowledge/`, not a trend ledger.
- **read-only git allowlist** — no-op: unknown commands already score low/allow.
- **ordinal hook profiles (minimal/standard/strict)** — over-engineering for 9 hook events; the
  single env kill-switch covers the real need.
- **tmux orchestration, 251-skill catalog, instincts-import** — REJECTED: tmux couples to a
  terminal multiplexer (VibeFlow is headless one-shot); the catalog contradicts the demand-driven
  skill model; instincts-import is a memory-poisoning attack surface and violates the
  no-silent-trust promotion gate (`maintainer.ts canPromote`).

## How to re-verify
`bun run src/cli.ts hook --selftest` → must print `20/20 pass`, exit 0, refresh `hook-selfcheck.json`.
`bun run check` → typecheck + lint + 302 tests green.
