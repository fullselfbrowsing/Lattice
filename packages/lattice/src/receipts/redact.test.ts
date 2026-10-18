import { describe, expect, it } from "vitest";

import type { TripwireEvidence } from "../contract/tripwire.js";

import { canonicalizeReceiptBody } from "./canonical.js";
import {
  DEFAULT_REDACTION_POLICY_ID,
  NO_PII_REDACTION_REASON,
  TRIPWIRE_MESSAGE_REDACTION_REASON,
  TRIPWIRE_OBSERVED_REDACTION_REASON,
  maskPiiSubstring,
  redactReceiptBody,
} from "./redact.js";
import type {
  CapabilityReceiptBody,
  ReceiptRedaction,
} from "./types.js";

function makeBody(
  overrides: Partial<CapabilityReceiptBody> = {},
): CapabilityReceiptBody {
  return {
    version: "lattice-receipt/v1",
    receiptId: "00000000-0000-4000-8000-000000000000",
    runId: "run-1",
    issuedAt: "2026-05-11T00:00:00.000Z",
    kid: "k1",
    model: { requested: "gpt-x", observed: null },
    route: {
      providerId: "openai",
      capabilityId: "chat",
      attemptNumber: 1,
    },
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      costUsd: null,
    },
    contractVerdict: "success",
    contractHash: null,
    inputHashes: [],
    outputHash: null,
    redactionPolicyId: "lattice.default.v1",
    redactions: [],
    ...overrides,
  };
}

function evidence(
  kind: TripwireEvidence["kind"],
  observed: unknown,
  message = `${kind}: violation`,
): TripwireEvidence {
  return { invariantId: "x", kind, path: "text", observed, message };
}

describe("DEFAULT_REDACTION_POLICY_ID", () => {
  it('equals exactly "lattice.default.v1"', () => {
    expect(DEFAULT_REDACTION_POLICY_ID).toBe("lattice.default.v1");
  });
});

describe("maskPiiSubstring", () => {
  it.each([
    ["123-45-6789", "***-**-****"],
    ["alice@example.com", "*****@*******.***"],
    ["+1 (415) 555-0100", "+* (***) ***-****"],
    ["4111 1111 1111 1111", "**** **** **** ****"],
    ["", ""],
  ])("masks %j as %j", (input, expected) => {
    expect(maskPiiSubstring(input)).toBe(expected);
  });

  it("is idempotent", () => {
    const once = maskPiiSubstring("Bob.Smith+tag@example.co.uk");
    expect(maskPiiSubstring(once)).toBe(once);
  });
});

