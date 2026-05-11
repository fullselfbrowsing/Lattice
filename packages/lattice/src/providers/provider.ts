import type { ArtifactInput, ArtifactRef } from "../artifacts/artifact.js";
import type { ContextPack } from "../context/context-pack.js";
import type { OutputContractMap } from "../outputs/contracts.js";
import type { ExecutionPlan, ProviderPackagingPlan, UsageRecord } from "../plan/plan.js";

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
}

export interface ProviderRunResponse {
  readonly rawOutputs: Record<string, unknown>;
  readonly artifactRefs?: readonly (ArtifactInput | ArtifactRef)[];
  readonly usage?: UsageRecord;
  readonly rawResponse?: unknown;
}

export interface ProviderAdapter {
  readonly id: string;
  readonly kind: "provider-adapter";
  readonly capabilities?: readonly ModelCapability[];
  readonly execute?: (request: ProviderRunRequest) => Promise<ProviderRunResponse>;
}

export type ProviderRegistryInput = readonly (ProviderRef | ProviderAdapter | string)[];
