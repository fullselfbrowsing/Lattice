import canonicalize from "canonicalize";
import { describe, expect, it } from "vitest";

import {
  canonicalizeReceiptBody,
  stringifyCostUsd,
  usageToCanonical,
} from "./canonical.js";
import type { CapabilityReceiptBody } from "./types.js";

function makeBody(
  overrides: Partial<CapabilityReceiptBody> = {},
): CapabilityReceiptBody {
  return {
    version: "lattice-receipt/v1",
    receiptId: "00000000-0000-4000-8000-000000000000",
    runId: "run-1",
    issuedAt: "2026-05-11T00:00:00.000Z",
    kid: "k1",
    model: { requested: "gpt-x", observed: "gpt-x-2026-04-01" },
    route: {
      providerId: "openai",
      capabilityId: "chat",
      attemptNumber: 1,
    },
    usage: {
      promptTokens: 10,
      completionTokens: 5,
      costUsd: "0.000125",
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

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

describe("usageToCanonical", () => {
  it("converts a number costUsd to a string", () => {
    const result = usageToCanonical({
      promptTokens: 10,
      completionTokens: 5,
      costUsd: 0.000125,
    });
    expect(result).toEqual({
      promptTokens: 10,
      completionTokens: 5,
      costUsd: "0.000125",
    });
    expect(typeof result.costUsd).toBe("string");
    expect(typeof result.costUsd === "number").toBe(false);
  });

  it("preserves null costUsd as null (not the string \"null\")", () => {
    const result = usageToCanonical({
      promptTokens: 0,
      completionTokens: 0,
      costUsd: null,
    });
    expect(result.costUsd).toBeNull();
    expect(result.costUsd).not.toBe("null");
  });
});

describe("stringifyCostUsd", () => {
  it("returns null for non-finite numbers", () => {
    expect(stringifyCostUsd(Number.NaN)).toBeNull();
    expect(stringifyCostUsd(Number.POSITIVE_INFINITY)).toBeNull();
    expect(stringifyCostUsd(Number.NEGATIVE_INFINITY)).toBeNull();
  });

  it("returns null for null input", () => {
    expect(stringifyCostUsd(null)).toBeNull();
  });

  it("returns a string for finite numbers", () => {
    expect(stringifyCostUsd(0)).toBe("0");
    expect(stringifyCostUsd(0.000125)).toBe("0.000125");
    expect(stringifyCostUsd(1.5)).toBe("1.5");
  });
});

describe("canonicalizeReceiptBody", () => {
  it("is byte-deterministic across 100 calls", () => {
    const body = makeBody();
    const first = canonicalizeReceiptBody(body);
    for (let i = 0; i < 100; i += 1) {
      const next = canonicalizeReceiptBody(body);
      expect(bytesEqual(first, next)).toBe(true);
    }
  });

  it("sorts top-level keys alphabetically (does NOT start with the insertion-order first key)", () => {
    // Build an object literal whose keys are in "wrong" order on purpose
    const scrambled: CapabilityReceiptBody = {
      receiptId: "00000000-0000-4000-8000-000000000000",
      version: "lattice-receipt/v1",
      runId: "run-1",
      kid: "k1",
      issuedAt: "2026-05-11T00:00:00.000Z",
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
    };
    const bytes = canonicalizeReceiptBody(scrambled);
    const text = new TextDecoder().decode(bytes);
    // RFC 8785 sorts keys lexicographically. First key alphabetically is
    // contractHash (precedes contractVerdict, issuedAt, kid, ...).
    expect(text.startsWith('{"contractHash":')).toBe(true);
    expect(text.startsWith('{"version":')).toBe(false);
    expect(text.startsWith('{"receiptId":')).toBe(false);
  });

  it("roundtrips: canonical bytes parse back to a structurally equal body", () => {
    const body = makeBody();
    const bytes = canonicalizeReceiptBody(body);
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Record<
      string,
      unknown
    >;
    // Deep-equal check: re-stringifying both via canonicalize must match.
    expect(canonicalize(parsed)).toBe(canonicalize(body));
  });
});

describe("RFC 8785 golden vectors", () => {
  // Source: cyberphone/json-canonicalization repo and RFC 8785 appendix.
  // These guard against silent drift in canonicalize@3.0.0 between V8 versions.

  it("vector 1: empty object", () => {
    expect(canonicalize({})).toBe("{}");
  });

  it("vector 2: simple string", () => {
    expect(canonicalize({ a: "value" })).toBe('{"a":"value"}');
  });

  it("vector 3: keys are sorted lexicographically", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("vector 4: nested keys are sorted", () => {
    expect(canonicalize({ x: { b: 2, a: 1 } })).toBe('{"x":{"a":1,"b":2}}');
  });

  it("vector 5: integer numbers serialize without trailing zero", () => {
    expect(canonicalize({ n: 1 })).toBe('{"n":1}');
  });

  it("vector 6: negative zero is canonicalized to 0", () => {
    expect(canonicalize({ z: -0 })).toBe('{"z":0}');
  });

  it("vector 7: unicode escapes are emitted as raw UTF-8", () => {
    expect(canonicalize({ name: "a\u00e9" })).toBe('{"name":"aé"}');
  });

  it("vector 8: array order is preserved", () => {
    expect(canonicalize({ arr: [3, 1, 2] })).toBe('{"arr":[3,1,2]}');
  });

  it('vector 9: string escape (double-quote → \\")', () => {
    expect(canonicalize({ q: '"' })).toBe('{"q":"\\""}');
  });
});
