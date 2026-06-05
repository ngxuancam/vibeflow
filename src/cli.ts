import { spawn } from "node:child_process";
import {
  doctor,
  hooks,
  init,
  initInteractive,
  printHelp,
  printVersion,
  run,
  skills,
  units,
  verify,
} from "./commands.js";
import { c, parseFlags } from "./core.js";
import { startServer } from "./server.js";

function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    spawn(cmd, [url], {
      stdio: "ignore",
      detached: true,
      shell: process.platform === "win32",
    }).unref();
  } catch {
    /* opening the browser is best-effort */
  }
}

async function ui(flags: Record<string, string | boolean>): Promise<number> {
  const port = typeof flags.port === "string" ? Number(flags.port) : 0;
  const { url } = await startServer(Number.isFinite(port) ? port : 0);
  if (!flags["no-open"]) openBrowser(url);
  return await new Promise<number>(() => {
    /* keep the process alive until Ctrl+C */
  });
}

async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  const { positionals, flags } = parseFlags(rest);

  if (flags.version || cmd === "--version" || cmd === "-v") return printVersion();
  if (cmd === "help" || flags.help || cmd === "-h") return printHelp();

  switch (cmd) {
    case undefined:
    case "ui":
      return await ui(flags);
    case "doctor":
      return doctor();
    case "init":
      if (flags.interactive && process.stdin.isTTY) return await initInteractive(flags);
      return init(flags);
    case "run":
      return run(positionals[0], flags);
    case "units":
      return units(positionals[0], positionals.slice(1));
    case "skills":
      return skills(positionals[0]);
    case "hooks":
      return hooks(positionals[0]);
    case "verify":
      return verify();
    default:
      console.error(c.red(`Unknown command: ${cmd}`));
      printHelp();
      return 2;
  }
}

main(process.argv.slice(2))
  .then((code) => {
    if (code) process.exitCode = code;
  })
  .catch((err) => {
    console.error(c.red(String(err?.stack ?? err)));
    process.exitCode = 1;
  });
