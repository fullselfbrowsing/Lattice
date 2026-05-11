import { describe, expect, it } from "vitest";

import { canonicalizeReceiptBody } from "./canonical.js";
import {
  DEFAULT_REDACTION_POLICY_ID,
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

describe("DEFAULT_REDACTION_POLICY_ID", () => {
  it('equals exactly "lattice.default.v1"', () => {
    expect(DEFAULT_REDACTION_POLICY_ID).toBe("lattice.default.v1");
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

  it("populates redactions[] for a no-pii tripwireEvidence", () => {
    const body = makeBody({
      contractVerdict: "tripwire-violated",
      tripwireEvidence: {
        invariantId: "x",
        kind: "no-pii",
        path: "text",
        observed: { detector: "luhn", substring: "4111****1111" },
        message: "no-pii: detector luhn flagged content",
      },
    });
    const result = redactReceiptBody(body);
    expect(result.redactions).toHaveLength(1);
    expect(result.redactions[0]).toEqual({
      path: "tripwireEvidence.observed",
      reason: "no-pii-detector-substring-only",
    });
    // Manifest is also written into the body for signing.
    expect(result.body.redactions).toEqual(result.redactions);
  });

  it("leaves redactions[] empty for non-no-pii tripwire kinds", () => {
    const body = makeBody({
      contractVerdict: "tripwire-violated",
      tripwireEvidence: {
        invariantId: "x",
        kind: "must-cite",
        path: "citations",
        observed: [],
        message: "must-cite",
      },
    });
    const result = redactReceiptBody(body);
    expect(result.redactions).toHaveLength(0);
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

  it("sorts redactions[] by path (single-entry default policy is trivially sorted)", () => {
    const body = makeBody({
      contractVerdict: "tripwire-violated",
      tripwireEvidence: {
        invariantId: "x",
        kind: "no-pii",
        path: "text",
        observed: { detector: "luhn", substring: "***" },
        message: "no-pii",
      },
    });
    const result = redactReceiptBody(body);
    // Verify each entry is lexicographically <= the next.
    const paths = result.redactions.map((r) => r.path);
    const sorted = [...paths].sort();
    expect(paths).toEqual(sorted);
  });

  it("redact→canonicalize produces byte-identical output on identical inputs", () => {
    const body = makeBody({
      contractVerdict: "tripwire-violated",
      tripwireEvidence: {
        invariantId: "x",
        kind: "no-pii",
        path: "text",
        observed: { detector: "luhn", substring: "***" },
        message: "no-pii",
      },
    });
    const firstBytes = canonicalizeReceiptBody(redactReceiptBody(body).body);
    const secondBytes = canonicalizeReceiptBody(redactReceiptBody(body).body);
    expect(firstBytes.byteLength).toBe(secondBytes.byteLength);
    for (let i = 0; i < firstBytes.byteLength; i += 1) {
      expect(firstBytes[i]).toBe(secondBytes[i]);
    }
  });
});
