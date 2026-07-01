/**
 * conformance/verify-ts/src/manifest.test.ts
 *
 * MANIFEST.sha256 self-check — VEC-06 / TSCONF-01 defense-in-depth.
 *
 * Independently recomputes SHA-256 over every file listed in
 * conformance/vectors/MANIFEST.sha256 and asserts it matches the committed
 * hex value. This is the READ-SIDE of the exact self-verify algorithm
 * conformance/generate/src/manifest.ts already proves on the WRITE side
 * (writeManifest()'s self-verify loop, lines 86-108).
 *
 * This file naturally sorts first alphabetically in vitest's default
 * `include` glob (manifest.test.ts < negative.test.ts < positive.test.ts),
 * satisfying the locked CONTEXT.md decision that this check "runs as its
 * first test" — a tampered vector file fails immediately rather than
 * silently validating the reference implementation against corrupted
 * expected values (T-52-01 mitigation).
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// conformance/verify-ts/src -> conformance/vectors
const VECTORS_DIR = join(__dirname, "..", "..", "vectors");
const MANIFEST_PATH = join(VECTORS_DIR, "MANIFEST.sha256");

interface ManifestLine {
  readonly expectedHex: string;
  readonly relPath: string;
}

function parseManifestLines(content: string): ManifestLine[] {
  return content
    .trim()
    .split("\n")
    .map((line) => {
      // Format: "<64-char-lowercase-hex>  <relative-path>" — exactly two
      // ASCII spaces, matching conformance/generate/src/manifest.ts's
      // sha256sum-compatible output format.
      const separatorIdx = line.indexOf("  ");
      if (separatorIdx === -1) {
        throw new Error(
          `manifest.test.ts: unexpected line format (missing double-space): ${line}`,
        );
      }
      return {
        expectedHex: line.slice(0, separatorIdx),
        relPath: line.slice(separatorIdx + 2),
      };
    });
}

describe("MANIFEST.sha256 self-check", () => {
  const manifestContent = readFileSync(MANIFEST_PATH, "utf8");
  const lines = parseManifestLines(manifestContent);

  it.each(lines)(
    "$relPath matches its committed SHA-256",
    ({ expectedHex, relPath }: ManifestLine) => {
      const bytes = readFileSync(join(VECTORS_DIR, relPath));
      const actualHex = createHash("sha256").update(bytes).digest("hex");
      expect(actualHex).toBe(expectedHex);
    },
  );
});
