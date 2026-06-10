/**
 * Receipt CID — Phase 39 (v1.3). Content address = sha256 of the DSSE
 * canonical payload bytes (the exact bytes that were signed).
 *
 * The CID is derivable from any envelope WITHOUT key material: it digests
 * `envelope.payload` (the base64-encoded RFC 8785 JCS canonical body) after
 * decoding. verifyReceipt proves payload byte-equality on every accepted
 * envelope (verify.ts re-canonicalization step), so two envelopes with the
 * same signed body always share a CID and any body tamper changes it.
 *
 * Web-standard APIs only (atob + crypto.subtle) — no Node-specific byte
 * types, matching the checkpoint.ts / fingerprint.ts precedents.
 */

import type { ReceiptEnvelope } from "./types.js";

/**
 * Derive the content-addressed CID of a receipt envelope.
 *
 * Returns `sha256:<hex>` where `<hex>` is the 64-char lowercase SHA-256
 * digest of the decoded DSSE payload bytes. No KeySet, signer, or other
 * key material is required — callers chaining receipts (parentReceiptCid)
 * compute this from the parent envelope alone.
 */
export async function receiptCid(envelope: ReceiptEnvelope): Promise<string> {
  // Decode base64 via atob — web-standard, runtime-agnostic (checkpoint.ts:255).
  const bytes = Uint8Array.from(atob(envelope.payload), (c) => c.charCodeAt(0));

  // Copy into a freshly-allocated backing store so crypto.subtle.digest
  // never sees a view over a larger shared allocation (fingerprint.ts idiom).
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);

  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);

  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  return `sha256:${hex}`;
}
