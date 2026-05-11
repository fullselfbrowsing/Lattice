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

    it("Test 10: does not match unseparated 4155551234", () => {
      expect(detector.detect("4155551234").matched).toBe(false);
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
