# npm CLI Design

## Goal

The user should be able to run one command and open a local web UI.

```bash
npx @vibeflow/cli
```

or:

```bash
npm install -g @vibeflow/cli
vf
```

## Startup flow

```text
1. Check Node.js version
2. Check Git
3. Check optional tools: Claude Code, Codex CLI, Copilot CLI, Docker, GitHub CLI
4. Ask before installing missing optional tools
5. Start local web server on 127.0.0.1
6. Open browser automatically
7. Load workflow UI
```

## Commands

```bash
vf
vf doctor
vf init
vf ui
vf run claude
vf run codex
vf run copilot
vf skills list
vf skills add ./skill-folder
vf skills verify
vf hooks install
vf hooks verify
```

## Package layout

```text
vibeflow/
  package.json
  bin/
    vf.ts
  src/
    cli/
      bootstrap.ts
      doctor.ts
      installer.ts
      open-browser.ts
    server/
      index.ts
      routes/
      websocket.ts
    web/
      app/
    core/
      workflow-engine.ts
      skill-resolver.ts
      source-resolver.ts
      file-reader-resolver.ts
      context-normalizer.ts
    adapters/
      claude-code-adapter.ts
      codex-adapter.ts
      copilot-cli-adapter.ts
    hooks/
    skills/
```

## Example package.json

```json
{
  "name": "@vibeflow/cli",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "vf": "./dist/bin/vf.js"
  },
  "scripts": {
    "dev": "tsx src/bin/vf.ts",
    "build": "tsup src/bin/vf.ts --format esm --out-dir dist/bin"
  },
  "dependencies": {
    "commander": "^12.0.0",
    "execa": "^9.0.0",
    "fastify": "^5.0.0",
    "open": "^10.0.0",
    "ws": "^8.0.0",
    "zod": "^3.0.0"
  }
}
```

## Dependency installation policy

### Auto-installed

Safe npm dependencies required by the orchestrator package.

### Ask before installing

```text
Claude Code
Codex CLI
GitHub Copilot CLI
Docker
GitHub CLI
MCP servers
Project dependencies
```

### Never install silently

```text
- global packages
- project dependencies
- tools that execute install scripts
- packages needing credentials
- external skills with shell/network/write permissions
```

## Local server rules

```text
- bind to 127.0.0.1 by default
- random available port
- no public tunnel by default
- no remote telemetry by default
- no source upload by default
```
