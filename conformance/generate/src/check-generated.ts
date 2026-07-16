import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { DEFAULT_VECTORS_ROOT, generateStandardVectors } from "./main.js";
import {
  collectStandardVectorPaths,
  createAggregateManifest,
  verifyAggregateManifest,
  verifyLegacyManifest,
} from "./manifest.js";

function compareStandardCorpus(
  committedRoot: string,
  generatedRoot: string,
): void {
  const committedPaths = collectStandardVectorPaths(committedRoot);
  const generatedPaths = collectStandardVectorPaths(generatedRoot);
  if (JSON.stringify(committedPaths) !== JSON.stringify(generatedPaths)) {
    throw new Error(
      `generated standard file set differs; committed=[${committedPaths.join(", ")}]; generated=[${generatedPaths.join(", ")}]`,
    );
  }

  for (const path of committedPaths) {
    const committed = readFileSync(join(committedRoot, ...path.split("/")));
    const generated = readFileSync(join(generatedRoot, ...path.split("/")));
    if (!committed.equals(generated)) {
      throw new Error(`generated standard bytes differ: ${path}`);
    }
  }
}

export async function checkGenerated(
  committedRoot: string = DEFAULT_VECTORS_ROOT,
): Promise<void> {
  verifyLegacyManifest(committedRoot);
  verifyAggregateManifest(committedRoot);

  const temporaryRoot = mkdtempSync(join(tmpdir(), "lattice-conformance-check-"));
  try {
    await generateStandardVectors(temporaryRoot);
    cpSync(join(committedRoot, "legacy"), join(temporaryRoot, "legacy"), {
      recursive: true,
      dereference: false,
      verbatimSymlinks: true,
    });
    verifyLegacyManifest(temporaryRoot);
    compareStandardCorpus(committedRoot, temporaryRoot);

    const generatedManifest = createAggregateManifest(temporaryRoot);
    const committedManifest = readFileSync(
      join(committedRoot, "MANIFEST.sha256"),
      "utf8",
    );
    if (generatedManifest !== committedManifest) {
      throw new Error("aggregate manifest differs from clean temporary generation");
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

const sourceFile = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1];
if (invokedPath !== undefined && resolve(invokedPath) === resolve(sourceFile)) {
  await checkGenerated();
  console.log("[generate-vectors] Committed corpus matches clean temporary generation.");
}
