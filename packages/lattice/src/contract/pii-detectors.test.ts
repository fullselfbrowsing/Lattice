import { describe, expect, it } from "vitest";

import { defaultPiiDetectors, type PiiDetector } from "./pii-detectors.js";

function findDetector(name: string): PiiDetector {
  const detector = defaultPiiDetectors.find((d) => d.name === name);
  if (!detector) {
    throw new Error(`Detector "${name}" not found in defaultPiiDetectors`);
  }
  return detector;
}

describe("defaultPiiDetectors", () => {
  describe("ordering and shape", () => {
    it("Test 1: defaultPiiDetectors exports detectors in the order email, us-ssn, credit-card, us-phone", () => {
      expect(defaultPiiDetectors.map((d) => d.name)).toEqual([
        "email",
        "us-ssn",
        "credit-card",
        "us-phone",
      ]);
    });

    it("Test 2: defaultPiiDetectors is readonly and each entry has name + detect", () => {
      expect(defaultPiiDetectors.length).toBe(4);
      for (const detector of defaultPiiDetectors) {
        expect(typeof detector.name).toBe("string");
        expect(typeof detector.detect).toBe("function");
      }
    });
  });

  describe("email detector", () => {
    const detector = findDetector("email");

    it("Test 3: matches alice@example.com and returns the matched substring", () => {
      const result = detector.detect("contact: alice@example.com please");
      expect(result.matched).toBe(true);
      if (result.matched) {
        expect(result.substring).toBe("alice@example.com");
      }
    });

    it("Test 4: matches plus-tag email with subdomain", () => {
      const result = detector.detect("Use a.b+tag@sub.example.co for routing");
      expect(result.matched).toBe(true);
      if (result.matched) {
        expect(result.substring).toBe("a.b+tag@sub.example.co");
      }
    });

    it("Test 5: does not match non-emails (not-an-email, @bad, bad@)", () => {
      expect(detector.detect("not-an-email").matched).toBe(false);
      expect(detector.detect("@bad").matched).toBe(false);
      expect(detector.detect("bad@").matched).toBe(false);
    });
  });

  describe("us-ssn detector", () => {
    const detector = findDetector("us-ssn");

    it("Test 6: matches 123-45-6789 SSN format", () => {
      const result = detector.detect("SSN: 123-45-6789 on file");
      expect(result.matched).toBe(true);
      if (result.matched) {
        expect(result.substring).toBe("123-45-6789");
      }
    });

    it("Test 7: does not match wrong-shape SSNs", () => {
      expect(detector.detect("12-345-6789").matched).toBe(false);
      expect(detector.detect("123-456-7890").matched).toBe(false);
    });
  });

  describe("us-phone detector", () => {
    const detector = findDetector("us-phone");

    it("Test 8: matches 415-555-1234 dashed phone", () => {
      const result = detector.detect("Call 415-555-1234 anytime");
      expect(result.matched).toBe(true);
      if (result.matched) {
        expect(result.substring).toBe("415-555-1234");
      }
    });

    it("Test 9: matches (415) 555-1234 parenthesized phone", () => {
      const result = detector.detect("Call (415) 555-1234 anytime");
      expect(result.matched).toBe(true);
      if (result.matched) {
        expect(result.substring).toBe("(415) 555-1234");
      }
    });

    it("Test 10: matches a plain 10-digit phone and ignores an 11-digit run", () => {
      const result = detector.detect("Call 4155551234 anytime");
      expect(result.matched).toBe(true);
      if (result.matched) expect(result.substring).toBe("4155551234");
      expect(detector.detect("14155551234").matched).toBe(false);
    });
  });

  describe("credit-card detector (Luhn validated)", () => {
    const detector = findDetector("credit-card");

    it("Test 11: matches Luhn-valid 4111 1111 1111 1111 with spaces", () => {
      const result = detector.detect("Card: 4111 1111 1111 1111 end");
      expect(result.matched).toBe(true);
      if (result.matched) {
        expect(result.substring).toBe("4111 1111 1111 1111");
      }
    });

    it("Test 12: matches Luhn-valid 4111-1111-1111-1111 with dashes", () => {
      const result = detector.detect("Card: 4111-1111-1111-1111 end");
      expect(result.matched).toBe(true);
      if (result.matched) {
        expect(result.substring).toBe("4111-1111-1111-1111");
      }
    });

    it("Test 13: matches Luhn-valid 4111111111111111 with no separators", () => {
      const result = detector.detect("Card: 4111111111111111 end");
      expect(result.matched).toBe(true);
      if (result.matched) {
        expect(result.substring).toBe("4111111111111111");
      }
    });

    it("Test 14: rejects Luhn-invalid 4111 1111 1111 1112", () => {
      const result = detector.detect("Card: 4111 1111 1111 1112 end");
      expect(result.matched).toBe(false);
    });

    it("Test 15: rejects sequences shorter than 13 digits", () => {
      // 12 digits — even with valid Luhn shape would not be a credit card.
      expect(detector.detect("Number: 411111111111 end").matched).toBe(false);
    });

    it("Test 16: rejects sequences longer than 19 digits", () => {
      // 20 digits — outside the 13-19 window per ISO/IEC 7812.
      expect(detector.detect("Number: 41111111111111111110 end").matched).toBe(false);
    });
  });

  describe("substring isolation", () => {
    it("Test 17: substring is only the matched text, never the full input", () => {
      const longInput =
        "lorem ipsum dolor sit amet contact alice@example.com bla bla bla bla";
      const result = findDetector("email").detect(longInput);
      expect(result.matched).toBe(true);
      if (result.matched) {
        expect(result.substring).toBe("alice@example.com");
        expect(result.substring.length).toBeLessThan(longInput.length);
      }
    });

    it("Test 18: non-match returns { matched: false } with no substring field", () => {
      const result = findDetector("email").detect("nothing to see here");
      expect(result.matched).toBe(false);
      // The discriminated union prevents accessing .substring on a non-match.
      expect("substring" in result).toBe(false);
    });
  });
});

