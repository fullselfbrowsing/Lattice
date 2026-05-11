/**
 * Regex-based PII detectors used by the `no-pii` tripwire invariant.
 *
 * Phase 8 ships four detectors (email, US SSN, Luhn-valid credit card,
 * US phone). They are intentionally regex-only — zero new dependencies —
 * per the v1.1 scope locked in 08-CONTEXT.md.
 *
 * Each detector returns either `{ matched: true, substring }` carrying
 * ONLY the matched fragment, or `{ matched: false }`. The substring shape
 * is required so the tripwire evaluator can emit redacted evidence
 * (Phase 9 receipts must not leak the full input).
 *
 * Detector order in `defaultPiiDetectors` is deterministic so the
 * evaluator's first-violation semantics produce stable receipts.
 */

export type PiiDetectorResult =
  | { readonly matched: true; readonly substring: string }
  | { readonly matched: false };

export interface PiiDetector {
  readonly name: string;
  detect(input: string): PiiDetectorResult;
}

/**
 * Luhn check digit validator.
 *
 * Strips non-digit characters from `digits`, requires the resulting length
 * to be 13-19 (ISO/IEC 7812 PAN range), then walks right-to-left doubling
 * every second digit and summing. Returns true when the sum is a multiple
 * of 10.
 */
function luhn(digits: string): boolean {
  const cleaned = digits.replace(/\D/g, "");
  if (cleaned.length < 13 || cleaned.length > 19) return false;

  let sum = 0;
  let shouldDouble = false;
  for (let i = cleaned.length - 1; i >= 0; i -= 1) {
    const code = cleaned.charCodeAt(i);
    // Defensive: charAt cannot produce non-digits here because of the
    // `replace(/\D/g, "")` above, but keep a guard for clarity.
    if (code < 48 || code > 57) return false;
    let digit = code - 48;
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function execFirst(regex: RegExp, input: string): string | undefined {
  // Always create a fresh exec; we do not rely on regex statefulness.
  const match = regex.exec(input);
  return match ? match[0] : undefined;
}

const emailDetector: PiiDetector = {
  name: "email",
  detect(input: string): PiiDetectorResult {
    // Local + domain + TLD. Requires at least one non-empty label on each
    // side and a dot in the domain part. Rejects `@bad`, `bad@`, `not-an-email`.
    const substring = execFirst(/[\w.+-]+@[\w-]+\.[\w.-]+/, input);
    return substring !== undefined ? { matched: true, substring } : { matched: false };
  },
};

const ssnDetector: PiiDetector = {
  name: "us-ssn",
  detect(input: string): PiiDetectorResult {
    // 3-2-4 grouped SSN with word boundaries on both sides to avoid
    // collapsing into longer adjacent digit runs (e.g., phone numbers).
    const substring = execFirst(/\b\d{3}-\d{2}-\d{4}\b/, input);
    return substring !== undefined ? { matched: true, substring } : { matched: false };
  },
};

const creditCardDetector: PiiDetector = {
  name: "credit-card",
  detect(input: string): PiiDetectorResult {
    // Match any 13-19 character sequence of digits with optional single
    // space or dash separators, then validate with Luhn. The regex is
    // intentionally permissive on separators (banks/forms vary); Luhn
    // filters trivially-formatted strings per Pitfall #5 in CONTEXT.md.
    const candidate = execFirst(/\b(?:\d[ -]?){13,19}\b/, input);
    if (candidate === undefined) return { matched: false };
    // Strip trailing space/dash that the regex may have absorbed.
    const trimmed = candidate.replace(/[ -]+$/, "");
    if (!luhn(trimmed)) return { matched: false };
    return { matched: true, substring: trimmed };
  },
};

const phoneDetector: PiiDetector = {
  name: "us-phone",
  detect(input: string): PiiDetectorResult {
    // Dashed form first, then parenthesized form. Combined alternation so
    // the regex engine picks whichever fires first in input order.
    const substring = execFirst(/\b\d{3}-\d{3}-\d{4}\b|\(\d{3}\)\s?\d{3}-\d{4}/, input);
    return substring !== undefined ? { matched: true, substring } : { matched: false };
  },
};

/**
 * Default PII detectors used by `evaluateTripwires` for `no-pii` invariants.
 *
 * Order is deterministic: email, us-ssn, credit-card, us-phone. Callers who
 * need a different set can pass their own list to `evaluateTripwires`.
 */
export const defaultPiiDetectors: readonly PiiDetector[] = Object.freeze([
  emailDetector,
  ssnDetector,
  creditCardDetector,
  phoneDetector,
]);
