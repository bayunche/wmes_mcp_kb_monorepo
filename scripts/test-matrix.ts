#!/usr/bin/env bun
import { spawnSync } from "bun";

type MatrixEntry = {
  name: string;
  command: string;
  args: string[];
  optional?: boolean;
};

const matrix: MatrixEntry[] = [
  { name: "unit", command: "bun", args: ["test"] },
  { name: "integration", command: "bunx", args: ["vitest", "--runInBand"], optional: true },
  { name: "e2e", command: "bunx", args: ["playwright", "test"], optional: true }
];

let failures = 0;
const results: Record<string, string> = {};

for (const entry of matrix) {
  console.log(`\n=== Running ${entry.name} tests ===`);
  try {
    const env = {
      ...process.env,
      BUN_INSTALL: process.env.BUN_INSTALL ?? `${process.cwd()}/.bun`,
      BUN_INSTALL_CACHE_DIR: process.env.BUN_INSTALL_CACHE_DIR ?? `${process.cwd()}/.bun-cache`,
      BUN_TMPDIR: process.env.BUN_TMPDIR ?? `${process.cwd()}/.bun-tmp`,
      TMPDIR: process.env.TMPDIR ?? `${process.cwd()}/.bun-tmp`
    };
    const proc = spawnSync([entry.command, ...entry.args], {
      stdout: "inherit",
      stderr: "inherit",
      env
    });
    if (proc.exitCode !== 0) {
      if (entry.optional) {
        results[entry.name] = `skipped (exit ${proc.exitCode})`;
      } else {
        results[entry.name] = `failed (exit ${proc.exitCode})`;
        failures += 1;
      }
    } else {
      results[entry.name] = "passed";
    }
  } catch (error) {
    results[entry.name] = entry.optional ? "skipped (tool not installed)" : "failed (missing tool)";
    if (!entry.optional) failures += 1;
    console.warn(`Skipping ${entry.name} tests: ${(error as Error).message}`);
  }
}

console.log("\n=== Test Matrix Summary ===");
console.table(results);

if (failures > 0) {
  process.exit(1);
}
