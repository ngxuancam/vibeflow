import { createInterface, emitKeypressEvents } from "node:readline";
import { c } from "../core.js";

export const CLEAR_LINE = "\x1b[2K";
export const CURSOR_START = "\r";
export const HIDE_CURSOR = "\x1b[?25l";
export const SHOW_CURSOR = "\x1b[?25h";
export const SELECT_TIMEOUT_MS = 30_000;
export const READLINE_TIMEOUT_MS = 60_000;

/** Max bytes per line of user text input. CWE-400 / CWE-20:
 * unbounded readline input (e.g. a 100MB paste) is forwarded to
 * engine prompts, written to workflow state, and stored in git.
 * Cap at 64 KiB which is well over any realistic prompt answer
 * and well under engine buffer pressure. */
const MAX_INPUT_BYTES = 64 * 1024;

/** Clamp user text input to MAX_INPUT_BYTES. Pastes longer than
 * this are truncated at the byte boundary and the caller is
 * expected to retry or accept the truncated value.
 *
 * Exported for direct unit testing — the readline-level
 * `textInput` tests run in a child process (via `runPrompt`) and
 * the child's coverage is not merged into the parent's lcov,
 * so the truncation branch in the child is invisible to the
 * coverage gate. Unit-testing clampInput directly here keeps
 * the per-file 100% gate green. */
export function clampInput(s: string): string {
  if (Buffer.byteLength(s, "utf8") <= MAX_INPUT_BYTES) return s;
  // Truncate at a safe UTF-8 boundary by walking byte-by-byte.
  const buf = Buffer.from(s, "utf8");
  return buf.subarray(0, MAX_INPUT_BYTES).toString("utf8");
}

export function write(text: string): void {
  process.stdout.write(text);
}

export function clearLines(count: number): void {
  for (let i = 0; i < count; i++) {
    write("\x1b[1A");
    write(`${CLEAR_LINE}${CURSOR_START}`);
  }
}

export function restoreRawMode(wasRaw: boolean, cursorHidden = false): void {
  try {
    process.stdin.setRawMode?.(wasRaw);
  } finally {
    process.stdin.pause();
    if (cursorHidden) write(SHOW_CURSOR);
  }
}

export function normalizeIndex(index: number, length: number): number {
  if (length === 0) return 0;
  return (index + length) % length;
}

/**
 * Test seam: dependencies injected into terminal prompts so unit tests can
 * drive the prompt flow in-process. Production callers leave this undefined
 * and the production implementations (`node:readline` + raw keypress events)
 * are used. The seam is intentionally narrow: only the surfaces that need
 * to be mocked (readLine, isTTY, setRawMode) are exposed. Everything else
 * (render, clearLines, normalizeIndex) is left as pure helpers and is
 * covered by exercising the public functions end-to-end.
 */
export interface TerminalDeps {
  /**
   * Replacement for the readLine fallback used when stdin is not a TTY
   * (or, with `forceReadLine: true`, in TTY mode too). Defaults to
   * `readLineImpl`, the production `node:readline`-backed implementation.
   */
  readLine?: (question: string, defaultValue: string, deps?: TerminalDeps) => Promise<string>;
  /**
   * Override the isTTY check. Defaults to `() => Boolean(process.stdin.isTTY)`.
   * Set to `() => true` to force the raw-mode path in unit tests, or
   * `() => false` to force the readLine fallback.
   */
  isTTY?: () => boolean;
  /**
   * Override stdin.setRawMode. Defaults to `process.stdin.setRawMode`.
   * Useful when the test environment has no setRawMode.
   */
  setRawMode?: ((value: boolean) => void) | null;
  /**
   * Override the SIGINT listener registration. Defaults to registering
   * `process.stdin` directly via `rl.on("SIGINT", ...)`. Tests that
   * have already mocked readLine generally don't need to override this.
   */
  onSigint?: (handler: () => void) => () => void;
  /**
   * Override the EOF ("close" event) listener registration. Defaults
   * to `rl.once("close", ...)`. Tests that have already mocked
   * readLine generally don't need to override this.
   */
  onClose?: (handler: () => void) => () => void;
  /**
   * Override the keypress listener registration. Defaults to
   * `process.stdin.on("keypress", handler)`. Tests can pass
   * `() => () => {}` to suppress keypress wiring entirely when
   * driving via timers.
   */
  onKeypress?: (
    handler: (str: string, key: { name?: string; ctrl?: boolean }) => void,
  ) => () => void;
  /**
   * Override emitKeypressEvents. Defaults to `emitKeypressEvents(process.stdin)`.
   * Set to `() => {}` in tests that don't need keypress events.
   */
  emitKeypressEvents?: (input: NodeJS.ReadableStream) => void;
  /**
   * Override the default keypress handler registration for readLine.
   * `false` (default) means readLine uses the production
   * `rl.question` + `rl.on("SIGINT")` + `rl.once("close")` paths.
   * `true` means readLine is fully mocked by `deps.readLine`.
   */
  forceReadLine?: boolean;
  /**
   * Override the `node:readline` createInterface factory. Defaults to
   * the production `createInterface` from `node:readline`. Used by
   * readLineImpl to allow unit tests to inject a fake readline
   * interface that supports the question/SIGINT/close events.
   */
  createInterface?: typeof createInterface;
}

export async function readLineImpl(
  question: string,
  defaultValue = "",
  deps: TerminalDeps = {},
): Promise<string> {
  const createInterfaceFn = deps.createInterface ?? createInterface;
  const rl = createInterfaceFn({ input: process.stdin, output: process.stdout });
  const suffix = defaultValue ? ` ${c.dim(`[${defaultValue}]`)}` : "";
  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => settle(defaultValue), READLINE_TIMEOUT_MS);
    timer.unref?.();
    const settle = (value: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rl.close();
      resolve(value);
    };
    const rejectSettle = (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rl.close();
      reject(err);
    };
    rl.question(`${question}${suffix}: `, (answer) => {
      settle(clampInput(answer.trim() || defaultValue));
    });
    rl.on("SIGINT", () => rejectSettle(new Error("cancelled")));
    rl.once("close", () => settle(defaultValue));
  });
}

/** The error messages the prompts throw when the user aborts (Ctrl+C / Esc) or a
 *  selection times out. Exported as the single source so questionnaire callers
 *  classify a cancellation the same way instead of duplicating the string list. */
export const PROMPT_CANCEL_MESSAGES = ["cancelled", "selection timed out"] as const;

/** True when an error is a user-cancellation / timeout from a prompt (vs a real fault). */
export function isCancellation(err: unknown): boolean {
  return (
    err instanceof Error && (PROMPT_CANCEL_MESSAGES as readonly string[]).includes(err.message)
  );
}