describe("redactReceiptBody", () => {
  it("is pure: two calls on the same input produce structurally equal results", () => {
    const body = makeBody();
    const first = redactReceiptBody(body);
    const second = redactReceiptBody(body);
    expect(first).toEqual(second);
    // Mutating first must not affect second.
    (first.redactions as ReceiptRedaction[]).push?.({
      path: "x",
      reason: "y",
    });
    expect(second.redactions).toEqual([]);
  });

  it("does not mutate the input body (frozen body is accepted)", () => {
    const body = Object.freeze(makeBody());
    expect(() => redactReceiptBody(body)).not.toThrow();
    // Original body's redactionPolicyId is unchanged.
    expect(body.redactionPolicyId).toBe("lattice.default.v1");
  });

  it("leaves redactions[] empty when no tripwireEvidence is present", () => {
    const body = makeBody();
    const result = redactReceiptBody(body);
    expect(result.redactions).toHaveLength(0);
  });

  it("overwrites redactionPolicyId with the provided policy id", () => {
    const body = makeBody({ redactionPolicyId: "preexisting" });
    const result = redactReceiptBody(body, "custom.v1");
    expect(result.body.redactionPolicyId).toBe("custom.v1");
  });

  it("uses the default policy id when none is provided", () => {
    const body = makeBody({ redactionPolicyId: "other" });
    const result = redactReceiptBody(body);
    expect(result.body.redactionPolicyId).toBe("lattice.default.v1");
  });

  describe("no-pii", () => {
    it("rewrites observed to detector, length, and mask and records the manifest entry", () => {
      const body = makeBody({
        contractVerdict: "tripwire-violated",
        tripwireEvidence: evidence("no-pii", {
          detector: "credit-card",
          substring: "4111 1111 1111 1111",
        }),
      });
      const result = redactReceiptBody(body);
      expect(result.redactions).toEqual([
        { path: "tripwireEvidence.message", reason: TRIPWIRE_MESSAGE_REDACTION_REASON },
        { path: "tripwireEvidence.observed", reason: NO_PII_REDACTION_REASON },
      ]);
      // Manifest is also written into the body for signing.
      expect(result.body.redactions).toEqual(result.redactions);
      expect(result.body.tripwireEvidence?.observed).toEqual({
        detector: "credit-card",
        length: 19,
        mask: "**** **** **** ****",
      });
      expect(JSON.stringify(result.body)).not.toContain("4111");
    });

    it("drops foundAt and rebuilds the message from the detector and declared path (review follow-up)", () => {
      // The kernel's message and observed.foundAt carry the concrete location,
      // which can contain model-produced object keys. Neither may be signed.
      const original = evidence(
        "no-pii",
        { detector: "email", substring: "a@b.co", foundAt: 'text.customer["bob@example.com"]' },
        'no-pii: detector "email" flagged content at "text.customer["bob@example.com"]".',
      );
      const result = redactReceiptBody(
        makeBody({ contractVerdict: "tripwire-violated", tripwireEvidence: original }),
      );
      expect(result.body.tripwireEvidence).toEqual({
        invariantId: "x",
        kind: "no-pii",
        path: "text",
        observed: { detector: "email", length: 6, mask: "*@*.**" },
        message: 'no-pii: detector "email" flagged content at "text".',
      });
      expect(JSON.stringify(result.body)).not.toContain("customer");
      expect(JSON.stringify(result.body)).not.toContain("bob@example.com");
    });

    it.each([
      ["a bare string", "just a string"],
      ["an empty object", {}],
      ["an object without substring", { detector: "email" }],
      ["a non-string substring", { detector: "email", substring: 42 }],
      ["null", null],
    ])("collapses a malformed observed (%s) to a safe empty shape", (_label, observed) => {
      const result = redactReceiptBody(
        makeBody({ contractVerdict: "tripwire-violated", tripwireEvidence: evidence("no-pii", observed) }),
      );
      const redacted = result.body.tripwireEvidence?.observed as Record<string, unknown>;
      expect(redacted.length).toBe(0);
      expect(redacted.mask).toBe("");
      expect(typeof redacted.detector).toBe("string");
      expect("substring" in redacted).toBe(false);
    });

    it("defaults detector to \"unknown\" when the kernel did not name one", () => {
      const result = redactReceiptBody(
        makeBody({ contractVerdict: "tripwire-violated", tripwireEvidence: evidence("no-pii", { substring: "x@y.z" }) }),
      );
      expect(result.body.tripwireEvidence?.observed).toEqual({
        detector: "unknown",
        length: 5,
        mask: "*@*.*",
      });
    });

    it("re-masks a forged already-redacted shape so cleartext cannot ride in the mask field", () => {
      const result = redactReceiptBody(
        makeBody({
          contractVerdict: "tripwire-violated",
          tripwireEvidence: evidence("no-pii", {
            detector: "us-ssn",
            length: 11,
            mask: "123-45-6789",
          }),
        }),
      );
      expect(result.body.tripwireEvidence?.observed).toEqual({
        detector: "us-ssn",
        length: 11,
        mask: "***-**-****",
      });
    });
  });

  describe("must-cite, field-from-table, matches", () => {
    it.each<[string, unknown, Record<string, unknown>]>([
      ["string", "SENSITIVE VALUE", { valueType: "string", length: 15 }],
      ["number", 4155551234, { valueType: "number" }],
      ["boolean", true, { valueType: "boolean" }],
      ["null", null, { valueType: "null" }],
      ["undefined", undefined, { valueType: "undefined" }],
      ["array", ["doc-1", { source: "doc-2" }], { valueType: "array", length: 2 }],
      ["object", { nested: { email: "a@b.co" } }, { valueType: "object" }],
    ])("elides a %s observed value to its shape", (_label, observed, expected) => {
      const result = redactReceiptBody(
        makeBody({ contractVerdict: "tripwire-violated", tripwireEvidence: evidence("field-from-table", observed) }),
      );
      expect(result.body.tripwireEvidence?.observed).toEqual(expected);
      expect(result.redactions).toEqual([
        { path: "tripwireEvidence.message", reason: TRIPWIRE_MESSAGE_REDACTION_REASON },
        { path: "tripwireEvidence.observed", reason: TRIPWIRE_OBSERVED_REDACTION_REASON },
      ]);
      expect(result.body.tripwireEvidence?.message).toBe(
        'field-from-table: value at "text" not in allowedValues.',
      );
    });

    it("elides the must-cite citations array and templates its message", () => {
      const result = redactReceiptBody(
        makeBody({
          contractVerdict: "tripwire-violated",
          tripwireEvidence: evidence("must-cite", [{ source: "private-memo.pdf" }], 'must-cite: no citation found for "doc".'),
        }),
      );
      expect(result.body.tripwireEvidence?.observed).toEqual({ valueType: "array", length: 1 });
      expect(result.body.tripwireEvidence?.message).toBe('must-cite: no matching citation at "text".');
      expect(JSON.stringify(result.body)).not.toContain("private-memo");
    });

    it("replaces the matches message (schema issue text may embed the value) and records both entries sorted by path", () => {
      const result = redactReceiptBody(
        makeBody({
          contractVerdict: "tripwire-violated",
          tripwireEvidence: {
            invariantId: "x",
            kind: "matches",
            path: "data.ssn",
            observed: "123-45-6789",
            message: 'Invalid input "123-45-6789": expected pattern',
          },
        }),
      );
      expect(result.body.tripwireEvidence?.message).toBe('matches: schema validation failed at "data.ssn".');
      expect(result.body.tripwireEvidence?.observed).toEqual({ valueType: "string", length: 11 });
      expect(result.redactions).toEqual([
        { path: "tripwireEvidence.message", reason: TRIPWIRE_MESSAGE_REDACTION_REASON },
        { path: "tripwireEvidence.observed", reason: TRIPWIRE_OBSERVED_REDACTION_REASON },
      ]);
      expect(JSON.stringify(result.body)).not.toContain("123-45-6789");
    });
  });

  describe("idempotency", () => {
    it.each<TripwireEvidence>([
      evidence("no-pii", { detector: "email", substring: "alice@example.com" }),
      evidence("must-cite", ["doc-1"]),
      evidence("field-from-table", "value"),
      { invariantId: "x", kind: "matches", path: "p", observed: { a: 1 }, message: "issue text" },
    ])("redacting an already-redacted $kind body is a no-op", (tripwireEvidence) => {
      const once = redactReceiptBody(
        makeBody({ contractVerdict: "tripwire-violated", tripwireEvidence }),
      ).body;
      const twice = redactReceiptBody(once, once.redactionPolicyId).body;
      expect(twice).toEqual(once);
    });
  });

  it("sorts redactions[] by path", () => {
    const body = makeBody({
      contractVerdict: "tripwire-violated",
      tripwireEvidence: { invariantId: "x", kind: "matches", path: "p", observed: 1, message: "m" },
    });
    const result = redactReceiptBody(body);
    const paths = result.redactions.map((r) => r.path);
    expect(paths).toEqual([...paths].sort());
    expect(paths.length).toBe(2);
  });

  it("redact→canonicalize produces byte-identical output on identical inputs", () => {
    const body = makeBody({
      contractVerdict: "tripwire-violated",
      tripwireEvidence: evidence("no-pii", { detector: "luhn", substring: "4111111111111111" }),
    });
    const firstBytes = canonicalizeReceiptBody(redactReceiptBody(body).body);
    const secondBytes = canonicalizeReceiptBody(redactReceiptBody(body).body);
    expect(firstBytes.byteLength).toBe(secondBytes.byteLength);
    for (let i = 0; i < firstBytes.byteLength; i += 1) {
      expect(firstBytes[i]).toBe(secondBytes[i]);
    }
  });
});
