import { spawnSync } from "node:child_process";
import { type AgentEngine, agentFilePath, renderForEngine } from "../agents/render.js";
import { type RoleName, getRoleSpec, roleContextFromProfile } from "../agents/role-templates.js";
import type { RoleSpec } from "../agents/role.js";
import { ENGINES } from "../core.js";
import type { ProjectProfile } from "../scanner.js";

function aiEnrichRole(spec: RoleSpec, profile: ProjectProfile): RoleSpec {
  const cmd = process.env.VIBEFLOW_AI;
  if (!cmd) return spec;
  const prompt = [
    `Tailor the following agent role for project "${profile.name}".`,
    `Project summary: ${profile.summary ?? "(none)"}.`,
    `Detected stack: ${profile.languages.join(", ")}, packageManager=${profile.packageManager ?? "?"}.`,
    "Return ONLY the rewritten body (markdown). Do not change name, tools, model, or sandbox.",
    "Keep length under 4000 characters.",
    "",
    "Original body:",
    spec.body,
  ].join("\n");
  const r = spawnSync(cmd, { input: prompt, shell: true, encoding: "utf8", timeout: 30_000 });
  if (r.status !== 0 || !r.stdout?.trim()) return spec;
  const enrichedBody = r.stdout.trim().slice(0, 4000);
  return { ...spec, body: enrichedBody };
}

export function agentFiles(
  profile: ProjectProfile,
  roles: RoleName[],
  useAi = true,
  engines: readonly AgentEngine[] = ENGINES as readonly AgentEngine[],
): Record<string, string> {
  const ctx = roleContextFromProfile(profile);
  const out: Record<string, string> = {};
  for (const roleName of roles) {
    const baseSpec = getRoleSpec(roleName, ctx);
    if (!baseSpec) continue;
    const spec = useAi ? aiEnrichRole(baseSpec, profile) : baseSpec;
    for (const engine of engines) {
      out[agentFilePath(engine, roleName)] = renderForEngine(engine, spec);
    }
  }
  return out;
}
