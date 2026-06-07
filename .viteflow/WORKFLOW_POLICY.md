# Workflow Policy

- No evidence, no conclusion. No verification, no completion.
- Generate the fewest files possible; every generated file is AI-composed from this context.
- Ask approval only for side effects or high-risk actions.

## Incremental File Authoring
- Never write a large file in a single operation — it causes request timeouts. Create the file with a small first part, then append/edit the remaining parts in separate steps.
- When merging generated content into an existing file, edit/append the specific section rather than rewriting the whole file.

## Knowledge
- Read curated guidance in `.viteflow/knowledge/` before knowledge-heavy or research tasks. Treat it as input you maintain (cross-reference and keep current); never overwrite a source the human curated.

## Tool Error & Execution Policy
- If any terminal command or test execution times out or returns an error code, do not give up immediately.
- Autonomously analyze the error output or partial logs, fix the scripts or parameters, and retry the command up to 3 times.
- Only prompt the user for feedback if the execution consistently fails after 3 distinct self-correction attempts.
