import type {
  CapabilityReceiptBody,
  ReceiptRedaction,
} from "./types.js";

/**
 * Default redaction policy id for v1.1. Free-form string per
 * 09-CONTEXT.md — registry enforcement deferred to v1.2.
 */
export const DEFAULT_REDACTION_POLICY_ID = "lattice.default.v1";

export interface RedactionResult {
  readonly body: CapabilityReceiptBody;
  readonly redactions: readonly ReceiptRedaction[];
}

/**
 * Redact a receipt body BEFORE canonicalization (and BEFORE signing).
 *
 * The signed digest commits to canonicalize(redact(body)). NEVER the
 * other way around. See 09-CONTEXT.md "Redact-Then-Sign Ordering
 * (UNRETROFITTABLE)" and PITFALLS.md Pitfall #1.
 *
 * For v1.1 the default policy is minimal — the heavy lifting already
 * happened upstream:
 *   - Tripwire evaluator emits {detector, substring} for no-pii (T-08-01).
 *   - Provider responses are hashed into inputHashes/outputHash, never
 *     embedded raw.
 *   - Router reject messages do not contain PII by construction.
 *
 * This function therefore primarily:
 *   1. Materializes the redactions[] manifest declaring what WAS elided
 *      upstream (so receipts are self-describing).
 *   2. Provides the extension point future policies will use.
 *
 * Returns a NEW body — never mutates the input.
 */
export function redactReceiptBody(
  body: CapabilityReceiptBody,
  policyId: string = DEFAULT_REDACTION_POLICY_ID,
): RedactionResult {
  const redactions: ReceiptRedaction[] = [];

  // Record the no-pii redaction as a declared manifest entry.
  // The tripwire kernel ALREADY redacted to {detector, substring};
  // this only declares that the redaction happened so verifiers can
  // see it in the signed body.
  if (
    body.tripwireEvidence !== undefined &&
    body.tripwireEvidence.kind === "no-pii"
  ) {
    redactions.push({
      path: "tripwireEvidence.observed",
      reason: "no-pii-detector-substring-only",
    });
  }

  // Sort redactions by path for canonical-form stability (sorted arrays
  // canonicalize identically regardless of insertion order).
  const sorted = [...redactions].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );

  return {
    body: {
      ...body,
      redactionPolicyId: policyId,
      redactions: sorted,
    },
    redactions: sorted,
  };
}
