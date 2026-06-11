# Task Context — mcp-lsp-startup

- Goal: Diagnose and fix the `lsp-typescript` MCP startup failure:
  `MCP startup failed: No such file or directory (os error 2)`.
- Definition of Done: `vf tools status` no longer reports an enabled missing LSP
  binary, and generated MCP config no longer points at an unavailable command; OR
  the exact install command requiring user approval is identified.
- Must not change: Source code unrelated to VibeFlow tool configuration.

## Evidence

- Capture `vf tools status`.
- Capture whether `mcp-language-server` and `typescript-language-server` are on
  `PATH`.
- Run `vf init` after any `.vibeflow/*` tool configuration change.
- Run `vf verify` before claiming completion, or report why it cannot complete.
