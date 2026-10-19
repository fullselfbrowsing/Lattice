import { describe, expect, it } from "vitest";

import { isRfc3339Instant, parseRfc3339Instant } from "./timestamp.js";

describe("parseRfc3339Instant", () => {
  it.each([
    ["Z, no fraction", "2026-10-18T12:00:00Z", Date.UTC(2026, 9, 18, 12)],
    ["Z, milliseconds", "2026-10-18T12:00:00.123Z", Date.UTC(2026, 9, 18, 12, 0, 0, 123)],
    ["Z, nanoseconds (truncated by Date.parse)", "2026-10-18T12:00:00.123456789Z", Date.UTC(2026, 9, 18, 12, 0, 0, 123)],
    ["positive offset", "2026-10-18T12:00:00+05:30", Date.UTC(2026, 9, 18, 6, 30)],
    ["negative offset", "2026-10-18T12:00:00-07:00", Date.UTC(2026, 9, 18, 19)],
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
  ])("rejects %s", (_label, input) => {
    expect(parseRfc3339Instant(input)).toBeUndefined();
    expect(isRfc3339Instant(input)).toBe(false);
  });

  it("accepts every Date#toISOString output", () => {
    const iso = new Date(1_792_324_800_000).toISOString();
    expect(parseRfc3339Instant(iso)).toBe(1_792_324_800_000);
  });
});
