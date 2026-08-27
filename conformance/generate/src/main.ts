import {
  existsSync,
  mkdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  STANDARD_NEGATIVE_FILENAMES,
  generateNegativeVectors,
} from "./negative.js";
import {
  STANDARD_POSITIVE_FILENAMES,
  generatePositiveVectors,
} from "./positive.js";
import { runRFC8785CrossChecks } from "./rfc8785-check.js";
import type { StandardConformanceVector } from "./types.js";

const sourceFile = fileURLToPath(import.meta.url);
const sourceDir = dirname(sourceFile);
export const DEFAULT_VECTORS_ROOT = resolve(sourceDir, "..", "..", "vectors");
const committedLegacyRoot = join(DEFAULT_VECTORS_ROOT, "legacy");

export interface GenerationResult {
  readonly outputRoot: string;
  readonly standardRoot: string;
  readonly positiveCount: number;
  readonly negativeCount: number;
}

function resolvePhysicalPath(target: string): string {
  let existingAncestor = resolve(target);
  const missingSegments: string[] = [];
  while (!existsSync(existingAncestor)) {
    const parent = dirname(existingAncestor);
    if (parent === existingAncestor) break;
    missingSegments.unshift(basename(existingAncestor));
    existingAncestor = parent;
  }
  const physicalAncestor = realpathSync(existingAncestor);
  return resolve(physicalAncestor, ...missingSegments);
}

function isWithinOrEqual(candidate: string, parent: string): boolean {
  const rel = relative(parent, candidate);
  return (
    rel === "" ||
    (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`))
  );
}

function resolveSafeOutput(outputRoot: string): {
  outputRoot: string;
  standardRoot: string;
} {
  const physicalOutputRoot = resolvePhysicalPath(outputRoot);
  const physicalLegacyRoot = resolvePhysicalPath(committedLegacyRoot);
  const standardRoot = join(physicalOutputRoot, "standard");
  if (
    isWithinOrEqual(physicalOutputRoot, physicalLegacyRoot) ||
    isWithinOrEqual(standardRoot, physicalLegacyRoot)
  ) {
    throw new Error(
      `refusing to generate inside immutable legacy corpus: ${physicalOutputRoot}`,
    );
  }
  return { outputRoot: physicalOutputRoot, standardRoot };
}

function writeVectors(
  directory: string,
  filenames: readonly string[],
  vectors: readonly StandardConformanceVector[],
): void {
  if (filenames.length !== vectors.length) {
    throw new Error(
      `filename/vector count mismatch: ${filenames.length} names for ${vectors.length} vectors`,
    );
  }
  mkdirSync(directory, { recursive: true });
  for (let index = 0; index < vectors.length; index += 1) {
    const filename = filenames[index];
    const vector = vectors[index];
    if (filename === undefined || vector === undefined) {
      throw new Error(`missing vector or filename at index ${index}`);
    }
    writeFileSync(
      join(directory, filename),
      `${JSON.stringify(vector, null, 2)}\n`,
      "utf8",
    );
  }
}

export async function generateStandardVectors(
  requestedOutputRoot: string = DEFAULT_VECTORS_ROOT,
): Promise<GenerationResult> {
  const safe = resolveSafeOutput(requestedOutputRoot);
  runRFC8785CrossChecks();

  const [positive, negative] = await Promise.all([
    generatePositiveVectors(),
    generateNegativeVectors(),
  ]);

  writeVectors(
    join(safe.standardRoot, "positive"),
    STANDARD_POSITIVE_FILENAMES,
    positive,
  );
  writeVectors(
    join(safe.standardRoot, "negative"),
    STANDARD_NEGATIVE_FILENAMES,
    negative,
  );

  return {
    outputRoot: safe.outputRoot,
    standardRoot: safe.standardRoot,
    positiveCount: positive.length,
    negativeCount: negative.length,
  };
}

function readOutputRoot(args: readonly string[]): string | undefined {
  const index = args.indexOf("--output-root");
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error("--output-root requires a path");
  }
  return value;
}

export async function runGeneratorCli(
  args: readonly string[],
  log: (message: string) => void = console.log,
): Promise<GenerationResult | null> {
  if (!args.includes("--regen-vectors")) {
    log(
      "[generate-vectors] No-op: pass --regen-vectors to regenerate committed vectors.",
    );
    return null;
  }

  const outputRoot = readOutputRoot(args);
  const result = await generateStandardVectors(
    outputRoot ?? DEFAULT_VECTORS_ROOT,
  );
  log(
    `[generate-vectors] Complete: ${result.positiveCount} positive + ${result.negativeCount} negative standard vectors written to ${result.standardRoot}.`,
  );
  return result;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && resolve(invokedPath) === resolve(sourceFile)) {
  await runGeneratorCli(process.argv.slice(2));
}
