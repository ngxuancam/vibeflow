import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";

/** A structured, evidence-based read of a repository's stack and tooling. */
export interface ProjectProfile {
  name: string;
  summary?: string;
  languages: string[];
  packageManager?: string;
  buildCommand?: string;
  testCommand?: string;
  lintCommand?: string;
  frameworks: string[];
  hasCI: boolean;
  manifests: string[];
}

const EXT_LANG: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".py": "Python",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java",
  ".kt": "Kotlin",
  ".rb": "Ruby",
  ".php": "PHP",
  ".cs": "C#",
  ".swift": "Swift",
  ".c": "C",
  ".cpp": "C++",
  ".sh": "Shell",
};

const FRAMEWORK_HINTS: Array<[string, string]> = [
  ["next", "Next.js"],
  ["react", "React"],
  ["vue", "Vue"],
  ["svelte", "Svelte"],
  ["@angular/core", "Angular"],
  ["express", "Express"],
  ["fastify", "Fastify"],
  ["nestjs", "NestJS"],
  ["@nestjs/core", "NestJS"],
  ["django", "Django"],
  ["flask", "Flask"],
  ["fastapi", "FastAPI"],
  ["gin-gonic", "Gin"],
  ["actix", "Actix"],
  ["spring-boot", "Spring Boot"],
];

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  "target",
  "vendor",
  "__pycache__",
  ".venv",
  "coverage",
]);

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** First non-empty, non-heading line of the README, used as a one-line summary. */
function readmeSummary(repo: string): string | undefined {
  for (const n of ["README.md", "README.MD", "readme.md", "README"]) {
    const p = join(repo, n);
    if (!existsSync(p)) continue;
    try {
      const lines = readFileSync(p, "utf8").split("\n");
      for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith("#") || line.startsWith("![") || line.startsWith("<"))
          continue;
        return line.replace(/^[*_>-]+\s*/, "").slice(0, 240);
      }
    } catch {
      /* ignore */
    }
    return undefined;
  }
  return undefined;
}

/** Sample top-level file extensions (depth 2, capped) to infer languages. */
function detectLanguages(repo: string): string[] {
  const counts = new Map<string, number>();
  let seen = 0;
  const walk = (dir: string, depth: number) => {
    if (depth > 2 || seen > 4000) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.startsWith(".") || SKIP_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      let st: ReturnType<typeof statSync>;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(full, depth + 1);
      } else {
        seen++;
        const lang = EXT_LANG[extname(entry).toLowerCase()];
        if (lang) counts.set(lang, (counts.get(lang) ?? 0) + 1);
      }
    }
  };
  walk(repo, 0);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([lang]) => lang);
}

function detectPackageManager(repo: string): string | undefined {
  if (existsSync(join(repo, "bun.lock")) || existsSync(join(repo, "bun.lockb"))) return "bun";
  if (existsSync(join(repo, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(repo, "yarn.lock"))) return "yarn";
  if (existsSync(join(repo, "package-lock.json"))) return "npm";
  if (existsSync(join(repo, "poetry.lock"))) return "poetry";
  if (existsSync(join(repo, "Cargo.lock"))) return "cargo";
  if (existsSync(join(repo, "go.sum"))) return "go";
  return undefined;
}

function hasCI(repo: string): boolean {
  return (
    existsSync(join(repo, ".github", "workflows")) ||
    existsSync(join(repo, ".gitlab-ci.yml")) ||
    existsSync(join(repo, ".circleci")) ||
    existsSync(join(repo, "azure-pipelines.yml"))
  );
}

/**
 * Scan a repository and return an evidence-based profile. Pure read-only:
 * inspects manifests, lockfiles, README, CI config, and a capped file sample.
 */
export function scanRepo(repo: string): ProjectProfile {
  const manifests: string[] = [];
  const frameworks = new Set<string>();
  let packageManager = detectPackageManager(repo);
  let buildCommand: string | undefined;
  let testCommand: string | undefined;
  let lintCommand: string | undefined;
  let name = basename(repo);

  const pkgPath = join(repo, "package.json");
  if (existsSync(pkgPath)) {
    manifests.push("package.json");
    const pkg = readJson(pkgPath);
    if (pkg) {
      if (typeof pkg.name === "string" && pkg.name) name = pkg.name;
      const scripts = (pkg.scripts ?? {}) as Record<string, string>;
      const runner = packageManager ?? "npm";
      const run = (s: string) => (runner === "npm" ? `npm run ${s}` : `${runner} run ${s}`);
      if (scripts.build) buildCommand = run("build");
      if (scripts.test) testCommand = run("test");
      if (scripts.lint) lintCommand = run("lint");
      const deps = {
        ...((pkg.dependencies as Record<string, string>) ?? {}),
        ...((pkg.devDependencies as Record<string, string>) ?? {}),
      };
      for (const [dep, fw] of FRAMEWORK_HINTS) if (deps[dep]) frameworks.add(fw);
      packageManager = packageManager ?? "npm";
    }
  }
  for (const [file, lang] of [
    ["pyproject.toml", "Python"],
    ["requirements.txt", "Python"],
    ["go.mod", "Go"],
    ["Cargo.toml", "Rust"],
    ["pom.xml", "Java"],
    ["build.gradle", "Java"],
    ["Gemfile", "Ruby"],
  ] as const) {
    if (existsSync(join(repo, file))) {
      manifests.push(file);
      const txt = (() => {
        try {
          return readFileSync(join(repo, file), "utf8");
        } catch {
          return "";
        }
      })();
      for (const [dep, fw] of FRAMEWORK_HINTS) if (txt.includes(dep)) frameworks.add(fw);
      void lang;
    }
  }

  return {
    name,
    summary: readmeSummary(repo),
    languages: detectLanguages(repo),
    packageManager,
    buildCommand,
    testCommand,
    lintCommand,
    frameworks: [...frameworks],
    hasCI: hasCI(repo),
    manifests,
  };
}

/** Render a profile into markdown bullet lines for PROJECT_CONTEXT.md. */
export function summarizeProfile(p: ProjectProfile): string {
  const lines: string[] = [];
  if (p.languages.length) lines.push(`- Languages: ${p.languages.join(", ")}`);
  if (p.frameworks.length) lines.push(`- Frameworks: ${p.frameworks.join(", ")}`);
  if (p.packageManager) lines.push(`- Package manager: ${p.packageManager}`);
  if (p.buildCommand) lines.push(`- Build: \`${p.buildCommand}\``);
  if (p.testCommand) lines.push(`- Test: \`${p.testCommand}\``);
  if (p.lintCommand) lines.push(`- Lint: \`${p.lintCommand}\``);
  if (p.manifests.length) lines.push(`- Manifests: ${p.manifests.join(", ")}`);
  lines.push(`- CI configured: ${p.hasCI ? "yes" : "no"}`);
  return lines.join("\n");
}
