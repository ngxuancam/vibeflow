// Re-export facade — all public API lives in src/adapters/*.ts.
// Every existing import of ../src/adapters.js keeps working.

// context-builders
export {
  VF_BANNER,
  VF_COMMANDS,
  VF_WORKFLOW,
  type ProjectContext,
  type DefaultContextOpts,
  defaultContext,
  aiGenerate,
} from "./adapters/context-builders.js";

// canonical-files
export { canonicalFiles } from "./adapters/canonical-files.js";

// engine-files
export { engineFiles } from "./adapters/engine-files.js";

// agent-files
export { agentFiles } from "./adapters/agent-files.js";

// dispatch-prompt
export { type UnitBrief, dispatchPrompt } from "./adapters/dispatch-prompt.js";
