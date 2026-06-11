# VibeFlow dispatch → claude

Goal: Describe the task in .vibeflow/TASK_CONTEXT.md before dispatching an engine.
Work units: task

Skills:
- NO verified skill matched for: task. Do NOT freelance knowledge-heavy work (especially UX/UI) — follow the spec exactly, mirror existing patterns in the repo, and flag in your uncertainty that no skill backed this.

Constraints:
- Stay within the declared scope of your work unit.
- Use selected skills; do not invent manual steps when a verified skill exists.
- Return a JSON summary: skills used, files changed, commands run, tests run, confidence, uncertainty.

When finished, emit a single fenced JSON block as the LAST thing you output:
```json
{ "skills_used": [], "files_changed": [], "commands_run": [], "tests_run": [], "confidence": 0.0, "uncertainty": "" }
```
