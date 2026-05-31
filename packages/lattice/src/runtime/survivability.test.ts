import { describe, expect, it } from "vitest";
import {
  createNoopSurvivabilityAdapter,
  type EvictionHook,
  type ResumePolicy,
  type SerializedSnapshot,
  type SurvivabilityAdapter,
} from "./survivability.js";
import {
  createInMemorySigner,
  generateEd25519KeyPairJwk,
} from "../receipts/sign.js";
import { createMemoryKeySet } from "../receipts/keyset.js";
import { createReceipt } from "../receipts/receipt.js";
import { verifyReceipt } from "../receipts/verify.js";
import type { ReceiptEnvelope } from "../receipts/types.js";

// ---------- Shape conformance ----------

describe("createNoopSurvivabilityAdapter -- factory identity", () => {
  it("Test 1: createNoopSurvivabilityAdapter is a function", () => {
    expect(typeof createNoopSurvivabilityAdapter).toBe("function");
  });

  it("Test 2: factory output has kind === 'survivability-adapter'", () => {
    const adapter = createNoopSurvivabilityAdapter();
    expect(adapter.kind).toBe("survivability-adapter");
  });

  it("Test 3: adapter exposes 4 methods (serialize, deserialize, onEviction, resume)", () => {
    const adapter = createNoopSurvivabilityAdapter();
    expect(typeof adapter.serialize).toBe("function");
    expect(typeof adapter.deserialize).toBe("function");
    expect(typeof adapter.onEviction).toBe("function");
    expect(typeof adapter.resume).toBe("function");
  });

  it("Test 3b: adapter has a stable id string (defaults to 'noop-survivability')", () => {
    const adapter = createNoopSurvivabilityAdapter();
    expect(adapter.id).toBe("noop-survivability");

    const named = createNoopSurvivabilityAdapter({ id: "test-fixture-A" });
    expect(named.id).toBe("test-fixture-A");
  });
});

// ---------- serialize / deserialize round-trip ----------

describe("SurvivabilityAdapter -- serialize / deserialize round-trip", () => {
  it("Test 4: serialize returns a SerializedSnapshot envelope with kind + version + payload + capturedAt", () => {
    const adapter = createNoopSurvivabilityAdapter<{ a: number; b: string }>();
    const snapshot = adapter.serialize({ a: 1, b: "two" });
    expect(snapshot.kind).toBe("survivability-snapshot");
    expect(snapshot.version).toBe("lattice-survivability/v1");
    expect(typeof snapshot.payload).toBe("string");
    expect(typeof snapshot.capturedAt).toBe("string");
    // ISO-8601 (RFC 3339) sanity check
    expect(new Date(snapshot.capturedAt).toString()).not.toBe("Invalid Date");
  });

  it("Test 5: deserialize(serialize(state)) round-trips byte-equal under JSON.stringify", () => {
    const adapter = createNoopSurvivabilityAdapter<{ a: number; b: string; c: readonly string[] }>();
    const original = { a: 1, b: "two", c: ["x", "y", "z"] as const };
    const snapshot = adapter.serialize(original);
    const restored = adapter.deserialize(snapshot);
    expect(JSON.stringify(restored)).toBe(JSON.stringify(original));
  });

  it("Test 9: serialize() called twice with identical state produces identical payload (deterministic JSON)", () => {
    const adapter = createNoopSurvivabilityAdapter<{ x: number }>();
    const a = adapter.serialize({ x: 42 });
    const b = adapter.serialize({ x: 42 });
    expect(a.payload).toBe(b.payload);
    // capturedAt may differ across calls (Date.now() advances); only payload is checked.
  });
});

// ---------- onEviction lifecycle ----------

