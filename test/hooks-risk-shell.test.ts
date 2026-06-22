import { describe, expect, test } from "bun:test";
import {
  MAX_UNWRAP_DEPTH,
  anyMatch,
  expandIfs,
  expandSubCommands,
  gitPushForce,
  isRecursiveRm,
  pathArgs,
  programName,
  splitOperators,
  stripQuoteChars,
  stripQuotedContent,
  tokenize,
  unwrapDashC,
  unwrapSubshell,
} from "../src/hooks/risk-shell.js";
import { scoreRisk } from "../src/hooks/risk.js";

// --- anyMatch ---
describe("anyMatch", () => {
  test("true when any pattern matches", () => {
    expect(anyMatch([/foo/, /bar/], "hello foo world")).toBe(true);
  });
  test("false when no pattern matches", () => {
    expect(anyMatch([/foo/, /bar/], "hello world")).toBe(false);
  });
  test("empty patterns returns false", () => {
    expect(anyMatch([], "anything")).toBe(false);
  });
});

// --- tokenize ---
describe("tokenize", () => {
  test("splits on whitespace", () => {
    expect(tokenize("ls -la /tmp")).toEqual(["ls", "-la", "/tmp"]);
  });
  test("trims leading/trailing whitespace", () => {
    expect(tokenize("  echo  hello  ")).toEqual(["echo", "hello"]);
  });
  test("empty string returns empty", () => {
    expect(tokenize("")).toEqual([]);
  });
  test("whitespace-only returns empty", () => {
    expect(tokenize("   ")).toEqual([]);
  });
});

// --- programName ---
describe("programName", () => {
  test("basename of path", () => {
    expect(programName("/usr/bin/rm")).toBe("rm");
    expect(programName("bin/ls")).toBe("ls");
  });
  test("plain name unchanged", () => {
    expect(programName("git")).toBe("git");
  });
  test("undefined returns empty", () => {
    expect(programName(undefined)).toBe("");
  });
  test("empty string returns empty", () => {
    expect(programName("")).toBe("");
  });
});

// --- isRecursiveRm ---
describe("isRecursiveRm", () => {
  test("false when program is not rm", () => {
    expect(isRecursiveRm(["ls", "-r"])).toBe(false);
  });
  test("false when rm has no recursive flag", () => {
    expect(isRecursiveRm(["rm", "foo.txt"])).toBe(false);
  });
  test("true with --recursive", () => {
    expect(isRecursiveRm(["rm", "--recursive", "/"])).toBe(true);
  });
  test("true with -r", () => {
    expect(isRecursiveRm(["rm", "-r", "/tmp"])).toBe(true);
  });
  test("true with -R", () => {
    expect(isRecursiveRm(["rm", "-R", "/tmp"])).toBe(true);
  });
  test("true with -rf", () => {
    expect(isRecursiveRm(["rm", "-rf", "/"])).toBe(true);
  });
  test("false when -f alone (no r/R)", () => {
    expect(isRecursiveRm(["rm", "-f", "file.txt"])).toBe(false);
  });
  test("empty tokens", () => {
    expect(isRecursiveRm([])).toBe(false);
  });
});

// --- gitPushForce ---
describe("gitPushForce", () => {
  test("none when not git", () => {
    expect(gitPushForce(["ls"])).toBe("none");
  });
  test("none when git but not push", () => {
    expect(gitPushForce(["git", "status"])).toBe("none");
  });
  test("none when git push without force flag", () => {
    expect(gitPushForce(["git", "push", "origin", "main"])).toBe("none");
  });
  test("force with -f", () => {
    expect(gitPushForce(["git", "push", "-f", "origin", "main"])).toBe("force");
  });
  test("force with --force", () => {
    expect(gitPushForce(["git", "push", "--force", "origin", "main"])).toBe("force");
  });
  test("lease with --force-with-lease", () => {
    expect(gitPushForce(["git", "push", "--force-with-lease"])).toBe("lease");
  });
  test("lease wins over bare flags when both present", () => {
    // --force-with-lease takes precedence in our check order
    expect(gitPushForce(["git", "push", "--force-with-lease", "-f"])).toBe("lease");
  });
  test("force with short flag cluster containing f", () => {
    expect(gitPushForce(["git", "push", "-fu", "origin", "main"])).toBe("force");
  });
  test("empty tokens returns none", () => {
    expect(gitPushForce([])).toBe("none");
  });
  test("single token returns none", () => {
    expect(gitPushForce(["git"])).toBe("none");
  });
});

