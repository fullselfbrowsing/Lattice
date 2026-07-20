import type { ArtifactInput, ArtifactRef } from "../artifacts/artifact.js";
import type { ContextPack } from "../context/context-pack.js";
import type { OutputContractMap } from "../outputs/contracts.js";
import type { ExecutionPlan, ProviderPackagingPlan, UsageRecord } from "../plan/plan.js";
import type { ValidatedToolCall } from "../tools/tool-call-validation.js";
import type { ToolDefinition } from "../tools/tools.js";
import type { StandardSchemaV1 } from "@standard-schema/spec";
// Optional ProviderAdapter fields remain non-breaking for
// v1.2 consumer adapters; existing 4-field literals still satisfy the interface.
import type { AdapterQuirks } from "./quirks.js";
import type { NegotiatedCapabilities } from "../capabilities/negotiate.js";

export type CapabilityModality =
  | "text"
  | "json"
  | "image"
  | "audio"
  | "video"
  | "document"
  | "file"
  | "url"
  | "tool";

export type ProviderTransportMode =
  | "inline"
  | "json"
  | "url"
  | "base64"
  | "provider-upload"
  | "file-id"
  | "extracted-text"
  | "transcript";

export type ProviderLatencyClass = "interactive" | "batch";

export interface ProviderPricingHint {
  /** @deprecated prefer `inputPer1kTokens` — kept for backward compatibility */
  readonly inputCostPer1M?: number;
  /** @deprecated prefer `outputPer1kTokens` — kept for backward compatibility */
  readonly outputCostPer1M?: number;
  /** Per-1000-prompt-token cost in USD. Preferred pricing field. */
  readonly inputPer1kTokens?: number;
  /** Per-1000-completion-token cost in USD. Preferred pricing field. */
  readonly outputPer1kTokens?: number;
}

/**
 * Normalized per-run usage at the result layer.
 *
 * `costUsd` is `number | null` (not optional, not `0`) so downstream
 * consumers can distinguish "free" (`0`) from "unmeasured" (`null`) when
 * provider pricing is unknown.
 *
 * Distinct from `UsageRecord` on `ProviderAttemptRecord`: `UsageRecord`
 * is the per-attempt record, `Usage` is the per-run normalized shape
 * surfaced on `RunSuccess` / `RunFailure`.
 */
export interface Usage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly costUsd: number | null;
}

export interface ProviderDataPolicyHints {
  readonly privacy: readonly ("standard" | "sensitive" | "restricted")[];
  readonly uploadRetention?: "none" | "ephemeral" | "provider-default";
  readonly supportsNoLogging?: boolean;
  readonly supportsNoTraining?: boolean;
}

export interface ModelCapability {
  readonly providerId: string;
  readonly modelId: string;
  readonly inputModalities: readonly CapabilityModality[];
  readonly outputModalities: readonly CapabilityModality[];
  readonly fileTransport: readonly ProviderTransportMode[];
  readonly contextWindow: number;
  readonly structuredOutput: boolean;
  readonly toolUse: boolean;
  readonly streaming: boolean;
  readonly pricing?: ProviderPricingHint;
  readonly latency: ProviderLatencyClass;
  readonly dataPolicy: ProviderDataPolicyHints;
  readonly available?: boolean;
}

export interface ProviderRef {
  readonly id: string;
  readonly kind?: "provider-ref";
}

export type ProviderToolDefinition = Pick<
  ToolDefinition<StandardSchemaV1>,
  "name" | "description" | "inputSchema"
>;

export type ProviderToolChoice =
  | "auto"
  | "none"
  | "required"
  | {
      readonly type: "tool";
      readonly name: string;
    };

export interface ProviderStructuredOutputRequest {
  readonly output: string;
  readonly schema: StandardSchemaV1;
  readonly name?: string;
  readonly strict?: boolean;
}

export interface ProviderRunRequest {
  readonly task: string;
  readonly artifacts: readonly ArtifactInput[];
  readonly outputs: readonly string[];
  readonly outputContracts?: OutputContractMap;
  readonly policy?: unknown;
  readonly signal?: AbortSignal;
  readonly plan?: ExecutionPlan;
  readonly contextPack?: ContextPack;
  readonly providerPackaging?: ProviderPackagingPlan;
  readonly packagedArtifacts?: readonly ArtifactRef[];
  /**
   * Opt-in prompt-cache prefix. Adapters that support
   * block-granular caching (Anthropic) hoist this to a `cache_control`-marked
   * system content block; adapters that ignore it MUST receive the prefix
   * folded into `task` by the caller instead (the crew dispatcher gates on
   * `quirks.promptCachingSupported`). The field is advisory, additive, and
   * absent for existing callers. Request and response fields may grow
   * additively while `ProviderAdapter` methods remain stable.
   */
  readonly cacheSystemPrefix?: string;
  /**
   * Provider-only native tool declarations. This is an explicit
   * opt-in so existing `ai.run()` and agent prompt-reencoded behavior does not
   * change merely because output contracts or tools exist elsewhere.
   */
  readonly nativeTools?: readonly ProviderToolDefinition[];
  readonly nativeToolChoice?: ProviderToolChoice;
  readonly nativeStructuredOutput?: ProviderStructuredOutputRequest;
}

