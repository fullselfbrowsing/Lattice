import type { TripwireEvidence } from "../contract/tripwire.js";

import type {
  CapabilityReceiptBody,
  ReceiptRedaction,
} from "./types.js";

/**
 * Default redaction policy id for v1.1+. Free-form string per
 * 09-CONTEXT.md — registry enforcement deferred to a later schema.
 */
export const DEFAULT_REDACTION_POLICY_ID = "lattice.default.v1";

/** Manifest reason: no-pii `observed` was rewritten to detector, length, and mask. */
export const NO_PII_REDACTION_REASON = "no-pii-detector-mask-only";
/** Manifest reason: a non-no-pii `observed` value was replaced by its shape. */
export const TRIPWIRE_OBSERVED_REDACTION_REASON = "tripwire-observed-value-elided";
/**
 * Manifest reason: `message` was rebuilt from developer-owned fields only
 * (invariant kind, declared path, detector name). Applies to every kind.
 */
export const TRIPWIRE_MESSAGE_REDACTION_REASON = "tripwire-message-templated";

export interface RedactionResult {
  readonly body: CapabilityReceiptBody;
  readonly redactions: readonly ReceiptRedaction[];
}

export type RedactedObservedValueType =
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "undefined"
  | "array"
  | "object";

/** Signed shape of `tripwireEvidence.observed` when kind is "no-pii". */
export interface RedactedNoPiiObserved {
  readonly detector: string;
  /**
   * Number of Unicode code points in the matched substring, which is also
   * the number of code points in `mask`. Counted on the mask rather than the
   * raw match so first-pass and re-redaction agree for supplementary-plane
   * characters (one code point, two UTF-16 units).
   */
  readonly length: number;
  /**
   * Matched substring with every letter, digit, and combining mark in any
   * script replaced by "*"; separators, symbols, and whitespace are kept.
   */
  readonly mask: string;
}

/**
 * Signed shape of `tripwireEvidence.observed` for the other invariant kinds.
 *
 * Deliberately a closed vocabulary with no free values. The raw observed
 * value for `field-from-table` and `matches` is model output, and any field
 * that carried a number or string from it could be mimicked by that output
 * to smuggle content past redaction (review finding on PR #22). The full
 * value is still committed to by `outputHash`.
 */
export interface RedactedObservedShape {
  readonly valueType: RedactedObservedValueType;
}

const OBSERVED_VALUE_TYPES: ReadonlySet<string> = new Set<RedactedObservedValueType>([
  "string",
  "number",
  "boolean",
  "null",
  "undefined",
  "array",
  "object",
]);

/**
 * Replace every letter, digit, and combining mark in any script with "*",
 * keeping punctuation, symbols, and whitespace so the shape of the match
 * stays readable: "123-45-6789" -> "***-**-****",
 * "alice@example.com" -> "*****@*******.***", "José Müller" -> "**** ******",
 * fullwidth "４１１１" -> "****". Idempotent.
 */
export function maskPiiSubstring(value: string): string {
  return value.replace(/[\p{L}\p{N}\p{M}]/gu, "*");
}

/**
 * Code-point count of a string. `String#length` counts UTF-16 units, so a
 * supplementary-plane letter would count as two before masking and one after
 * (it masks to a single "*"), making redaction non-idempotent. Masking maps
 * each code point to exactly one code point, so this count is the same for a
 * match and for its mask.
 */
function codePointLength(value: string): number {
  let count = 0;
  for (const _ of value) count += 1;
  return count;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function redactNoPiiObserved(observed: unknown): RedactedNoPiiObserved {
  const record = isRecord(observed) ? observed : {};
  const detector = typeof record.detector === "string" ? record.detector : "unknown";
  // Already-redacted shape: re-mask the mask and derive the length from it.
  // For a genuine mask this is the identity, so redaction stays idempotent;
  // for a forged mask it guarantees no cleartext survives and no number from
  // the input is trusted. `detector` is the one free string kept here: in
  // every kernel path it is a detector name, which is developer-owned
  // configuration, never model output.
  if (!("substring" in record) && typeof record.mask === "string") {
    const mask = maskPiiSubstring(record.mask);
    return { detector, length: codePointLength(mask), mask };
  }
  // Normal path: the kernel emitted { detector, substring }. A malformed
  // observed (no string substring) collapses to an empty, safe shape. The
  // length is counted on the mask, in code points, so it equals what the
  // already-redacted branch computes on a second pass.
  const substring = typeof record.substring === "string" ? record.substring : "";
  const mask = maskPiiSubstring(substring);
  return { detector, length: codePointLength(mask), mask };
}

/**
 * True only for an object whose sole key is `valueType` with a value from the
 * closed set. Passing such an object through is harmless even when it is raw
 * model output, because it carries nothing but one of seven fixed strings.
 */
function isRedactedObservedShape(value: unknown): value is RedactedObservedShape {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.length !== 1 || keys[0] !== "valueType") return false;
  return typeof value.valueType === "string" && OBSERVED_VALUE_TYPES.has(value.valueType);
}

