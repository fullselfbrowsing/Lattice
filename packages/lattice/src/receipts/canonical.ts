import canonicalize from "canonicalize";

import type { Usage } from "../providers/provider.js";
import type {
  CapabilityReceiptBody,
  ReceiptUsageCanonical,
} from "./types.js";

const encoder = new TextEncoder();

/**
 * Convert costUsd (number | null) to its canonical string form.
 * RFC 8785 requires deterministic float-to-string; using JS Number→string
 * directly is unsafe across V8 versions (Grisu3 vs Dragonbox). We pin the
 * format by routing through Number.prototype.toString() for FINITE numbers
 * only, and treat NaN/Infinity as null. This matches "I-JSON only" from
 * 09-CONTEXT.md — receipts NEVER carry non-finite floats.
 */
export function stringifyCostUsd(costUsd: number | null): string | null {
  if (costUsd === null) return null;
  if (!Number.isFinite(costUsd)) return null;
  return costUsd.toString();
}

/**
 * Convert a runtime Usage (number costUsd) to its canonical receipt form
 * (string costUsd). This is the single conversion site — canonical bytes
 * NEVER see a raw float in the cost field.
 */
export function usageToCanonical(usage: Usage): ReceiptUsageCanonical {
  return {
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    costUsd: stringifyCostUsd(usage.costUsd),
  };
}

/**
 * Canonicalize a receipt body to JCS bytes (RFC 8785).
 *
 * INVARIANT: callers MUST pass an already-redacted body. The redactor in
 * redact.ts produces the input to this function — never the cleartext.
 * See 09-CONTEXT.md "Redact-Then-Sign Ordering (UNRETROFITTABLE)".
 *
 * Throws if canonicalize returns undefined (impossible for valid bodies
 * — surfaces a programmer error rather than silently producing zero
 * bytes that would later fail signature verification).
 */
export function canonicalizeReceiptBody(
  body: CapabilityReceiptBody,
): Uint8Array {
  const json = canonicalize(body);
  if (json === undefined) {
    throw new Error(
      "canonicalizeReceiptBody: canonicalize returned undefined; receipt body contained a non-canonicalizable value (function/symbol/undefined).",
    );
  }
  return encoder.encode(json);
}
