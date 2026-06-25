/**
 * conformance/generate/src/main.ts
 *
 * Entry point for the conformance vector generator.
 *
 * INVOCATION GATE (VEC-02 / T-51-02):
 *   Running this script without `--regen-vectors` is a NO-OP: it logs a
 *   message and exits 0 without writing any files to conformance/vectors/.
 *   This prevents accidental regeneration at CI time — `pnpm -r build` and
 *   `pnpm -r test` cannot trigger the generator.
 *
 *   To regenerate committed vectors:
 *     pnpm --filter @lattice-conformance/generate run generate
 *   which expands to:
 *     tsx src/main.ts --regen-vectors
 */

import process from "node:process";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { runRFC8785CrossChecks } from "./rfc8785-check.js";
import { generatePositiveVectors } from "./positive.js";

// ---------------------------------------------------------------------------
// Flag gate — VEC-02 no-op path
// ---------------------------------------------------------------------------
if (!process.argv.includes("--regen-vectors")) {
  console.log(
    "[generate-vectors] No-op: pass --regen-vectors to regenerate committed vectors.",
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Derive the vectors output directory relative to this file.
// conformance/generate/src/ -> conformance/generate/ -> conformance/ -> conformance/vectors/
// ---------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// src/ -> generate/ -> conformance/ -> repo root -> conformance/vectors/
const VECTORS_DIR = join(__dirname, "..", "..", "vectors");

// ---------------------------------------------------------------------------
// Generation path
// ---------------------------------------------------------------------------
console.log("[generate-vectors] Starting vector regeneration...");

/**
 * Full vector generation logic.
 *
 * Order of operations:
 *   1. RFC 8785 cross-checks (VEC-05) — MUST pass before any file writes.
 *      A wrong §3.2.4 hex constant or library regression throws immediately.
 *   2. Create output directories (idempotent).
 *   3. Generate positive vectors (v1.3 vec-00, v1.1 vec-01, v1.2 vec-02).
 *      The vec-00 byte-identity assertion runs inside generatePositiveVectors().
 *   4. Write positive vector files.
 *   5. Log summary.
 *
 * Negative vectors + manifest will be added in Plan 51-03.
 */
async function generate(): Promise<void> {
  // Step 1: RFC 8785 cross-checks — fail fast before any file writes (VEC-05)
  runRFC8785CrossChecks();

  // Step 2: Create output directories (recursive = no-op if already exists)
  mkdirSync(join(VECTORS_DIR, "positive"), { recursive: true });
  mkdirSync(join(VECTORS_DIR, "negative"), { recursive: true });

  // Step 3: Generate positive vectors
  const positiveVectors = await generatePositiveVectors();

  // Step 4: Write positive vector files
  // File names: vec-00-v1.3.json, vec-01-v1.1.json, vec-02-v1.2.json
  const positiveFilenames = [
    "vec-00-v1.3.json",
    "vec-01-v1.1.json",
    "vec-02-v1.2.json",
  ];

  for (let i = 0; i < positiveVectors.length; i++) {
    const vec = positiveVectors[i];
    const filename = positiveFilenames[i];
    if (vec === undefined || filename === undefined) continue;
    const outPath = join(VECTORS_DIR, "positive", filename);
    writeFileSync(outPath, JSON.stringify(vec, null, 2) + "\n", "utf8");
    console.log(`[generate-vectors] Wrote: conformance/vectors/positive/${filename}`);
  }

  // Step 5: Log summary
  console.log(`[generate-vectors] Wrote ${positiveVectors.length} positive vectors.`);
  console.log("[generate-vectors] Negative vectors: pending (Plan 03).");
}

await generate();
