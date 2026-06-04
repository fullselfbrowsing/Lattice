/**
 * Filesystem ArtifactLoader for `lattice repro`.
 *
 * Reads `<fixturesDir>/<sha256-hex>.bin` and constructs an `ArtifactInput`
 * the Phase 10 materializer (`materializeReplayEnvelope`) can consume.
 *
 * Path-traversal defense: the hash MUST match `/^[a-f0-9]{64}$/u` (the exact
 * sha256-hex shape) BEFORE any filesystem call. A malicious receipt whose
 * inputHashes contain `../../etc/passwd` is rejected upstream of the read.
 *
 * Error shape mirrors `MaterializationError` (plain object literal,
 * discriminated by `kind`) so callers pattern-match the same way they do for
 * materialize/verify failures.
 */

import { readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { ArtifactInput } from "@fullselfbrowsing/lattice";

const HASH_REGEX = /^[a-f0-9]{64}$/u;

export interface ArtifactLoaderError {
  readonly kind: "missing" | "invalid-hash";
  readonly hash: string;
  readonly path?: string;
  readonly message: string;
}

export function isArtifactLoaderError(value: unknown): value is ArtifactLoaderError {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.kind !== "missing" && v.kind !== "invalid-hash") return false;
  if (typeof v.hash !== "string") return false;
  if (typeof v.message !== "string") return false;
  return true;
}

function fail(
  kind: ArtifactLoaderError["kind"],
  hash: string,
  message: string,
  path?: string,
): ArtifactLoaderError {
  return path === undefined
    ? { kind, hash, message }
    : { kind, hash, path, message };
}

/**
 * Build a filesystem-backed `ArtifactLoader` rooted at `fixturesDir`. The
 * returned function is the callback shape `materializeReplayEnvelope`
 * expects: `(hash) => Promise<ArtifactInput>`.
 */
export function createFilesystemArtifactLoader(
  fixturesDir: string,
): (hash: string) => Promise<ArtifactInput> {
  const root = resolve(fixturesDir);
  return async (hash: string): Promise<ArtifactInput> => {
    if (!HASH_REGEX.test(hash)) {
      throw fail(
        "invalid-hash",
        hash,
        `Artifact hash is not a 64-char lowercase hex SHA-256 digest. Refusing to read.`,
      );
    }
    const filePath = join(root, `${hash}.bin`);
    let bytes: Buffer;
    let stats: { size: number };
    try {
      [bytes, stats] = await Promise.all([readFile(filePath), stat(filePath)]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw fail("missing", hash, message, filePath);
    }
    const input: ArtifactInput = {
      id: hash,
      kind: "file",
      source: "file",
      privacy: "standard",
      mediaType: "application/octet-stream",
      size: { bytes: stats.size },
      value: new Uint8Array(bytes),
    };
    return input;
  };
}
