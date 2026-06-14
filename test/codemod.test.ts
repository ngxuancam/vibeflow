import { describe, expect, it } from "bun:test";
import { runCodemod } from "../scripts/codemod-console-to-out.js";

// runCodemod is the jscodeshift transform wrapped for testability. It takes source
// and a fake path (used to decide whether to skip the file).

const SOURCE = `import { c } from "./core.js";

export function greet() {
  console.log("hello");
  console.log(c.bold("Ready"));
  console.log("a", "b", 42);
  console.log(\`multi \\n line\`);
  console.error("oh no");
  console.warn("be careful");
  console.debug("trace");
}
`;

const EXPECTED = `import { c } from "./core.js";

import { out } from "./logbus.js";

export function greet() {
  out("vf", "hello");
  out("vf", c.bold("Ready"));
  out("vf", "a", "b", 42);
  out("vf", \`multi \\n line\`);
  out("vf", "oh no", {
    level: "error"
  });
  out("vf", "be careful", {
    level: "warn"
  });
  out("vf", "trace", {
    level: "debug"
  });
}
`;

describe("codemod-console-to-out", () => {
  it("transforms console.log/error/warn/debug into out() with the right channel and level", () => {
    const result = runCodemod(SOURCE, "src/sample.ts");
    expect(result).toBe(EXPECTED);
  });

  it("is idempotent — re-running on already-transformed code is a no-op", () => {
    const once = runCodemod(SOURCE, "src/sample.ts");
    const twice = runCodemod(once, "src/sample.ts");
    expect(twice).toBe(once);
  });

  it("does not transform console calls inside skipped paths", () => {
    const src = `export function f() { console.log("skip me"); }`;
    const skipped = runCodemod(src, "test/sample.test.ts");
    expect(skipped).toBe(src);
    const distSkipped = runCodemod(src, "dist/sample.js");
    expect(distSkipped).toBe(src);
    const nodeModules = runCodemod(src, "node_modules/foo/index.js");
    expect(nodeModules).toBe(src);
    const e2e = runCodemod(src, "e2e/foo.spec.ts");
    expect(e2e).toBe(src);
  });

  it("preserves the import block — adds `out` only if not already imported", () => {
    const src = `import { c } from "./core.js";\nconsole.log("a");`;
    const once = runCodemod(src, "src/sample.ts");
    expect(once).toContain('import { out } from "./logbus.js"');
    const twice = runCodemod(once, "src/sample.ts");
    // The `out` import appears once, not twice.
    expect((twice.match(/import .* out .* from "\.\/logbus\.js"/g) ?? []).length).toBe(1);
  });

  it("does not re-wrap an existing out() call (idempotency at the call site)", () => {
    const src = `import { out } from "./logbus.js";\nout("vf", "hello");`;
    const result = runCodemod(src, "src/sample.ts");
    expect(result).toBe(src);
  });

  it("ensureOutImport: existing out import detected → no duplicate (line 98-99 lambda body)", () => {
    // The file already imports out. The .some((p) => ...) lambda
    // should fire to detect this and return early.
    const src = `console.log("hi");\nimport { out } from "./logbus.js";`;
    const result = runCodemod(src, "src/sample.ts");
    // The import should appear exactly once (the existing one, not duplicated)
    expect(result.split("import { out } from").length - 1).toBe(1);
  });

  it("adds out import when no imports exist (line 111 else branch)", () => {
    // A file with console.log but NO imports triggers the else
    // branch at line 111 (root.get().node.program.body.unshift).
    const src = `console.log("hello");`;
    const result = runCodemod(src, "src/sample.ts");
    expect(result).toContain("import { out } from");
    expect(result).toContain('out("vf", "hello")');
  });

  it("adds out import for nested src dir (line 98-99 deep import path)", () => {
    // A file in src/foo/bar.ts where the codemod should generate
    // a deeper import path (e.g. "./logbus.js" relative to the file's
    // parent dir).
    const src = `console.log("hello");`;
    const result = runCodemod(src, "src/foo/bar.ts");
    expect(result).toContain("import { out } from");
  });
});