describe("us-phone detector — broadened forms (issue #21 F8)", () => {
  const detector = findDetector("us-phone");

  it.each([
    ["dotted", "Call 415.555.1234 now", "415.555.1234"],
    ["spaced", "Call 415 555 1234 now", "415 555 1234"],
    ["parenthesized without space", "Call (415)555-1234 now", "(415)555-1234"],
    ["+1 with spaces", "Call +1 415 555 1234 now", "+1 415 555 1234"],
    ["+1 with dashes", "Call +1-415-555-1234 now", "+1-415-555-1234"],
    ["1- trunk prefix", "Call 1-415-555-1234 now", "1-415-555-1234"],
    ["+1 parenthesized", "Call +1 (415) 555-1234 now", "+1 (415) 555-1234"],
    ["+1 glued to the area code", "Call +1415-555-1234 now", "+1415-555-1234"],
    ["+1 glued, dotted", "Call +1415.555.1234 now", "+1415.555.1234"],
    ["+1 glued to parentheses", "Call +1(415)555-1234 now", "+1(415)555-1234"],
  ])("matches the %s form", (_label, input, expected) => {
    const result = detector.detect(input);
    expect(result.matched).toBe(true);
    if (result.matched) expect(result.substring).toBe(expected);
  });

  it("matches a plain 10-digit run only after a phone cue or trunk prefix, and still skips an 11-digit run", () => {
    expect(detector.detect("4155551234").matched).toBe(false);
    expect(detector.detect("call 4155551234").matched).toBe(true);
    expect(detector.detect("14155551234").matched).toBe(false);
    // E.164 is unseparated and stays out of scope; a bare `1` glued to the
    // area code needs its own separator so it is not confused with a longer
    // number. The 11-digit run is not a 10-digit match either.
    expect(detector.detect("+14155551234").matched).toBe(false);
    expect(detector.detect("1415-555-1234").matched).toBe(false);
  });

  it("does not flag a phone-shaped SKU or part number", () => {
    expect(detector.detect("SKU 123-456-7890").matched).toBe(false);
    expect(detector.detect("SKU: 123-456-7890").matched).toBe(false);
    expect(detector.detect("pn 415-555-0199").matched).toBe(false);
    expect(detector.detect("PN: 415-555-0199").matched).toBe(false);
    // A bare 10-digit run after a label has no phone cue either.
    expect(detector.detect("SKU 4155551234").matched).toBe(false);
  });

  it("flags a phone after the plain word part", () => {
    // "part" is an English word, not an identifier label ("in part", "part
    // of"), so only the abbreviation pn suppresses.
    expect(detector.detect("part 415-555-0199").matched).toBe(true);
    expect(detector.detect("Part No. 415-555-0199").matched).toBe(true);
    expect(detector.detect("part 123-456-7890").matched).toBe(true);
  });

  it("flags a phone with a trunk prefix even right after a label", () => {
    // The trunk prefix is a phone cue nearer the value than the label. A
    // number written before the phone can also read as a `1` trunk.
    expect(detector.detect("Order 1 415 555 0134").matched).toBe(true);
    expect(detector.detect("Order 1 415-555-0134").matched).toBe(true);
    expect(detector.detect("Part 1 415-555-0134").matched).toBe(true);
    expect(detector.detect("SKU +1 415-555-0134").matched).toBe(true);
    expect(detector.detect("SKU 1-4155551234").matched).toBe(true);
    const result = detector.detect("Order 1 415-555-0134");
    if (result.matched) expect(result.substring).toBe("1 415-555-0134");
  });

  it("does not flag an ISBN-13 or a plain date", () => {
    expect(detector.detect("ISBN 978-0-306-40615-7").matched).toBe(false);
    expect(detector.detect("2026-10-18").matched).toBe(false);
  });
});

