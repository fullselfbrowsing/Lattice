import type {
  CapabilityModality,
  ModelCapability,
  ProviderAdapter,
  ProviderPricingHint,
  ProviderRef,
} from "../providers/provider.js";

export const DEFAULT_CATALOG_VERSION = "lattice:catalog:v1";

export interface CapabilityCatalog {
  readonly version: string;
  readonly models: readonly ModelCapability[];
}

export function createCapabilityCatalog(
  providers: readonly (ProviderRef | ProviderAdapter)[],
): CapabilityCatalog {
  return {
    version: DEFAULT_CATALOG_VERSION,
    models: providers.flatMap((provider) => {
      if (provider.kind === "provider-adapter" && provider.capabilities !== undefined) {
        return provider.capabilities;
      }

      return [defaultCapabilityForProvider(provider.id)];
    }),
  };
}

export function defaultCapabilityForProvider(providerId: string): ModelCapability {
  return {
    providerId,
    modelId: `${providerId}:default`,
    inputModalities: ["text", "json", "image", "audio", "document", "file", "url", "tool"],
    outputModalities: ["text", "json"],
    fileTransport: ["inline", "json", "url", "base64", "extracted-text", "transcript"],
    contextWindow: 16_000,
    structuredOutput: true,
    toolUse: false,
    streaming: false,
    pricing: {
      inputCostPer1M: 0,
      outputCostPer1M: 0,
      inputPer1kTokens: 0,
      outputPer1kTokens: 0,
    },
    latency: "interactive",
    dataPolicy: {
      privacy: ["standard", "sensitive"],
      uploadRetention: "none",
      supportsNoLogging: true,
      supportsNoTraining: true,
    },
    available: true,
  };
}

/**
 * Resolve the effective per-1k token pricing for a capability.
 *
 * Prefers the explicit `inputPer1kTokens` / `outputPer1kTokens` fields and
 * falls back to dividing the legacy per-1M fields by 1000 when only those
 * are present. Returns `undefined` per side when neither shape supplies a
 * value, so callers can distinguish "free / zero" (`0`) from "unknown"
 * (`undefined`) — Phase 7 cost normalization treats unknown pricing as
 * `usage.costUsd === null`, not `0`.
 */
export function effectivePer1kPricing(
  pricing: ProviderPricingHint | undefined,
): {
  readonly inputPer1kTokens: number | undefined;
  readonly outputPer1kTokens: number | undefined;
} {
  if (pricing === undefined) {
    return { inputPer1kTokens: undefined, outputPer1kTokens: undefined };
  }

  const inputPer1k =
    pricing.inputPer1kTokens ??
    (pricing.inputCostPer1M !== undefined ? pricing.inputCostPer1M / 1000 : undefined);
  const outputPer1k =
    pricing.outputPer1kTokens ??
    (pricing.outputCostPer1M !== undefined ? pricing.outputCostPer1M / 1000 : undefined);

  return {
    inputPer1kTokens: inputPer1k,
    outputPer1kTokens: outputPer1k,
  };
}

export function modalRank(modality: CapabilityModality): number {
  const ranks: Record<CapabilityModality, number> = {
    text: 0,
    json: 1,
    image: 2,
    audio: 3,
    document: 4,
    file: 5,
    url: 6,
    video: 7,
    tool: 8,
  };

  return ranks[modality];
}
