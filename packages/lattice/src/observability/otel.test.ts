import { describe, expect, it } from "vitest";

import {
  createLangfuseOtlpConfig,
  createOtelReceiptAttributes,
  createOtelRunEventSink,
  createPhoenixOtlpConfig,
  sanitizeRunEventAttributes,
  type OtelAttributes,
  type OtelSpanLike,
  type OtelSpanStatus,
  type OtelTracerLike,
} from "./otel.js";
import { createReceipt, type CreateReceiptInput } from "../receipts/receipt.js";
import {
  createInMemorySigner,
  generateEd25519KeyPairJwk,
} from "../receipts/sign.js";
import type { ReceiptEnvelope, ReceiptSigner } from "../receipts/types.js";
import type { RunEvent, RunEventKind } from "../tracing/tracing.js";

const ALL_EVENT_KINDS = [
  "run.start",
  "artifact.ingested",
  "context.packed",
  "router.candidates",
  "stage.start",
  "stage.complete",
  "provider.attempt",
  "stream.start",
  "stream.complete",
  "stream.failed",
  "fallback.activated",
  "validation.complete",
  "validation.failed",
  "artifact.created",
  "run.complete",
  "run.failed",
  "tool.call",
  "replay.offline",
  "replay.live",
  "step.transition",
  "recovery.start",
  "recovery.complete",
  "recovery.failed",
  "capabilities.negotiation.fallback",
] as const satisfies readonly RunEventKind[];

class FakeSpan implements OtelSpanLike {
  readonly attributes: OtelAttributes[] = [];
  readonly events: Array<{ readonly name: string; readonly attributes?: OtelAttributes }> = [];
  readonly exceptions: Array<Error | string | Record<string, unknown>> = [];
  statuses: OtelSpanStatus[] = [];
  ended = false;
  endTime: Date | number | undefined;

  setAttributes(attributes: OtelAttributes): void {
    this.attributes.push({ ...attributes });
  }

  addEvent(name: string, attributes?: OtelAttributes): void {
    this.events.push({
      name,
      ...(attributes !== undefined ? { attributes: { ...attributes } } : {}),
    });
  }

  setStatus(status: OtelSpanStatus): void {
    this.statuses = [...this.statuses, status];
  }

  recordException(error: Error | string | Record<string, unknown>): void {
    this.exceptions.push(error);
  }

  end(endTime?: Date | number): void {
    this.ended = true;
    this.endTime = endTime;
  }
}

class FakeTracer implements OtelTracerLike {
  readonly starts: Array<{
    readonly name: string;
    readonly options?: { readonly attributes?: OtelAttributes; readonly startTime?: Date | number };
    readonly span: FakeSpan;
  }> = [];

  startSpan(
    name: string,
    options?: { readonly attributes?: OtelAttributes; readonly startTime?: Date | number },
  ): OtelSpanLike {
    const span = new FakeSpan();
    this.starts.push({
      name,
      ...(options !== undefined ? { options } : {}),
      span,
    });
    return span;
  }
}