describe("us-ssn detector — undashed and spaced forms", () => {
  const detector = findDetector("us-ssn");

  it("matches an undashed 9-digit SSN and a spaced 3-2-4 SSN after an SSN cue", () => {
    const bare = detector.detect("SSN 123456789 on file");
    expect(bare.matched).toBe(true);
    if (bare.matched) expect(bare.substring).toBe("123456789");
    const spaced = detector.detect("SSN 123 45 6789");
    expect(spaced.matched).toBe(true);
    if (spaced.matched) expect(spaced.substring).toBe("123 45 6789");
    expect(detector.detect("SSN: 123456789").matched).toBe(true);
    expect(detector.detect("Social Security No. 123456789").matched).toBe(true);
    expect(detector.detect("ss# 123 45 6789").matched).toBe(true);
  });

  it("does not flag the spaced or undashed form without an SSN cue", () => {
    expect(detector.detect("123 45 6789").matched).toBe(false);
    expect(detector.detect("123456789").matched).toBe(false);
    expect(detector.detect("Call 123456789").matched).toBe(false);
  });

  it("does not flag an SSN-shaped order id, dashed or undashed", () => {
    expect(detector.detect("order 123456789").matched).toBe(false);
    expect(detector.detect("order 123-45-6789").matched).toBe(false);
    expect(detector.detect("invoice 123-45-6789").matched).toBe(false);
    expect(detector.detect("ref 123456789").matched).toBe(false);
    expect(detector.detect("Order No. 123-45-6789").matched).toBe(false);
    expect(detector.detect("Order: 123-45-6789").matched).toBe(false);
    expect(detector.detect("order number is 123-45-6789").matched).toBe(false);
    expect(detector.detect("isbn 123-45-6789").matched).toBe(false);
  });

  it("does not treat a 16-digit reference as an SSN", () => {
    expect(detector.detect("ref 4111111111111111").matched).toBe(false);
    expect(detector.detect("1234567890123456").matched).toBe(false);
  });
});

