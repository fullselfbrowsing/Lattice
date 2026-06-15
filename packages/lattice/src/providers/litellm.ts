import type { NegotiatedCapabilities } from "../capabilities/negotiate.js";
import { synthesizeNegotiatedCapabilitiesFromRegistry } from "../capabilities/negotiate.js";
import type { GatewayPolicy } from "../policy/policy.js";
import { createOpenAICompatibleProvider, type OpenAICompatibleProviderOptions } from "./adapters.js";
import type { ProviderAdapter } from "./provider.js";
import type { LiteLLMQuirks } from "./quirks.js";

/**
 * Options for {@link createLiteLLMProvider}.
 *
 * Thin wrapper around {@link createOpenAICompatibleProvider} pinned to the
 * documented local LiteLLM proxy URL. LiteLLM is treated as an
 * OpenAI-compatible gateway over HTTP; this helper does not start, embed, or
 * depend on a LiteLLM gateway process.
 */
export interface LiteLLMProviderOptions
  extends Omit<OpenAICompatibleProviderOptions, "id" | "baseUrl" | "gateway"> {
  readonly id?: string;
  /** Defaults to `http://localhost:4000`. Override for hosted proxies or `/v1` deployments. */
  readonly baseUrl?: string;
  readonly gateway?: GatewayPolicy;
}

const DEFAULT_LITELLM_BASE_URL = "http://localhost:4000";

export function createLiteLLMProvider(
  options: LiteLLMProviderOptions,
): ProviderAdapter & {
  readonly quirks: LiteLLMQuirks;
  readonly negotiateCapabilities: (modelId: string) => Promise<NegotiatedCapabilities>;
} {
  const resolvedId = options.id ?? "litellm";
  const resolvedBaseUrl = options.baseUrl ?? DEFAULT_LITELLM_BASE_URL;
  const gateway: GatewayPolicy = {
    allowFallbacks: false,
    ...options.gateway,
  };

  const inner = createOpenAICompatibleProvider({
    ...options,
    id: resolvedId,
    baseUrl: resolvedBaseUrl,
    gateway,
  });

  const negotiate = async (modelId: string): Promise<NegotiatedCapabilities> => {
    return synthesizeNegotiatedCapabilitiesFromRegistry("litellm", modelId, "registry");
  };

  return {
    ...inner,
    quirks: {
      supportsToolChoice: false,
      parallelToolCalls: false,
      structuredOutputs: false,
      responseFormatHonored: false,
      streamingDiverges: true,
      gatewayMetadataSupported: true,
      gatewayFallbacksSupported: true,
      openAIErrorMapping: true,
    } satisfies LiteLLMQuirks,
    negotiateCapabilities: negotiate,
  };
}
