/**
 * Sidecar-aware receipt-directory walker for `lattice repro` and
 * `lattice eval`.
 *
 * Wraps `walkReceiptsDirectory` and pairs each yielded receipt with its
 * sidecar at `<sidecarDir>/<id>.json`. Behavior contract:
 *
 *   - Missing sidecar (file-not-found)   -> entry yields with sidecar: null
 *                                            (NON-FATAL — consumer decides)
 *   - Sidecars-dir-missing               -> every entry yields sidecar: null
 *                                            (NON-FATAL — delegated to the
 *                                             loader's file-not-found path)
 *   - Sidecar malformed/version-mismatch -> yields a WalkedReceiptError
 *     /unsupported-output-shape             pointing at the SIDECAR path with
 *                                            kind: "malformed" so the eval
 *                                            runner's existing single-union
 *                                            error-handling stays sound.
 *                                            The original sidecar error kind
 *                                            is preserved in the message.
 *   - Receipt-side malformed             -> yields the underlying
 *                                            WalkedReceiptError unchanged.
 *   - Receipts-dir-missing               -> propagates the receipt walker's
 *                                            throw `{ kind: "missing", ... }`
 *                                            so the existing exit-2 path
 *                                            still fires.
 *
 * Order: lexicographic by receipt id (delegated from `walkReceiptsDirectory`).
 *
 * Imports ONLY public exports of `lattice` per CLI-06.
 */

import { join, resolve } from "node:path";

import type { ReceiptEnvelope } from "lattice";

import {
  isWalkedReceiptError as isUnderlyingReceiptError,
  walkReceiptsDirectory,
  type WalkedReceiptError,
} from "./receipt-walker.js";
import {
  isSidecarLoadError,
  loadSidecar,
  type SidecarFile,
} from "./sidecar-loader.js";

/** Pair of receipt + (optional) sidecar. `sidecar` is null when no sidecar
 *  exists for this id (or when the sidecar directory itself is missing). */
export interface WalkedReceiptWithSidecar {
  readonly id: string;
  readonly envelope: ReceiptEnvelope;
  readonly resolvedPath: string;
  readonly sidecar: SidecarFile | null;
  readonly sidecarPath: string | null;
}

/** Union of success entries plus the same error shape the receipt walker
 *  emits — load failures from either side surface uniformly so consumers
 *  can switch on a single union. */
export type WalkedReceiptWithSidecarEntry =
  | WalkedReceiptWithSidecar
  | WalkedReceiptError;

export function isWalkedReceiptError(
  entry: WalkedReceiptWithSidecarEntry,
): entry is WalkedReceiptError {
  return "error" in entry;
}

/**
 * Walk `receiptsDir` and pair each yielded receipt with its sidecar at
 * `<sidecarDir>/<id>.json`. See module docstring for the full error matrix.
 */
export async function* walkReceiptsWithSidecars(
  receiptsDir: string,
  sidecarDir: string,
): AsyncIterable<WalkedReceiptWithSidecarEntry> {
  const resolvedSidecarDir = resolve(sidecarDir);

  for await (const entry of walkReceiptsDirectory(receiptsDir)) {
    if (isUnderlyingReceiptError(entry)) {
      yield entry;
      continue;
    }

    const candidatePath = join(resolvedSidecarDir, `${entry.id}.json`);
    let sidecar: SidecarFile | null = null;

    try {
      sidecar = await loadSidecar(candidatePath);
    } catch (err) {
      if (isSidecarLoadError(err)) {
        if (err.kind === "file-not-found") {
          // Non-fatal: no sidecar for this receipt id (or the dir is missing).
          sidecar = null;
        } else {
          // Malformed / version-mismatch / unsupported-output-shape:
          // surface as a WalkedReceiptError-compatible entry so consumers
          // can use a single union discriminator.
          const message =
            err.kind === "malformed"
              ? err.message
              : `sidecar ${err.kind}: ${err.message}`;
          yield {
            id: entry.id,
            resolvedPath: candidatePath,
            error: {
              kind: "malformed",
              resolvedPath: candidatePath,
              message,
            },
          } satisfies WalkedReceiptError;
          continue;
        }
      } else {
        // Non-typed throw — surface as malformed with the best-effort message.
        const message = err instanceof Error ? err.message : String(err);
        yield {
          id: entry.id,
          resolvedPath: candidatePath,
          error: {
            kind: "malformed",
            resolvedPath: candidatePath,
            message,
          },
        } satisfies WalkedReceiptError;
        continue;
      }
    }

    yield {
      id: entry.id,
      envelope: entry.envelope,
      resolvedPath: entry.resolvedPath,
      sidecar,
      sidecarPath: sidecar !== null ? candidatePath : null,
    } satisfies WalkedReceiptWithSidecar;
  }
}
