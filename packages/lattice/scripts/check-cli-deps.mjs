#!/usr/bin/env node
/**
 * Phase 11 depcheck gate (CLI-06).
 *
 * Asserts that the BUILT lattice runtime (packages/lattice/dist/*.js) does NOT
 * reference any CLI-only dependency. Run after `pnpm --filter @full-self-browsing/lattice build`.
 *
 * Forbidden runtime imports (must stay in packages/lattice-cli only):
 *   - citty, commander, cac, yargs
 *
 * Exit codes:
 *   0 — runtime is clean
 *   1 — a forbidden symbol was found; prints the offending file + match
 *
 * This guards against a future refactor that accidentally moves a CLI helper
 * into the runtime package. CONTEXT.md locked: lattice MUST NOT depend on
 * CLI-only deps.
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const distDir = join(here, "..", "dist");
const FORBIDDEN = ["citty", "commander", "cac", "yargs"];

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && /\.(js|mjs|cjs|d\.ts)$/.test(entry.name)) yield full;
  }
}

const offenders = [];
try {
  for await (const file of walk(distDir)) {
    const text = await readFile(file, "utf8");
    for (const sym of FORBIDDEN) {
      // Match `from "citty"` / `require("citty")` / `import("citty")`.
      // Avoid false positives on substrings inside larger words (e.g. "velocity").
      const re = new RegExp(`(from|require|import)\\s*\\(?\\s*["']${sym}["']`);
      if (re.test(text)) offenders.push({ file, sym });
    }
  }
} catch (err) {
  if (err && err.code === "ENOENT") {
    console.error(`[check-cli-deps] dist directory not found at ${distDir}. Run \`pnpm --filter @full-self-browsing/lattice build\` first.`);
    process.exit(1);
  }
  throw err;
}

if (offenders.length > 0) {
  console.error("[check-cli-deps] FAIL — lattice runtime imports forbidden CLI-only deps:");
  for (const { file, sym } of offenders) console.error(`  ${file}  ->  ${sym}`);
  process.exit(1);
}
console.log(`[check-cli-deps] OK — no forbidden CLI deps found in ${distDir}.`);
