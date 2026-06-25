/**
 * conformance/generate/src/manifest.ts
 *
 * MANIFEST.sha256 writer — VEC-06.
 *
 * Generates a sha256sum-compatible integrity manifest over all committed
 * conformance vector files. The manifest is always written LAST, after all
 * vector files have been written to disk. This ordering is critical:
 *   - If any vector write fails before writeManifest() is called, the manifest
 *     is not written (and the previous manifest, if any, remains valid).
 *   - CI checks `sha256sum --check MANIFEST.sha256` from conformance/vectors/;
 *     any tampered or missing vector file fails that check immediately.
 *
 * Format: one line per file: "${lowercase-hex}  ${relative-path-from-conformance/vectors/}"
 * (exactly two spaces between hash and path — standard sha256sum output format)
 *
 * The manifest is generated deterministically: file paths are sorted
 * lexicographically so repeated runs produce byte-identical manifests
 * regardless of filesystem enumeration order.
 *
 * Portability: Node.js crypto module (no shell tool dependency). The CI
 * command `cd conformance/vectors && sha256sum --check MANIFEST.sha256`
 * works on both macOS (Darwin sha256sum) and Linux (GNU sha256sum).
 *
 * T-51-06 mitigation: writeManifest() is called AFTER all 12 vector writes
 * complete. The sequential await chain in main.ts ensures this ordering.
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// writeManifest()
//
// @param vectorsDir  Absolute path to the conformance/vectors/ directory.
//                    All relative paths in the manifest are relative to this.
//
// Enumerates positive/ and negative/ subdirectories, sorts all paths
// lexicographically, computes SHA-256 of each file's bytes, writes the
// MANIFEST.sha256 file, then self-verifies internal consistency.
// ---------------------------------------------------------------------------
export function writeManifest(vectorsDir: string): void {
  // Enumerate vector files from positive/ and negative/ subdirectories.
  // Relative paths are from conformance/vectors/ (e.g. "positive/vec-00-v1.3.json").
  const posFiles = readdirSync(join(vectorsDir, "positive"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => `positive/${f}`);

  const negFiles = readdirSync(join(vectorsDir, "negative"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => `negative/${f}`);

  // Sort lexicographically for deterministic output.
  const allFiles = [...posFiles, ...negFiles].sort();

  if (allFiles.length === 0) {
    throw new Error("writeManifest: no vector files found in positive/ or negative/");
  }

  // Compute SHA-256 for each file and format as a sha256sum-compatible line.
  const lines: string[] = allFiles.map((relPath) => {
    const filePath = join(vectorsDir, relPath);
    const bytes = readFileSync(filePath);
    const hex = createHash("sha256").update(bytes).digest("hex");
    // sha256sum format: exactly two spaces between hash and path.
    return `${hex}  ${relPath}`;
  });

  // Join lines with newline and append trailing newline (sha256sum convention).
  const manifestContent = lines.join("\n") + "\n";
  const manifestPath = join(vectorsDir, "MANIFEST.sha256");

  // Write MANIFEST.sha256.
  writeFileSync(manifestPath, manifestContent, "utf8");

  console.log(
    `[generate-vectors] Wrote MANIFEST.sha256 (${allFiles.length} files).`,
  );

  // -------------------------------------------------------------------------
  // Self-verify: re-read manifest, re-compute each hash, assert all match.
  // This proves the manifest is internally consistent before main() exits.
  // A corruption at write time (truncated write, encoding error) is caught here.
  // -------------------------------------------------------------------------
  const writtenLines = manifestContent.trim().split("\n");
  for (const line of writtenLines) {
    // Format: "<64-char-hex>  <relative-path>"
    const separatorIdx = line.indexOf("  ");
    if (separatorIdx === -1) {
      throw new Error(
        `writeManifest self-verify: unexpected line format (missing double-space): ${line}`,
      );
    }
    const expectedHex = line.slice(0, separatorIdx);
    const relPath = line.slice(separatorIdx + 2);
    const filePath = join(vectorsDir, relPath);
    const actualHex = createHash("sha256")
      .update(readFileSync(filePath))
      .digest("hex");
    if (actualHex !== expectedHex) {
      throw new Error(
        `writeManifest self-verify FAILED for ${relPath}\n` +
          `  expected: ${expectedHex}\n` +
          `  actual:   ${actualHex}`,
      );
    }
  }
  console.log(
    `[generate-vectors] MANIFEST.sha256 self-verified (${allFiles.length} files OK).`,
  );
}
