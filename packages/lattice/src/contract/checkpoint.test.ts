import { describe, expect, it } from "vitest";

import { createMemoryKeySet } from "../receipts/keyset.js";
import {
  createInMemorySigner,
  generateEd25519KeyPairJwk,
} from "../receipts/sign.js";
import type { ReceiptSigner } from "../receipts/types.js";
import { verifyReceipt } from "../receipts/verify.js";

import { BAND, createHookPipeline } from "./bands.js";
import {
  DEFAULT_CHECKPOINT_BAND,
  STEP_TRANSITION_EVENT_NAME,
  createCheckpointHook,
  type CheckpointHookContext,
} from "./checkpoint.js";

import type { TracerLike } from "../tracing/tracing.js";

// Recording tracer -- captures every event the handler emits so tests can
// assert metadata shape + count. Mirrors bands.test.ts recordingTracer().
function recordingTracer(): {
  readonly tracer: TracerLike;
  readonly events: Array<{ name: string; attributes?: Record<string, unknown> }>;
} {
  const events: Array<{ name: string; attributes?: Record<string, unknown> }> = [];
  const tracer: TracerLike = {
    kind: "tracer",
    event(name, attributes) {
      events.push({ name, ...(attributes !== undefined ? { attributes } : {}) });
    },
  };
  return { tracer, events };
}

// Helper: minimal viable CheckpointHookContext for a single step transition.
function ctx(overrides: Partial<CheckpointHookContext> = {}): CheckpointHookContext {
  return {
    stepName: "step-1",
    stepIndex: 0,
    timestamp: "2026-05-24T18:00:00.000Z",
    ...overrides,
  };
}

// Helper: a fresh signer + key set for receipt round-trip cases.
async function makeSigner(kid = "checkpoint-test-key"): Promise<{
  readonly signer: ReceiptSigner;
  readonly publicKeyJwk: JsonWebKey;
}> {
  const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
  const signer = createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk });
  return { signer, publicKeyJwk };
}

// Helper: a signer that always throws -- exercises D-07 best-effort mint.
function rejectingSigner(kid = "checkpoint-test-key"): ReceiptSigner {
  return {
    kid,
    publicKeyJwk: { kty: "OKP", crv: "Ed25519", x: "stub" } as JsonWebKey,
    async sign(): Promise<Uint8Array> {
      throw new Error("signer-throws-on-purpose");
    },
  };
}

describe("createCheckpointHook -- factory identity", () => {
  it("returns a function (the handler)", () => {
    const handler = createCheckpointHook({ runId: "r-1" });
    expect(typeof handler).toBe("function");
  });

  it("exports STEP_TRANSITION_EVENT_NAME === 'step.transition'", () => {
    expect(STEP_TRANSITION_EVENT_NAME).toBe("step.transition");
  });

  it("exports DEFAULT_CHECKPOINT_BAND === BAND.OBSERVABILITY", () => {
    expect(DEFAULT_CHECKPOINT_BAND).toBe(BAND.OBSERVABILITY);
  });
});

describe("createCheckpointHook -- tracer-only mode (no signer)", () => {
  it("emits exactly one step.transition event when no signer is configured", async () => {
    const { tracer, events } = recordingTracer();
    const handler = createCheckpointHook({ runId: "r-1", tracer });
    await handler(ctx());
    expect(events.length).toBe(1);
    expect(events[0]?.name).toBe(STEP_TRANSITION_EVENT_NAME);
  });

  it("event metadata carries stepName, stepIndex, timestamp, runId", async () => {
    const { tracer, events } = recordingTracer();
    const handler = createCheckpointHook({ runId: "r-42", tracer });
    await handler(ctx({ stepName: "click-link", stepIndex: 5, timestamp: "2026-05-24T19:00:00.000Z" }));
    const attrs = events[0]?.attributes ?? {};
    expect(attrs.stepName).toBe("click-link");
    expect(attrs.stepIndex).toBe(5);
    expect(attrs.timestamp).toBe("2026-05-24T19:00:00.000Z");
    expect(attrs.runId).toBe("r-42");
  });

  it("event metadata carries parentStepName + previousStepName + sessionId when provided", async () => {
    const { tracer, events } = recordingTracer();
    const handler = createCheckpointHook({ runId: "r-1", tracer, sessionId: "sess-abc" });
    await handler(ctx({ parentStepName: "parent-step", previousStepName: "prev-step" }));
    const attrs = events[0]?.attributes ?? {};
    expect(attrs.parentStepName).toBe("parent-step");
    expect(attrs.previousStepName).toBe("prev-step");
    expect(attrs.sessionId).toBe("sess-abc");
  });

  it("event metadata omits receiptId AND mintError when no signer", async () => {
    const { tracer, events } = recordingTracer();
    const handler = createCheckpointHook({ runId: "r-1", tracer });
    await handler(ctx());
    const attrs = events[0]?.attributes ?? {};
    expect(attrs.receiptId).toBeUndefined();
    expect(attrs.mintError).toBeUndefined();
  });
});

