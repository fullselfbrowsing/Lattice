import type { ProviderAdapter } from "./provider.js";
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

export function createLmStudioProvider(options: LmStudioProviderOptions): ProviderAdapter {
  return createOpenAICompatibleProvider({
    ...options,
    id: options.id ?? "lm-studio",
    baseUrl: options.baseUrl ?? DEFAULT_LM_STUDIO_BASE_URL,
  });
}