describe("credit-card detector — reference numbers", () => {
  const detector = findDetector("credit-card");

  it("does not flag a 16-digit reference or an ISBN-13", () => {
    expect(detector.detect("ref 4111111111111111").matched).toBe(false);
    expect(detector.detect("ref 1234567890123456").matched).toBe(false);
    expect(detector.detect("ISBN 9780306406157").matched).toBe(false);
    expect(detector.detect("order 4111111111111111").matched).toBe(false);
  });

  it("still flags a Luhn-valid Visa number that is not an identifier", () => {
    expect(detector.detect("Card: 4111111111111111 end").matched).toBe(true);
  });

  it.each([
    ["UnionPay", "6200000000000005"],
    ["UnionPay 62 (19-digit range)", "6250941006528599"],
    ["Maestro 67", "6759649826438453"],
    ["Maestro 6304", "6304000000000000"],
    ["Mir 2200", "2200307418529635"],
    ["Diners 309", "30930741852968"],
    ["Diners 39", "39307418529636"],
  ])("flags a Luhn-valid %s card: the issuer prefix is not allowlisted", (_label, pan) => {
    const result = detector.detect(`Card: ${pan} end`);
    expect(result.matched).toBe(true);
    if (result.matched) expect(result.substring).toBe(pan);
  });

  it("skips Luhn-valid runs that start with 0 or 1 or are a 13-digit ISBN", () => {
    // Each of these passes Luhn, so only the run-shape rule drops it.
    expect(detector.detect("ts 1729555200008").matched).toBe(false);
    expect(detector.detect("id 0000000000000000").matched).toBe(false);
    expect(detector.detect("9780306406156").matched).toBe(false);
    expect(detector.detect("9791234567894").matched).toBe(false);
  });

  it("checks every candidate, and a label hides only the value right after it", () => {
    const result = detector.detect("ref 1234567890123456 card 4111111111111111");
    expect(result.matched).toBe(true);
    if (result.matched) expect(result.substring).toBe("4111111111111111");
    expect(detector.detect("Ref: card 4111111111111111").matched).toBe(true);
  });

  it.each([
    ["Apt 18 4111 1111 1111 1111", "4111 1111 1111 1111"],
    ["Seat 18 4111111111111111", "4111111111111111"],
    ["Ticket 19 3782 822463 10005", "3782 822463 10005"],
    ["Step 0 4111111111111111", "4111111111111111"],
    ["Invoice 42 4111 1111 1111 1111", "4111 1111 1111 1111"],
    ["order 5521 378282246310005", "378282246310005"],
    ["order 5521 4222222222222", "4222222222222"],
    ["Room 101 4111 1111 1111 1111", "4111 1111 1111 1111"],
    ["Ticket 4412 378282246310005", "378282246310005"],
    ["Card 4111 1111 1111 1111 123", "4111 1111 1111 1111"],
    ["Card: 4111 1111 1111 1111 12/25", "4111 1111 1111 1111"],
    ["Apt 18 4111 1111 1111 1111 123", "4111 1111 1111 1111"],
  ])("flags the card in %j: a short number joined to it does not hide it", (input, expected) => {
    const result = detector.detect(input);
    expect(result.matched).toBe(true);
    if (result.matched) expect(result.substring).toBe(expected);
  });

  it("checks only card-shaped inner spans, and a label still hides a span right after it", () => {
    // The spans keep the run's start, so the label still applies.
    expect(detector.detect("ref 4111 1111 1111 1111 123").matched).toBe(false);
    expect(detector.detect("order 4111111111111111 12").matched).toBe(false);
    // 4-4-4-3 and 2-digit groups are not card shapes.
    expect(detector.detect("Lot 9 4111 1111 1111 111").matched).toBe(false);
    expect(detector.detect("Scores 12 34 56 78 90 12 34 56 78").matched).toBe(false);
  });

  it("does not cut a row of same-length groups into card-sized pieces", () => {
    // The trailing 4-4-4-4 window passes Luhn, but the leading candidate
    // does not, and a run whose groups all have 4 digits is not cut. The
    // cost: a 4-digit number joined to a 4-4-4-4 card hides it.
    expect(detector.detect("2025 5555 5555 5555 4444").matched).toBe(false);
    expect(detector.detect("Ticket 4412 5555 5555 5555 4444").matched).toBe(false);
    expect(detector.detect("2025-5555-5555-5555-4444").matched).toBe(false);
    // The leading candidate of a uniform run is still checked as written.
    expect(detector.detect("4111 1111 1111 1111 2026").matched).toBe(true);
    // A 4-digit number before a differently grouped card is dropped.
    const amex = detector.detect("order 5521 3782 822463 10005");
    expect(amex.matched).toBe(true);
    if (amex.matched) expect(amex.substring).toBe("3782 822463 10005");
  });

  it("flags a list of long ids when any one passes Luhn (documented trade-off)", () => {
    // Every run is checked and no issuer list is applied, so about one
    // random 16-digit id in ten trips the detector. The header label is on
    // an earlier line, so it does not suppress.
    const ids = "order_id\n2345678901234567\n3456789012345678\n4111111111111111";
    expect(detector.detect(ids).matched).toBe(true);
    expect(detector.detect("order_id\n2345678901234567\n3456789012345678").matched).toBe(false);
  });
});

function firstMatch(input: string): string | undefined {
  for (const detector of defaultPiiDetectors) {
    if (detector.detect(input).matched) return detector.name;
  }
  return undefined;
}

