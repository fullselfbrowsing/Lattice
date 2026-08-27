import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import {
  dirname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
} from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const sourceFile = fileURLToPath(import.meta.url);
const sourceDir = dirname(sourceFile);
export const DEFAULT_MANIFEST_VECTORS_ROOT = resolve(
  sourceDir,
  "..",
  "..",
  "vectors",
);

export interface ManifestEntry {
  readonly hash: string;
  readonly path: string;
}

function assertCanonicalManifestPath(path: string): void {
  if (
    path.length === 0 ||
    path.includes("\\") ||
    path.includes("\0") ||
    isAbsolute(path) ||
    posix.isAbsolute(path) ||
    /^[A-Za-z]:/.test(path) ||
    posix.normalize(path) !== path ||
    path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    throw new Error(`manifest path is not a canonical POSIX relative path: ${path}`);
  }
}

function resolveManifestPath(root: string, path: string): string {
  assertCanonicalManifestPath(path);
  const absoluteRoot = resolve(root);
  const absolutePath = resolve(absoluteRoot, ...path.split("/"));
  const fromRoot = relative(absoluteRoot, absolutePath);
  if (
    fromRoot === "" ||
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`) ||
    isAbsolute(fromRoot)
  ) {
    throw new Error(`manifest path escapes corpus root: ${path}`);
  }
  return absolutePath;
}

function assertRegularFile(path: string, label: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) {
    throw new Error(`${label} must not be a symlink: ${path}`);
  }
  if (!stat.isFile()) {
    throw new Error(`${label} must be a regular file: ${path}`);
  }
}

function walkTree(vectorsRoot: string, tree: "legacy" | "standard"): string[] {
  const root = resolve(vectorsRoot);
  const treeRoot = join(root, tree);
  const treeStat = lstatSync(treeRoot);
  if (treeStat.isSymbolicLink()) {
    throw new Error(`corpus tree must not be a symlink: ${tree}`);
  }
  if (!treeStat.isDirectory()) {
    throw new Error(`corpus tree must be a directory: ${tree}`);
  }

  const files: string[] = [];
  const visit = (directory: string, prefix: string): void => {
    for (const name of readdirSync(directory).sort()) {
      const path = `${prefix}/${name}`;
      assertCanonicalManifestPath(path);
      const absolutePath = resolveManifestPath(root, path);
      const stat = lstatSync(absolutePath);
      if (stat.isSymbolicLink()) {
        throw new Error(`corpus entries must not be symlinks: ${path}`);
      }
      if (stat.isDirectory()) {
        visit(absolutePath, path);
        continue;
      }
      if (!stat.isFile()) {
        throw new Error(`unsupported corpus entry type: ${path}`);
      }
      files.push(path);
    }
  };

  visit(treeRoot, tree);
  return files.sort();
}

function validateCorpusFiles(
  files: readonly string[],
  tree: "legacy" | "standard",
): void {
  for (const path of files) {
    const isLegacyManifest = path === "legacy/MANIFEST.sha256";
    if (!path.endsWith(".json") && !(tree === "legacy" && isLegacyManifest)) {
      throw new Error(`unexpected file in ${tree} corpus: ${path}`);
    }
  }
}

export function collectStandardVectorPaths(vectorsRoot: string): string[] {
  const files = walkTree(vectorsRoot, "standard");
  validateCorpusFiles(files, "standard");
  return files;
}

function collectLegacyPaths(vectorsRoot: string): string[] {
  const files = walkTree(vectorsRoot, "legacy");
  validateCorpusFiles(files, "legacy");
  if (!files.includes("legacy/MANIFEST.sha256")) {
    throw new Error("legacy corpus is missing MANIFEST.sha256");
  }
  return files;
}

export function collectAggregatePaths(vectorsRoot: string): string[] {
  return [
    ...collectLegacyPaths(vectorsRoot),
    ...collectStandardVectorPaths(vectorsRoot),
  ].sort();
}

export function parseManifest(content: string): ManifestEntry[] {
  if (content.length === 0 || !content.endsWith("\n") || content.includes("\r")) {
    throw new Error("manifest must be non-empty LF-terminated text");
  }

  const entries: ManifestEntry[] = [];
  const seen = new Set<string>();
  for (const line of content.slice(0, -1).split("\n")) {
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    if (match === null) {
      throw new Error(`invalid sha256 manifest line: ${line}`);
    }
    const [, hash, path] = match;
    if (hash === undefined || path === undefined) {
      throw new Error(`invalid sha256 manifest line: ${line}`);
    }
    assertCanonicalManifestPath(path);
    if (seen.has(path)) {
      throw new Error(`duplicate manifest path: ${path}`);
    }
    seen.add(path);
    entries.push({ hash, path });
  }

  const sorted = entries.map((entry) => entry.path).toSorted();
  if (entries.some((entry, index) => entry.path !== sorted[index])) {
    throw new Error("manifest paths must be sorted lexicographically");
  }
  return entries;
}

function hashFile(root: string, path: string): string {
  const absolutePath = resolveManifestPath(root, path);
  assertRegularFile(absolutePath, "manifest target");
  return createHash("sha256").update(readFileSync(absolutePath)).digest("hex");
}

function formatManifest(vectorsRoot: string, paths: readonly string[]): string {
  if (paths.length === 0) {
    throw new Error("cannot create an empty manifest");
  }
  return `${paths.map((path) => `${hashFile(vectorsRoot, path)}  ${path}`).join("\n")}\n`;
}

function verifyManifest(
  vectorsRoot: string,
  manifestContent: string,
  expectedPaths: readonly string[],
): void {
  const entries = parseManifest(manifestContent);
  const actualPaths = new Set(entries.map((entry) => entry.path));
  const expected = new Set(expectedPaths);
  const missing = expectedPaths.filter((path) => !actualPaths.has(path));
  const extra = entries
    .map((entry) => entry.path)
    .filter((path) => !expected.has(path));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `manifest set mismatch; missing=[${missing.join(", ")}]; extra=[${extra.join(", ")}]`,
    );
  }

  for (const entry of entries) {
    const actualHash = hashFile(vectorsRoot, entry.path);
    if (actualHash !== entry.hash) {
      throw new Error(
        `manifest hash mismatch for ${entry.path}: expected ${entry.hash}, got ${actualHash}`,
      );
    }
  }
}

export function verifyLegacyManifest(vectorsRoot: string): void {
  const legacyPaths = collectLegacyPaths(vectorsRoot);
  const nestedPaths = legacyPaths
    .filter((path) => path.endsWith(".json"))
    .map((path) => path.slice("legacy/".length));
  const manifestPath = join(resolve(vectorsRoot), "legacy", "MANIFEST.sha256");
  assertRegularFile(manifestPath, "legacy manifest");
  verifyManifest(
    join(resolve(vectorsRoot), "legacy"),
    readFileSync(manifestPath, "utf8"),
    nestedPaths,
  );
}

export function createAggregateManifest(vectorsRoot: string): string {
  return formatManifest(vectorsRoot, collectAggregatePaths(vectorsRoot));
}

export function verifyAggregateManifest(
  vectorsRoot: string,
  manifestContent: string = readFileSync(
    join(resolve(vectorsRoot), "MANIFEST.sha256"),
    "utf8",
  ),
): void {
  verifyManifest(vectorsRoot, manifestContent, collectAggregatePaths(vectorsRoot));
}

export function writeAggregateManifest(vectorsRoot: string): void {
  verifyLegacyManifest(vectorsRoot);
  const content = createAggregateManifest(vectorsRoot);
  const manifestPath = join(resolve(vectorsRoot), "MANIFEST.sha256");
  writeFileSync(manifestPath, content, "utf8");
  verifyAggregateManifest(vectorsRoot, content);
}

function readVectorsRoot(args: readonly string[]): string {
  const index = args.indexOf("--vectors-root");
  if (index === -1) return DEFAULT_MANIFEST_VECTORS_ROOT;
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error("--vectors-root requires a path");
  }
  return value;
}

export function runManifestCli(
  args: readonly string[],
  log: (message: string) => void = console.log,
): void {
  if (!args.includes("--write-aggregate")) {
    throw new Error("pass --write-aggregate to write the aggregate manifest");
  }
  const vectorsRoot = readVectorsRoot(args);
  writeAggregateManifest(vectorsRoot);
  const count = collectAggregatePaths(vectorsRoot).length;
  log(`[generate-vectors] Wrote and verified aggregate manifest (${count} files).`);
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && resolve(invokedPath) === resolve(sourceFile)) {
  runManifestCli(process.argv.slice(2));
}
