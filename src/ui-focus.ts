import { spawnSync } from "node:child_process";

/** Raise the controlling terminal so a screen recording shows the run. macOS only; no-op otherwise. */
export function focusTerminal(
  inject: {
    platform?: string;
    run?: (cmd: string, args: string[]) => void;
    termProgram?: string;
  } = {},
): void {
  const platform = inject.platform ?? process.platform;
  if (platform !== "darwin") return;
  const run =
    inject.run ??
    ((c, a) => {
      spawnSync(c, a, { stdio: "ignore" });
    });
  const termProgram = inject.termProgram ?? process.env.TERM_PROGRAM;
  const app = termProgram === "iTerm.app" ? "iTerm" : "Terminal";
  run("osascript", ["-e", `tell application "${app}" to activate`]);
}

/** Guard: focus=false or non-TTY → no-op. Calls focusTerminal only when both conditions hold. */
export function maybeFocus(
  flags: { focus?: boolean; isTTY?: boolean },
  inject?: Parameters<typeof focusTerminal>[0],
): void {
  if (flags.focus !== true || flags.isTTY !== true) return;
  focusTerminal(inject);
}
