#!/usr/bin/env bun
/**
 * jscodeshift codemod — `console.log/error/warn/debug(...)` → `out("vf", ...)`.
 *
 * Usage:
 *   bunx jscodeshift --transform=scripts/codemod-console-to-out.ts <path>...
 *   bunx jscodeshift --dry --print --transform=scripts/codemod-console-to-out.ts src/commands.ts
 *
 * Behavior:
 *   - console.log(...)   → out("vf", ...)
 *   - console.error(...) → out("vf", ..., { level: "error" })
 *   - console.warn(...)  → out("vf", ..., { level: "warn" })
 *   - console.debug(...) → out("vf", ..., { level: "debug" })
 *   - Skips files under node_modules/, dist/, e2e/, test/.
 *   - Idempotent: re-runs become no-ops. Already-wrapped out() calls are not re-wrapped.
 *   - Adds `import { out } from "./logbus.js"` (relative path) if not already present.
 *
 * The module also exports a test-friendly `runCodemod(src, filePath)` function so
 * snapshot tests don't have to go through the jscodeshift CLI.
 */
import type { API, FileInfo, JSCodeshift } from "jscodeshift";

const SKIP_PREFIXES = ["node_modules/", "dist/", "e2e/", "test/"];

function shouldSkip(filePath: string): boolean {
  return SKIP_PREFIXES.some((p) => filePath.includes(`/${p}`) || filePath.startsWith(p));
}

const LEVEL_BY_METHOD: Record<string, string | null> = {
  log: null,
  error: "error",
  warn: "warn",
  debug: "debug",
};

function isConsoleCall(
  j: JSCodeshift,
  path: { node: { callee: unknown }; parent: { node: unknown } },
): boolean {
  const callee = path.node.callee as {
    type?: string;
    object?: { name?: string };
    property?: { name?: string };
  };
  if (callee.type !== "MemberExpression") return false;
  if (callee.object?.name !== "console") return false;
  const method = callee.property?.name;
  if (!method || !(method in LEVEL_BY_METHOD)) return false;
  // Idempotency: skip if the immediate parent is an `out(...)` call.
  const parent = path.parent.node as { type?: string; callee?: { name?: string } } | null;
  if (parent && parent.type === "CallExpression" && parent.callee?.name === "out") return false;
  // j is intentionally unused here — the call filter only needs path inspection.
  void j;
  return true;
}

function replaceCalls(
  j: JSCodeshift,
  root: ReturnType<JSCodeshift>,
): { changed: boolean; outImportPath: string } {
  const allCalls = root
    .find(j.CallExpression, { callee: { type: "MemberExpression" } })
    .filter((p) => isConsoleCall(j, p));

  if (allCalls.size() === 0) {
    return { changed: false, outImportPath: "./logbus.js" };
  }

  // jscodeshift Collections don't expose Symbol.iterator, so the standard `for...of`
  // would have to fall back to `forEach`-style iteration anyway. This is the idiomatic
  // jscodeshift mutation API.
  // biome-ignore lint/complexity/noForEach: jscodeshift Collection API
  allCalls.forEach((path) => {
    const callee = path.node.callee as { property?: { name?: string } };
    const method = callee.property?.name as keyof typeof LEVEL_BY_METHOD;
    const level = LEVEL_BY_METHOD[method];
    const args = path.node.arguments;
    const newArgs: unknown[] = [j.literal("vf"), ...args];
    if (level) {
      newArgs.push(
        j.objectExpression([j.property("init", j.identifier("level"), j.literal(level))]),
      );
    }
    path.replace(j.callExpression(j.identifier("out"), newArgs as never[]));
  });

  // Decide the import path. Files at `src/foo.ts` import `./logbus.js`; nested
  // files (e.g. `src/orchestrator/agent.ts`) use `../logbus.js`.
  // We import the path from the caller via root.filePath — not present on jscodeshift
  // root, so callers pass it via `filePath`.
  return { changed: true, outImportPath: "./logbus.js" };
}

function ensureOutImport(j: JSCodeshift, root: ReturnType<JSCodeshift>, importPath: string): void {
  const hasOutImport = root
    .find(j.ImportDeclaration)
    .filter((p) => p.node.source.value === "./logbus.js" || p.node.source.value === "../logbus.js")
    .some((p) => {
      const specs = p.node.specifiers ?? [];
      return specs.some((s) => (s as { imported?: { name?: string } }).imported?.name === "out");
    });
  if (hasOutImport) return;

  const importDecl = j.importDeclaration(
    [j.importSpecifier(j.identifier("out"))],
    j.literal(importPath),
  );
  const lastImport = root.find(j.ImportDeclaration).at(-1);
  if (lastImport.size() > 0) {
    lastImport.get().insertAfter(importDecl);
  } else {
    root.get().node.program.body.unshift(importDecl as never);
  }
}

function relativeImportPath(filePath: string): string {
  if (!filePath.startsWith("src/")) return "./logbus.js";
  const depth = filePath.split("/").length - 2; // strip "src/" prefix and the filename
  // src/x.ts -> depth 0 -> "./logbus.js"
  // src/a/x.ts -> depth 1 -> "../logbus.js"
  return depth === 0 ? "./logbus.js" : "../logbus.js";
}

// ---------------------------------------------------------------------------
// Public test entry point: takes source + path, returns transformed source.
// ---------------------------------------------------------------------------

export function runCodemod(source: string, filePath: string): string {
  if (shouldSkip(filePath)) return source;
  // jscodeshift is a CJS module; import it via createRequire.
  const { createRequire } = require("node:module") as typeof import("node:module");
  const req = createRequire(import.meta.url);
  const jscodeshift = req("jscodeshift") as JSCodeshift;
  const j = jscodeshift.withParser("ts");
  const root = j(source);
  const { changed } = replaceCalls(j, root);
  if (!changed) return root.toSource();
  ensureOutImport(j, root, relativeImportPath(filePath));
  return root.toSource();
}

// ---------------------------------------------------------------------------
// jscodeshift module-shape (transform) — used by `jscodeshift --transform=...`
// ---------------------------------------------------------------------------

export const parser = "ts";

export default function transform(file: FileInfo, api: API): string | undefined {
  const j = api.jscodeshift;
  if (shouldSkip(file.path)) return undefined;
  const root = j(file.source, { parser: "ts" });
  const { changed } = replaceCalls(j, root);
  if (!changed) return undefined;
  ensureOutImport(j, root, relativeImportPath(file.path));
  return root.toSource();
}
