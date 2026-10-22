/**
 * Regex-based PII detectors used by the `no-pii` tripwire invariant.
 *
 * Phase 8 ships four detectors (email, US SSN, Luhn-valid credit card,
 * US phone). They are intentionally regex-only — zero new dependencies —
 * per the v1.1 scope locked in 08-CONTEXT.md.
 *
 * In-scope formats (anything else is NOT detected by default; supply your
 * own `PiiDetector` list to `evaluateTripwires` for more):
 *   - email        `local@domain.tld` (one `@`, a dot in the domain part).
 *                  The local part is capped at 64 characters and the first
 *                  domain label at 63, which keeps the scan linear on long
 *                  runs of word characters.
 *   - us-ssn       `ddd-dd-dddd`. The spaced `ddd dd dddd` form and an
 *                  undashed 9-digit run match only after an SSN cue (`ssn`,
 *                  `social`, `ss#`), because on their own they are usually
 *                  counts, sizes, or routing numbers.
 *   - credit-card  13 to 19 digits with optional single space or dash
 *                  separators that pass Luhn. A run that starts with 0 or 1
 *                  (epoch milliseconds, snowflake ids) is skipped, which
 *                  also leaves UATP airline cards undetected, and so is a
 *                  13-digit run that starts with 978 or 979 (ISBN-13).
 *   - us-phone     `ddd-ddd-dddd`, `ddd.ddd.dddd`, `ddd ddd dddd`,
 *                  `(ddd) ddd-dddd`, each with an optional `+1` or `1`
 *                  trunk prefix. `+1` may be glued to the area code
 *                  (`+1415-555-1234`); a bare `1` prefix needs a separator so
 *                  it is not confused with a longer number. A plain 10-digit
 *                  run matches only when it is a valid NANP number, is not
 *                  the tail of a decimal, and follows a trunk prefix (`+1`
 *                  plus a separator, or `1-`) or a phone cue (`phone`,
 *                  `tel`, `call`, `mobile`, `cell`, `fax`). Unseparated
 *                  11-digit runs (E.164 `+14155551234`) stay out of scope.
 *
 * Cue rules. Cues are read from the 48 characters before a candidate, cut
 * at the last line break and at the last sentence end (`.`, `;`, `!`, or
 * `?` before whitespace, except the abbreviations `no.` and `tel.`), so a
 * word on an earlier line or in an earlier sentence never counts.
 *   - A candidate of any type is skipped when the nearest token before it
 *     is an identifier label: order, orders, ord, invoice, inv, sku, ref,
 *     reference, po, isbn, part, pn, or txn. Only whitespace and the
 *     connectors `:`, `#`, `=`, `no.` (or `no`), `number`, and `is` may sit
 *     between the label and the value, so "Order No. 123-45-6789" is
 *     skipped while "Order 5521, 415-555-1234" and "Customer SSN
 *     123-45-6789" are flagged.
 *     The trade-off is deliberate: a real value written right after one of
 *     these labels ("for reference 123-45-6789") is not flagged.
 *   - A positive cue counts only when it comes after every identifier label
 *     in that text, so "SSN for order 123456789" is not flagged.
 *
 * Detectors see one string at a time, not the field name that holds it, so
 * a bare value under a telling key (`{ ssn: "123456789" }`) is not flagged.
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
 * Labels that mark the number right after them as an identifier rather than
 * as PII. Kept to words that almost always name an id. Words that often sit
 * in front of real PII in support or CRM text (customer, account, id,
 * ticket, item) are deliberately absent.
 */
const IDENTIFIER_LABELS: readonly string[] = [
  "order",
  "orders",
  "ord",
  "invoice",
  "inv",
  "sku",
  "ref",
  "reference",
  "po",
  "isbn",
  "part",
  "pn",
  "txn",
];

const IDENTIFIER_LABEL_SET: ReadonlySet<string> = new Set(IDENTIFIER_LABELS);

/** A label as the last token, followed only by connectors. */
const LABEL_BEFORE_VALUE = new RegExp(
  String.raw`(?:^|[^a-z0-9])(?:${IDENTIFIER_LABELS.join("|")})(?:[\s:#=]|\bno\b\.?|\bnumber\b|\bis\b)*$`,
);

const SSN_CUES: ReadonlySet<string> = new Set(["ssn", "social", "ss#"]);

const PHONE_CUES: ReadonlySet<string> = new Set(["phone", "tel", "call", "mobile", "cell", "fax"]);

/** Abbreviations whose period does not end the sentence. */
const ABBREVIATIONS: ReadonlySet<string> = new Set(["no", "tel"]);

const CUE_WINDOW = 48;

/**
 * The lowercased text before `index` that may describe the candidate: at
 * most CUE_WINDOW characters, cut after the last line break and after the
 * last sentence end.
 */
function textBefore(input: string, index: number): string {
  const from = Math.max(0, index - CUE_WINDOW);
  let window = input.slice(from, index).toLowerCase();
  // A word cut by the window edge is not a token ("piano." is not "no.").
  if (from > 0 && /\w/.test(input.charAt(from - 1))) window = window.replace(/^\w+/, "");
  let start = window.lastIndexOf("\n") + 1;
  for (const stop of window.matchAll(/(\b[a-z]+)?[.;!?](?=\s)/g)) {
    const end = stop.index + stop[0].length;
    if (end <= start) continue;
    const word = stop[1];
    if (stop[0].endsWith(".") && word !== undefined && ABBREVIATIONS.has(word)) continue;
    start = end;
  }
  return window.slice(start);
}

