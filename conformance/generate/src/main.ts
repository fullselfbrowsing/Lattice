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
import { generateNegativeVectors } from "./negative.js";
import { writeManifest } from "./manifest.js";

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
 * Order of operations (Plan 51-03 final pipeline):
 *   1. RFC 8785 cross-checks (VEC-05) — MUST pass before any file writes.
 *      A wrong §3.2.4 hex constant or library regression throws immediately.
 *   2. Create output directories (idempotent).
 *   3. Generate positive vectors (v1.3 vec-00, v1.1 vec-01, v1.2 vec-02).
 *      The vec-00 byte-identity assertion runs inside generatePositiveVectors().
 *   4. Write positive vector files.
 *   5. Generate negative vectors (9 adversarial constructions covering all 7 VerifyErrorKind).
 *   6. Write negative vector files.
 *   7. Write MANIFEST.sha256 (LAST — after ALL 12 vector files are on disk).
 *      T-51-06: if any write fails before step 7, manifest is not written.
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

  console.log(`[generate-vectors] Wrote ${positiveVectors.length} positive vectors.`);

  // Step 5: Generate negative vectors (VEC-04 — 9 constructions, all 7 kinds)
  const negativeVectors = await generateNegativeVectors();

  // Step 6: Write negative vector files
  // File names follow the plan spec exactly:
  const negativeFilenames = [
    "neg-01-envelope-malformed.json",
    "neg-02-version-mismatch.json",
    "neg-03a-schema-version-too-low-v1.json",
    "neg-03b-schema-version-too-low-absent.json",
    "neg-04-key-not-found.json",
    "neg-05-key-revoked.json",
    "neg-06-canonicalization-mismatch.json",
    "neg-07-signature-invalid-bad-sig.json",
    "neg-08-signature-invalid-kid-mismatch.json",
  ];

  for (let i = 0; i < negativeVectors.length; i++) {
    const vec = negativeVectors[i];
    const filename = negativeFilenames[i];
    if (vec === undefined || filename === undefined) continue;
    const outPath = join(VECTORS_DIR, "negative", filename);
    writeFileSync(outPath, JSON.stringify(vec, null, 2) + "\n", "utf8");
    console.log(`[generate-vectors] Wrote: conformance/vectors/negative/${filename}`);
  }

  console.log(`[generate-vectors] Wrote ${negativeVectors.length} negative vectors.`);

  // Step 7: Write MANIFEST.sha256 — LAST (T-51-06: only after all 12 files exist).
  // writeManifest() self-verifies consistency before returning.
  writeManifest(VECTORS_DIR);

  console.log(
    `[generate-vectors] Complete: ${positiveVectors.length} positive + ${negativeVectors.length} negative vectors written, MANIFEST.sha256 verified.`,
  );
}

await generate();
