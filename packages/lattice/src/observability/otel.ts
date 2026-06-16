import type { RunEvent, RunEventSink } from "../tracing/tracing.js";

export type OtelAttributeValue =
  | string
  | number
  | boolean
  | readonly string[]
  | readonly number[]
  | readonly boolean[];

export type OtelAttributes = Record<string, OtelAttributeValue>;

export interface OtelSpanStatus {
  readonly code: number;
  readonly message?: string;
}

export interface OtelSpanLike {
  setAttribute?(key: string, value: OtelAttributeValue): unknown;
  setAttributes?(attributes: OtelAttributes): unknown;
  addEvent?(name: string, attributes?: OtelAttributes): unknown;
  setStatus?(status: OtelSpanStatus): unknown;
  recordException?(error: Error | string | Record<string, unknown>): unknown;
  end?(endTime?: Date | number): unknown;
}

export interface OtelTracerLike {
  startSpan(
    name: string,
    options?: {
      readonly attributes?: OtelAttributes;
      readonly startTime?: Date | number;
    },
  ): OtelSpanLike;
}

export type OtelContentCaptureMode = "none" | "metadata";

export interface OtelSanitizerOptions {
  readonly contentCapture?: OtelContentCaptureMode;
}

export interface OtelRunEventSinkOptions extends OtelSanitizerOptions {
  readonly tracer: OtelTracerLike;
  readonly spanName?: string;
}

const DEFAULT_SPAN_NAME = "lattice.run";
const OTEL_STATUS_OK = 1;
const OTEL_STATUS_ERROR = 2;

export function createOtelRunEventSink(
  options: OtelRunEventSinkOptions,
): RunEventSink {
  const spans = new Map<string, OtelSpanLike>();

  return async (event) => {
    const span = getOrCreateRunSpan(event, options, spans);
    const attributes = sanitizeRunEventAttributes(event, options);
    setSpanAttributes(span, attributes);
    span.addEvent?.(`lattice.${event.kind}`, attributes);

    if (event.kind === "run.complete") {
      span.setStatus?.({ code: OTEL_STATUS_OK });
      span.end?.(eventTime(event));
      spans.delete(event.runId);
      return;
    }

    if (event.kind === "run.failed") {
      const message = metadataString(event, "error") ?? metadataString(event, "reason");
      span.setStatus?.({
        code: OTEL_STATUS_ERROR,
        ...(message !== undefined ? { message } : {}),
      });
      if (message !== undefined) {
        span.recordException?.(message);
      }
      span.end?.(eventTime(event));
      spans.delete(event.runId);
    }
  };
}

export function sanitizeRunEventAttributes(
  event: RunEvent,
  _options: OtelSanitizerOptions = {},
): OtelAttributes {
  const attributes: OtelAttributes = {
    "lattice.event.kind": event.kind,
    "lattice.run.id": event.runId,
  };

  assignString(attributes, "lattice.plan.id", event.planId);
  assignString(attributes, "lattice.stage.id", event.stageId);
  assignString(attributes, "lattice.provider.id", event.providerId);
  assignString(attributes, "lattice.model.id", event.modelId);
  assignString(attributes, "lattice.artifact.id", event.artifactId);
  assignString(attributes, "gen_ai.provider.name", event.providerId);
  assignString(attributes, "gen_ai.request.model", event.modelId);

  if (event.kind === "stream.start" || event.kind === "stream.complete" || event.kind === "stream.failed") {
    attributes["gen_ai.request.stream"] = true;
  }

  const metadata = event.metadata ?? {};
  assignString(attributes, "lattice.event.status", metadataString(event, "status"));
  assignString(attributes, "lattice.error.message", metadataString(event, "error"));
  assignString(attributes, "lattice.failure.reason", metadataString(event, "reason"));
  assignString(attributes, "lattice.route.selected_model", asString(metadata.selected));
  assignNumber(attributes, "lattice.route.rejected.count", asNumber(metadata.rejected));
  assignNumber(attributes, "lattice.route.fallback.count", asNumber(metadata.fallbacks));
  assignNumber(attributes, "lattice.context.estimated_tokens", asNumber(metadata.estimatedTokens));
  assignNumber(attributes, "lattice.context.included.count", asNumber(metadata.included));
  assignNumber(attributes, "lattice.context.summarized.count", asNumber(metadata.summarized));
  assignNumber(attributes, "lattice.context.omitted.count", asNumber(metadata.omitted));
  assignString(attributes, "lattice.tool.name", asString(metadata.toolName));
  assignString(attributes, "lattice.tool.call.id", asString(metadata.callId));

  return attributes;
}

function getOrCreateRunSpan(
  event: RunEvent,
  options: OtelRunEventSinkOptions,
  spans: Map<string, OtelSpanLike>,
): OtelSpanLike {
  const existing = spans.get(event.runId);
  if (existing !== undefined) {
    return existing;
  }

  const span = options.tracer.startSpan(options.spanName ?? DEFAULT_SPAN_NAME, {
    attributes: sanitizeRunEventAttributes(event, options),
    startTime: eventTime(event),
  });
  spans.set(event.runId, span);
  return span;
}

function setSpanAttributes(span: OtelSpanLike, attributes: OtelAttributes): void {
  if (span.setAttributes !== undefined) {
    span.setAttributes(attributes);
    return;
  }

  for (const [key, value] of Object.entries(attributes)) {
    span.setAttribute?.(key, value);
  }
}

function eventTime(event: RunEvent): Date {
  return new Date(event.timestamp);
}

function metadataString(event: RunEvent, key: string): string | undefined {
  return asString(event.metadata?.[key]);
}

function assignString(
  attributes: OtelAttributes,
  key: string,
  value: string | undefined,
): void {
  if (value !== undefined) {
    attributes[key] = value;
  }
}

function assignNumber(
  attributes: OtelAttributes,
  key: string,
  value: number | undefined,
): void {
  if (value !== undefined) {
    attributes[key] = value;
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
