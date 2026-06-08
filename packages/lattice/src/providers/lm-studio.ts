import type { ProviderAdapter } from "./provider.js";
import type { LmStudioQuirks } from "./quirks.js";
import type { NegotiatedCapabilities } from "../capabilities/negotiate.js";
import { synthesizeNegotiatedCapabilitiesFromRegistry } from "../capabilities/negotiate.js";
import { createOpenAICompatibleProvider, type OpenAICompatibleProviderOptions } from "./adapters.js";

/**
 * Options for {@link createLmStudioProvider}.
 *
 * Thin wrapper around {@link createOpenAICompatibleProvider} pinned to
 * LM Studio's default local server URL `http://localhost:1234/v1`. Wire
 * shape is OpenAI Chat Completions. LM Studio is no-auth by convention
 * (CD-03): `apiKey` is OPTIONAL; when omitted, the underlying factory
 * sends no `Authorization` header (see
 * `lattice/packages/lattice/src/providers/adapters.ts:53` for the
 * conditional auth-header wiring).
 *
 * Phase 34 additions:
 *   - `modelsCacheTtlMs` -- Reserved for future /models discovery; LM Studio
 *     currently has no remote /models endpoint. Accepted for option-bag
 *     uniformity but NOT USED (D-04 intentional no-endpoint pattern).
 *   - `runEventSink` -- Accepted for option-bag uniformity but NEVER fired
 *     because source: "registry" is the documented happy path for LM Studio
 *     (no event for intentional no-endpoint per RESEARCH Open Question 5).
 *
 * DEFERRED (D-16 carryforward):
 *   - latency-tail diagnostics  -- observability concern; LM Studio is
 *                                  the canary for latency tails (INV-03);
 *                                  diagnostics module deferred to a
 *                                  follow-on observability phase.
 *   - streaming                 -- deferred (single-shot per D-06).
 *   - resume-from-eviction      -- see Phase 5 (MV3-survivability adapter).
 *
 * Ref: FSB v0.10.0-attempt-2 Phase 4 (D-03: thin wrapper; D-16: latency-tail deferred; CD-03 no-opt-out).
 */
export interface LmStudioProviderOptions
  extends Omit<OpenAICompatibleProviderOptions, "id" | "baseUrl" | "apiKey"> {
  readonly id?: string;
  /** Defaults to `http://localhost:1234/v1`. Override for non-localhost deployments. */
  readonly baseUrl?: string;
  /**
   * Optional. LM Studio is no-auth by convention (CD-03 default).
   * When provided, sent as `Authorization: Bearer <apiKey>` (matches the
   * underlying OpenAI-compat factory). Use only for proxied LM Studio
   * deployments that have a token gate in front.
   */
  readonly apiKey?: string;
}

const DEFAULT_LM_STUDIO_BASE_URL = "http://localhost:1234/v1";

/**
 * Phase 34 — D-04 / QUIRK-02 — LM Studio provider factory.
 *
 * LM Studio is the prototypical "intentional no remote /models endpoint"
 * adapter per D-04 (alongside OpenAI-compat). The factory returns conservative
 * defaults for the quirks block because LM Studio runs LOCAL quantized models
 * whose capabilities vary wildly by chat template + model file.
 *
 * The `negotiateCapabilities` method performs NO fetch; it returns
 * `synthesizeNegotiatedCapabilitiesFromRegistry` with source: "registry"
 * (the intentional-no-endpoint signal, distinct from "registry-fallback"
 * which signals a transient failure). Mirrors Plan 34-03 Task 2 (OpenAI-compat
 * registry-only pattern) verbatim.
 *
 * D-04 citation: "consumer adapters without a /models endpoint skip the
 * fetch layer entirely and delegate to synthesizeNegotiatedCapabilitiesFromRegistry."
 *
 * Open Question 5 (RESEARCH §): no event emitted for source: "registry" because
 * this is the intentional happy path for LM Studio -- emitting a "fallback" event
 * would produce false-positive noise for consumers monitoring the event stream.
 */
export function createLmStudioProvider(
  options: LmStudioProviderOptions,
): ProviderAdapter & {
  readonly quirks: LmStudioQuirks;
  readonly negotiateCapabilities: (modelId: string) => Promise<NegotiatedCapabilities>;
} {
  const resolvedId = options.id ?? "lm-studio";
  const resolvedBaseUrl = options.baseUrl ?? DEFAULT_LM_STUDIO_BASE_URL;

  // Phase 34 — D-04 — LM Studio negotiate() is registry-only.
  // No fetch, no cache, no inflight coalescing, no event emission.
  // Source: "registry" signals intentional no-endpoint (per D-04).
  // Open Question 5: no event emitted for source: "registry" (intentional no-endpoint).
  const negotiate = async (modelId: string): Promise<NegotiatedCapabilities> => {
    return synthesizeNegotiatedCapabilitiesFromRegistry("lm-studio", modelId, "registry");
  };

  // Delegate execute() and capabilities to the OpenAI-compat factory.
  const inner = createOpenAICompatibleProvider({
    ...options,
    id: resolvedId,
    baseUrl: resolvedBaseUrl,
  });

  return {
    ...inner,
    // Phase 34 — QUIRK-02 / LmStudioQuirks — conservative defaults.
    // LM Studio runs LOCAL quantized models whose capabilities vary wildly
    // by chat template + model file. Conservative false values for all 5
    // universal booleans. streamingDiverges: true because some LM Studio
    // chat templates produce different output streaming vs buffered.
    //
    // CITED: lmstudio-bug-tracker issue 1342 -- Jinja template mismatches
    //   between model training and LM Studio server defaults cause output
    //   format corruption -> customChatTemplateRiskFlag: true
    // VERIFIED: lm-studio.ts apiKey is optional (CD-03) ->
    //   noAuthRequired: true (no auth needed for local localhost:1234 server)
    quirks: {
      supportsToolChoice: false,
      parallelToolCalls: false,
      structuredOutputs: false,
      responseFormatHonored: false,
      streamingDiverges: true,
      customChatTemplateRiskFlag: true,
      noAuthRequired: true,
    } satisfies LmStudioQuirks,
    negotiateCapabilities: negotiate,
  };
}
