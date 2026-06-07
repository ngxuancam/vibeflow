# Knowledge: LLM Wiki (Karpathy)

> Source: Andrej Karpathy — "LLM Wiki", https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
> Saved to `.viteflow/knowledge/` so dispatched engines treat it as curated guidance, not
> rediscovered each run. This is INPUT the human curates; VibeFlow never overwrites it.

## Why this is here

VibeFlow's `.viteflow/` is exactly the "schema + wiki" layering Karpathy describes: the human
curates sources/goals, the AI does the bookkeeping (context files, work-unit evidence, skill
index) and keeps it current. Read this before doing knowledge-heavy or research tasks — prefer
**building a persistent, cross-referenced artifact** over re-deriving answers every query.

## The pattern (verbatim core)

A pattern for building personal knowledge bases using LLMs. Designed to be copy-pasted to your own
LLM agent (Codex, Claude Code, etc.) — it communicates the high-level idea; the agent builds the
specifics with you.

### Core idea
Most LLM+document usage is RAG: upload files, retrieve chunks at query time, generate an answer —
the LLM rediscovers knowledge from scratch every question; nothing accumulates. The alternative:
the LLM **incrementally builds and maintains a persistent wiki** — structured, interlinked markdown
between you and the raw sources. Adding a source isn't just indexing: the LLM reads it, extracts
key info, integrates it (updates entity pages, revises summaries, flags contradictions, strengthens
synthesis). Knowledge is compiled once and **kept current**, not re-derived. The wiki is a
**persistent, compounding artifact**: cross-references already there, contradictions already
flagged, synthesis already reflects everything read. The human curates/sources/asks; the LLM does
summarizing, cross-referencing, filing, bookkeeping.

### Architecture — three layers
- **Raw sources** — curated source docs; immutable, the LLM reads but never modifies. Source of truth.
- **The wiki** — LLM-generated markdown (summaries, entity/concept pages, overview, synthesis). The
  LLM owns it: creates, updates on new sources, maintains cross-refs, keeps consistent.
- **The schema** — a config doc (CLAUDE.md / AGENTS.md) defining structure, conventions, workflows
  for ingest/query/maintain. Co-evolved over time. This is what makes the LLM a disciplined
  maintainer, not a generic chatbot.

### Operations
- **Ingest** — drop a source, LLM reads it, discusses takeaways, writes a summary page, updates the
  index, updates relevant entity/concept pages (one source might touch 10-15 pages), appends to the log.
- **Query** — LLM searches relevant pages, answers with citations. **Good answers get filed back as
  new pages** so explorations compound, not lost to chat history.
- **Lint** — periodic health-check: contradictions, stale claims, orphan pages, missing pages/
  cross-references, data gaps to fill with a web search.

### Indexing & logging
- **index.md** — content catalog: every page with a link + one-line summary, by category. Read it
  first when answering, then drill in. Works well at moderate scale (~100 sources) without embeddings.
- **log.md** — append-only chronological record with a consistent prefix so it's greppable, e.g.
  `## [2026-04-02] ingest | Article Title` → `grep "^## \[" log.md | tail -5`.

### Why it works
The tedious part of a knowledge base is bookkeeping, not reading/thinking — updating cross-refs,
keeping summaries current, noting contradictions, consistency across dozens of pages. Humans abandon
wikis because maintenance outgrows value. LLMs don't get bored, don't forget a cross-reference, and
can touch 15 files in one pass. The human curates sources, directs analysis, asks good questions; the
LLM does everything else. (Spiritually: Vannevar Bush's Memex, 1945 — with the LLM solving the
"who maintains it" problem.)

### Note
The pattern is intentionally abstract — directory structure, schema conventions, page formats, and
tooling depend on the domain. Everything is optional/modular; instantiate a version that fits.
