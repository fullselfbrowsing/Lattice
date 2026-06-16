import { describe, expect, it } from "vitest";

import {
  createOtelRunEventSink,
  sanitizeRunEventAttributes,
  type OtelAttributes,
  type OtelSpanLike,
  type OtelSpanStatus,
  type OtelTracerLike,
} from "./otel.js";
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

  it("marks run.failed spans as errors and records the sanitized failure message", async () => {
    const tracer = new FakeTracer();
    const sink = createOtelRunEventSink({ tracer });

    await sink(event("run.start"));
    await sink(event("run.failed", { metadata: { error: "Provider unavailable" } }));

    const span = tracer.starts[0]?.span;
    expect(span?.statuses).toEqual([{ code: 2, message: "Provider unavailable" }]);
    expect(span?.exceptions).toEqual(["Provider unavailable"]);
    expect(span?.ended).toBe(true);
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
