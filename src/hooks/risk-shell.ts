import { isAbsolute } from "node:path";

export function anyMatch(patterns: RegExp[], value: string): boolean {
  return patterns.some((re) => re.test(value));
}

/** Split a shell command into whitespace-separated tokens. */
export function tokenize(cmd: string): string[] {
  return cmd.trim().split(/\s+/).filter(Boolean);
}

/** Basename of a program token (`/bin/rm` → `rm`). */
export function programName(token: string | undefined): string {
  if (!token) return "";
  const parts = token.split("/");
  return parts[parts.length - 1] ?? "";
}

/** True when an `rm` invocation deletes recursively (the dangerous mode). */
export function isRecursiveRm(tokens: string[]): boolean {
  if (programName(tokens[0]) !== "rm") return false;
  return tokens.slice(1).some((t) => {
    if (t === "--recursive") return true;
    // short flag cluster containing r or R, e.g. -r, -R, -rf, -fr, -Rf
    return /^-[a-z]*[rR][a-z]*$/i.test(t);
  });
}

export type ForceKind = "none" | "force" | "lease";

/** Classify a `git push` force flag: hard force (critical) vs --force-with-lease (safer). */
export function gitPushForce(tokens: string[]): ForceKind {
  if (programName(tokens[0]) !== "git" || tokens[1] !== "push") return "none";
  const rest = tokens.slice(2);
  if (rest.some((t) => t === "--force-with-lease")) return "lease";
  if (rest.some((t) => t === "-f" || t === "--force" || /^-[a-z]*f[a-z]*$/i.test(t)))
    return "force";
  return "none";
}

/** Path-like argument tokens (skip flags and plain words like subcommands). */
export function pathArgs(tokens: string[]): string[] {
  return tokens
    .slice(1)
    .filter((t) => !t.startsWith("-") && (t.includes("/") || t.startsWith("~") || isAbsolute(t)));
}

/** Expand the `$IFS` / `${IFS}` field-separator trick back to literal spaces. */
export function expandIfs(cmd: string): string {
  return cmd.replace(/\$\{IFS\}/g, " ").replace(/\$IFS\b/g, " ");
}

/**
 * Split a command on UNQUOTED shell operators (`;`, `&&`, `||`, `|`) into segments. Quote
 * state is tracked so an operator inside a string is not a split point.
 */
export function splitOperators(cmd: string): string[] {
  const segments: string[] = [];
  let buf = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (quote) {
      buf += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === ";" || ch === "|" || ch === "&" || ch === "\n") {
      segments.push(buf);
      buf = "";
      if (cmd[i + 1] === ch) i++; // collapse doubled operators (&& / ||)
      continue;
    }
    buf += ch;
  }
  segments.push(buf);
  return segments.map((s) => s.trim()).filter(Boolean);
}

/**
 * Replace the CONTENT inside quotes with spaces, keeping structure. Backslash escapes are
 * intentionally NOT honored: a crafted escaped quote surfaces MORE text (fail-safe toward
 * over-blocking), never hides a destructive payload. Used for the destructive-regex check so a
 * quoted commit message (`-m "drop table users"`) cannot trip it.
 */
export function stripQuotedContent(cmd: string): string {
  let out = "";
  let quote: string | null = null;
  for (const ch of cmd) {
    if (quote) {
      if (ch === quote) {
        quote = null;
        out += " ";
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += " ";
      continue;
    }
    out += ch;
  }
  return out;
}

/** Remove quote characters (keeping their content) so a sub-command tokenizes cleanly. */
export function stripQuoteChars(cmd: string): string {
  return cmd.replace(/['"]/g, " ");
}

/** Unwrap `bash -c "<payload>"` / `sh -c '<payload>'` / bare `-c "<payload>"` inline scripts. */
export function unwrapDashC(segment: string): string[] {
  const out: string[] = [];
  for (const m of segment.matchAll(/(?:^|\s)-c\s+(['"])([\s\S]*?)\1/g)) {
    if (m[2]) out.push(m[2]);
  }
  return out;
}

/** Surface the inner bodies of `$(...)` and backtick command substitutions as commands. */
export function unwrapSubshell(segment: string): string[] {
  const out: string[] = [];
  for (const m of segment.matchAll(/\$\(([^()]*)\)/g)) {
    const inner = m[1]?.trim();
    if (inner) out.push(inner);
  }
  for (const m of segment.matchAll(/`([^`]*)`/g)) {
    const inner = m[1]?.trim();
    if (inner) out.push(inner);
  }
  return out;
}

/** Bound on wrapper/subshell unwrap recursion (defense-in-depth against crafted nesting). */
export const MAX_UNWRAP_DEPTH = 4;

/**
 * Expand a raw command into the list of sub-commands whose tokens must be scored: expand the
 * `$IFS` trick, split on unquoted operators, then recursively surface inline `-c` payloads and
 * `$(...)`/backtick bodies (bounded). Each sub-command is run through the existing token checks
 * so wrapper-based evasions (`bash -c "rm -rf /"`, `$(rm -rf /)`, `a | rm -rf x`) are caught.
 */
export function expandSubCommands(raw: string): string[] {
  const collected = new Set<string>();
  const visit = (cmd: string, depth: number): void => {
    for (const segment of splitOperators(cmd)) {
      collected.add(segment);
      if (depth >= MAX_UNWRAP_DEPTH) continue;
      for (const inner of [...unwrapDashC(segment), ...unwrapSubshell(segment)]) {
        visit(inner, depth + 1);
      }
    }
  };
  visit(expandIfs(raw), 0);
  return [...collected];
}