describe("createOtelRunEventSink", () => {
  it("starts one low-cardinality run span and ends it on run.complete", async () => {
    const tracer = new FakeTracer();
    const sink = createOtelRunEventSink({ tracer });

    await sink(event("run.start"));
    await sink(event("context.packed", {
      metadata: { estimatedTokens: 42, included: 2, summarized: 1, omitted: 0 },
    }));
    await sink(event("run.complete"));

    expect(tracer.starts).toHaveLength(1);
    expect(tracer.starts[0]?.name).toBe("lattice.run");
    const span = tracer.starts[0]?.span;
    expect(span?.events.map((item) => item.name)).toEqual([
      "lattice.run.start",
      "lattice.context.packed",
      "lattice.run.complete",
    ]);
    expect(span?.statuses).toEqual([{ code: 1 }]);
    expect(span?.ended).toBe(true);
    expect(span?.events[1]?.attributes).toMatchObject({
      "lattice.context.estimated_tokens": 42,
      "lattice.context.included.count": 2,
      "lattice.context.summarized.count": 1,
      "lattice.context.omitted.count": 0,
    });
  });

  it("lazily starts a span when the first event is not run.start", async () => {
    const tracer = new FakeTracer();
    const sink = createOtelRunEventSink({ tracer, spanName: "custom.lattice.run" });

    await sink(event("provider.attempt", {
      providerId: "openai",
      modelId: "gpt-4.1",
      metadata: { status: "started" },
    }));

    expect(tracer.starts).toHaveLength(1);
    expect(tracer.starts[0]?.name).toBe("custom.lattice.run");
    expect(tracer.starts[0]?.span.events[0]).toMatchObject({
      name: "lattice.provider.attempt",
      attributes: {
        "lattice.provider.id": "openai",
        "lattice.model.id": "gpt-4.1",
        "gen_ai.provider.name": "openai",
        "gen_ai.request.model": "gpt-4.1",
        "lattice.event.status": "started",
      },
    });
  });

  it("marks run.failed spans as errors without recording arbitrary error text", async () => {
    const tracer = new FakeTracer();
    const sink = createOtelRunEventSink({ tracer });

    await sink(event("run.start"));
    await sink(event("run.failed", { metadata: { error: "Provider unavailable" } }));

    const span = tracer.starts[0]?.span;
    expect(span?.statuses).toEqual([{ code: 2 }]);
    expect(span?.exceptions).toEqual([]);
    expect(span?.ended).toBe(true);
  });

  it("uses safe failure reasons as error status messages", async () => {
    const tracer = new FakeTracer();
    const sink = createOtelRunEventSink({ tracer });

    await sink(event("run.start"));
    await sink(event("run.failed", { metadata: { reason: "no-route" } }));

    const span = tracer.starts[0]?.span;
    expect(span?.statuses).toEqual([{ code: 2, message: "no-route" }]);
    expect(span?.exceptions).toEqual(["no-route"]);
  });

  it("maps every current RunEventKind to a predictable span event", async () => {
    const tracer = new FakeTracer();
    const sink = createOtelRunEventSink({ tracer });

    for (const kind of ALL_EVENT_KINDS) {
      await sink(event(kind, { runId: `run:${kind}` }));
    }

    expect(tracer.starts).toHaveLength(ALL_EVENT_KINDS.length);
    const names = tracer.starts.map((start) => start.span.events[0]?.name);
    expect(names).toEqual(ALL_EVENT_KINDS.map((kind) => `lattice.${kind}`));

    for (const [index, kind] of ALL_EVENT_KINDS.entries()) {
      expect(tracer.starts[index]?.span.events[0]?.attributes).toMatchObject({
        "lattice.event.kind": kind,
        "lattice.run.id": `run:${kind}`,
      });
    }
  });

  it("adds receipt CID and signature attributes when metadata carries an envelope", async () => {
    const tracer = new FakeTracer();
    const sink = createOtelRunEventSink({ tracer });
    const envelope = await makeReceiptEnvelope("otel-receipt-key");

    await sink(event("step.transition", { metadata: { envelope } }));

    expect(tracer.starts[0]?.span.events[0]?.attributes).toMatchObject({
      "lattice.receipt.cid": expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      "lattice.receipt.signature.count": 1,
      "lattice.receipt.signature.keyid": "otel-receipt-key",
    });
  });
});

