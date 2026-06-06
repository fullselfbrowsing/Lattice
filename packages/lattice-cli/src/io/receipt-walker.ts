/**
 * Receipt-directory walker for `lattice eval`.
 *
 * Yields each `.json` entry in `dir` either as a successfully-loaded
 * `WalkedReceipt` or as a `WalkedReceiptError` capturing the typed
 * `ReceiptLoadError` from `receipt-loader.ts`. The walk NEVER aborts on a
 * single malformed file — the eval gate must keep going so its summary is
 * complete.
 *
 * Behavior contract (Plan 12-01):
 *   - readdir(ENOENT)            -> throws `{ kind: "missing", ... }`
 *                                    (so the runner can map to exit 2)
 *   - non-.json entries          -> skipped entirely
 *   - file load failure          -> yields { id, error, resolvedPath }
 *   - successful envelope        -> yields { id, envelope, resolvedPath }
 *   - entries are emitted in     -> lexicographic byte-order (Array#sort)
 *     deterministic order          so eval reports diff cleanly across machines
 *
 * Reuses `loadReceiptByIdOrPath` from `./receipt-loader.js` so envelope shape
 * validation lives in exactly one place.
 */

import { readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { resolve } from "node:path";

import type { ReceiptEnvelope } from "@full-self-browsing/lattice";

import {
  isReceiptLoadError,
  loadReceiptByIdOrPath,
  type ReceiptLoadError,
} from "./receipt-loader.js";

export interface WalkedReceipt {
  readonly id: string;
  readonly envelope: ReceiptEnvelope;
  readonly resolvedPath: string;
}

export interface WalkedReceiptError {
  readonly id: string;
  readonly resolvedPath: string;
  readonly error: ReceiptLoadError;
}

export type WalkedEntry = WalkedReceipt | WalkedReceiptError;

export function isWalkedReceiptError(entry: WalkedEntry): entry is WalkedReceiptError {
  return "error" in entry;
}

const JSON_SUFFIX = ".json";

export async function* walkReceiptsDirectory(
  dir: string,
): AsyncIterable<WalkedEntry> {
  const root = resolve(dir);

  let entries: Dirent[];
  try {
    entries = (await readdir(root, { withFileTypes: true })) as unknown as Dirent[];
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw {
      kind: "missing",
      resolvedPath: root,
      message,
    } satisfies ReceiptLoadError;
  }

  const names = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(JSON_SUFFIX))
    .map((entry) => entry.name)
    .sort();

  for (const name of names) {
    const id = name.slice(0, -JSON_SUFFIX.length);
    const resolvedPath = resolve(root, name);
    try {
      const loaded = await loadReceiptByIdOrPath(resolvedPath);
      yield {
        id,
        envelope: loaded.envelope,
        resolvedPath: loaded.resolvedPath,
      } satisfies WalkedReceipt;
    } catch (err) {
      if (isReceiptLoadError(err)) {
        yield { id, resolvedPath, error: err } satisfies WalkedReceiptError;
        continue;
      }
      const message = err instanceof Error ? err.message : String(err);
      yield {
        id,
        resolvedPath,
        error: { kind: "malformed", resolvedPath, message },
      } satisfies WalkedReceiptError;
    }
  }
}
