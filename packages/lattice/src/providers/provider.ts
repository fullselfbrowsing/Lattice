import type { ArtifactInput, ArtifactRef } from "../artifacts/artifact.js";
import type { ContextPack } from "../context/context-pack.js";
import type { OutputContractMap } from "../outputs/contracts.js";
import type { ExecutionPlan, ProviderPackagingPlan, UsageRecord } from "../plan/plan.js";
import type { ValidatedToolCall } from "../tools/tool-call-validation.js";
// Phase 34 — D-01 / D-02 optional fields on ProviderAdapter (non-breaking for
// v1.2 consumer adapters; existing 4-field literals still satisfy the interface)
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
  /** Per-1000-prompt-token cost in USD. Preferred field for Phase 7+ pricing. */
  readonly inputPer1kTokens?: number;
  /** Per-1000-completion-token cost in USD. Preferred field for Phase 7+ pricing. */
  readonly outputPer1kTokens?: number;
}

/**
 * Normalized per-run usage at the result layer.
 *
 * `costUsd` is `number | null` (not optional, not `0`) so downstream
 * consumers can distinguish "free" (`0`) from "unmeasured" (`null`) when
 * provider pricing is unknown — see 07-CONTEXT.md "Cost Normalization & Usage".
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
   * Phase 39 — opt-in prompt-cache prefix (DELEG-04). Adapters that support
   * block-granular caching (Anthropic) hoist this to a `cache_control`-marked
   * system content block; adapters that ignore it MUST receive the prefix
   * folded into `task` by the caller instead (the crew dispatcher gates on
   * `quirks.promptCachingSupported`). The field is advisory, additive, and
   * absent for all existing callers — follows the Phase 37 `toolCalls`
   * additive-field precedent (request/response additive fields accepted;
   * `ProviderAdapter` METHODS frozen per INV-03).
   */
  readonly cacheSystemPrefix?: string;
}

export interface ProviderGatewayMetadata {
  readonly used: boolean;
  readonly requestedModel?: string;
  readonly observedModel?: string;
  readonly fallbackModels?: readonly string[];
  readonly policy?: Record<string, unknown>;
}

export interface ProviderRunResponse {
  readonly rawOutputs: Record<string, unknown>;
  readonly artifactRefs?: readonly (ArtifactInput | ArtifactRef)[];
  /**
   * @deprecated Legacy per-attempt usage shape. Phase 7+ adapters should
   * populate `normalizedUsage` instead — Plan 04 will prefer `normalizedUsage`
   * when wiring `RunResult.usage`. Kept here for backward compatibility with
   * v1.0 adapters that already report this field.
   */
  readonly usage?: UsageRecord;
  /**
   * Phase 7 normalized usage shape for `RunResult.usage`. Populated by all
   * Phase 7+ adapters (openai, openai-compat, ai-sdk, fake). `costUsd` is
   * `null` when pricing is unknown (per the cost-normalization decision in
   * 07-CONTEXT.md — distinguishes "free" from "unmeasured").
   */
  readonly normalizedUsage?: Usage;
  readonly toolCalls?: readonly ValidatedToolCall[];
  readonly gateway?: ProviderGatewayMetadata;
  readonly rawResponse?: unknown;
}

export interface ProviderAdapter {
  readonly id: string;
  readonly kind: "provider-adapter";
  readonly capabilities?: readonly ModelCapability[];
  readonly execute?: (request: ProviderRunRequest) => Promise<ProviderRunResponse>;
  /**
   * Phase 34 — D-01 — Per-adapter behavioral deviation flags. OPTIONAL on the
   * base interface so v1.2 consumer adapters (4-field literals) continue to work
   * without modification (non-breaking). First-party adapter factories narrow the
   * return type to require `quirks` with the specific sub-interface for their adapter.
   *
   * D-03 discriminant-narrowing contract: consumers reading this field get
   * `AdapterQuirks` autocomplete. To access adapter-specific flags, cast after
   * an `adapter.id` discriminant check OR use the typed factory return directly.
   * Example: `(adapter.quirks as AnthropicQuirks).promptCachingSupported`.
   */
  readonly quirks?: AdapterQuirks;
  /**
   * Phase 34 — D-02 — Capability negotiation via the provider's /models endpoint.
   * OPTIONAL on the base interface (non-breaking for v1.2 consumer adapters).
   * First-party adapters that have a /models endpoint implement this; adapters
   * without one (LM Studio, openai-compat) fall back to the Phase 33 registry.
   *
   * The top-level `negotiateCapabilities(adapter, modelId)` helper in
   * `capabilities/negotiate.ts` delegates to this method when present and
   * synthesizes from the registry otherwise (D-04).
   */
  readonly negotiateCapabilities?: (modelId: string) => Promise<NegotiatedCapabilities>;
}

export type ProviderRegistryInput = readonly (ProviderRef | ProviderAdapter | string)[];
