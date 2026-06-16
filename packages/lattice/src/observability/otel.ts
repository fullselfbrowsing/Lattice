import { receiptCid } from "../receipts/cid.js";
import type { ReceiptEnvelope } from "../receipts/types.js";
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

export interface OtelHttpTraceConfig {
  readonly endpoint: string;
  readonly headers: Record<string, string>;
}

export interface LangfuseOtlpConfigOptions {
  readonly baseUrl?: string;
  readonly publicKey?: string;
  readonly secretKey?: string;
  readonly authString?: string;
  readonly ingestionVersion?: string;
  readonly headers?: Record<string, string>;
}

export interface PhoenixOtlpConfigOptions {
  readonly baseUrl?: string;
  readonly endpoint?: string;
  readonly apiKey?: string;
  readonly projectName?: string;
  readonly headers?: Record<string, string>;
}

const DEFAULT_SPAN_NAME = "lattice.run";
const DEFAULT_LANGFUSE_BASE_URL = "https://cloud.langfuse.com";
const DEFAULT_PHOENIX_BASE_URL = "http://localhost:6006";
const OTEL_STATUS_OK = 1;
const OTEL_STATUS_ERROR = 2;
const SECRET_KEY_RE = /api[-_]?key|authorization|credentials?|headers?|password|secret|token/iu;
const CONTENT_KEY_RE = /artifact|body|content|input|inputs|message|messages|output|outputs|payload|prompt|rawOutputs|task|value/iu;