describe("sanitizeRunEventAttributes", () => {
  it("maps base lattice and gen_ai attributes", () => {
    expect(sanitizeRunEventAttributes(event("router.candidates", {
      providerId: "anthropic",
      modelId: "claude-sonnet-4",
      artifactId: "artifact:1",
      stageId: "routing",
      metadata: { selected: "claude-sonnet-4", rejected: 2, fallbacks: 1 },
    }))).toMatchObject({
      "lattice.event.kind": "router.candidates",
      "lattice.run.id": "run:test",
      "lattice.stage.id": "routing",
      "lattice.provider.id": "anthropic",
      "lattice.model.id": "claude-sonnet-4",
      "lattice.artifact.id": "artifact:1",
      "gen_ai.provider.name": "anthropic",
      "gen_ai.request.model": "claude-sonnet-4",
      "lattice.route.selected_model": "claude-sonnet-4",
      "lattice.route.rejected.count": 2,
      "lattice.route.fallback.count": 1,
    });
  });

  it("marks stream events as streaming requests", () => {
    expect(sanitizeRunEventAttributes(event("stream.start"))).toMatchObject({
      "gen_ai.request.stream": true,
    });
  });

  it("maps usage, gateway, and provider attempt metadata without leaking gateway policy internals", () => {
    const attributes = sanitizeRunEventAttributes(event("provider.attempt", {
      providerId: "openrouter",
      modelId: "openai/gpt-4.1",
      metadata: {
        status: "succeeded",
        fallback: true,
        usage: { inputTokens: 12, outputTokens: 5, costUsd: 0.03 },
        gateway: {
          used: true,
          providerId: "openrouter",
          selectedProviderId: "openrouter",
          requestedModel: "openai/gpt-4.1",
          observedModel: "openai/gpt-4.1-2026-06",
          fallbackModels: ["anthropic/claude-sonnet-4"],
          policy: {
            authorization: "Bearer secret",
          },
        },
      },
    }));

    expect(attributes).toMatchObject({
      "lattice.event.status": "succeeded",
      "lattice.provider.attempt.fallback": true,
      "gen_ai.usage.input_tokens": 12,
      "gen_ai.usage.output_tokens": 5,
      "llm.token_count.prompt": 12,
      "llm.token_count.completion": 5,
      "lattice.usage.cost_usd": 0.03,
      "lattice.gateway.used": true,
      "lattice.gateway.requested_model": "openai/gpt-4.1",
      "lattice.gateway.observed_model": "openai/gpt-4.1-2026-06",
      "gen_ai.response.model": "openai/gpt-4.1-2026-06",
      "lattice.gateway.fallback_models": ["anthropic/claude-sonnet-4"],
    });
    expect(JSON.stringify(attributes)).not.toContain("Bearer secret");
  });

  it("excludes raw content and secret-shaped keys by default", () => {
    const attributes = sanitizeRunEventAttributes(event("validation.failed", {
      metadata: {
        error: "schema failed",
        prompt: "raw user prompt",
        rawOutputs: { answer: "raw model output" },
        artifact: { value: "file bytes" },
        apiKey: "sk-test-secret",
        authorization: "Bearer secret",
        content: "message content",
      },
    }));

    expect(attributes).toMatchObject({
      "lattice.error.present": true,
    });
    const serialized = JSON.stringify(attributes);
    expect(serialized).not.toContain("schema failed");
    expect(serialized).not.toContain("raw user prompt");
    expect(serialized).not.toContain("raw model output");
    expect(serialized).not.toContain("file bytes");
    expect(serialized).not.toContain("sk-test-secret");
    expect(serialized).not.toContain("Bearer secret");
    expect(serialized).not.toContain("message content");
  });

  it("captures bounded benign metadata only when explicitly enabled", () => {
    const attributes = sanitizeRunEventAttributes(event("recovery.complete", {
      metadata: {
        workerId: "worker-1",
        retryCount: 2,
        resumed: true,
        tags: ["resume", "storage"],
        buckets: [1, 2, 3],
        switches: [true, false],
        token: "secret",
        prompt: "raw prompt",
        nested: { safe: "but not captured" },
      },
    }), { contentCapture: "metadata" });

    expect(attributes).toMatchObject({
      "lattice.metadata.workerId": "worker-1",
      "lattice.metadata.retryCount": 2,
      "lattice.metadata.resumed": true,
      "lattice.metadata.tags": ["resume", "storage"],
      "lattice.metadata.buckets": [1, 2, 3],
      "lattice.metadata.switches": [true, false],
    });
    const serialized = JSON.stringify(attributes);
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("raw prompt");
    expect(serialized).not.toContain("but not captured");
  });
});

describe("createOtelReceiptAttributes", () => {
  it("derives receipt CID and signature references from a real envelope", async () => {
    const envelope = await makeReceiptEnvelope("receipt-attrs-key");

    await expect(createOtelReceiptAttributes(envelope)).resolves.toMatchObject({
      "lattice.receipt.cid": expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
      "lattice.receipt.signature.count": 1,
      "lattice.receipt.signature.keyid": "receipt-attrs-key",
    });
  });
});

