import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  collectAggregatePaths,
  parseManifest,
  verifyAggregateManifest,
  verifyLegacyManifest,
} from "../../generate/src/manifest.js";

const sourceDir = dirname(fileURLToPath(import.meta.url));
const vectorsRoot = resolve(sourceDir, "..", "..", "vectors");
const aggregatePath = join(vectorsRoot, "MANIFEST.sha256");
const legacyManifestPath = join(vectorsRoot, "legacy", "MANIFEST.sha256");
const frozenLegacyManifestHash =
  "4b3b7c7558298d7286de66a25f8ffa55bf5c7bbf532bbbd67ec227fbc3af0aca";

describe("profile corpus manifests", () => {
  it("verifies exact aggregate and nested legacy coverage", () => {
    expect(() => verifyLegacyManifest(vectorsRoot)).not.toThrow();
    expect(() => verifyAggregateManifest(vectorsRoot)).not.toThrow();

    const entries = parseManifest(readFileSync(aggregatePath, "utf8"));
    expect(entries.map((entry) => entry.path)).toEqual(
      collectAggregatePaths(vectorsRoot),
    );
    expect(entries).toHaveLength(28);
  });

  it("pins the immutable nested legacy manifest bytes", () => {
    const bytes = readFileSync(legacyManifestPath);
    const actual = createHash("sha256").update(bytes).digest("hex");
    expect(actual).toBe(frozenLegacyManifestHash);

    const aggregate = parseManifest(readFileSync(aggregatePath, "utf8"));
    expect(aggregate).toContainEqual({
      hash: frozenLegacyManifestHash,
      path: "legacy/MANIFEST.sha256",
    });
  });

  it("rejects duplicate manifest entries", () => {
    const content = readFileSync(aggregatePath, "utf8");
    const firstLine = content.split("\n")[0];
    expect(() => parseManifest(`${content}${firstLine}\n`)).toThrow(
      /duplicate manifest path/,
    );
  });

  it("has no JSON vectors in retired flat profile paths", () => {
    for (const profile of ["positive", "negative"]) {
      const obsoletePath = join(vectorsRoot, profile);
      const jsonFiles = existsSync(obsoletePath)
        ? readdirSync(obsoletePath).filter((name) => name.endsWith(".json"))
        : [];
      expect(jsonFiles).toEqual([]);
    }
  });
});
