# Skill Discovery and Evolution

## Purpose

The system must combine two learning sources:

```text
External skill discovery = learn from trusted external sources
Internal skill evolution = learn from real project execution
```

These two mechanisms do not conflict. External skills provide a baseline. Internal skills capture verified local experience.

## External discovery rule

The orchestrator must not rely only on model memory for version-sensitive, tool-specific, framework-specific, or ecosystem-dependent tasks.

Before designing or executing a task, the orchestrator checks:

```text
1. Is there a local verified skill?
2. Is the task dependent on current API/library/tool behavior?
3. Is the required skill missing or outdated?
4. Is there official documentation or a trusted source?
```

## Trusted external sources

Recommended priority:

```text
1. Local verified skills
2. Context7 / ctx7 skills and docs
3. Official Anthropic skills/plugins
4. Vercel find-skills
5. Official vendor documentation
6. Trusted MCP registries
7. Community skills after review
8. npm packages only after security verification
```

## Context7 usage

Context7 should be the primary external skill and documentation resolver.

Use ctx7 when:

```text
- a task needs a reusable skill
- a skill is missing or stale
- task depends on library/framework behavior
- repo uses version-sensitive APIs
- model knowledge may be stale
- implementation requires current examples
- a custom skill should be generated from fresh docs
```

Typical flow:

```text
Detect required capability and repo libraries
  ↓
Search local verified skills
  ↓
Query ctx7 skills if missing or stale
  ↓
Query ctx7 docs for current API behavior
  ↓
Install candidate skill as draft/experimental
  ↓
Validate with a task-specific prompt
  ↓
Save relevant notes into TASK_CONTEXT.md
  ↓
Plan and implement based on verified docs
```

## Vercel find-skills usage

Vercel `find-skills` should be supported as a secondary provider, especially for Vercel, Next.js, AI SDK, frontend, deployment, and web-agent workflows.

Use it after local skills and ctx7, or when the user explicitly requests Vercel skills.

## npm usage

npm packages are not skills by default. They are external dependencies or tool adapters.

npm package installation requires approval when it affects the user environment or project.

Default safety rules:

```text
- do not install silently
- prefer pinned versions
- inspect package metadata
- prefer --ignore-scripts when possible
- run inside sandbox when possible
- do not grant credentials to packages
```

## Internal skill evolution

Update or propose a skill when:

```text
- the assistant repeatedly fails at the same task
- a manual workaround is needed
- a file format, framework, or workflow is not handled well
- the assistant discovers a reusable project-specific process
- the user corrects the assistant
- repeated prompts can be standardized
- a source connector or file reader needs special handling
```

## Skill update process

Before modifying a skill, the assistant must:

```text
1. Identify the problem encountered
2. Explain why the current skill was insufficient
3. Propose the skill change
4. Add or update SKILL.md instructions
5. Add scripts/templates/examples only when necessary
6. Add a validation prompt
7. Record the change in the changelog
```

## Changelog format

Each skill should include:

```md
## Changelog

### YYYY-MM-DD
- Problem encountered:
- Root cause:
- Change made:
- Validation prompt:
- Result:
```

## External vs internal skill policy

Do not overwrite external skills directly. Instead, create one of:

```text
- local wrapper skill
- project-specific patch skill
- verified internal skill
- changelog entry documenting the learned workaround
```

Example:

```text
External skill says: run npm test
Repo requires: pnpm test -- --runInBand
Result: create project-test-runner skill or update repo-onboarding notes
```

## Promotion lifecycle

```text
draft
  ↓
experimental
  ↓
verified
  ↓
deprecated
```

New external or generated skills should start as `draft` or `experimental`.

Promotion to `verified` requires:

```text
- validation prompt
- successful run
- no critical security issue
- clear scope
- review approval if elevated permissions are needed
```