describe("createLangfuseOtlpConfig", () => {
  it("builds the default Langfuse Cloud trace endpoint and ingestion header", () => {
    expect(createLangfuseOtlpConfig()).toEqual({
      endpoint: "https://cloud.langfuse.com/api/public/otel/v1/traces",
      headers: {
        "x-langfuse-ingestion-version": "4",
      },
    });
  });

  it("supports Basic auth from public and secret keys", () => {
    expect(createLangfuseOtlpConfig({
      baseUrl: "https://us.cloud.langfuse.com/api/public/otel",
      publicKey: "pk-lf-test",
      secretKey: "sk-lf-test",
    })).toEqual({
      endpoint: "https://us.cloud.langfuse.com/api/public/otel/v1/traces",
      headers: {
        Authorization: `Basic ${btoa("pk-lf-test:sk-lf-test")}`,
        "x-langfuse-ingestion-version": "4",
      },
    });
  });

  it("allows precomputed auth strings and custom headers", () => {
    expect(createLangfuseOtlpConfig({
      baseUrl: "http://localhost:3000/",
      authString: "precomputed",
      ingestionVersion: "4",
      headers: { "x-custom": "1" },
    })).toEqual({
      endpoint: "http://localhost:3000/api/public/otel/v1/traces",
      headers: {
        Authorization: "Basic precomputed",
        "x-langfuse-ingestion-version": "4",
        "x-custom": "1",
      },
    });
  });

  it("requires Langfuse public and secret keys together", () => {
    expect(() => createLangfuseOtlpConfig({ publicKey: "pk-lf-test" })).toThrow(
      /publicKey and secretKey/u,
    );
  });
});

describe("createPhoenixOtlpConfig", () => {
  it("builds the local Phoenix OTLP HTTP trace endpoint by default", () => {
    expect(createPhoenixOtlpConfig()).toEqual({
      endpoint: "http://localhost:6006/v1/traces",
      headers: {},
    });
  });

  it("adds Bearer auth and project routing headers", () => {
    expect(createPhoenixOtlpConfig({
      baseUrl: "https://app.phoenix.arize.com/s/space-name",
      apiKey: "px-key",
      projectName: "lattice",
    })).toEqual({
      endpoint: "https://app.phoenix.arize.com/s/space-name/v1/traces",
      headers: {
        Authorization: "Bearer px-key",
        "x-project-name": "lattice",
      },
    });
  });

  it("respects exact endpoints and custom headers", () => {
    expect(createPhoenixOtlpConfig({
      endpoint: "https://phoenix.example.com/custom/traces",
      headers: { "x-env": "test" },
    })).toEqual({
      endpoint: "https://phoenix.example.com/custom/traces",
      headers: { "x-env": "test" },
    });
  });
});

function event(
  kind: RunEventKind,
  overrides: Partial<Omit<RunEvent, "kind" | "timestamp">> = {},
): RunEvent {
  return {
    kind,
    timestamp: "2026-06-16T12:00:00.000Z",
    runId: "run:test",
    ...(overrides.planId !== undefined ? { planId: overrides.planId } : { planId: "plan:test" }),
    ...(overrides.stageId !== undefined ? { stageId: overrides.stageId } : {}),
    ...(overrides.providerId !== undefined ? { providerId: overrides.providerId } : {}),
    ...(overrides.modelId !== undefined ? { modelId: overrides.modelId } : {}),
    ...(overrides.artifactId !== undefined ? { artifactId: overrides.artifactId } : {}),
    ...(overrides.metadata !== undefined ? { metadata: overrides.metadata } : {}),
    ...(overrides.runId !== undefined ? { runId: overrides.runId } : {}),
  };
}

async function makeSigner(
  kid: string,
): Promise<{ readonly signer: ReceiptSigner; readonly publicKeyJwk: JsonWebKey }> {
  const { privateKeyJwk, publicKeyJwk } = await generateEd25519KeyPairJwk();
  return {
    signer: createInMemorySigner(privateKeyJwk, { kid, publicKeyJwk }),
    publicKeyJwk,
  };
}

async function makeReceiptEnvelope(kid: string): Promise<ReceiptEnvelope> {
  const { signer } = await makeSigner(kid);
  return createReceipt(minimalReceiptInput(), signer);
}

function minimalReceiptInput(
  overrides: Partial<CreateReceiptInput> = {},
): CreateReceiptInput {
  const base: CreateReceiptInput = {
    runId: "run-otel-receipt",
    model: { requested: "gpt-4.1", observed: null },
    route: {
      providerId: "openai",
      capabilityId: "openai/gpt-4.1",
      attemptNumber: 1,
    },
    usage: { promptTokens: 1, completionTokens: 1, costUsd: 0.001 },
    contractVerdict: "success",
    contractHash: null,
    inputHashes: [],
    outputHash: null,
  };
  return { ...base, ...overrides };
}
