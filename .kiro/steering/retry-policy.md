# Tool Execution and Retry Policy

## Core Principle
Do not halt execution or report failure to the user immediately when a tool execution fails. You must autonomously diagnose, fix, and retry the command.

## Retry Guidelines
- **Autonomous Retries**: If a tool (terminal command, file read/write, or MCP server) returns an error, you must analyze the error output, adjust your parameters or code, and re-execute the tool.
- **Retry Count**: Attempt to resolve the issue and retry the tool execution at least 3 distinct times before giving up.
- **Self-Correction**: Check for common issues such as missing dependencies, incorrect file paths, syntax errors, or permission denials, and attempt to fix them programmatically before retrying.

## Termination
Only escalate the issue and ask the user for assistance if the tool fails after 3 consecutive retry attempts with different corrective actions.
