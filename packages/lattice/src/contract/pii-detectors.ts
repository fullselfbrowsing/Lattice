/**
 * Regex-based PII detectors used by the `no-pii` tripwire invariant.
 *
 * Phase 8 ships four detectors (email, US SSN, Luhn-valid credit card,
 * US phone). They are intentionally regex-only — zero new dependencies —
 * per the v1.1 scope locked in 08-CONTEXT.md.
 *
 * In-scope formats (anything else is NOT detected by default; supply your
 * own `PiiDetector` list to `evaluateTripwires` for more):
 *   - email        `local@domain.tld` (one `@`, a dot in the domain part)
 *   - us-ssn       `ddd-dd-dddd`, `ddd dd dddd`, and an undashed 9-digit
 *                  run. A candidate is skipped when an identifier cue
 *                  (order, invoice, sku, ref, id, and the same family)
 *                  appears in the 32 characters before it, so an
 *                  SSN-shaped order id is not flagged. The cue is a whole
 *                  word, so a real SSN labeled "SSN" still matches.
 *   - credit-card  13 to 19 digits with optional single space or dash
 *                  separators, a known card IIN, and a valid Luhn check.
 *                  A 16-digit reference prefixed by ref/order/sku/id is
 *                  not flagged, and an ISBN-13 (978/979) fails the IIN.
 *   - us-phone     `ddd-ddd-dddd`, `ddd.ddd.dddd`, `ddd ddd dddd`,
 *                  `(ddd) ddd-dddd`, a plain 10-digit run, each with an
 *                  optional `+1` or `1` trunk prefix. `+1` may be glued
 *                  to the area code (`+1415-555-1234`); a bare `1` prefix
 *                  needs a separator so it is not confused with a longer
 *                  number. Unseparated 11-digit runs (E.164
 *                  `+14155551234`) stay out of scope. The same identifier
 *                  cue that protects order ids suppresses a phone-shaped
 *                  SKU.
 * Names, postal addresses, IP addresses, dates of birth, and non-US formats
 * are not detected.
 *
 * Each detector returns either `{ matched: true, substring }` carrying
 * ONLY the matched fragment, or `{ matched: false }`. The substring shape
 * is required so the tripwire evaluator can emit narrowed evidence; the
 * receipt redaction policy (receipts/redact.ts) masks it before signing.
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

/**
 * Whole-word cues that mark the following number as an identifier rather
 * than as PII. Kept tight: "id" is included because order and account ids
 * are the documented collision, and it is matched as its own word so
 * "valid" or "paid" do not count. The window is the 32 characters before
 * the candidate, which covers "order ", "SKU ", and "ref ".
 */
const IDENTIFIER_WORDS: ReadonlySet<string> = new Set([
  "order",
  "orders",
  "ord",
  "oid",
  "invoice",
  "inv",
  "sku",
  "part",
  "pn",
  "ref",
  "reference",
  "refs",
  "id",
  "po",
  "tracking",
  "account",
  "acct",
  "item",
  "ticket",
  "txn",
  "transaction",
  "customer",
  "confirmation",
  "product",
  "catalog",
  "isbn",
  "doi",
  "serial",
  "lot",
]);

function hasIdentifierCue(input: string, index: number): boolean {
  // Only the two tokens immediately before the number. A wider window would
  // treat an unrelated earlier word ("see the id. Then 123-45-6789" is
  // already cut by punctuation below) as a label for this number.
  const window = input.slice(Math.max(0, index - 48), index).replace(/.*[.;:!?]/, "");
  const tokens = window.toLowerCase().match(/[a-z][a-z0-9-]*/g) ?? [];
  return tokens.slice(-2).some((token) => IDENTIFIER_WORDS.has(token));
}

