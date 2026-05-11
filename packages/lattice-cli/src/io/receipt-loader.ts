/**
 * Receipt id-or-path loader for `lattice repro`.
 *
 * Resolution heuristic (CONTEXT.md decision):
 *   - target contains "/" OR ends with ".json" -> treat as a path; resolve via path.resolve.
 *   - otherwise                                  -> resolve as `<receiptsDir>/<target>.json`,
 *                                                   default receiptsDir is `.lattice/receipts/`
 *                                                   relative to cwd.
 *
 * On disk error, JSON parse error, or wrong envelope shape, throws
 * `ReceiptLoadError { kind: "missing" | "malformed", ... }`.
 */

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { ReceiptEnvelope } from "lattice";

const PAYLOAD_TYPE = "application/vnd.lattice.receipt+json" as const;

export interface ReceiptLoadError {
  readonly kind: "missing" | "malformed";
  readonly resolvedPath: string;
  readonly message: string;
}

export function isReceiptLoadError(value: unknown): value is ReceiptLoadError {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.kind !== "missing" && v.kind !== "malformed") return false;
  if (typeof v.resolvedPath !== "string") return false;
  if (typeof v.message !== "string") return false;
  return true;
}

function isReceiptEnvelopeShape(value: unknown): value is ReceiptEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.payloadType !== PAYLOAD_TYPE) return false;
  if (typeof v.payload !== "string") return false;
  if (!Array.isArray(v.signatures)) return false;
  return true;
}

export interface ReceiptResolverOptions {
  /** Directory to resolve plain ids against. Defaults to `.lattice/receipts` (cwd-relative). */
  readonly receiptsDir?: string;
}

export interface LoadedReceipt {
  readonly envelope: ReceiptEnvelope;
  readonly resolvedPath: string;
  readonly idOrPath: string;
}

function resolveReceiptPath(
  target: string,
  options: ReceiptResolverOptions,
): string {
  const treatAsPath = target.includes("/") || target.endsWith(".json");
  if (treatAsPath) return resolve(target);
  const dir = options.receiptsDir ?? join(".lattice", "receipts");
  return resolve(join(dir, `${target}.json`));
}

export async function loadReceiptByIdOrPath(
  target: string,
  options: ReceiptResolverOptions = {},
): Promise<LoadedReceipt> {
  const resolvedPath = resolveReceiptPath(target, options);

  let text: string;
  try {
    text = await readFile(resolvedPath, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw { kind: "missing", resolvedPath, message } satisfies ReceiptLoadError;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw { kind: "malformed", resolvedPath, message } satisfies ReceiptLoadError;
  }

  if (!isReceiptEnvelopeShape(parsed)) {
    throw {
      kind: "malformed",
      resolvedPath,
      message:
        "Receipt JSON does not match ReceiptEnvelope shape (payloadType/payload/signatures).",
    } satisfies ReceiptLoadError;
  }

  return { envelope: parsed, resolvedPath, idOrPath: target };
}