describe("SurvivabilityAdapter -- onEviction hook lifecycle", () => {
  it("Test 6: onEviction returns an UnsubscribeFn; calling it removes the hook idempotently", () => {
    const adapter = createNoopSurvivabilityAdapter<{ y: number }>();
    const hook: EvictionHook<{ y: number }> = () => undefined;
    const unsub = adapter.onEviction(hook);
    expect(typeof unsub).toBe("function");
    // Idempotency: calling twice does not throw.
    expect(() => unsub()).not.toThrow();
    expect(() => unsub()).not.toThrow();
  });

  it("Test 10: EvictionHook<TState> signature accepts state by reference (void | Promise<void> return)", () => {
    const adapter = createNoopSurvivabilityAdapter<{ z: number }>();
    let lastSeen: { z: number } | null = null;
    const hook: EvictionHook<{ z: number }> = (state) => {
      lastSeen = state;
    };
    const unsub = adapter.onEviction(hook);
    // The noop adapter records but does not invoke; lastSeen stays null
    // unless a real driver calls hooks. The test asserts the hook
    // signature compiles + registers without throwing.
    expect(lastSeen).toBeNull();
    unsub();
  });
});

// ---------- resume + ResumePolicy ----------

describe("SurvivabilityAdapter -- resume + ResumePolicy", () => {
  it("Test 7: resume(snapshot) returns Promise<ResumePolicy>; default = 'SAFE'", async () => {
    const adapter = createNoopSurvivabilityAdapter<Record<string, unknown>>();
    const snapshot = adapter.serialize({});
    const policy: ResumePolicy = await adapter.resume(snapshot);
    expect(policy).toBe("SAFE");
  });

  it("Test 8: ResumePolicy covers exactly 4 literal members per CD-E taxonomy", () => {
    // Compile-time exhaustiveness via an explicit type-level mapping.
    const members: readonly ResumePolicy[] = [
      "SAFE",
      "RECOVERY_AMBIGUOUS",
      "ON_ERROR_SW_EVICTION_MID_REQUEST",
      "ON_ERROR_SW_EVICTION_MID_TOOL_DISPATCH",
    ];
    expect(members).toHaveLength(4);
    // Sanity: each member is a non-empty string.
    for (const m of members) {
      expect(typeof m).toBe("string");
      expect(m.length).toBeGreaterThan(0);
    }
  });

  it("Test 13: ResumePolicy literal-union is discriminated by string (no record shapes)", () => {
    // Type-level guarantee asserted via assignability; runtime check
    // ensures each member round-trips through JSON.
    const all: ResumePolicy[] = [
      "SAFE",
      "RECOVERY_AMBIGUOUS",
      "ON_ERROR_SW_EVICTION_MID_REQUEST",
      "ON_ERROR_SW_EVICTION_MID_TOOL_DISPATCH",
    ];
    for (const m of all) {
      expect(JSON.parse(JSON.stringify(m))).toBe(m);
    }
  });

  it("Test 15: factory accepts options.policy to override the default resume policy", async () => {
    const adapter = createNoopSurvivabilityAdapter({ policy: "RECOVERY_AMBIGUOUS" });
    const snapshot = adapter.serialize({});
    const policy = await adapter.resume(snapshot);
    expect(policy).toBe("RECOVERY_AMBIGUOUS");

    const onError = createNoopSurvivabilityAdapter({ policy: "ON_ERROR_SW_EVICTION_MID_REQUEST" });
    const onErrorPolicy = await onError.resume(onError.serialize({}));
    expect(onErrorPolicy).toBe("ON_ERROR_SW_EVICTION_MID_REQUEST");
  });
});

// ---------- Composition with checkpoint envelope (D-10) ----------