function redactObservedShape(observed: unknown): RedactedObservedShape {
  if (isRedactedObservedShape(observed)) return { valueType: observed.valueType };
  if (observed === null) return { valueType: "null" };
  if (observed === undefined) return { valueType: "undefined" };
  if (Array.isArray(observed)) return { valueType: "array" };
  switch (typeof observed) {
    case "string":
      return { valueType: "string" };
    case "number":
      return { valueType: "number" };
    case "boolean":
      return { valueType: "boolean" };
    default:
      return { valueType: "object" };
  }
}

/**
 * Rebuild the evidence message from developer-owned inputs only. The kernel's
 * message is written for the runtime error and may embed the concrete
 * location of a no-pii hit (model-produced object keys) or a schema
 * library's issue text (the offending value), so the signed copy never
 * reuses it.
 */
function templatedMessage(
  kind: TripwireEvidence["kind"],
  path: string,
  detector: string | undefined,
): string {
  switch (kind) {
    case "no-pii":
      return `no-pii: detector "${detector ?? "unknown"}" flagged content at "${path}".`;
    case "must-cite":
      return `must-cite: no matching citation at "${path}".`;
    case "field-from-table":
      return `field-from-table: value at "${path}" not in allowedValues.`;
    case "matches":
      return `matches: schema validation failed at "${path}".`;
    default: {
      const exhaustive: never = kind;
      return `${String(exhaustive)}: violation at "${path}".`;
    }
  }
}

/**
 * Redact a receipt body BEFORE canonicalization (and BEFORE signing).
 *
 * The signed digest commits to canonicalize(redact(body)). NEVER the
 * other way around. See 09-CONTEXT.md "Redact-Then-Sign Ordering
 * (UNRETROFITTABLE)" and PITFALLS.md Pitfall #1.
 *
 * Division of labor:
 *   - The tripwire kernel (contract/tripwire.ts) emits evidence with the raw
 *     matched value in `observed` so `ai.run` callers can act on the runtime
 *     error. That copy is never signed.
 *   - THIS function is the only place the signed copy is sanitized. For
 *     every tripwire kind it rewrites `tripwireEvidence.observed`:
 *       no-pii           -> { detector, length, mask }   (foundAt dropped)
 *       must-cite        -> { valueType }
 *       field-from-table -> { valueType }
 *       matches          -> { valueType }
 *     The only free string in a signed shape is the no-pii `detector` name,
 *     which is developer-owned configuration in every kernel path.
 *     and rebuilds `tripwireEvidence.message` from the kind, the declared
 *     path, and the detector name, because the kernel's message may embed
 *     model-produced object keys (no-pii) or schema issue text (matches).
 *     `tripwireEvidence.path` is already the declared path and is kept.
 *     Each rewrite pushes its manifest entry at the same moment, so the
 *     manifest can never claim a redaction that did not happen.
 *   - No hash of the observed value is kept. `outputHash` already commits to
 *     the full output, and an unsalted hash of a short secret such as an SSN
 *     is brute-forceable.
 *   - Provider responses are hashed into inputHashes/outputHash, never
 *     embedded raw; router reject messages contain no user content.
 *
 * Pure, synchronous, idempotent. Returns a NEW body — never mutates the input.
 */
export function redactReceiptBody(
  body: CapabilityReceiptBody,
  policyId: string = DEFAULT_REDACTION_POLICY_ID,
): RedactionResult {
  const redactions: ReceiptRedaction[] = [];
  let tripwireEvidence: TripwireEvidence | undefined = body.tripwireEvidence;

  if (tripwireEvidence !== undefined) {
    const isNoPii = tripwireEvidence.kind === "no-pii";
    const observed = isNoPii
      ? redactNoPiiObserved(tripwireEvidence.observed)
      : redactObservedShape(tripwireEvidence.observed);
    redactions.push({
      path: "tripwireEvidence.observed",
      reason: isNoPii ? NO_PII_REDACTION_REASON : TRIPWIRE_OBSERVED_REDACTION_REASON,
    });

    const message = templatedMessage(
      tripwireEvidence.kind,
      tripwireEvidence.path,
      isNoPii ? (observed as RedactedNoPiiObserved).detector : undefined,
    );
    redactions.push({
      path: "tripwireEvidence.message",
      reason: TRIPWIRE_MESSAGE_REDACTION_REASON,
    });

    tripwireEvidence = { ...tripwireEvidence, observed, message };
  }

  // Sort redactions by path for canonical-form stability (sorted arrays
  // canonicalize identically regardless of insertion order).
  const sorted = [...redactions].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );

  return {
    body: {
      ...body,
      ...(tripwireEvidence !== undefined ? { tripwireEvidence } : {}),
      redactionPolicyId: policyId,
      redactions: sorted,
    },
    redactions: sorted,
  };
}
