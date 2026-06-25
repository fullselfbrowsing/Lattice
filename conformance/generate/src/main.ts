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
// Generation path (Plans 51-02 and 51-03 fill in generate())
// ---------------------------------------------------------------------------
console.log("[generate-vectors] Starting vector regeneration...");

/**
 * Full vector generation logic — implemented in Plans 51-02 (positive vectors)
 * and 51-03 (negative vectors + manifest). Stub only in Plan 51-01.
 */
async function generate(): Promise<void> {
  throw new Error("not yet implemented");
}

await generate();