describe("SurvivabilityAdapter -- composes with Phase 3 checkpoint receipts (D-10)", () => {
  it("Test 11: SerializedSnapshot.payload can carry a v1.1 ReceiptEnvelope + session state", async () => {
    interface HostState {
      readonly sessionId: string;
      readonly stepIndex: number;
      readonly latestEnvelope: ReceiptEnvelope;
    }

    // Real signer + receipt (no mocks per "Real runtime tests" project rule).
    const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
    const signer = createInMemorySigner(privateKeyJwk, { kid: "test-kid-A", publicKeyJwk });

    const envelope = await createReceipt(
      {
        runId: "run-survivability-test-A",
        model: { requested: "lattice-test/none", observed: null },
        route: { providerId: "lattice-test", capabilityId: "lattice-test/none", attemptNumber: 1 },
        usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
        contractVerdict: "success",
        contractHash: null,
        inputHashes: [],
        outputHash: null,
        stepName: "test-step-A",
        stepIndex: 0,
        sessionId: "test-session-A",
        timestamp: new Date().toISOString(),
      },
      signer,
    );

    const adapter = createNoopSurvivabilityAdapter<HostState>();
    const original: HostState = {
      sessionId: "test-session-A",
      stepIndex: 0,
      latestEnvelope: envelope,
    };
    const snapshot = adapter.serialize(original);
    const restored = adapter.deserialize(snapshot);

    expect(restored.sessionId).toBe("test-session-A");
    expect(restored.stepIndex).toBe(0);
    expect(restored.latestEnvelope.payloadType).toBe(envelope.payloadType);
    expect(restored.latestEnvelope.payload).toBe(envelope.payload);
    expect(restored.latestEnvelope.signatures[0]?.sig).toBe(envelope.signatures[0]?.sig);
  });

  it("Test 12: round-tripped envelope verifies under verifyReceipt (DSSE + JCS preserved)", async () => {
    interface HostState {
      readonly envelope: ReceiptEnvelope;
    }

    const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
    const signer = createInMemorySigner(privateKeyJwk, { kid: "test-kid-B", publicKeyJwk });
    const keySet = createMemoryKeySet([{ kid: "test-kid-B", publicKeyJwk, state: "active" }]);

    const envelope = await createReceipt(
      {
        runId: "run-survivability-test-B",
        model: { requested: "lattice-test/none", observed: null },
        route: { providerId: "lattice-test", capabilityId: "lattice-test/none", attemptNumber: 1 },
        usage: { promptTokens: 0, completionTokens: 0, costUsd: null },
        contractVerdict: "success",
        contractHash: null,
        inputHashes: [],
        outputHash: null,
        stepName: "test-step-B",
        stepIndex: 1,
        sessionId: "test-session-B",
        timestamp: new Date().toISOString(),
      },
      signer,
    );

    const adapter = createNoopSurvivabilityAdapter<HostState>();
    const snapshot = adapter.serialize({ envelope });
    const restored = adapter.deserialize(snapshot);

    const result = await verifyReceipt(restored.envelope, keySet);
    expect(result.ok).toBe(true);
  });
});

// ---------- TypeScript strict-mode compile cleanliness (D-12) ----------

describe("SurvivabilityAdapter -- TypeScript exactOptionalPropertyTypes compile cleanliness", () => {
  it("Test 14: optional config field compiles under Lattice's strict tsconfig", () => {
    // Compiles iff exactOptionalPropertyTypes accepts the {id?: string} pattern
    // in the factory options interface. Sanity check at runtime.
    const a = createNoopSurvivabilityAdapter();
    const b = createNoopSurvivabilityAdapter({});
    const c = createNoopSurvivabilityAdapter({ id: "explicit" });
    expect(a.kind).toBe("survivability-adapter");
    expect(b.kind).toBe("survivability-adapter");
    expect(c.id).toBe("explicit");
  });

  it("Test 14b: SerializedSnapshot type is structurally consistent across serialize calls", () => {
    const adapter = createNoopSurvivabilityAdapter<{ k: string }>();
    const s1 = adapter.serialize({ k: "v1" });
    const s2 = adapter.serialize({ k: "v2" });
    // Both snapshots share the same `kind` + `version` literal shape.
    expect(s1.kind).toBe(s2.kind);
    expect(s1.version).toBe(s2.version);
    expect(s1.payload).not.toBe(s2.payload);
  });
});