/** The nearest token before `index` is an identifier label. */
function hasIdentifierLabel(input: string, index: number): boolean {
  return LABEL_BEFORE_VALUE.test(textBefore(input, index));
}

/** A token from `cues` appears before `index`, after every identifier label. */
function hasPositiveCue(input: string, index: number, cues: ReadonlySet<string>): boolean {
  let cued = false;
  for (const [token] of textBefore(input, index).matchAll(/[a-z0-9]+#?/g)) {
    const word = token.endsWith("#") ? token.slice(0, -1) : token;
    if (IDENTIFIER_LABEL_SET.has(word)) cued = false;
    else if (cues.has(token) || cues.has(word)) cued = true;
  }
  return cued;
}

/**
 * Luhn-valid runs that are not payment cards. ISO/IEC 7812 major industry
 * identifiers 0 and 1 hold no bank cards (only UATP airline cards start
 * with 1), and in model output such a run is far more often an
 * epoch-millisecond timestamp or a snowflake id. A 13-digit 978 or 979 run
 * is an ISBN-13.
 */
function isNonCardRun(digits: string): boolean {
  if (digits.startsWith("0") || digits.startsWith("1")) return true;
  return digits.length === 13 && (digits.startsWith("978") || digits.startsWith("979"));
}

const emailDetector: PiiDetector = {
  name: "email",
  detect(input: string): PiiDetectorResult {
    // Local + domain + TLD. Requires at least one non-empty label on each
    // side and a dot in the domain part. Rejects `@bad`, `bad@`, `not-an-email`.
    // The bounded local part and first label keep a long run of word
    // characters with no `@` (a base64 blob, a digit string) linear to scan.
    const substring = execFirst(/[\w.+-]{1,64}@[\w-]{1,63}\.[\w.-]+/, input);
    return substring !== undefined ? { matched: true, substring } : { matched: false };
  },
};

const ssnDetector: PiiDetector = {
  name: "us-ssn",
  detect(input: string): PiiDetectorResult {
    // Group 1 is the dashed form, flagged unless an identifier label sits
    // right before it ("order 123-45-6789"). The spaced and undashed forms
    // need an SSN cue ("SSN 123456789"), so "104857600 bytes" and
    // "512 64 4096" pass. Word boundaries keep a 9-digit run from matching
    // inside a 10-digit phone or a 16-digit reference.
    for (const match of input.matchAll(
      /\b(\d{3}-\d{2}-\d{4})\b|\b\d{3} \d{2} \d{4}\b|(?<!\.)\b\d{9}\b/g,
    )) {
      const flagged =
        match[1] !== undefined
          ? !hasIdentifierLabel(input, match.index)
          : hasPositiveCue(input, match.index, SSN_CUES);
      if (flagged) return { matched: true, substring: match[0] };
    }
    return { matched: false };
  },
};

const creditCardDetector: PiiDetector = {
  name: "credit-card",
  detect(input: string): PiiDetectorResult {
    // 13-19 digits with optional single space or dash separators, then
    // Luhn. Every candidate is checked, so a reference number earlier in
    // the text does not hide a card after it. The issuer prefix is not
    // allowlisted, so UnionPay, Maestro, Mir, RuPay, and other networks
    // match; only the known non-card runs and labeled ids ("ref 4111...")
    // are skipped.
    for (const match of input.matchAll(/\b(?:\d[ -]?){13,19}\b/g)) {
      const trimmed = match[0].replace(/[ -]+$/, "");
      const digits = trimmed.replace(/\D/g, "");
      if (!luhn(digits) || isNonCardRun(digits)) continue;
      if (hasIdentifierLabel(input, match.index)) continue;
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
    // Separators may be dash, dot, or space (issue #21 F8). These forms are
    // flagged unless an identifier label sits right before them ("SKU
    // 123-456-7890").
    //
    // The last alternative is a plain 10-digit run (group 2) with an
    // optional `+1` plus separator or `1-` trunk prefix (group 1). It must
    // be a valid NANP number, so epoch seconds before 2033 and anything with
    // a leading 0 or 1 fail, and without a prefix it may not follow a `.`,
    // so "3.1415926535" fails. Without a trunk prefix it also needs a phone
    // cue ("call 4155551234"). An 11-digit run never matches, because `\b`
    // cannot start inside it.
    for (const match of input.matchAll(
      /(?:(?:\+1[ .-]?|\b1[ .-])(?:\(\d{3}\)[ .-]?|\d{3}[ .-])|\(\d{3}\)[ .-]?|\b\d{3}[ .-])\d{3}[ .-]\d{4}\b|(?:(\+1[ .-]|\b1-)|(?<!\.))\b([2-9]\d{2}[2-9]\d{6})\b/g,
    )) {
      const flagged =
        match[2] !== undefined && match[1] === undefined
          ? hasPositiveCue(input, match.index, PHONE_CUES)
          : !hasIdentifierLabel(input, match.index);
      if (flagged) return { matched: true, substring: match[0] };
    }
    return { matched: false };
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
