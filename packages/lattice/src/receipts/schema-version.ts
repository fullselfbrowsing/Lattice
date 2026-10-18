import type { ReceiptVersion } from "./types.js";

/**
 * Receipt schema versions in ordinal order, oldest first. The last entry is
 * the version `createReceipt` mints. Verifiers compare by position in this
 * list, so adding a version means appending here and nowhere else.
 *
 * History:
 *   - v1    original body
 *   - v1.1  step-marker fields (stepName, stepIndex, parent/previous step)
 *   - v1.2  modelClass training-class tag
 *   - v1.3  parentReceiptCid chain link and lineageMerkleRoot
 *   - v1.4  optional audience, nonce, expiresAt binding fields
 */
export const RECEIPT_VERSIONS: readonly ReceiptVersion[] = Object.freeze([
  "lattice-receipt/v1",
  "lattice-receipt/v1.1",
  "lattice-receipt/v1.2",
  "lattice-receipt/v1.3",
  "lattice-receipt/v1.4",
]);

/** The version newly minted receipts carry. */
export const CURRENT_RECEIPT_VERSION: ReceiptVersion = "lattice-receipt/v1.4";

/**
 * CRYPTO-01 floor. Receipts at or above this version are accepted; v1 and
 * unversioned bodies are rejected before any cryptographic work.
 */
export const MIN_ACCEPTED_RECEIPT_VERSION: ReceiptVersion = "lattice-receipt/v1.1";

/** Position of `version` in RECEIPT_VERSIONS, or -1 for an unknown literal. */
export function receiptVersionOrdinal(version: unknown): number {
  return RECEIPT_VERSIONS.indexOf(version as ReceiptVersion);
}

export function isReceiptVersion(value: unknown): value is ReceiptVersion {
  return receiptVersionOrdinal(value) >= 0;
}