export interface ProviderGatewayMetadata {
  readonly used: boolean;
  readonly requestedModel?: string;
  readonly observedModel?: string;
  readonly fallbackModels?: readonly string[];
  readonly policy?: Record<string, unknown>;
}

export interface ProviderFinishMetadata {
  readonly reason?: string;
  readonly toolCallIds?: readonly string[];
  readonly metadata?: Record<string, unknown>;
}

export interface ProviderRunResponse {
  readonly rawOutputs: Record<string, unknown>;
  readonly artifactRefs?: readonly (ArtifactInput | ArtifactRef)[];
  /**
   * @deprecated Legacy per-attempt usage shape. Adapters should populate
   * `normalizedUsage` instead; consumers prefer `normalizedUsage`
   * when wiring `RunResult.usage`. Kept here for backward compatibility with
   * v1.0 adapters that already report this field.
   */
  readonly usage?: UsageRecord;
  /**
   * Normalized usage shape for `RunResult.usage`. Populated by first-party
   * adapters. `costUsd` is `null` when pricing is unknown, distinguishing
   * "free" from "unmeasured".
   */
  readonly normalizedUsage?: Usage;
  readonly toolCalls?: readonly ValidatedToolCall[];
  readonly gateway?: ProviderGatewayMetadata;
  readonly finish?: ProviderFinishMetadata;
  readonly rawResponse?: unknown;
}

export interface ProviderStreamTextDeltaChunk {
  readonly kind: "text-delta";
  readonly output?: string;
  readonly text: string;
}

export interface ProviderStreamOutputChunk {
  readonly kind: "output";
  readonly output: string;
  readonly value: unknown;
}

export interface ProviderStreamUsageChunk {
  readonly kind: "usage";
  readonly usage?: UsageRecord;
  readonly normalizedUsage?: Usage;
}

export interface ProviderStreamGatewayChunk {
  readonly kind: "gateway";
  readonly gateway: ProviderGatewayMetadata;
}

export interface ProviderStreamToolCallChunk {
  readonly kind: "tool-call";
  readonly toolCall: ValidatedToolCall;
}

export interface ProviderStreamCompleteChunk {
  readonly kind: "complete";
  readonly rawOutputs?: Record<string, unknown>;
  readonly artifactRefs?: readonly (ArtifactInput | ArtifactRef)[];
  readonly usage?: UsageRecord;
  readonly normalizedUsage?: Usage;
  readonly gateway?: ProviderGatewayMetadata;
  readonly toolCalls?: readonly ValidatedToolCall[];
  readonly finish?: ProviderFinishMetadata;
  readonly rawResponse?: unknown;
}

export type ProviderStreamChunk =
  | ProviderStreamTextDeltaChunk
  | ProviderStreamOutputChunk
  | ProviderStreamUsageChunk
  | ProviderStreamGatewayChunk
  | ProviderStreamToolCallChunk
  | ProviderStreamCompleteChunk;

export type ProviderStream = AsyncIterable<ProviderStreamChunk>;

export interface ProviderAdapter {
  readonly id: string;
  readonly kind: "provider-adapter";
  readonly capabilities?: readonly ModelCapability[];
  readonly execute?: (request: ProviderRunRequest) => Promise<ProviderRunResponse>;
  readonly executeStream?: (
    request: ProviderRunRequest,
  ) => ProviderStream | Promise<ProviderStream>;
  /**
   * Per-adapter behavioral deviation flags. OPTIONAL on the
   * base interface so v1.2 consumer adapters (4-field literals) continue to work
   * without modification (non-breaking). First-party adapter factories narrow the
   * return type to require `quirks` with the specific sub-interface for their adapter.
   *
   * Consumers reading this field get
   * `AdapterQuirks` autocomplete. To access adapter-specific flags, cast after
   * an `adapter.id` discriminant check OR use the typed factory return directly.
   * Example: `(adapter.quirks as AnthropicQuirks).promptCachingSupported`.
   */
  readonly quirks?: AdapterQuirks;
  /**
   * Capability negotiation via the provider's /models endpoint.
   * OPTIONAL on the base interface (non-breaking for v1.2 consumer adapters).
   * First-party adapters that have a /models endpoint implement this; adapters
   * without one (LM Studio, openai-compat) fall back to the static registry.
   *
   * The top-level `negotiateCapabilities(adapter, modelId)` helper in
   * `capabilities/negotiate.ts` delegates to this method when present and
   * synthesizes from the registry otherwise.
   */
  readonly negotiateCapabilities?: (modelId: string) => Promise<NegotiatedCapabilities>;
}

export type ProviderRegistryInput = readonly (ProviderRef | ProviderAdapter | string)[];