describe("default detectors — identifier labels and cues", () => {
  it.each([
    ["Customer SSN 123-45-6789", "us-ssn"],
    ["account ssn 123-45-6789", "us-ssn"],
    ["Account 123-45-6789", "us-ssn"],
    ["Patient ID 123-45-6789", "us-ssn"],
    ["Tax ID 123-45-6789", "us-ssn"],
    ["my id is 123-45-6789", "us-ssn"],
    ["SSN/ID 123-45-6789", "us-ssn"],
    ["Customer phone 415-555-1234", "us-phone"],
    ["Ticket #881 opened by 415-555-1234", "us-phone"],
    ["Thanks a lot 415-555-1234", "us-phone"],
    ["customer card 4111111111111111", "credit-card"],
    ["SSN: 123456789", "us-ssn"],
    ["+1 4155551234", "us-phone"],
    ["call 4155551234", "us-phone"],
    ["for reference 123-45-6789", "us-ssn"],
    ["Reference: 415-555-0134", "us-phone"],
    ["My SSN is part 123-45-6789", "us-ssn"],
    ["part 123-456-7890", "us-phone"],
    ["reference 4111111111111111", "credit-card"],
  ])("flags %j: only identifier labels suppress, and common words are not labels", (input, expected) => {
    expect(firstMatch(input)).toBe(expected);
  });

  it.each([
    "order 123-45-6789",
    "Order No. 123-45-6789",
    "SKU 123-456-7890",
    "ref 4111111111111111",
    "isbn 123-45-6789",
    "ISBN 978-0-306-40615-7",
    "PO# 415-555-1234",
    "ref 123-45-6789",
    "pn 415-555-0134",
  ])("does not flag %j: a value right after an identifier label is an id", (input) => {
    expect(firstMatch(input)).toBeUndefined();
  });

  it.each([
    "created at 1729555200",
    "Last login: 1729555200",
    "104857600 bytes",
    "Revenue was 123456789 dollars",
    "512 64 4096",
    "021000021",
    "routing 021000021",
    "3.1415926535",
    "probability 0.123456789",
    "ISBN-10 0306406152",
    "Build 2024101501 passed",
    '{"event":"login","ts":1729555200}',
    "Please call us about order 123-45-6789",
  ])("does not flag %j: bare numbers need a cue, and a label nearer than the cue wins", (input) => {
    expect(firstMatch(input)).toBeUndefined();
  });

  it("a plain 10-digit phone must be NANP-valid and not the tail of a decimal", () => {
    const phone = findDetector("us-phone");
    expect(phone.detect("call 1729555200").matched).toBe(false);
    expect(phone.detect("call 0306406152").matched).toBe(false);
    expect(phone.detect("call 3.4155551234").matched).toBe(false);
    expect(phone.detect("phone: 4155551234").matched).toBe(true);
    expect(phone.detect("Tel. 4155551234").matched).toBe(true);
    const prefixed = phone.detect("reach me at +1 4155551234");
    expect(prefixed.matched).toBe(true);
    if (prefixed.matched) expect(prefixed.substring).toBe("+1 4155551234");
    expect(phone.detect("1-4155551234").matched).toBe(true);
  });

  it("a label suppresses only as the nearest token; numbers between them break the link", () => {
    expect(firstMatch("Order 5521, 415-555-1234, 123-45-6789")).toBe("us-ssn");
    expect(findDetector("us-phone").detect("Order 5521, 415-555-1234").matched).toBe(true);
    expect(firstMatch("order 5521 5522 5523 call 415-555-1234")).toBe("us-phone");
    expect(firstMatch("Order 5521 — call 415-555-1234")).toBe("us-phone");
    expect(firstMatch("order #5521 / 415-555-1234")).toBe("us-phone");
  });

  it("a positive cue counts only when it comes after every label", () => {
    const ssn = findDetector("us-ssn");
    expect(ssn.detect("SSN for order 123456789").matched).toBe(false);
    expect(ssn.detect("order 5521 SSN 123456789").matched).toBe(true);
    expect(findDetector("us-phone").detect("order=5521&phone=4155551234").matched).toBe(true);
  });

  it.each([
    ["phone_number=4155551234", "us-phone"],
    ["mobile_phone: 4155551234", "us-phone"],
    ["call me at 4155551234", "us-phone"],
    ["Call us on 4155551234", "us-phone"],
    ["mobile no. 4155551234", "us-phone"],
    ["Her cell number is 4155551234", "us-phone"],
    ["tel# 4155551234", "us-phone"],
    ['{"phone":"4155551234"}', "us-phone"],
    ["Social Security Number: 123456789", "us-ssn"],
    ["social sec # 123 45 6789", "us-ssn"],
    ["customer_ssn: 123456789", "us-ssn"],
    ["SSN number is 123456789", "us-ssn"],
  ])("flags the bare value in %j: the cue is the nearest word", (input, expected) => {
    expect(firstMatch(input)).toBe(expected);
  });

  it.each([
    "Mobile app build 2024101501 passed QA",
    "Release notes (mobile) build 2026102201",
    "call_id=4155551234 status=200",
    "call duration 2345678901 ns",
    "Cell B7 holds 2345678901",
    "Phone model id 2125550199",
    "Social media reach 123456789 impressions",
    "social followers: 123456789",
    "social 123456789",
    "SSN count 123456789",
    "call Jane at 4155551234",
  ])("does not flag the bare value in %j: another word sits between the cue and the value", (input) => {
    expect(firstMatch(input)).toBeUndefined();
  });

  it.each([
    ["Order 5521\nThanks! Call 415-555-1234", "us-phone"],
    ["order 5521\nfoo bar. phone 415-555-1234", "us-phone"],
    ["Re: order 5521\nphone 415-555-1234", "us-phone"],
    ["Order 5521\n123-45-6789", "us-ssn"],
    ["order_id,phone\n5521,415-555-1234", "us-phone"],
    ["customer,ssn\nJane Doe,123-45-6789", "us-ssn"],
    ["| Order | Phone |\n|---|---|\n| 5521 | 415-555-1234 |", "us-phone"],
    ["| Customer | SSN |\n|---|---|\n| Jane | 123-45-6789 |", "us-ssn"],
    ["customer: Jane\naccount 123-45-6789", "us-ssn"],
  ])("flags %j: a label on an earlier line or in a header does not reach the value", (input, expected) => {
    expect(firstMatch(input)).toBe(expected);
  });

  it("a line break or a sentence end also cuts a positive cue off", () => {
    expect(findDetector("us-ssn").detect("ssn,name\n123456789,Jane").matched).toBe(false);
    expect(findDetector("us-phone").detect("Please call us. 4155551234 is the order").matched).toBe(false);
    expect(findDetector("us-phone").detect("Call us; 4155551234").matched).toBe(false);
  });

  it("looks back at most 48 characters", () => {
    const ssn = findDetector("us-ssn");
    // "order" ends 43 spaces before the value: the label starts 48 back.
    expect(ssn.detect(`order${" ".repeat(43)}123-45-6789`).matched).toBe(false);
    // One more space pushes the label's first letter out, and a cut-off
    // word is not a token.
    expect(ssn.detect(`order${" ".repeat(44)}123-45-6789`).matched).toBe(true);
    expect(ssn.detect(`SSN${" ".repeat(45)}123456789`).matched).toBe(true);
    expect(ssn.detect(`SSN${" ".repeat(46)}123456789`).matched).toBe(false);
  });
});

