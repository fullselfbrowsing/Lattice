/**
 * Strict RFC 3339 instant parsing for receipt timestamps.
 *
 * `Date.parse` treats a date-time with no `Z` or numeric offset as local
 * time and also accepts many non-ISO forms, so the same signed `expiresAt`
 * or `issuedAt` could be expired on one machine and valid on another (review
 * finding on PR #22). Receipt freshness must be a pure function of the
 * envelope and the verifier options, so only strings that name exactly one
 * instant are accepted: `YYYY-MM-DDTHH:MM:SS[.fff]Z` or the same shape with
 * a `+HH:MM` / `-HH:MM` offset. `Date#toISOString()` output always
 * satisfies this, which is what `ai.run` writes.
 */
const RFC3339_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/u;

/**
 * Epoch milliseconds for an RFC 3339 instant with an explicit offset, or
 * `undefined` when the string has any other shape or names an impossible
 * date (month 13, hour 25).
 */
export function parseRfc3339Instant(value: string): number | undefined {
  if (!RFC3339_INSTANT.test(value)) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
}

export function isRfc3339Instant(value: string): boolean {
  return parseRfc3339Instant(value) !== undefined;
}

/** Human-readable statement of the accepted shape, for error messages. */
export const RFC3339_INSTANT_REQUIREMENT =
  "an RFC 3339 timestamp with an explicit UTC offset (a trailing Z or +HH:MM, as produced by Date#toISOString())";
