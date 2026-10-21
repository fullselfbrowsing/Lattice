/**
 * Strict RFC 3339 instant parsing for receipt timestamps.
 *
 * Two properties of `Date.parse` make it unsuitable for signed timestamps
 * (review findings on PR #22):
 *   - a date-time with no `Z` or numeric offset is read as local time, so
 *     the same `expiresAt` could be expired on one machine and valid on
 *     another;
 *   - several impossible dates that still match the RFC 3339 shape are
 *     rolled forward instead of rejected: on Node `2026-02-31T00:00:00Z`
 *     becomes March 3, a 31st in a 30-day month and a non-leap February 29
 *     roll into the next month, and hour 24 becomes midnight the next day,
 *     so an expiry written as February 31 would stay valid into March.
 *
 * Receipt freshness must be a pure function of the envelope and the
 * verifier options, so this module never calls `Date.parse`. It accepts only
 * `YYYY-MM-DDTHH:MM:SS[.f]Z` or the same shape with a `+HH:MM` / `-HH:MM`
 * offset, checks every field against the calendar (leap years included),
 * and computes the instant from the fields. `Date#toISOString()` output
 * always satisfies this, which is what `ai.run` writes.
 */
const RFC3339_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(?:(Z)|([+-])(\d{2}):(\d{2}))$/u;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 2:
      return isLeapYear(year) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

/**
 * Epoch milliseconds for an RFC 3339 instant with an explicit offset, or
 * `undefined` when the string has any other shape or names a date or time
 * that does not exist (February 31, hour 24, minute 60, offset 24:00).
 * Fractional seconds beyond milliseconds are truncated. Second 60 (a leap
 * second) is rejected because `Date` cannot represent it and
 * `toISOString()` never emits it.
 */
export function parseRfc3339Instant(value: string): number | undefined {
  const match = RFC3339_INSTANT.exec(value);
  if (match === null) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fraction = match[7] ?? "";
  if (month < 1 || month > 12) return undefined;
  if (day < 1 || day > daysInMonth(year, month)) return undefined;
  if (hour > 23 || minute > 59 || second > 59) return undefined;

  let offsetMinutes = 0;
  if (match[8] !== "Z") {
    const offsetHours = Number(match[10]);
    const offsetMins = Number(match[11]);
    if (offsetHours > 23 || offsetMins > 59) return undefined;
    offsetMinutes = (offsetHours * 60 + offsetMins) * (match[9] === "-" ? -1 : 1);
  }

  const millis = Number(`${fraction}000`.slice(0, 3));
  // setUTCFullYear rather than Date.UTC: Date.UTC maps years 0 to 99 onto
  // 1900 to 1999, which would silently move a four-digit year.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, millis);
  return date.getTime() - offsetMinutes * 60_000;
}

export function isRfc3339Instant(value: string): boolean {
  return parseRfc3339Instant(value) !== undefined;
}

/** Human-readable statement of the accepted shape, for error messages. */
export const RFC3339_INSTANT_REQUIREMENT =
  "a calendar-valid RFC 3339 timestamp with an explicit UTC offset (a trailing Z or +HH:MM, as produced by Date#toISOString())";
