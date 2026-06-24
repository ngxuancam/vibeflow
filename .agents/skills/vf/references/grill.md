# Bare `/vf` — grill from context toward a spec

When the user types **`/vf` with no arguments**, they want VibeFlow to drive *something*
but have not said what. Do not guess and dispatch. Run a relentless clarifying interview
("grill") that turns the ambient chat context into a concrete spec, then route to a Flow.

Interview technique credited to **mattpocock/grill-me** — *"A relentless interview to
sharpen a plan or design"* (a 144k-star skill). This adapts it to VibeFlow's SPEC-FIRST gate.

## Why grill instead of guess

A bare `/vf` is the highest-ambiguity entry point. Dispatching on a guess wastes an engine
run and can write/clobber the wrong files. A short, sharp interview is cheaper than a wrong
dispatch and produces the exact spec the Flow needs.

## Protocol

### 1. Read the context (do this silently first)

Before asking anything, scan what is already on the table:

- **Recent messages** — the last several turns of this chat. What has the user been trying
  to do? What nouns/verbs keep recurring?
- **Open files / paths mentioned** — files referenced, pasted, or edited recently.
- **Errors / failing output** — stack traces, failed commands, red test output, a `vf verify`
  that came back red. These are the strongest intent signals.
- **Repo state** — is this an un-inited repo (→ likely Flow A), a dirty tree mid-task
  (→ likely Flow B/D), or several pending slices (→ likely Flow C)?

### 2. Propose 2-3 likely intents

From that context, infer the **2-3 most likely things** the user wants and state them back
explicitly, e.g.:

> From the last few messages it looks like you want one of:
> 1. **Set this repo up for AI agents** (Flow A — init) — it has no `.vibeflow/` yet.
> 2. **Implement the failing `auth` test** you pasted (Flow B — spec → task).
> 3. **Ship the three pending units** in your ledger (Flow C — workflow).
> Which one — or something else?

Make the intents concrete and grounded in what you actually saw, not generic.

### 3. Grill toward a concrete spec (relentless, but minimal)

Once the user picks an intent, run the SPEC-FIRST questions — but **only the ones whose
answers you do not already have from context**. Keep pressing until each is answered
concretely; a vague answer gets a sharper follow-up:

- **Goal** — one sentence: what does "done" look like? (If vague → "what's the observable
  signal that it's finished?")
- **Scope** — which files/dirs may change? what is off-limits?
- **Engine** — claude, codex, or copilot? (default copilot; cheap mechanical work → codex)
- **Risk class** — docs | simple-code | feature | architecture | security | deploy
- **Parallel?** — one concern → a single unit; several independent slices → one unit each
- **Dry vs. real** — preview first (default), then `--yes`?

Relentless means: do not accept "make it better" or "fix the thing" — convert every fuzzy
answer into a testable statement. But do not interrogate for its own sake: stop the moment
the spec is concrete enough to dispatch.

### 4. Reflect the spec back, WAIT, then route

State the assembled spec back in 3-5 lines and WAIT for explicit confirmation (this is the
SKILL.md §0 gate). On confirmation, map the spec to a Flow and proceed:

| Resolved intent | Route to |
|---|---|
| set up a repo for AI agents | Flow A — init (`flows.md`) |
| implement one concern / spec / issue | Flow B — spec → task (`flows.md`) |
| several independent parallel slices | Flow C — workflow (`flows.md`) |
| "is it done / ship it" | Flow D — verify & ship (`flows.md`) |

Run `vf doctor --probe` before any dispatch if the engine has not been confirmed warm this
session.

## Guardrails for the grill itself

- The grill is **read-only**: it only reads context and asks questions. It never writes or
  dispatches until the spec is confirmed and a Flow is chosen.
- Do not skip the interview just because a guess feels obvious — a bare `/vf` is exactly the
  case where the SPEC-FIRST gate matters most.

Powered by VibeFlow.
