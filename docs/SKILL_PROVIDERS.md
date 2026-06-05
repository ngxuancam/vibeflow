# Skill Providers

## Purpose

VibeFlow should not rely only on model memory. It must use a provider-based skill discovery layer so agents can find, install, validate, and reuse trusted skills.

## Provider priority

Recommended default order:

```text
1. Local verified skills
2. Context7 / ctx7 skills
3. Official Anthropic skills and Claude Code plugins
4. Vercel find-skills
5. Official vendor documentation
6. Trusted MCP registries
7. Community skills after review
8. npm packages only after security verification
```

## Why Context7 is the primary external provider

Context7 should be the default external skill/docs resolver because it can support both:

```text
- skill discovery / installation / generation
- fresh documentation lookup for libraries, frameworks, SDKs, and APIs
```

This matters because many coding failures happen when the model relies on outdated API knowledge.

## Role of Vercel find-skills

Vercel `find-skills` should remain supported as an additional provider.

Use it when:

```text
- the task needs a reusable agent skill
- the stack is Vercel, Next.js, AI SDK, frontend, deployment, or web-agent related
- Context7 has no suitable skill
- the user explicitly requests Vercel skills
```

## Provider interface

Every provider adapter should implement:

```ts
interface SkillProvider {
  name: string;
  search(query: SkillSearchQuery): Promise<SkillSearchResult[]>;
  suggest(context: ProjectContext): Promise<SkillSuggestion[]>;
  install(skillRef: string, targetDir: string): Promise<InstalledSkill>;
  verify(skillPath: string): Promise<SkillVerificationResult>;
}
```

## Skill resolution flow

```text
Task received
  ↓
Detect required capabilities
  ↓
Search local verified skills
  ↓
If missing or stale, query ctx7 skills
  ↓
If framework/API behavior is involved, query ctx7 docs
  ↓
If still missing, query Vercel find-skills / official sources
  ↓
Install as draft or experimental
  ↓
Run validation prompt
  ↓
Promote to verified only after checks pass
```

## Skill status

```text
draft         = generated or downloaded but not trusted
experimental  = usable with caution and limited permissions
verified      = tested and allowed by policy
deprecated    = preserved for history but should not be selected
blocked       = known unsafe or incompatible
```

## Rule for agents

Agents must not invent a manual process before checking available skills.

If a matching verified skill exists, it must be used.

If no verified skill exists, the agent must:

```text
1. search external providers
2. propose the best skill candidate
3. explain risks
4. install only as draft/experimental
5. validate before use
```

## npm packages are not skills by default

npm should be treated as a package/tool dependency source, not a trusted skill registry.

Before installing npm dependencies, VibeFlow must check:

```text
- package name and namespace
- maintainer/repository
- pinned version
- install scripts
- license
- known security advisories if available
- whether the dependency is truly required
```

Default install strategy should prefer:

```bash
npm install --ignore-scripts
```

or sandboxed execution.
