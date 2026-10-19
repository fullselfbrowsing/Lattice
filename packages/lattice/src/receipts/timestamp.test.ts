import { describe, expect, it } from "vitest";

import { isRfc3339Instant, parseRfc3339Instant } from "./timestamp.js";

describe("parseRfc3339Instant", () => {
  it.each([
    ["Z, no fraction", "2026-10-18T12:00:00Z", Date.UTC(2026, 9, 18, 12)],
    ["Z, milliseconds", "2026-10-18T12:00:00.123Z", Date.UTC(2026, 9, 18, 12, 0, 0, 123)],
    ["Z, nanoseconds (truncated by Date.parse)", "2026-10-18T12:00:00.123456789Z", Date.UTC(2026, 9, 18, 12, 0, 0, 123)],
    ["positive offset", "2026-10-18T12:00:00+05:30", Date.UTC(2026, 9, 18, 6, 30)],
    ["negative offset", "2026-10-18T12:00:00-07:00", Date.UTC(2026, 9, 18, 19)],
    ["leap day in a leap year", "2024-02-29T00:00:00Z", Date.UTC(2024, 1, 29)],
    ["leap day in a 400-year century", "2000-02-29T00:00:00Z", Date.UTC(2000, 1, 29)],
    ["last valid second of a day", "2026-10-18T23:59:59Z", Date.UTC(2026, 9, 18, 23, 59, 59)],
    ["31st of a 31-day month", "2026-10-31T00:00:00Z", Date.UTC(2026, 9, 31)],
    ["unknown-local-offset form -00:00", "2026-10-18T12:00:00-00:00", Date.UTC(2026, 9, 18, 12)],
  ])("accepts %s", (_label, input, expected) => {
    expect(parseRfc3339Instant(input)).toBe(expected);
    expect(isRfc3339Instant(input)).toBe(true);
  });

  it.each([
    ["offset-less date-time (Date.parse would read it as local time)", "2026-10-18T12:00:00"],
    ["date only (Date.parse would read it as UTC midnight)", "2026-10-18"],
    ["missing seconds", "2026-10-18T12:00Z"],
    ["lowercase t and z", "2026-10-18t12:00:00z"],
    ["space separator", "2026-10-18 12:00:00Z"],
    ["non-ISO text", "Oct 18 2026"],
    ["impossible month", "2026-13-01T00:00:00Z"],
    ["impossible hour", "2026-10-18T25:00:00Z"],
    ["empty", ""],
    // Date.parse rolls each of these forward into a real later instant
    // (review follow-up round 6); they must be rejected, not shifted.
    ["February 31 (Date.parse says March 3)", "2026-02-31T00:00:00Z"],
    ["April 31 (Date.parse says May 1)", "2026-04-31T00:00:00Z"],
    ["February 29 in a non-leap year", "2026-02-29T00:00:00Z"],
    ["February 29 in a 100-year non-leap century", "1900-02-29T00:00:00Z"],
    ["hour 24 (Date.parse says next midnight)", "2026-10-18T24:00:00Z"],
    ["minute 60", "2026-10-18T12:60:00Z"],
    ["leap second 60", "2026-10-18T12:00:60Z"],
    ["offset hour 24", "2026-10-18T12:00:00+24:00"],
    ["offset minute 60", "2026-10-18T12:00:00+05:60"],
    ["month 00", "2026-00-18T12:00:00Z"],
    ["day 00", "2026-10-00T12:00:00Z"],
  ])("rejects %s", (_label, input) => {
    expect(parseRfc3339Instant(input)).toBeUndefined();
    expect(isRfc3339Instant(input)).toBe(false);
  });

  it("accepts every Date#toISOString output", () => {
    const iso = new Date(1_792_324_800_000).toISOString();
    expect(parseRfc3339Instant(iso)).toBe(1_792_324_800_000);
  });

  it("round-trips toISOString for a spread of instants, including years below 100", () => {
    for (const ms of [0, -62_135_596_800_000, 951_782_400_000, 1_792_324_800_000, 4_102_444_800_000]) {
      expect(parseRfc3339Instant(new Date(ms).toISOString())).toBe(ms);
    }
    // Year 0099 must stay year 99, not become 1999 as Date.UTC would make it.
    const parsed = parseRfc3339Instant("0099-01-01T00:00:00Z");
    expect(parsed).toBeDefined();
    expect(new Date(parsed!).getUTCFullYear()).toBe(99);
  });

  it("never produces a different calendar date than the one written", () => {
    // Property: for any accepted string, formatting the parsed instant back
    // in UTC reproduces the written date and time fields (offset applied).
    for (const input of ["2026-10-18T12:00:00Z", "2024-02-29T23:59:59.999Z", "2026-01-01T00:00:00+05:30"]) {
      const ms = parseRfc3339Instant(input);
      expect(ms).toBeDefined();
      const offset = input.endsWith("Z") ? 0 : 330;
      const local = new Date(ms! + offset * 60_000).toISOString();
      expect(local.slice(0, 19)).toBe(input.slice(0, 19));
    }
  });
});