// --- pathArgs ---
describe("pathArgs", () => {
  test("returns path-like arguments", () => {
    expect(pathArgs(["rm", "/etc/hosts", "-r"])).toEqual(["/etc/hosts"]);
  });
  test("skips flags", () => {
    expect(pathArgs(["cat", "-n", "/tmp/x"])).toEqual(["/tmp/x"]);
  });
  test("tilde path", () => {
    expect(pathArgs(["cat", "~/file.txt"])).toEqual(["~/file.txt"]);
  });
  test("relative path with slash", () => {
    expect(pathArgs(["cat", "dir/file.txt"])).toEqual(["dir/file.txt"]);
  });
  test("plain words without slash skipped", () => {
    expect(pathArgs(["git", "push", "origin", "main"])).toEqual([]);
  });
});

// --- expandIfs ---
describe("expandIfs", () => {
  test("replaces ${IFS} with space", () => {
    expect(expandIfs("rm${IFS}-rf")).toBe("rm -rf");
  });
  test("replaces $IFS with space", () => {
    expect(expandIfs("rm$IFS-rf")).toBe("rm -rf");
  });
  test("no IFS unchanged", () => {
    expect(expandIfs("rm -rf /")).toBe("rm -rf /");
  });
});

// --- splitOperators ---
describe("splitOperators", () => {
  test("splits on ;", () => {
    expect(splitOperators("echo a; echo b")).toEqual(["echo a", "echo b"]);
  });
  test("splits on |", () => {
    expect(splitOperators("cat x | grep y")).toEqual(["cat x", "grep y"]);
  });
  test("splits on &&", () => {
    expect(splitOperators("make && make install")).toEqual(["make", "make install"]);
  });
  test("splits on ||", () => {
    expect(splitOperators("false || echo fail")).toEqual(["false", "echo fail"]);
  });
  test("does not split operator inside double quotes", () => {
    expect(splitOperators('echo "a;b"')).toEqual(['echo "a;b"']);
  });
  test("does not split operator inside single quotes", () => {
    expect(splitOperators("echo 'a|b'")).toEqual(["echo 'a|b'"]);
  });
  test("splits on newline", () => {
    expect(splitOperators("ls\nrm -rf /")).toEqual(["ls", "rm -rf /"]);
  });
  test("trims whitespace from segments", () => {
    expect(splitOperators("  echo a  ;  echo b  ")).toEqual(["echo a", "echo b"]);
  });
  test("filters empty segments", () => {
    expect(splitOperators("echo a;;echo b")).toEqual(["echo a", "echo b"]);
  });
  test("empty command", () => {
    expect(splitOperators("")).toEqual([]);
  });
});

// --- stripQuotedContent ---
describe("stripQuotedContent", () => {
  test("replaces double-quoted content with spaces", () => {
    const r = stripQuotedContent('echo "hello world" there');
    expect(r).not.toContain("hello");
  });
  test("replaces single-quoted content with spaces", () => {
    const r = stripQuotedContent("echo 'hello world' there");
    expect(r).not.toContain("hello");
  });
  test("leaves unquoted text intact", () => {
    expect(stripQuotedContent("echo hello")).toBe("echo hello");
  });
  test("empty string", () => {
    expect(stripQuotedContent("")).toBe("");
  });
});

// --- stripQuoteChars ---
describe("stripQuoteChars", () => {
  test("replaces quote chars with space", () => {
    expect(stripQuoteChars("echo 'hello'")).toBe("echo  hello ");
  });
  test("handles double quotes", () => {
    expect(stripQuoteChars('echo "hello"')).toBe("echo  hello ");
  });
  test("no quotes unchanged", () => {
    expect(stripQuoteChars("echo hello")).toBe("echo hello");
  });
});

