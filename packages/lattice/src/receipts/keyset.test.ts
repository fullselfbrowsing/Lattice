import { describe, expect, it } from "vitest";

import { createMemoryKeySet } from "./keyset.js";
import type { KeyEntry } from "./types.js";

const samplePublicJwk: JsonWebKey = {
  kty: "OKP",
  crv: "Ed25519",
  x: "AAAA",
};

function entry(
  kid: string,
  state: KeyEntry["state"] = "active",
): KeyEntry {
  return { kid, publicKeyJwk: samplePublicJwk, state };
}

describe("createMemoryKeySet", () => {
  it("returns the entry for a known kid", () => {
    const set = createMemoryKeySet([entry("k1", "active")]);
    const found = set.lookup("k1");
    expect(found).toBeDefined();
    expect(found?.kid).toBe("k1");
    expect(found?.state).toBe("active");
    expect(found?.publicKeyJwk).toEqual(samplePublicJwk);
  });

  it("returns undefined for an unknown kid", () => {
    const set = createMemoryKeySet([entry("k1")]);
    expect(set.lookup("nonexistent")).toBeUndefined();
  });

  it("accepts an empty entries array; all lookups return undefined", () => {
    const set = createMemoryKeySet([]);
    expect(set.lookup("k1")).toBeUndefined();
    expect(set.lookup("anything")).toBeUndefined();
  });

  it("when duplicate kids are passed, last write wins", () => {
    const set = createMemoryKeySet([
      entry("k1", "active"),
      entry("k1", "revoked"),
    ]);
    expect(set.lookup("k1")?.state).toBe("revoked");
  });

  it("preserves all three KeyState values: active, retired, revoked", () => {
    const set = createMemoryKeySet([
      entry("active-key", "active"),
      entry("retired-key", "retired"),
      entry("revoked-key", "revoked"),
    ]);
    expect(set.lookup("active-key")?.state).toBe("active");
    expect(set.lookup("retired-key")?.state).toBe("retired");
    expect(set.lookup("revoked-key")?.state).toBe("revoked");
  });

  it("exposes only the lookup method (no enumeration surface)", () => {
    const set = createMemoryKeySet([entry("k1")]);
    const keys = Object.keys(set);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toBe("lookup");
  });
});