/** Major card IINs. ISBN-13 (978/979) and random references fail this. */
function hasCardIin(digits: string): boolean {
  if (digits.startsWith("4")) return true;
  const two = Number(digits.slice(0, 2));
  if (two >= 51 && two <= 55) return true;
  const four = Number(digits.slice(0, 4));
  if (four >= 2221 && four <= 2720) return true;
  if (digits.startsWith("34") || digits.startsWith("37")) return true;
  if (digits.startsWith("6011") || digits.startsWith("65")) return true;
  const three = Number(digits.slice(0, 3));
  if (three >= 644 && three <= 649) return true;
  if (four >= 3528 && four <= 3589) return true;
  if (three >= 300 && three <= 305) return true;
  if (digits.startsWith("36") || digits.startsWith("38")) return true;
  return false;
}

function firstUnsuppressed(
  regex: RegExp,
  input: string,
): { readonly substring: string; readonly index: number } | undefined {
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  const global = new RegExp(regex.source, flags);
  let match: RegExpExecArray | null;
  while ((match = global.exec(input)) !== null) {
    if (!hasIdentifierCue(input, match.index)) {
      return { substring: match[0], index: match.index };
    }
    if (match[0].length === 0) global.lastIndex += 1;
  }
  return undefined;
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
    // Dashed, spaced, then undashed. Word boundaries keep a 9-digit run
    // from matching inside a 10-digit phone or a 16-digit reference.
    // Identifier context ("order 123-45-6789", "order 123456789") is
    // skipped so those stay non-matches; "SSN 123456789" has no such cue.
    const candidate = firstUnsuppressed(
      /\b\d{3}-\d{2}-\d{4}\b|\b\d{3} \d{2} \d{4}\b|\b\d{9}\b/,
      input,
    );
    return candidate !== undefined
      ? { matched: true, substring: candidate.substring }
      : { matched: false };
  },
};

const creditCardDetector: PiiDetector = {
  name: "credit-card",
  detect(input: string): PiiDetectorResult {
    // 13-19 digits with optional single space or dash separators, then a
    // known IIN and Luhn. IIN drops ISBN-13 and most random 16-digit
    // references; the identifier cue drops the rest ("ref 4111...").
    const flags = "g";
    const global = new RegExp(String.raw`\b(?:\d[ -]?){13,19}\b`, flags);
    let match: RegExpExecArray | null;
    while ((match = global.exec(input)) !== null) {
      const trimmed = match[0].replace(/[ -]+$/, "");
      const digits = trimmed.replace(/\D/g, "");
      if (!luhn(trimmed) || !hasCardIin(digits)) continue;
      if (hasIdentifierCue(input, match.index)) continue;
      return { matched: true, substring: trimmed };
    }
    return { matched: false };
  },
};

const phoneDetector: PiiDetector = {
  name: "us-phone",
  detect(input: string): PiiDetectorResult {
    // Three ways into the area code, then the 3-4 tail with a separator.
    //   1. A `+1` or `1` trunk prefix followed by the area code. After a
    //      consumed prefix the area code needs no word boundary, so
    //      `+1415-555-1234` matches (review finding on PR #22); `1` without
    //      `+` still requires its own separator (`\b1[ .-]`).
    //   2. A parenthesized area code with no prefix.
    //   3. A bare area code at a word boundary followed by a separator.
    // Separators may be dash, dot, or space (issue #21 F8). A plain
    // 10-digit run is included; an 11-digit run still is not, because
    // `\b\d{10}\b` cannot start inside a longer digit run. Identifier
    // context suppresses phone-shaped SKUs ("SKU 123-456-7890").
    const candidate = firstUnsuppressed(
      /(?:(?:\+1[ .-]?|\b1[ .-])(?:\(\d{3}\)[ .-]?|\d{3}[ .-])|\(\d{3}\)[ .-]?|\b\d{3}[ .-])\d{3}[ .-]\d{4}\b|\b\d{10}\b/,
      input,
    );
    return candidate !== undefined
      ? { matched: true, substring: candidate.substring }
      : { matched: false };
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
