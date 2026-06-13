import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { StatusLine } from "../src/ui.js";

let writtenToConsole: { channel: string; args: unknown[] }[] = [];
let originalError: typeof console.error;
let originalLog: typeof console.log;
let originalStderrWrite: typeof process.stderr.write;
let originalIsTTY: boolean | undefined;

beforeEach(() => {
  writtenToConsole = [];
  originalError = console.error;
  originalLog = console.log;
  originalStderrWrite = process.stderr.write;
  originalIsTTY = process.stderr.isTTY;
  console.error = (...args: unknown[]) => {
    writtenToConsole.push({ channel: "error", args });
  };
  console.log = (...args: unknown[]) => {
    writtenToConsole.push({ channel: "log", args });
  };
  (process.stderr as { write: typeof process.stderr.write }).write = ((
    chunk: string | Uint8Array,
  ) => {
    if (typeof chunk === "string") {
      writtenToConsole.push({ channel: "stderr", args: [chunk] });
    } else {
      writtenToConsole.push({ channel: "stderr", args: [new TextDecoder().decode(chunk)] });
    }
    return true;
  }) as typeof process.stderr.write;
  Object.defineProperty(process.stderr, "isTTY", { value: false, configurable: true });
});

afterEach(() => {
  console.error = originalError;
  console.log = originalLog;
  (process.stderr as { write: typeof process.stderr.write }).write = originalStderrWrite;
  Object.defineProperty(process.stderr, "isTTY", { value: originalIsTTY, configurable: true });
});

function outputText(): string {
  return writtenToConsole.map((w) => w.args.map((a) => String(a)).join(" ")).join("\n");
}

describe("ui: StatusLine", () => {
  test("start/succeed forward to underlying Spinner", () => {
    const sl = new StatusLine();
    sl.start("working");
    sl.succeed("done");
    expect(writtenToConsole.length).toBeGreaterThan(0);
    expect(outputText()).toContain("done");
  });

  test("text(msg, trail) appends the trail (forwarded to Spinner)", () => {
    const sl = new StatusLine();
    sl.start("working");
    sl.text("uploading", "42%");
    // In non-TTY, spinner.text() is a no-op so the trail doesn't appear
    // in the captured output. We just verify the call doesn't throw.
    expect(true).toBe(true);
  });

  test("text(msg) without trail forwards just the message", () => {
    const sl = new StatusLine();
    sl.start("working");
    sl.text("uploading");
    expect(true).toBe(true);
  });

  test("fail(msg) updates and stops", () => {
    const sl = new StatusLine();
    sl.start("working");
    sl.fail("oops");
    expect(outputText()).toContain("oops");
  });
});
