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
 *                  Each `@` is examined once, so the scan stays linear on
 *                  long runs of word characters.
 *   - us-ssn       `ddd-dd-dddd`. The spaced `ddd dd dddd` form and an
 *                  undashed 9-digit run match only right after an SSN cue
 *                  (see the cue rules below), because on their own they are
 *                  usually counts, sizes, or routing numbers.
 *   - credit-card  13 to 19 digits with optional single space or dash
 *                  separators that pass Luhn. Every digit run in the text is
 *                  checked. When a run is not a card as written, the part
 *                  left after dropping its first group, its last group, or
 *                  both is checked too if it is shaped like a card (4-4-4-4,
 *                  4-4-4-4-3, 4-6-5, 4-6-4, or one unbroken 13-19 digit
 *                  group), so a number written next to a card ("Apt 18 4111
 *                  1111 1111 1111", "4111 1111 1111 1111 123") does not hide
 *                  it. A run whose groups all have the same length is not
 *                  cut, so a row of 4-digit numbers yields no extra
 *                  candidates, and a 4-digit number joined to a 4-4-4-4 card
 *                  ("4412 5555 5555 5555 4444") still hides it. A run that
 *                  starts with 0 or 1 (epoch milliseconds, snowflake ids) is
 *                  skipped, which also leaves UATP airline cards undetected,
 *                  and so is a 13-digit run that starts with 978 or 979
 *                  (ISBN-13). No issuer prefix list is applied, so UnionPay,
 *                  Maestro, Mir, and other networks match.
 *   - us-phone     `ddd-ddd-dddd`, `ddd.ddd.dddd`, `ddd ddd dddd`,
 *                  `(ddd) ddd-dddd`, each with an optional `+1` or `1`
 *                  trunk prefix. `+1` may be glued to the area code
 *                  (`+1415-555-1234`); a bare `1` prefix needs a separator so
 *                  it is not confused with a longer number. A plain 10-digit
 *                  run matches only when it is a valid NANP number, is not
 *                  the tail of a decimal, and follows a trunk prefix (`+1`
 *                  plus a separator, or `1-`) or comes right after a phone
 *                  cue. Unseparated 11-digit runs (E.164 `+14155551234`) stay
 *                  out of scope.
 *
 * Cue rules. Cues are read from the 48 characters before a candidate, cut
 * at the last line break and at the last sentence end (`.`, `;`, `!`, or
 * `?` before whitespace, except the abbreviations `no.` and `tel.`), so a
 * word on an earlier line or in an earlier sentence never counts. Words
 * are runs of ASCII letters and digits, so `call_id` reads as `call id`.
 *   - Identifier labels: order, orders, ord, invoice, inv, sku, ref, po,
 *     isbn, pn, and txn. A candidate of any type is skipped when the
 *     nearest word before it is one of these, with only whitespace and the
 *     connectors `:`, `#`, `=`, `no.` (or `no`), `number`, and `is` between
 *     them. So "Order No. 123-45-6789" is skipped, while "Order 5521,
 *     415-555-1234", "Customer SSN 123-45-6789", and "for reference
 *     123-45-6789" are flagged. A phone with a trunk prefix ("SKU +1 415 555
 *     0134") is flagged even right after a label.
 *   - Positive cues: `ssn`, `ss#`, and `social security` (or `social sec`)
 *     for an SSN; `phone`, `tel`, `call`, `mobile`, `cell`, and `fax` for a
 *     phone. A bare form needs the cue as the nearest word, with only
 *     punctuation and the words `no`, `number`, `num`, `nbr`, `nr`, `is`,
 *     `at`, `on`, `me`, and `us` between them. So "SSN: 123456789",
 *     "phone_number=4155551234", and "call me at 4155551234" are flagged,
 *     while "call_id=4155551234", "mobile build 2024101501", "Social media
 *     reach 123456789", and "SSN for order 123456789" are not.
 *
 * Known trade-offs, all deliberate:
 *   - A real value right after a label is not flagged ("ref 123-45-6789",
 *     "order 4111111111111111").
 *   - A bare form with any other word between the cue and the value is not
 *     flagged ("call Jane at 4155551234").
 *   - About one random 13-19 digit run in ten passes Luhn, and every run is
 *     checked, so a text that lists k long numeric ids (a CSV column, a JSON
 *     array, log lines) is flagged with probability near 1 - 0.9^k. A label
 *     in a header line does not help, because the cue window stops at the
 *     line break. Runs that start with 0 or 1 never count, which removes
 *     most epoch-millisecond and snowflake ids.
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

/**
 * Labels that mark the number right after them as an identifier rather than
 * as PII. Kept to short words that almost always name an id. Words that
 * often sit in front of real PII in support or CRM text (customer, account,
 * id, ticket, item) or in plain English ("for reference", "in part") are
 * deliberately absent.
 */
const IDENTIFIER_LABELS: readonly string[] = [
  "order",
  "orders",
  "ord",
  "invoice",
  "inv",
  "sku",
  "ref",
  "po",
  "isbn",
  "pn",
  "txn",
];

/** A label as the last word, followed only by connectors. */
const LABEL_BEFORE_VALUE = new RegExp(
  String.raw`(?:^|[^a-z0-9])(?:${IDENTIFIER_LABELS.join("|")})(?:[\s:#=]|\bno\b\.?|\bnumber\b|\bis\b)*$`,
);

/** Positive cues: single words, or two words joined by one space. */
const SSN_CUES: ReadonlySet<string> = new Set(["ssn", "ss#", "social security", "social sec"]);

const PHONE_CUES: ReadonlySet<string> = new Set(["phone", "tel", "call", "mobile", "cell", "fax"]);

/** Words that may sit between a positive cue and a bare value. */
const CUE_CONNECTORS: ReadonlySet<string> = new Set([
  "no",
  "number",
  "num",
  "nbr",
  "nr",
  "is",
  "at",
  "on",
  "me",
  "us",
]);

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
  // A word cut by the window edge is not a word ("piano." is not "no.").
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

/** The nearest word before `index` is an identifier label. */
function hasIdentifierLabel(input: string, index: number): boolean {
  return LABEL_BEFORE_VALUE.test(textBefore(input, index));
}

/**
 * The nearest word before `index` that is not a connector is one of `cues`
 * (or ends a two-word cue). Punctuation between them is ignored. A label or
 * any other word in between breaks the link, so "SSN for order 123456789"
 * and "call duration 2345678901" have no cue.
 */
function hasPositiveCue(input: string, index: number, cues: ReadonlySet<string>): boolean {
  const words = textBefore(input, index).match(/[a-z0-9]+#?/g) ?? [];
  for (let i = words.length - 1; i >= 0; i -= 1) {
    const token = words[i] ?? "";
    const word = token.endsWith("#") ? token.slice(0, -1) : token;
    if (cues.has(token) || cues.has(word)) return true;
    const previous = words[i - 1];
    if (previous !== undefined && cues.has(`${previous} ${word}`)) return true;
    if (!CUE_CONNECTORS.has(word)) return false;
  }
  return false;
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

/** ASCII letters, digits, `_`, `.`, `+`, and `-`: the email local-part class. */
function isEmailLocalChar(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 95 ||
    code === 46 ||
    code === 43 ||
    code === 45
  );
}

const emailDetector: PiiDetector = {
  name: "email",
  detect(input: string): PiiDetectorResult {
    // Local + domain + TLD, the same match as `[\w.+-]+@[\w-]+\.[\w.-]+`.
    // Requires at least one non-empty label on each side and a dot in the
    // domain part. Rejects `@bad`, `bad@`, `not-an-email`. Scanning from
    // each `@` instead of from every start position keeps a long run of
    // word characters (a base64 blob, a digit string) linear to scan: the
    // local part stops at the previous `@`, and the domain at the next.
    const domain = /[\w-]+\.[\w.-]+/y;
    for (let at = input.indexOf("@"); at !== -1; at = input.indexOf("@", at + 1)) {
      let start = at;
      while (start > 0 && isEmailLocalChar(input.charCodeAt(start - 1))) start -= 1;
      if (start === at) continue;
      domain.lastIndex = at + 1;
      const match = domain.exec(input);
      if (match !== null) return { matched: true, substring: input.slice(start, at + 1) + match[0] };
    }
    return { matched: false };
  },
};

const ssnDetector: PiiDetector = {
  name: "us-ssn",
  detect(input: string): PiiDetectorResult {
    // Group 1 is the dashed form, flagged unless an identifier label sits
    // right before it ("order 123-45-6789"). The spaced and undashed forms
    // need an SSN cue right before them ("SSN 123456789"), so "104857600
    // bytes" and "512 64 4096" pass. Word boundaries keep a 9-digit run from
    // matching inside a 10-digit phone or a 16-digit reference.
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

/** Digit groups joined by single space or dash separators. */
const DIGIT_RUN = /\b\d+(?:[ -]\d+)*\b/g;

/** 13-19 digits with optional single separators: a card as written. */
const CARD_CANDIDATE = /\b(?:\d[ -]?){13,19}\b/g;

/** How cards are printed: unbroken, 4-4-4-4, 4-4-4-4-3, 4-6-5, or 4-6-4. */
const CARD_SHAPE = /^(?:\d{13,19}|\d{4}(?:[ -]\d{4}){3}(?:[ -]\d{3})?|\d{4}[ -]\d{6}[ -]\d{4,5})$/;

/** `text` (found at `index`) as a reportable card, or undefined. */
function cardAt(input: string, index: number, text: string): string | undefined {
  // Strip a trailing space or dash that the candidate pattern may absorb.
  const trimmed = text.replace(/[ -]+$/, "");
  const digits = trimmed.replace(/\D/g, "");
  if (!luhn(digits) || isNonCardRun(digits)) return undefined;
  if (hasIdentifierLabel(input, index)) return undefined;
  return trimmed;
}

/** Every group of a digit run has the same number of digits. */
function hasUniformGroups(run: string): boolean {
  let first = -1;
  let length = 0;
  for (let i = 0; i <= run.length; i += 1) {
    const code = i < run.length ? run.charCodeAt(i) : 32;
    if (code >= 48 && code <= 57) {
      length += 1;
      continue;
    }
    if (first === -1) first = length;
    else if (length !== first) return false;
    length = 0;
  }
  return true;
}

/**
 * The card-shaped spans of a digit run left after dropping its first
 * group, its last group, or both, as `[start, end)` offsets into `run`.
 * A run whose groups all have the same length (a row of years, a long
 * dashed id) is not cut into card-sized pieces.
 */
function innerCardSpans(run: string): Array<readonly [number, number]> {
  const first = run.search(/[ -]/);
  if (first === -1 || hasUniformGroups(run)) return [];
  const last = Math.max(run.lastIndexOf(" "), run.lastIndexOf("-"));
  const spans: Array<readonly [number, number]> = [
    [first + 1, run.length],
    [0, last],
  ];
  if (first < last) spans.push([first + 1, last]);
  return spans.filter(([from, to]) => CARD_SHAPE.test(run.slice(from, to)));
}

const creditCardDetector: PiiDetector = {
  name: "credit-card",
  detect(input: string): PiiDetectorResult {
    // 13-19 digits with optional single space or dash separators, then
    // Luhn. Every candidate in every digit run is checked, so a reference
    // number earlier in the text does not hide a card after it. A short
    // number written next to a card joins it into one run ("Apt 18 4111
    // 1111 1111 1111"), so when no candidate in a run is a card, its
    // card-shaped inner spans are checked as well. The issuer prefix is not
    // allowlisted; only the known non-card runs and values right after an
    // identifier label ("ref 4111...") are skipped.
    for (const run of input.matchAll(DIGIT_RUN)) {
      const text = run[0];
      if (text.length < 13) continue;
      for (const candidate of text.matchAll(CARD_CANDIDATE)) {
        const card = cardAt(input, run.index + candidate.index, candidate[0]);
        if (card !== undefined) return { matched: true, substring: card };
      }
      for (const [start, end] of innerCardSpans(text)) {
        const card = cardAt(input, run.index + start, text.slice(start, end));
        if (card !== undefined) return { matched: true, substring: card };
      }
    }
    return { matched: false };
  },
};

/** A `+1` or `1` trunk prefix at the start of a phone match. */
const TRUNK_PREFIX = /^(?:\+1|1[ .-])/;

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
    // cue right before it ("call 4155551234"). An 11-digit run never
    // matches, because `\b` cannot start inside it.
    //
    // A trunk prefix is itself a phone cue and always sits nearer the value
    // than any label, so a prefixed match is flagged even after a label.
    // That also keeps "Order 1 415 555 0134" flagged when the order number
    // reads as a `1` trunk.
    for (const match of input.matchAll(
      /(?:(?:\+1[ .-]?|\b1[ .-])(?:\(\d{3}\)[ .-]?|\d{3}[ .-])|\(\d{3}\)[ .-]?|\b\d{3}[ .-])\d{3}[ .-]\d{4}\b|(?:(\+1[ .-]|\b1-)|(?<!\.))\b([2-9]\d{2}[2-9]\d{6})\b/g,
    )) {
      let flagged: boolean;
      if (TRUNK_PREFIX.test(match[0])) flagged = true;
      else if (match[2] !== undefined) flagged = hasPositiveCue(input, match.index, PHONE_CUES);
      else flagged = !hasIdentifierLabel(input, match.index);
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
