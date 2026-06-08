// Phase 34 — D-02 / D-04 / D-09 / D-10 / D-12 — Capability negotiation
// surface. NEG-01 / NEG-02 surface.
//
// Pitfall 5 mitigation: the top-level `negotiateCapabilities` helper has ZERO
// live-path logic. It purely delegates to `adapter.negotiateCapabilities` when
// present. All /models fetch logic, retry policy, and TTL caching live in the
// per-adapter implementations (Plans 02-05). This avoids the double-logic trap
// where the helper and the adapter independently implement the same behavior
// and drift over time.

import type { CapabilityAdapter, KnownFailureMode, ModelCapabilityProfile } from "./profile.js";
import type { SanitizerKey } from "./sanitizer-recommendations.js";
import { getCapabilityProfile } from "./lookup.js";
import { getRecommendedSanitizers } from "./sanitizer-recommendations.js";
import type { ProviderAdapter } from "../providers/provider.js";

/**
 * Phase 34 — SC-3 — Consumer-facing capability shape returned by
 * `adapter.negotiateCapabilities()` and the top-level `negotiateCapabilities()`
 * helper. Simplified relative to `ModelCapabilityProfile` (the registry
 * profile); consumers needing the full enum (e.g., native_strict vs
 * native_lenient) should look up the profile directly via `getCapabilityProfile`.
 *
 * Source values (D-09):
 *   - "live"               — /models endpoint hit, registry profile intersected
 *   - "registry-fallback"  — /models hit failed transiently (5xx/network/timeout),
 *                            fell back to Phase 33 static registry (D-09)
 *   - "registry"           — adapter intentionally has no /models endpoint
 *                            (LM Studio, openai-compat), OR consumer-adapter
 *                            fallback path (D-04)
 */
export interface NegotiatedCapabilities {
  readonly modelId: string;
  readonly contextWindow: number;
  readonly supports: {
    readonly nativeToolCalling: boolean;
    readonly structuredOutputs: boolean;
    readonly parallelToolCalls: boolean;
    readonly extendedThinking: boolean;
    readonly streaming: boolean;
  };
  readonly knownFailureModes: readonly KnownFailureMode[];
  readonly recommendedSanitizers: readonly SanitizerKey[];
  readonly source: "live" | "registry-fallback" | "registry";
}

/**
 * D-10 — Typed error thrown by `negotiateCapabilities` when the adapter's
 * /models endpoint returns 401 or 403. Mirrors `AgentDeniedError` shape
 * (the only existing v1.2 `class extends Error` precedent in agent/types.ts).
 *
 * Why throw (vs return-as-error-union):
 *   - Auth errors indicate a broken apiKey config — it is the caller's bug
 *   - Silently falling back would hide the misconfiguration
 *   - `try/catch` ergonomics work cleanly with `class extends Error`
 *   - `instanceof NegotiationAuthError` is the consumer ergonomic
 *
 * IMPORTANT: `NegotiationAuthError` is throwable from `negotiateCapabilities`
 * ONLY — never from `execute()`. Auth errors from /models do NOT contaminate
 * the request path.
 *
 * T-34-01-02: message field set by adapter implementations in Plans 02-04
 * MUST NOT include the apiKey. Only adapter, modelId, and httpStatus are carried.
 */
export class NegotiationAuthError extends Error {
  readonly kind = "negotiation-auth-failed" as const;
  readonly adapter: CapabilityAdapter;
  readonly modelId: string;
  readonly httpStatus: 401 | 403;

  constructor(
    adapter: CapabilityAdapter,
    modelId: string,
    httpStatus: 401 | 403,
    message: string,
  ) {
    super(message);
    this.name = "NegotiationAuthError";
    this.adapter = adapter;
    this.modelId = modelId;
    this.httpStatus = httpStatus;
  }
}

/**
 * Phase 34 — D-02 / D-04 — Top-level helper for capability negotiation.
 *
 * Pitfall 5 (zero live-path logic): delegates verbatim to
 * `adapter.negotiateCapabilities(modelId)` when the adapter implements it.
 * No inflight-coalescing, no cache, no source value transformation. The
 * adapter owns all of that.
 *
 * When the adapter has NO `negotiateCapabilities` (consumer-provided v1.2
 * adapters, third-party adapters), falls back to the Phase 33 registry
 * via `synthesizeNegotiatedCapabilitiesFromRegistry` with source "registry"
 * (D-04). Consumer adapters get useful behavior out of the box without any
 * migration code.
 *
 * Verifiable per Pitfall 5: grep for `new Map<` in this function body should
 * return zero matches; LOC count of the function body is < 10 lines.
 */
export async function negotiateCapabilities(
  adapter: ProviderAdapter,
  modelId: string,
): Promise<NegotiatedCapabilities> {
  if (adapter.negotiateCapabilities !== undefined) {
    return adapter.negotiateCapabilities(modelId);
  }
  return synthesizeNegotiatedCapabilitiesFromRegistry(
    adapter.id as CapabilityAdapter,
    modelId,
    "registry",
  );
}

