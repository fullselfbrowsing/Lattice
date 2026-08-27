import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { generateStandardVectors } from "../conformance/generate/src/main.js";
import type { StandardConformanceVector } from "../conformance/generate/src/types.js";

const sourceDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = dirname(sourceDir);
const designatedPath =
  "standard/positive/vec-00-v1.4-unicode-redaction.json";
const committedPath = join(
  repoRoot,
  "conformance",
  "vectors",
  ...designatedPath.split("/"),
);
const fixturePath = join(repoRoot, "spec", "vector0-fixture.json");

function assertDesignatedCoverage(vector: StandardConformanceVector): void {
  const redactions = vector.body["redactions"];
  const stepName = vector.body["stepName"];
  if (
    vector.corpusProfile !== "standard" ||
    vector.expectedVerificationProfile !== "dsse-v1" ||
    vector.expectedDeprecated !== false ||
    vector.expectedResult !== "ok" ||
    vector.body["version"] !== "lattice-receipt/v1.4" ||
    vector.body["signatureProfile"] !== "dsse-v1"
  ) {
    throw new Error("designated fixture must be a successful v1.4/dsse-v1 vector");
  }
  if (
    typeof stepName !== "string" ||
    !/[^\u0000-\u007f]/u.test(stepName) ||
    !Array.isArray(redactions) ||
    redactions.length === 0
  ) {
    throw new Error("designated fixture must cover Unicode and redaction");
  }
  if (!vector.WARNING.includes("EXAMPLE/TEST-ONLY KEY MATERIAL")) {
    throw new Error("designated fixture must retain its example-key warning");
  }

  const canonicalBytes = Buffer.from(vector.canonicalBytesHex, "hex");
  const signedBytes = Buffer.from(vector.paeHex, "hex");
  const suffix = signedBytes.subarray(-canonicalBytes.byteLength);
  if (canonicalBytes.byteLength === 0 || !suffix.equals(canonicalBytes)) {
    throw new Error("designated fixture must use raw canonical payload bytes in PAE");
  }
}

async function main(): Promise<void> {
  const unexpected = process.argv.slice(2).filter((arg) => arg !== "--write");
  if (unexpected.length > 0) {
    throw new Error(`unsupported argument: ${unexpected[0]}`);
  }

  const temporaryRoot = mkdtempSync(join(tmpdir(), "lattice-vector0-"));
  try {
    await generateStandardVectors(temporaryRoot);
    const generatedPath = join(temporaryRoot, ...designatedPath.split("/"));
    const generatedBytes = readFileSync(generatedPath);
    const committedBytes = readFileSync(committedPath);
    const vector = JSON.parse(generatedBytes.toString("utf8")) as StandardConformanceVector;
    assertDesignatedCoverage(vector);

    if (!generatedBytes.equals(committedBytes)) {
      throw new Error("designated committed vector differs from standalone generation");
    }

    if (process.argv.includes("--write")) {
      writeFileSync(fixturePath, generatedBytes);
    } else if (!readFileSync(fixturePath).equals(generatedBytes)) {
      throw new Error("spec fixture differs; rerun with --write to synchronize it");
    }
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }

  console.log(
    `[spec-vector0] ${process.argv.includes("--write") ? "Synchronized" : "Verified"} ${designatedPath}.`,
  );
}

await main();