// --- unwrapDashC ---
describe("unwrapDashC", () => {
  test("extracts -c payload with double quotes", () => {
    expect(unwrapDashC('bash -c "rm -rf /"')).toEqual(["rm -rf /"]);
  });
  test("extracts -c payload with single quotes", () => {
    expect(unwrapDashC("sh -c 'rm -rf /'")).toEqual(["rm -rf /"]);
  });
  test("no -c returns empty", () => {
    expect(unwrapDashC("ls -la")).toEqual([]);
  });
  test("empty segment returns empty", () => {
    expect(unwrapDashC("")).toEqual([]);
  });
});

// --- unwrapSubshell ---
describe("unwrapSubshell", () => {
  test("extracts $() body", () => {
    expect(unwrapSubshell("echo $(ls)")).toEqual(["ls"]);
  });
  test("extracts backtick body", () => {
    expect(unwrapSubshell("echo `ls`")).toEqual(["ls"]);
  });
  test("returns empty for no subshell", () => {
    expect(unwrapSubshell("echo hello")).toEqual([]);
  });
  test("empty segment", () => {
    expect(unwrapSubshell("")).toEqual([]);
  });
});

// --- MAX_UNWRAP_DEPTH ---
describe("MAX_UNWRAP_DEPTH", () => {
  test("is 4", () => {
    expect(MAX_UNWRAP_DEPTH).toBe(4);
  });
});

// --- expandSubCommands ---
describe("expandSubCommands", () => {
  test("simple command returned as-is", () => {
    expect(expandSubCommands("echo hello")).toEqual(["echo hello"]);
  });
  test("splits on operators", () => {
    const r = expandSubCommands("ls; rm -rf /");
    expect(r).toContain("ls");
    expect(r).toContain("rm -rf /");
  });
  test("expands $IFS", () => {
    const r = expandSubCommands("rm${IFS}-rf /");
    expect(r).toContain("rm -rf /");
  });
  test("unwraps -c payload", () => {
    const r = expandSubCommands('bash -c "rm -rf /"');
    expect(r).toContain("rm -rf /");
  });
  test("unwraps $() subshell", () => {
    const r = expandSubCommands("echo $(rm -rf /)");
    expect(r).toContain("rm -rf /");
  });
  test("unwraps backtick subshell", () => {
    const r = expandSubCommands("echo `rm -rf /`");
    expect(r).toContain("rm -rf /");
  });
  test("respects depth limit", () => {
    // Craft deep nesting that would exceed MAX_UNWRAP_DEPTH
    // but still finishes (doesn't stack overflow)
    const deep =
      'bash -c "bash -c \\"bash -c \\\\\\"bash -c \\\\\\\\\\"bash -c \\\\\\\\\\\\\\"rm -rf /\\\\\\\\\\\\\\"\\\\\\\\\\"\\\\\\"\\""';
    const r = expandSubCommands(deep);
    expect(r.length).toBeGreaterThanOrEqual(1);
  });
});

// --- Behavior sanity: scoreRisk still classifies the same ---
describe("split regression: scoreRisk classification unchanged", () => {
  test("rm -rf / still critical", () => {
    const r = scoreRisk({ event: "pre-command", command: "rm -rf /" });
    expect(r.risk).toBe("critical");
  });
  test("git push --force still critical", () => {
    const r = scoreRisk({ event: "pre-command", command: "git push --force origin main" });
    expect(r.risk).toBe("critical");
  });
  test("git push --force-with-lease still high", () => {
    const r = scoreRisk({
      event: "pre-command",
      command: "git push --force-with-lease origin main",
    });
    expect(r.risk).toBe("high");
  });
  test("safe command still low", () => {
    const r = scoreRisk({ event: "pre-command", command: "ls -la" });
    expect(["none", "low"]).toContain(r.risk);
  });
  test("cat .env still critical", () => {
    const r = scoreRisk({ event: "pre-command", command: "cat .env" });
    expect(r.risk).toBe("critical");
  });
});
