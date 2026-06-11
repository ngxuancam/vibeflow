#!/usr/bin/env bun
/**
 * One-shot driver: apply runCodemod to the two target files and write them back.
 * Not part of the ship — only used by M1.5 to apply the approved codemod.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { runCodemod } from "./codemod-console-to-out.js";

const TARGETS = ["src/commands.ts", "src/cli.ts"];
for (const file of TARGETS) {
  const before = readFileSync(file, "utf8");
  const after = runCodemod(before, file);
  writeFileSync(file, after);
  console.log(`✓ ${file}: ${before.length} → ${after.length} bytes`);
}