export function createOtelRunEventSink(
  options: OtelRunEventSinkOptions,
): RunEventSink {
  const spans = new Map<string, OtelSpanLike>();

  return async (event) => {
    const span = getOrCreateRunSpan(event, options, spans);
    const attributes = await createRunEventAttributes(event, options);
    setSpanAttributes(span, attributes);
    span.addEvent?.(`lattice.${event.kind}`, attributes);

    if (event.kind === "capabilities.negotiation.fallback") {
      span.setStatus?.({ code: OTEL_STATUS_OK });
      span.end?.(eventTime(event));
      spans.delete(event.runId);
      return;
    }

    if (event.kind === "run.complete") {
      span.setStatus?.({ code: OTEL_STATUS_OK });
      span.end?.(eventTime(event));
      spans.delete(event.runId);
      return;
    }

    if (event.kind === "run.failed") {
      const message = metadataString(event, "reason");
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
  options: OtelSanitizerOptions = {},
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
  assignBoolean(attributes, "lattice.error.present", metadataString(event, "error") !== undefined ? true : undefined);
  assignString(attributes, "lattice.failure.reason", metadataString(event, "reason"));
  assignString(attributes, "lattice.tripwire.invariant_id", asString(metadata.invariantId));
  assignString(attributes, "lattice.artifact.source", asString(metadata.source));
  assignString(attributes, "lattice.receipt.id", asString(metadata.receiptId));
  assignBoolean(attributes, "lattice.receipt.mint_error.present", asString(metadata.mintError) !== undefined ? true : undefined);
  assignString(attributes, "lattice.route.selected_model", asString(metadata.selected));
  assignNumber(attributes, "lattice.route.rejected.count", asNumber(metadata.rejected));
  assignNumber(attributes, "lattice.route.fallback.count", asNumber(metadata.fallbacks));
  assignBoolean(attributes, "lattice.provider.attempt.fallback", asBoolean(metadata.fallback));
  assignNumber(attributes, "lattice.context.estimated_tokens", asNumber(metadata.estimatedTokens));
  assignNumber(attributes, "lattice.context.included.count", asNumber(metadata.included));
  assignNumber(attributes, "lattice.context.summarized.count", asNumber(metadata.summarized));
  assignNumber(attributes, "lattice.context.omitted.count", asNumber(metadata.omitted));
  assignString(attributes, "lattice.tool.name", asString(metadata.toolName));
  assignString(attributes, "lattice.tool.call.id", asString(metadata.callId));
  assignStringArray(attributes, "lattice.output.names", asStringArray(metadata.outputNames));
  assignUsage(attributes, metadata);
  assignGateway(attributes, metadata.gateway);
  captureSafeMetadata(attributes, metadata, options);

  return attributes;
}

export async function createOtelReceiptAttributes(
  envelope: ReceiptEnvelope,
): Promise<OtelAttributes> {
  const attributes: OtelAttributes = {
    "lattice.receipt.cid": await receiptCid(envelope),
    "lattice.receipt.signature.count": envelope.signatures.length,
  };
  assignString(
    attributes,
    "lattice.receipt.signature.keyid",
    envelope.signatures[0]?.keyid,
  );
  return attributes;
}

export function createLangfuseOtlpConfig(
  options: LangfuseOtlpConfigOptions = {},
): OtelHttpTraceConfig {
  const authString = langfuseAuthString(options);
  return {
    endpoint: langfuseTraceEndpoint(options.baseUrl ?? DEFAULT_LANGFUSE_BASE_URL),
    headers: {
      ...(authString !== undefined ? { Authorization: `Basic ${authString}` } : {}),
      "x-langfuse-ingestion-version": options.ingestionVersion ?? "4",
      ...(options.headers ?? {}),
    },
  };
}

export function createPhoenixOtlpConfig(
  options: PhoenixOtlpConfigOptions = {},
): OtelHttpTraceConfig {
  return {
    endpoint: options.endpoint ?? phoenixTraceEndpoint(options.baseUrl ?? DEFAULT_PHOENIX_BASE_URL),
    headers: {
      ...(options.apiKey !== undefined ? { Authorization: `Bearer ${options.apiKey}` } : {}),
      ...(options.projectName !== undefined ? { "x-project-name": options.projectName } : {}),
      ...(options.headers ?? {}),
    },
  };
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

async function createRunEventAttributes(
  event: RunEvent,
  options: OtelSanitizerOptions,
): Promise<OtelAttributes> {
  const attributes = sanitizeRunEventAttributes(event, options);
  const envelope = findReceiptEnvelope(event.metadata);
  if (envelope === undefined) {
    return attributes;
  }

  try {
    return {
      ...attributes,
      ...(await createOtelReceiptAttributes(envelope)),
    };
  } catch {
    return attributes;
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

function assignBoolean(
  attributes: OtelAttributes,
  key: string,
  value: boolean | undefined,
): void {
  if (value !== undefined) {
    attributes[key] = value;
  }
}

function assignStringArray(
  attributes: OtelAttributes,
  key: string,
  value: readonly string[] | undefined,
): void {
  if (value !== undefined && value.length > 0) {
    attributes[key] = value;
  }
}

function assignNumberArray(
  attributes: OtelAttributes,
  key: string,
  value: readonly number[] | undefined,
): void {
  if (value !== undefined && value.length > 0) {
    attributes[key] = value;
  }
}

function assignBooleanArray(
  attributes: OtelAttributes,
  key: string,
  value: readonly boolean[] | undefined,
): void {
  if (value !== undefined && value.length > 0) {
    attributes[key] = value;
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asStringArray(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : undefined;
}

function asNumberArray(value: unknown): readonly number[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item))
    ? value
    : undefined;
}

function asBooleanArray(value: unknown): readonly boolean[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "boolean")
    ? value
    : undefined;
}

function assignUsage(attributes: OtelAttributes, metadata: Record<string, unknown>): void {
  const usage = usageFrom(metadata.normalizedUsage)
    ?? usageFrom(metadata.usage)
    ?? usageFrom(metadata);

  if (usage === undefined) {
    return;
  }

  assignNumber(attributes, "gen_ai.usage.input_tokens", usage.inputTokens);
  assignNumber(attributes, "gen_ai.usage.output_tokens", usage.outputTokens);
  assignNumber(attributes, "llm.token_count.prompt", usage.inputTokens);
  assignNumber(attributes, "llm.token_count.completion", usage.outputTokens);
  assignNumber(attributes, "lattice.usage.cost_usd", usage.costUsd);
}

function usageFrom(value: unknown):
  | {
      readonly inputTokens?: number;
      readonly outputTokens?: number;
      readonly costUsd?: number;
    }
  | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const inputTokens = asNumber(value.promptTokens) ?? asNumber(value.inputTokens);
  const outputTokens = asNumber(value.completionTokens) ?? asNumber(value.outputTokens);
  const costUsd = asNumber(value.costUsd);

  if (inputTokens === undefined && outputTokens === undefined && costUsd === undefined) {
    return undefined;
  }

  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(costUsd !== undefined ? { costUsd } : {}),
  };
}

function assignGateway(attributes: OtelAttributes, value: unknown): void {
  if (!isRecord(value)) {
    return;
  }

  assignBoolean(attributes, "lattice.gateway.used", asBoolean(value.used));
  assignString(attributes, "lattice.gateway.provider.id", asString(value.providerId));
  assignString(attributes, "lattice.gateway.selected_provider.id", asString(value.selectedProviderId));
  assignString(attributes, "lattice.gateway.requested_model", asString(value.requestedModel));
  assignString(attributes, "lattice.gateway.observed_model", asString(value.observedModel));
  assignStringArray(attributes, "lattice.gateway.fallback_models", asStringArray(value.fallbackModels));

  const requestedModel = asString(value.requestedModel);
  const observedModel = asString(value.observedModel);
  if (requestedModel !== undefined && attributes["gen_ai.request.model"] === undefined) {
    attributes["gen_ai.request.model"] = requestedModel;
  }
  assignString(attributes, "gen_ai.response.model", observedModel);
}

function captureSafeMetadata(
  attributes: OtelAttributes,
  metadata: Record<string, unknown>,
  options: OtelSanitizerOptions,
): void {
  if (options.contentCapture !== "metadata") {
    return;
  }

  const knownKeys = new Set([
    "callId",
    "estimatedTokens",
    "error",
    "fallback",
    "fallbacks",
    "gateway",
    "included",
    "invariantId",
    "mintError",
    "normalizedUsage",
    "omitted",
    "outputNames",
    "reason",
    "receiptId",
    "rejected",
    "selected",
    "source",
    "status",
    "summarized",
    "toolName",
    "usage",
  ]);

  for (const [key, value] of Object.entries(metadata)) {
    if (knownKeys.has(key) || isUnsafeMetadataKey(key)) {
      continue;
    }
    const attrKey = `lattice.metadata.${safeAttributeKey(key)}`;
    assignString(attributes, attrKey, asString(value));
    assignNumber(attributes, attrKey, asNumber(value));
    assignBoolean(attributes, attrKey, asBoolean(value));
    assignStringArray(attributes, attrKey, asStringArray(value));
    assignNumberArray(attributes, attrKey, asNumberArray(value));
    assignBooleanArray(attributes, attrKey, asBooleanArray(value));
  }
}

function isUnsafeMetadataKey(key: string): boolean {
  return SECRET_KEY_RE.test(key) || CONTENT_KEY_RE.test(key);
}

function safeAttributeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9_.-]+/gu, "_");
}

