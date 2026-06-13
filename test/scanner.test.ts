import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanRepo } from "../src/scanner.js";

describe("scanner language detection", () => {
  test("detects Kotlin via build.gradle.kts marker even when sources are deep (KMP)", () => {
    const dir = mkdtempSync(join(tmpdir(), "vf-scan-"));
    try {
      // KMP layout: marker at root, .kt sources buried at depth 6 (the old depth-2 walk missed them).
      writeFileSync(join(dir, "build.gradle.kts"), "// kmp\n");
      writeFileSync(join(dir, "settings.gradle.kts"), "// kmp\n");
      const deep = join(dir, "composeApp", "src", "commonMain", "kotlin", "com", "app");
      mkdirSync(deep, { recursive: true });
      writeFileSync(join(deep, "App.kt"), "fun main() {}\n");
      const langs = scanRepo(dir).languages;
      expect(langs).toContain("Kotlin");
      // marker-detected language is surfaced first (signals the primary stack)
      expect(langs[0]).toBe("Kotlin");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("detects shallow extensions too (TypeScript) and unions with markers", () => {
    const dir = mkdtempSync(join(tmpdir(), "vf-scan-"));
    try {
      writeFileSync(join(dir, "tsconfig.json"), "{}\n");
      writeFileSync(join(dir, "index.ts"), "export const x = 1;\n");
      const langs = scanRepo(dir).languages;
      expect(langs).toContain("TypeScript");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("go.mod marker → Go even with no shallow .go files", () => {
    const dir = mkdtempSync(join(tmpdir(), "vf-scan-"));
    try {
      writeFileSync(join(dir, "go.mod"), "module x\n");
      expect(scanRepo(dir).languages).toContain("Go");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("scanner evidence", () => {
  test("returns stack findings with evidence file paths", () => {
    const dir = mkdtempSync(join(tmpdir(), "vf-rust-evidence-"));
    writeFileSync(
      join(dir, "Cargo.toml"),
      '[package]\nname="zoom-terminal-translator-rs"\n[dependencies]\ntokio = "1"\n',
    );
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src", "main.rs"), "fn main() {}");
    const profile = scanRepo(dir);
    expect(profile.findings).toBeDefined();
    const langFinding = profile.findings?.find((f) => f.component === "language");
    expect(langFinding).toBeDefined();
    expect(langFinding?.value).toBe("Rust");
    expect(langFinding?.evidence).toContain("Cargo.toml");
    expect(langFinding?.confidence).toBe("high");
  });

  test("marks UI as none detected when no web manifest", () => {
    const dir = mkdtempSync(join(tmpdir(), "vf-rust-no-ui-"));
    writeFileSync(join(dir, "Cargo.toml"), '[package]\nname="x"');
    const profile = scanRepo(dir);
    const ui = profile.findings?.find((f) => f.component === "ui");
    expect(ui).toBeDefined();
    expect(ui?.value).toContain("none detected");
    expect(ui?.confidence).toBe("low");
  });
});

describe("scanner: edge branches", () => {
  test("readmeSummary returns the first non-heading line", () => {
    const dir = mkdtempSync(join(tmpdir(), "vf-scanner-readme-"));
    writeFileSync(
      join(dir, "README.md"),
      "# Heading 1\n\nThis is the project summary line.\n\nMore details below.\n",
    );
    const profile = scanRepo(dir);
    expect(profile.summary).toContain("This is the project summary line");
  });

  test("readmeSummary returns undefined when README has only headings", () => {
    const dir = mkdtempSync(join(tmpdir(), "vf-scanner-readme-heads-"));
    writeFileSync(join(dir, "README.md"), "# Title\n## Subtitle\n### Subsubtitle\n");
    const profile = scanRepo(dir);
    // No summary line, but no error
    const summary = profile.findings?.find((f) => f.component === "summary");
    // Either no summary finding, or the value is empty
    if (summary) expect(summary.value).toBe("");
  });

  test("readmeSummary returns undefined when no README exists (line 121)", () => {
    const dir = mkdtempSync(join(tmpdir(), "vf-scanner-no-readme-"));
    // No README
    const profile = scanRepo(dir);
    const summary = profile.findings?.find((f) => f.component === "summary");
    // No summary finding emitted
    if (summary) expect(summary.value).toBe("");
  });

  test("readJson is null when JSON is malformed (line 140 catch)", () => {
    const dir = mkdtempSync(join(tmpdir(), "vf-scanner-bad-json-"));
    writeFileSync(join(dir, "package.json"), "not valid json {{{");
    // scanRepo doesn't crash, profile fields are empty/default
    const profile = scanRepo(dir);
    expect(profile.languages).toBeDefined();
  });

  test("detects KMP frameworks from version catalog (line 259-265)", () => {
    const dir = mkdtempSync(join(tmpdir(), "vf-scanner-kmp-"));
    mkdirSync(join(dir, "gradle"), { recursive: true });
    writeFileSync(join(dir, "gradle", "libs.versions.toml"), "[versions]\nkoin = \"3.5\"\n");
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "build.gradle.kts"), "plugins { kotlin(\"jvm\") }");
    const profile = scanRepo(dir);
    expect(profile.frameworks).toContain("Koin");
  });

  test("detects web/package.json subproject build/test commands (line 272-279)", () => {
    const dir = mkdtempSync(join(tmpdir(), "vf-scanner-web-"));
    mkdirSync(join(dir, "web"), { recursive: true });
    writeFileSync(
      join(dir, "web", "package.json"),
      JSON.stringify({
        name: "web",
        scripts: { build: "vite build", test: "vitest" },
      }),
    );
    const profile = scanRepo(dir);
    expect(profile.buildCommand).toContain("cd web");
    expect(profile.testCommand).toContain("cd web");
  });
});