/**
 * Phase 34 — D-04 / D-09 — Synthesizes a `NegotiatedCapabilities` shape from
 * the Phase 33 static registry. Used by:
 *   1. The top-level helper (above) for consumer-adapter fallback (D-04).
 *   2. Per-adapter negotiate() implementations (Plans 02-05) when /models
 *      fails transiently (D-09, source "registry-fallback").
 *
 * Exported as a named export so Plans 02-05 can reuse the fallback synthesis
 * without duplicating the mapping logic.
 *
 * Implementation note: the boolean derivations are intentionally minimal
 * (heuristic, not definitive). The per-adapter negotiate() implementations
 * in Plans 02-05 own the richer derivation from live /models data.
 * This helper is a SAFETY NET for adapters without /models endpoints and
 * for transient-fallback cases.
 *
 * Anti-shape (documented in CONTEXT.md <specifics>): boolean `nativeToolCalling`
 * loses the strict-vs-lenient distinction in `toolCallSurface`. Consumers
 * needing the enum should look up the profile directly via `getCapabilityProfile`.
 */
export function synthesizeNegotiatedCapabilitiesFromRegistry(
  adapter: CapabilityAdapter,
  modelId: string,
  source: "registry" | "registry-fallback",
): NegotiatedCapabilities {
  const canonicalKey = `${adapter}:${modelId}`;
  const profile = getCapabilityProfile(canonicalKey);

  if (profile === undefined) {
    // Not-found stub per Test 3 in capabilities-negotiate-helper.test.ts:
    // Return a graceful-degradation empty shape rather than throwing.
    // Documented here so the behavior is traceable: Plans 02-05 may log
    // the capabilities.negotiation.fallback event in this case.
    //
    // IN-03: keep `streaming` consistent with mapProfileToNegotiatedCapabilities
    // (line 198 below) -- LM Studio defaults to streaming: false even when no
    // profile exists, so consumers querying an unknown lm-studio model get the
    // same conservative default as a known one.
    return {
      modelId,
      contextWindow: 0,
      supports: {
        nativeToolCalling: false,
        structuredOutputs: false,
        parallelToolCalls: false,
        extendedThinking: false,
        streaming: adapter !== "lm-studio",
      },
      knownFailureModes: [],
      recommendedSanitizers: [],
      source,
    };
  }

  return mapProfileToNegotiatedCapabilities(profile, source);
}

/**
 * Internal helper: maps a `ModelCapabilityProfile` to `NegotiatedCapabilities`.
 * This mapping is intentionally a SIMPLIFIED view. The boolean `nativeToolCalling`
 * loses the strict-vs-lenient distinction in `toolCallSurface`; consumers needing
 * the enum should call `getCapabilityProfile` directly.
 */
function mapProfileToNegotiatedCapabilities(
  profile: ModelCapabilityProfile,
  source: "live" | "registry" | "registry-fallback",
): NegotiatedCapabilities {
  // nativeToolCalling: true if toolCallSurface starts with "native_" (native_strict or native_lenient)
  const nativeToolCalling =
    profile.toolCallSurface === "native_strict" ||
    profile.toolCallSurface === "native_lenient";

  // extendedThinking: true if reasoningSurface is NOT "none" and NOT "hidden_cot"
  // (i.e., the model exposes a visible reasoning trace — inlined_tags, interleaved, streamed)
  const extendedThinking =
    profile.reasoningSurface !== "none" &&
    profile.reasoningSurface !== "hidden_cot";

  // structuredOutputs: heuristic — frontier_rlhf models generally support structured outputs;
  // Plans 02-04 override this with live /models data for the richer derivation.
  const structuredOutputs = profile.trainingClass === "frontier_rlhf";

  // parallelToolCalls: heuristic — native_strict and native_lenient models can in principle
  // do parallel tool calls; Plans 02-04 set this more precisely from live data.
  const parallelToolCalls = nativeToolCalling;

  // streaming: default true for all adapters except LM Studio (local server may not stream)
  const streaming = profile.adapter !== "lm-studio";

  return {
    modelId: profile.id,
    contextWindow: profile.contextWindow,
    supports: {
      nativeToolCalling,
      structuredOutputs,
      parallelToolCalls,
      extendedThinking,
      streaming,
    },
    knownFailureModes: profile.knownFailureModes,
    recommendedSanitizers: getRecommendedSanitizers(profile.knownFailureModes),
    source,
  };
}

/**
 * Re-export for Plans 02-05 that need to intersect a live /models response
 * with the static registry profile. The "live" source is used when /models
 * succeeded; Plans 02-05 call this with the appropriate source value.
 */
export { mapProfileToNegotiatedCapabilities as _mapProfileToNegotiatedCapabilities };