function findReceiptEnvelope(metadata: Record<string, unknown> | undefined): ReceiptEnvelope | undefined {
  if (metadata === undefined) {
    return undefined;
  }

  const candidates = [metadata.envelope, metadata.receiptEnvelope, metadata.receipt];
  return candidates.find(isReceiptEnvelope);
}

function isReceiptEnvelope(value: unknown): value is ReceiptEnvelope {
  return (
    isRecord(value) &&
    value.payloadType === "application/vnd.lattice.receipt+json" &&
    typeof value.payload === "string" &&
    Array.isArray(value.signatures) &&
    value.signatures.every((signature) =>
      isRecord(signature) &&
      typeof signature.keyid === "string" &&
      typeof signature.sig === "string",
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function langfuseAuthString(options: LangfuseOtlpConfigOptions): string | undefined {
  if (options.authString !== undefined) {
    return options.authString;
  }

  if (options.publicKey === undefined && options.secretKey === undefined) {
    return undefined;
  }

  if (options.publicKey === undefined || options.secretKey === undefined) {
    throw new Error("Langfuse OTLP auth requires both publicKey and secretKey.");
  }

  return base64Utf8(`${options.publicKey}:${options.secretKey}`);
}

function langfuseTraceEndpoint(baseUrl: string): string {
  const base = trimTrailingSlashes(baseUrl);
  if (base.endsWith("/api/public/otel/v1/traces")) {
    return base;
  }
  if (base.endsWith("/api/public/otel")) {
    return `${base}/v1/traces`;
  }
  return `${base}/api/public/otel/v1/traces`;
}

function phoenixTraceEndpoint(baseUrl: string): string {
  const base = trimTrailingSlashes(baseUrl);
  if (base.endsWith("/v1/traces")) {
    return base;
  }
  return `${base}/v1/traces`;
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/u, "");
}

function base64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