describe("email detector — bounded scan", () => {
  const detector = findDetector("email");

  it("stays linear on long runs of word characters", () => {
    const size = 128 * 1024;
    for (const input of [
      "1".repeat(size),
      `${"a".repeat(size)}@`,
      `a@${"b".repeat(size)}`,
      "a@b".repeat(size / 3),
      `${"a".repeat(size / 2)}@${"b".repeat(size / 2)}`,
    ]) {
      const started = performance.now();
      expect(detector.detect(input).matched).toBe(false);
      // The unanchored pattern took seconds at this size; scanning from each
      // `@` takes a few milliseconds.
      expect(performance.now() - started).toBeLessThan(1000);
    }
  });

  it("reports the whole address, however long its parts", () => {
    const longLocal = `${"a".repeat(100)}@example.com`;
    const longLabel = `x@${"a".repeat(70)}.com`;
    for (const address of [longLocal, longLabel]) {
      const result = detector.detect(`mail ${address} now`);
      expect(result.matched).toBe(true);
      if (result.matched) expect(result.substring).toBe(address);
    }
  });

  it("returns the first address and skips an @ with no domain", () => {
    const result = detector.detect("@bad, x@nodot then bob@example.org and amy@example.com");
    expect(result.matched).toBe(true);
    if (result.matched) expect(result.substring).toBe("bob@example.org");
  });
});