describe("createCheckpointHook -- signer mode (mint + verify round-trip)", () => {
  it("mints exactly one v1.1 receipt when signer present", async () => {
    const { tracer, events } = recordingTracer();
    const { signer, publicKeyJwk } = await makeSigner("cp-key-1");
    const handler = createCheckpointHook({ runId: "r-mint-1", tracer, signer });
    await handler(ctx({ stepName: "do-thing", stepIndex: 7 }));
    expect(events.length).toBe(1);
    const attrs = events[0]?.attributes ?? {};
    expect(typeof attrs.receiptId).toBe("string");
    expect(attrs.mintError).toBeUndefined();
    // ensure the minted body verifies via the real Lattice verifier
    expect(attrs.envelope).toBeDefined();
    const envelope = attrs.envelope as Awaited<ReturnType<typeof import("../receipts/receipt.js").createReceipt>>;
    const keySet = createMemoryKeySet([{ kid: "cp-key-1", publicKeyJwk, state: "active" }]);
    const result = await verifyReceipt(envelope, keySet);
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.body.version).toBe("lattice-receipt/v1.1");
      expect(result.body.stepName).toBe("do-thing");
      expect(result.body.stepIndex).toBe(7);
      expect(result.body.runId).toBe("r-mint-1");
    }
  });

  it("round-trips all 6 step-marker fields through verifyReceipt", async () => {
    const { tracer, events } = recordingTracer();
    const { signer, publicKeyJwk } = await makeSigner("cp-key-2");
    const handler = createCheckpointHook({
      runId: "r-mint-2",
      tracer,
      signer,
      sessionId: "sess-mint",
    });
    await handler(ctx({
      stepName: "step-7",
      stepIndex: 7,
      parentStepName: "step-3",
      previousStepName: "step-6",
      timestamp: "2026-05-24T20:00:00.000Z",
    }));
    const envelope = (events[0]?.attributes as Record<string, unknown>)?.envelope as Awaited<ReturnType<typeof import("../receipts/receipt.js").createReceipt>>;
    const keySet = createMemoryKeySet([{ kid: "cp-key-2", publicKeyJwk, state: "active" }]);
    const result = await verifyReceipt(envelope, keySet);
    expect(result.ok).toBe(true);
    if (result.ok === true) {
      expect(result.body.stepName).toBe("step-7");
      expect(result.body.stepIndex).toBe(7);
      expect(result.body.parentStepName).toBe("step-3");
      expect(result.body.previousStepName).toBe("step-6");
      expect(result.body.sessionId).toBe("sess-mint");
      expect(result.body.timestamp).toBe("2026-05-24T20:00:00.000Z");
    }
  });
});

describe("createCheckpointHook -- best-effort mint (D-07)", () => {
  it("does NOT throw upstream when signer rejects", async () => {
    const { tracer } = recordingTracer();
    const handler = createCheckpointHook({ runId: "r-fail", tracer, signer: rejectingSigner() });
    await expect(handler(ctx())).resolves.toBeUndefined();
  });

  it("emits a single step.transition event with mintError when signer throws", async () => {
    const { tracer, events } = recordingTracer();
    const handler = createCheckpointHook({ runId: "r-fail", tracer, signer: rejectingSigner() });
    await handler(ctx());
    expect(events.length).toBe(1);
    const attrs = events[0]?.attributes ?? {};
    expect(typeof attrs.mintError).toBe("string");
    expect(attrs.receiptId).toBeUndefined();
  });
});

describe("createCheckpointHook -- 3-call linked-list threading", () => {
  it("emits 3 events with monotonically increasing stepIndex (caller-supplied)", async () => {
    const { tracer, events } = recordingTracer();
    const handler = createCheckpointHook({ runId: "r-thread", tracer });
    await handler(ctx({ stepName: "step-1", stepIndex: 0 }));
    await handler(ctx({ stepName: "step-2", stepIndex: 1, previousStepName: "step-1" }));
    await handler(ctx({ stepName: "step-3", stepIndex: 2, parentStepName: "step-1", previousStepName: "step-2" }));
    expect(events.length).toBe(3);
    expect((events[0]?.attributes as Record<string, unknown>)?.stepIndex).toBe(0);
    expect((events[1]?.attributes as Record<string, unknown>)?.stepIndex).toBe(1);
    expect((events[2]?.attributes as Record<string, unknown>)?.stepIndex).toBe(2);
    expect((events[1]?.attributes as Record<string, unknown>)?.previousStepName).toBe("step-1");
    expect((events[2]?.attributes as Record<string, unknown>)?.parentStepName).toBe("step-1");
    expect((events[2]?.attributes as Record<string, unknown>)?.previousStepName).toBe("step-2");
  });
});

describe("createCheckpointHook -- HookPipeline integration", () => {
  it("registers cleanly on Phase 2's HookPipeline at BAND.OBSERVABILITY without throwing", () => {
    const pipe = createHookPipeline();
    const handler = createCheckpointHook({ runId: "r-pipe" });
    expect(() => {
      pipe.register("AFTER_TOOL", handler, { band: BAND.OBSERVABILITY });
    }).not.toThrow();
  });

  it("pipeline.run invokes the handler exactly once per fire", async () => {
    const { tracer, events } = recordingTracer();
    const pipe = createHookPipeline();
    const handler = createCheckpointHook({ runId: "r-pipe", tracer });
    pipe.register("AFTER_TOOL", handler, { band: BAND.OBSERVABILITY });
    await pipe.run("AFTER_TOOL", ctx({ stepName: "via-pipeline" }));
    expect(events.length).toBe(1);
    expect((events[0]?.attributes as Record<string, unknown>)?.stepName).toBe("via-pipeline");
  });
});

describe("createCheckpointHook -- tracer absent (mint still works)", () => {
  it("mints a receipt even when tracer is omitted (no throw, returns)", async () => {
    const { signer } = await makeSigner("cp-key-no-tracer");
    const handler = createCheckpointHook({ runId: "r-no-tracer", signer });
    await expect(handler(ctx())).resolves.toBeUndefined();
  });
});
