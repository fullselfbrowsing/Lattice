# Phase 34: Adapter Quirk Flags + Capability Negotiation API - Research

**Researched:** 2026-06-08
**Domain:** Adapter-level capability disclosure + runtime /models discovery + registry intersection
**Confidence:** HIGH for Anthropic, OpenAI, Gemini, OpenRouter shapes (live-verified); MEDIUM for xAI /v1/models shape (endpoint exists, undocumented); HIGH for internal codebase patterns (verified by Read)

## Summary

Phase 34 wires two surfaces onto each of the 7 first-party provider adapters: (a) a typed `quirks` field documenting known behavioral deviations from OpenAI-canonical shape, and (b) a runtime `negotiateCapabilities(modelId)` method that queries the provider's `/models` endpoint where available and intersects the result with Phase 33's static registry. Both are OPTIONAL on `ProviderAdapter` per D-01/D-02 (non-breaking) and required-by-narrowed-return on the 7 first-party factories. CONTEXT.md locks 16 decisions across 4 areas; the planner's remaining freedom is the per-adapter quirk vocabulary, the `NegotiationAuthError` shape, inflight-coalescing, and test-fixture layout.

The major external finding: **Anthropic's `/v1/models` endpoint (live-verified 2026-06-08) exposes a rich, typed `capabilities` block** — `batch`, `citations`, `code_execution`, `context_management`, `effort` (with `high/medium/low/max/xhigh`), `image_input`, `pdf_input`, `structured_outputs`, and `thinking` (with `adaptive`/`enabled` types). This is dramatically more than what training data suggested. It means Anthropic negotiation can populate `nativeToolCalling`, `structuredOutputs`, `parallelToolCalls`, `extendedThinking`, and even `extendedThinking` types directly from upstream truth — no static-registry fallback needed for capability booleans. **The planner should make Anthropic's negotiator the "thick" reference implementation; the others will inevitably be thinner.** OpenAI's `/v1/models` is famously sparse (id/object/created/owned_by only). Gemini exposes `supportedGenerationMethods` and token limits but no per-method strict-mode flags. xAI `/v1/models` exists (HTTP 401 unauth on live probe) but is undocumented — treat its shape as OpenAI-compatible (id/object/created/owned_by) and fall back to the registry for the capability booleans. OpenRouter is already understood from Phase 33.

**Primary recommendation:** Author the 5-boolean `AdapterQuirks` base interface plus 7 per-adapter narrowed types in `packages/lattice/src/providers/quirks.ts`; ship `negotiateCapabilities` per-adapter as a thin closure-cached fetcher; route everything through a single `packages/lattice/src/capabilities/negotiate.ts` helper that owns the registry intersection + `recommendedSanitizers` derivation; emit `capabilities.negotiation.fallback` via the existing `RunEventKind` union in `tracing.ts`; ship `NegotiationAuthError` as a `class extends Error` (matches the lone existing precedent `AgentDeniedError` in `agent/types.ts`).

## User Constraints (from CONTEXT.md)

### Locked Decisions

**quirks + negotiateCapabilities placement**
- **D-01 (quirks location):** `quirks?: AdapterQuirks` is OPTIONAL on the public `ProviderAdapter` interface in `packages/lattice/src/providers/provider.ts`. The 7 first-party adapter factories narrow the return type to require `quirks`. Consumer-provided v1.2 adapters continue to work without modification — intentionally non-breaking.
- **D-02 (negotiateCapabilities location):** `negotiateCapabilities?(modelId: string): Promise<NegotiatedCapabilities>` is OPTIONAL on `ProviderAdapter`. The 7 first-party adapters implement it. A top-level helper function `negotiateCapabilities(adapter: ProviderAdapter, modelId: string): Promise<NegotiatedCapabilities>` orchestrates: if `adapter.negotiateCapabilities` exists, delegate; otherwise synthesize from Phase 33 registry.
- **D-03 (quirks shape):** Per-adapter typed sub-interface. `AdapterQuirks` is the base with the 5 SC-1 universal booleans (`supportsToolChoice`, `parallelToolCalls`, `structuredOutputs`, `responseFormatHonored`, `streamingDiverges`). Each adapter narrows: `AnthropicQuirks extends AdapterQuirks { promptCachingSupported: boolean; extendedThinkingSupported: boolean }`, `OpenAIQuirks extends AdapterQuirks { strictModeSupported: boolean; structuredOutputsTier2: boolean }`, etc. Consumers reading `adapter.quirks` get adapter-specific autocomplete after a `if (adapter.id === 'anthropic')` discriminant check.
- **D-04 (consumer-adapter fallback):** When `adapter.negotiateCapabilities` is absent, the top-level helper looks up canonical key `${adapter.id}:${modelId}` via Phase 33's `getCapabilityProfile`, maps the resulting `ModelCapabilityProfile` to a `NegotiatedCapabilities` shape, and returns it with `source: "registry"`.

**/models endpoint caching policy**
- **D-05 (caching mode):** In-memory TTL Map. Default TTL = 5 minutes. Per-adapter instance (each `createAnthropicProvider({...})` call gets its own Map).
- **D-06 (cache scope):** Per-instance cache. Two `createAnthropicProvider({apiKey: ...})` calls with different keys do NOT share.
- **D-07 (eviction policy):** Lazy expiry on read. No background `setInterval`/timer.
- **D-08 (TTL configurability):** `modelsCacheTtlMs` factory option per adapter. Default 5 min if omitted; `0` disables (always refetch); `Infinity` disables expiry (process-lifetime).

**/models fetch-failure policy**
- **D-09 (default failure handling):** Fall back to Phase 33 registry with `source: "registry-fallback"` — a DISTINCT `source` value from `"registry"` (intentional no-endpoint adapter) and `"live"` (/models succeeded).
- **D-10 (auth-error policy):** 401/403 throw `NegotiationAuthError` (typed exported class). Only transient errors (network, timeout, 5xx) fall back.
- **D-11 (retry policy):** 2 retries with exponential backoff on transient errors: immediate + 200ms + 1s = 3 total attempts before fallback. Tests can override via `modelsRetryCount` factory option (default 2; 0 disables).
- **D-12 (observability):** Emit `capabilities.negotiation.fallback` event via Lattice's existing `RunEventKind` vocabulary. Event payload: `{ adapter: CapabilityAdapter, modelId: string, errorReason: string, fallbackSource: "registry-fallback" | "registry" }`.

**recommendedSanitizers source / Phase 36 coupling**
- **D-13 (SanitizerKey type):** Closed string-literal union `type SanitizerKey = "stripReasoningTags" | "stripChatTemplateArtifacts" | "unwrapInternalEnvelope"`. `NegotiatedCapabilities.recommendedSanitizers: readonly SanitizerKey[]`.
- **D-14 (derivation table):** Registry-driven `SANITIZER_BY_FAILURE_MODE: Record<KnownFailureMode, SanitizerKey | null>` constant with the 7-mode initial mapping.
- **D-15 (mapping location):** New module `packages/lattice/src/capabilities/sanitizer-recommendations.ts`.
- **D-16 (null encoding):** `Record<KnownFailureMode, SanitizerKey | null>` — exhaustive; `getRecommendedSanitizers` filters nulls.

### Claude's Discretion

- Exact field names for per-adapter quirks (e.g., `promptCachingSupported` vs `supportsPromptCaching` — consistent style across adapters)
- Quirk fixture file format (JSON vs TS literal) and per-adapter test layout
- Whether `negotiateCapabilities()` does inflight-request coalescing — **advisory: yes**, simple to implement
- Exact `NegotiationAuthError` class shape (extends Error; carries `adapter`, `httpStatus`, original message)
- Whether `source: "live"` distinguishes "/models hit, registry intersected" from "/models hit, registry had no profile" — advisory: yes, add `source: "live-only"` if needed
- Logging format for the `capabilities.negotiation.fallback` event payload
- Test fixture strategy: mock /models endpoint responses per adapter

### Deferred Ideas (OUT OF SCOPE)

- **Phase 36 sanitizer implementations** — D-13 locks the 3 SanitizerKey ids
- **Telemetry headers on /models calls** — `User-Agent: lattice/1.3.0` advisory
- **`source: "live-only"` distinct from `"live"`** — Claude-discretion
- **NegotiationAuthError -> ConsumerCallback for refresh** — NOT in Phase 34
- **Quirks-aware routing** — NOT Phase 34's responsibility

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **QUIRK-01** | `AdapterQuirks` base interface in `provider.ts` with 5 universal booleans (`supportsToolChoice`, `parallelToolCalls`, `structuredOutputs`, `responseFormatHonored`, `streamingDiverges`); 7 per-adapter narrowed sub-interfaces in `quirks.ts` | Q6 (per-adapter quirks); §Standard Stack; §Architecture Patterns; §Code Examples |
| **QUIRK-02** | Each of the 7 first-party adapter factories populates a typed `quirks` block; quirk values match real provider behavior asserted by per-adapter quirk-fixture tests | Q6 (per-adapter quirks); Q10 (test mocking); §Code Examples |
| **QUIRK-03** | Per-adapter narrowing accessible via discriminant check (`if (adapter.id === 'anthropic')`); tsd type-level test asserts discriminant narrowing | Q11 (closure pattern); §Code Examples |
| **NEG-01** | `negotiateCapabilities(modelId): Promise<NegotiatedCapabilities>` shipped on each of the 7 first-party adapters; queries `/models` when available (Anthropic, OpenAI, Gemini, OpenRouter, xAI) with TTL cache + retry + auth-error class + fallback semantics per D-05..D-12 | Q1-Q5 (provider /models shapes); Q7 (coalescing); Q8 (NegotiationAuthError); Q11 (closure cache) |
| **NEG-02** | Top-level helper `negotiateCapabilities(adapter, modelId)` synthesizes `NegotiatedCapabilities` from Phase 33 registry when adapter lacks `negotiateCapabilities`; anchor case study (`openrouter:openai/gpt-oss-120b:free`) returns `recommendedSanitizers: ["unwrapInternalEnvelope"]` | Q9 (RunEventKind addition); §Code Examples; CONTEXT.md `<specifics>` anchor |

## Project Constraints (from CLAUDE.md)

No `./CLAUDE.md` exists at the Lattice repo root. The user's private global CLAUDE.md (loaded as system context) applies:

- **Never run applications automatically** — adapter `negotiate()` is consumer-triggered (user explicitly invokes; no auto-warmup)
- **No emojies** in terminal logs, READMEs, or markdown files unless explicitly asked
- **Browser automation policy** — N/A for this phase

Inferred from existing v1.2/v1.3 discipline (verified via Read):

- **Zero external runtime dependencies** in `packages/lattice/src/`. Production deps are `@standard-schema/spec`, `canonicalize`, `mime`. Dev deps are `@noble/ed25519`, `zod`. **Phase 34 adds zero new runtime deps.** `node:` built-in `fetch` already drives every existing adapter.
- **Every new public type/function lands in `packages/lattice/src/index.ts`** (PKG-01/INDEX-01) — non-negotiable.
- **Closed string-literal unions throughout** — match `KnownFailureMode`, `ResumePolicy`, `RunEventKind`, `SanitizerKey` style.
- **Per-instance closures over config** — every existing factory (anthropic.ts, gemini.ts, openrouter.ts, xai.ts, lm-studio.ts) closes over instance state. D-05/D-06 cache lives in this same closure.
- **Adapter-level `fetch` parameter is the established test seam** — every adapter test file uses `makeFakeFetch` returning `Response` (verified: `anthropic.test.ts:17-31`, `gemini.test.ts:18-30`, `openrouter.test.ts:16-28`, `xai.test.ts:18-30`, `lm-studio.test.ts:14-28`, `adapters.test.ts:23-87`). Phase 34 reuses this exact seam.
- **No `vi.mock` for adapter HTTP** — the codebase deliberately uses constructor-injected `fetch` (the function is part of `OpenAICompatibleProviderOptions` / `AnthropicProviderOptions` / etc.). This is the testing pattern the planner MUST follow; introducing `msw` or `vi.mock` would break with established convention.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-in `fetch` | Node >=24 (engines target) | HTTP GET to `/v1/models` per adapter | [VERIFIED: packages/lattice/package.json engines.node `>=24`]; existing adapters already use built-in fetch; zero new deps. |
| `AbortSignal.timeout(ms)` | Node 18+ (backported to 16) | Per-call timeout on `/models` fetch | [CITED: https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static]; existing `refresh-model-registry.mjs:64-69` uses `AbortController` + `setTimeout` — Phase 34 can use the simpler `AbortSignal.timeout()` form in the new TS code since Node 24 supports it. |
| `Map<string, {result, expiresAt}>` | built-in | TTL cache per adapter instance | [VERIFIED: existing lookup.ts:72 uses `Map<string, ModelCapabilityProfile>` for the same reason — `Map` survives `__proto__` keys, plain object would not]; matches lookup.ts pattern. |
| TypeScript `class extends Error` | TS 5+ (have TS 6) | `NegotiationAuthError` typed error | [VERIFIED: agent/types.ts:172 `class AgentDeniedError extends Error` is the lone precedent in v1.2]; mirrors that exact shape with `readonly kind`, `readonly httpStatus`, named constructor. |
| Closed string-literal union for event kind | n/a — TS native | Add `"capabilities.negotiation.fallback"` to `RunEventKind` | [VERIFIED: tracing.ts:11-33 is the canonical union; v1.2 Phase 17 added `recovery.start`/`recovery.complete`/`recovery.failed` via the same pattern]. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `getCapabilityProfile` from Phase 33 | shipped | Strict canonical-key lookup | Use in the top-level helper (D-04) and in each adapter's negotiate() for static-fallback intersection. |
| `findCapabilityProfile` from Phase 33 | shipped | Fuzzy multi-adapter lookup with OpenRouter suffix-strip | Use in the negotiator when the consumer passes a non-canonical id (e.g., `openai/gpt-oss-120b:free` → strips `:free`, returns the openrouter profile). |
| `stripOpenRouterVariant` from Phase 33 | shipped | Variant suffix stripper | Use inside the OpenRouter negotiator before the registry intersection step. |
| Phase 33's `SanitizerKey` derivation table | not yet shipped | Phase 34 ships D-13/D-14/D-15 mapping | Land alongside negotiate(); single source of truth for Phase 36 sanitizer registration. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `class NegotiationAuthError extends Error` | Plain interface in errors.ts (matches `TripwireViolationError` v1.1 pattern) | Phase 19 `AgentDeniedError` set the precedent for `class extends Error` when the error is throwable from inside an async runtime path. Negotiate() throws inside a Promise; class is the right shape so `try { await adapter.negotiateCapabilities(...) } catch (err) { if (err instanceof NegotiationAuthError) {...} }` works ergonomically. The interface union pattern in `errors.ts:64-79` is for `LatticeRunError` returned-not-thrown shape — different use case. |
| `vi.mock('node:fetch')` for adapter HTTP tests | `fetch: makeFakeFetch(...)` constructor-injected | Established convention in 5+ existing adapter tests. `vi.mock` would break with conventions and pollute module resolution. Stick with the seam. |
| New `AdapterQuirks` interface in a separate `quirks.ts` module | Inline in `provider.ts` next to `ProviderAdapter` | Phase 34 ships 8 types (1 base + 7 narrowed). Putting them in `provider.ts` bloats that file. New `packages/lattice/src/providers/quirks.ts` keeps `provider.ts` lean. Pattern parallels `capabilities/profile.ts` + `capabilities/lookup.ts` separation from Phase 33. |
| `peter-evans/create-pull-request` action / cron / npm dep | none | This phase ships only runtime TS code; no CI / npm install. No alternatives to consider at the infrastructure level. |

**Installation:** No new dependencies. Zero runtime deps. Zero dev deps.

**Version verification:** No external libraries to version-verify. Existing Node `fetch` and `AbortSignal.timeout` are stable since Node 18; engines target is `>=24` (verified in package.json) so both are fully supported.

## Architecture Patterns

### Recommended Project Structure

```
packages/lattice/src/providers/
├── provider.ts                  # EXISTING — add optional quirks?: AdapterQuirks + negotiateCapabilities?(modelId): Promise<NegotiatedCapabilities>
├── quirks.ts                    # NEW — AdapterQuirks base + 7 narrowed sub-interfaces
├── adapters.ts                  # EXISTING — extend createOpenAIProvider + createOpenAICompatibleProvider with quirks + negotiate()
├── anthropic.ts                 # EXISTING — extend with quirks + negotiate() (thickest implementation — see Q1)
├── gemini.ts                    # EXISTING — extend with quirks + negotiate() (responseSchema query)
├── openrouter.ts                # EXISTING — extend with quirks + negotiate() (reuse refresh-model-registry pattern)
├── xai.ts                       # EXISTING — extend with quirks + negotiate() (OpenAI-compat /models, sparse response)
└── lm-studio.ts                 # EXISTING — extend with quirks; negotiate() returns registry-only (source: "registry")

packages/lattice/src/capabilities/
├── profile.ts                   # EXISTING (Phase 33)
├── lookup.ts                    # EXISTING (Phase 33)
├── registry.generated.ts        # EXISTING (Phase 33)
├── registry.static.ts           # EXISTING (Phase 33)
├── sanitizer-recommendations.ts # NEW — SanitizerKey + SANITIZER_BY_FAILURE_MODE + getRecommendedSanitizers (D-13/D-14/D-15/D-16)
├── negotiate.ts                 # NEW — NegotiatedCapabilities type + top-level negotiateCapabilities helper (D-02 / D-04)
└── index.ts                     # EXISTING barrel — add new exports

packages/lattice/src/tracing/
└── tracing.ts                   # EXISTING — add "capabilities.negotiation.fallback" to RunEventKind union (Q9)

packages/lattice/src/index.ts    # EXISTING — re-export AdapterQuirks + AnthropicQuirks + ... + NegotiatedCapabilities + SanitizerKey + NegotiationAuthError + getRecommendedSanitizers + SANITIZER_BY_FAILURE_MODE + top-level negotiateCapabilities helper

packages/lattice/test-d/
└── quirks-negotiation.test-d.ts # NEW — tsd type-level: exhaustive switch over SanitizerKey + AdapterQuirks discriminant narrowing + NegotiatedCapabilities shape

packages/lattice/test/__fixtures__/quirks/
├── anthropic-models-ok.json         # NEW — happy-path /v1/models response (claude-opus-4-6 with capabilities block)
├── anthropic-models-401.json        # NEW — auth error (causes NegotiationAuthError)
├── anthropic-models-503.json        # NEW — transient error (falls back)
├── openai-models-ok.json            # NEW — happy-path /v1/models (sparse list-only response)
├── gemini-models-ok.json            # NEW — happy-path /v1beta/models (with supportedGenerationMethods)
├── openrouter-models-ok.json        # NEW — happy-path or symlink to scripts/.../openrouter-models-snapshot.json
└── xai-models-ok.json               # NEW — sparse OpenAI-shaped response (guessed; verify when xAI documents)

packages/lattice/src/providers/
├── quirks-anthropic.test.ts     # NEW — adjacent test pattern (matches existing anthropic.test.ts, gemini.test.ts)
├── quirks-openai.test.ts        # NEW
├── quirks-gemini.test.ts        # NEW
├── quirks-xai.test.ts           # NEW
├── quirks-openrouter.test.ts    # NEW
├── quirks-lm-studio.test.ts     # NEW
└── negotiate-helper.test.ts     # NEW — top-level helper, consumer-adapter fallback path
```

### Pattern 1: Per-instance TTL Map cache in factory closure

**What:** Each call to `createAnthropicProvider({...})` creates its own `Map<string, {result: NegotiatedCapabilities, expiresAt: number}>` that lives in the factory closure. Lazy expiry on read.

**When to use:** D-05/D-06/D-07 — always for Phase 34 negotiate() implementations.

**Example (Source: lookup.ts:72-98 lazy Map pattern + this phase's TTL extension):**

```typescript
// Source: NEW packages/lattice/src/providers/anthropic.ts (Phase 34 extension)
export interface AnthropicProviderOptions {
  readonly id?: string;
  readonly model: string;
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly anthropicVersion?: string;
  readonly fetch?: typeof fetch;
  readonly pricing?: { ... };
  // Phase 34 additions:
  readonly modelsCacheTtlMs?: number;     // D-08 default 300_000; 0 disables; Infinity = process-lifetime
  readonly modelsRetryCount?: number;     // D-11 default 2; 0 disables retries
}

interface CacheEntry {
  readonly result: NegotiatedCapabilities;
  readonly expiresAt: number;             // Date.now() + ttl; Infinity for no-expire
}

export function createAnthropicProvider(options: AnthropicProviderOptions): ProviderAdapter & {
  readonly quirks: AnthropicQuirks;
  readonly negotiateCapabilities: (modelId: string) => Promise<NegotiatedCapabilities>;
} {
  const id = options.id ?? "anthropic";
  const fetchImpl = options.fetch ?? fetch;
  const baseUrl = (options.baseUrl ?? "https://api.anthropic.com").replace(/\/$/u, "");
  const anthropicVersion = options.anthropicVersion ?? "2023-06-01";
  const ttlMs = options.modelsCacheTtlMs ?? 300_000;   // D-08 default 5min
  const retryCount = options.modelsRetryCount ?? 2;    // D-11 default 2
  const cache = new Map<string, CacheEntry>();         // D-05/D-06 per-instance
  const inflight = new Map<string, Promise<NegotiatedCapabilities>>();  // Q7 coalescing

  async function negotiateCapabilities(modelId: string): Promise<NegotiatedCapabilities> {
    // 1. Lazy expiry check (D-07)
    const cached = cache.get(modelId);
    if (cached && cached.expiresAt > Date.now()) return cached.result;

    // 2. Inflight coalescing (Q7 / Claude's Discretion advisory)
    const existing = inflight.get(modelId);
    if (existing) return existing;

    const fetchPromise = (async () => {
      try {
        const result = await fetchAndNegotiate(modelId);
        if (ttlMs > 0) {
          cache.set(modelId, { result, expiresAt: Date.now() + ttlMs });
        }
        return result;
      } finally {
        inflight.delete(modelId);  // ALWAYS clear — Pitfall 4
      }
    })();
    inflight.set(modelId, fetchPromise);
    return fetchPromise;
  }

  async function fetchAndNegotiate(modelId: string): Promise<NegotiatedCapabilities> {
    // D-09/D-10/D-11: retry transient, throw auth, fall back at end
    // ... see Pattern 4 below
  }

  return {
    id,
    kind: "provider-adapter",
    capabilities: [ ... ],
    quirks: {
      // 5 universal SC-1 booleans
      supportsToolChoice: true,
      parallelToolCalls: true,
      structuredOutputs: true,
      responseFormatHonored: true,
      streamingDiverges: false,
      // 2 Anthropic narrowed
      promptCachingSupported: true,
      extendedThinkingSupported: true,
    } satisfies AnthropicQuirks,
    negotiateCapabilities,
    async execute(request) { ... },
  };
}
```

**Key trick:** The factory return type INCLUDES `quirks` and `negotiateCapabilities` (narrowed). The base `ProviderAdapter` interface keeps them OPTIONAL (D-01/D-02). Consumers using the factory keyword get autocomplete; consumers writing a raw `ProviderAdapter` literal are not forced to populate them.

### Pattern 2: AdapterQuirks base + per-adapter narrowed types

**What:** A single base interface with the 5 SC-1 booleans, plus 7 narrowed sub-interfaces per adapter. Consumers narrow via discriminant check on `adapter.id`.

**When to use:** D-03 — exactly.

**Example:**

```typescript
// Source: NEW packages/lattice/src/providers/quirks.ts
// Phase 34 — D-03 — Adapter-level capability disclosure.

/**
 * Universal 5-boolean shape every first-party adapter populates (SC-1).
 * `responseFormatHonored` is whether the model treats `response_format` as
 * authoritative (false for vanilla openai-compat servers; true for OpenAI,
 * Anthropic, Gemini). `streamingDiverges` is whether streamed output differs
 * from buffered (true for some self-hosted servers; false for OpenAI/Anthropic).
 */
export interface AdapterQuirks {
  readonly supportsToolChoice: boolean;
  readonly parallelToolCalls: boolean;
  readonly structuredOutputs: boolean;
  readonly responseFormatHonored: boolean;
  readonly streamingDiverges: boolean;
}

/** Anthropic adds prompt caching + extended thinking flags. */
export interface AnthropicQuirks extends AdapterQuirks {
  readonly promptCachingSupported: boolean;       // CITED: prompt-caching is on all active Claude models
  readonly extendedThinkingSupported: boolean;    // CITED: claude-3.7 onward
  readonly toolUseInputSchemaStrict: boolean;     // Anthropic tool_use blocks with strict JSON Schema
}

/** OpenAI adds strict-mode + tier-2 structured-outputs flags. */
export interface OpenAIQuirks extends AdapterQuirks {
  readonly strictModeSupported: boolean;          // CITED: function-calling strict:true on gpt-4o-2024-08-06+
  readonly structuredOutputsTier2: boolean;       // CITED: json_schema response_format on gpt-4o+, gpt-4o-mini, o1
}

/** OpenAI-compat narrows responseFormatHonored separately because self-hosted
 *  servers (vLLM, TGI, Ollama) vary on whether they honor response_format. */
export interface OpenAICompatQuirks extends AdapterQuirks {
  // Same 5 base; no new fields — but the base values for openai-compat are
  // conservatively "false" / "false" / "false" / "false" / "true" by default
  // because the consumer points the factory at any OpenAI-shaped endpoint.
}

/** Gemini adds responseSchema + safetySettings flags. */
export interface GeminiQuirks extends AdapterQuirks {
  readonly responseSchemaSupported: boolean;      // CITED: Gemini API responseSchema/responseJsonSchema
  readonly safetySettingsConfigurable: boolean;   // verified: gemini.ts:50-55 4-category BLOCK_NONE
  readonly systemInstructionSupported: boolean;   // gemini-1.5+ supports system_instruction
}

/** xAI adds reasoning-tokens telemetry + parallel-tool-calls behavior. */
export interface XaiQuirks extends AdapterQuirks {
  readonly reasoningTokensReported: boolean;      // verified: xai.ts:46-72 — completion_tokens_details.reasoning_tokens
  readonly logprobsSupported: boolean;            // CITED: docs.x.ai — grok-4.20 silently ignores logprobs
}

/** OpenRouter adds provider-routing + floor-pricing flags. */
export interface OpenRouterQuirks extends AdapterQuirks {
  readonly providerRoutingArraySupported: boolean;  // CITED: openrouter.ai/docs provider routing order/only/ignore
  readonly floorPricingHints: boolean;              // CITED: openrouter.ai/docs max_price / sort: "throughput" / "price"
  readonly allowFallbacks: boolean;                 // CITED: openrouter.ai/docs allow_fallbacks boolean
}

/** LM Studio adds custom-chat-template risk flag. */
export interface LmStudioQuirks extends AdapterQuirks {
  readonly customChatTemplateRiskFlag: boolean;    // CITED: lmstudio-bug-tracker — Jinja template mismatches with model training
  readonly noAuthRequired: boolean;                // verified: lm-studio.ts:35-37 — apiKey optional
}
```

### Pattern 3: NegotiatedCapabilities shape

**What:** The simplified consumer-facing view of model capabilities. Distinct from `ModelCapabilityProfile` (the full registry profile).

**When to use:** Return value of every `negotiateCapabilities()` method + top-level helper.

**Example:**

```typescript
// Source: NEW packages/lattice/src/capabilities/negotiate.ts

import type { CapabilityAdapter, KnownFailureMode } from "./profile.js";
import type { SanitizerKey } from "./sanitizer-recommendations.js";

/**
 * Phase 34 — SC-3 — Consumer-facing capability shape returned by
 * adapter.negotiateCapabilities() and the top-level negotiateCapabilities()
 * helper. Simplified relative to ModelCapabilityProfile (the registry
 * profile); consumers needing the full enum (e.g., native_strict vs
 * native_lenient) should look up the profile directly.
 *
 * Source values:
 *   - "live"               — /models endpoint hit, registry profile intersected
 *   - "registry-fallback"  — /models hit failed transiently, fell back to registry (D-09)
 *   - "registry"           — adapter intentionally has no /models endpoint (LM Studio, openai-compat)
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
 * D-10 — Typed error thrown by negotiateCapabilities when /models returns
 * 401 or 403. Throwable from async; mirrors AgentDeniedError shape (the
 * only existing v1.2 class-extends-Error precedent).
 *
 * Why throw (vs return-as-error-union):
 *   - Auth errors indicate a broken apiKey config — caller's bug
 *   - Silently falling back would hide the bug
 *   - try/catch ergonomics work with class-extends-Error
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
```

### Pattern 4: retry-with-backoff + auth-error throw + fallback

**What:** The core fetch loop inside each adapter's negotiate(). Implements D-09/D-10/D-11.

**When to use:** Every per-adapter `fetchAndNegotiate(modelId)` helper.

**Example:**

```typescript
// Source: NEW pattern reused across all 4 adapters that have a /models endpoint
async function fetchAndNegotiate(modelId: string): Promise<NegotiatedCapabilities> {
  const url = `${baseUrl}/v1/models`;
  const headers = {
    "x-api-key": options.apiKey,
    "anthropic-version": anthropicVersion,
    "accept": "application/json",
  };
  let lastErr: unknown;
  const attempts = retryCount + 1;       // D-11: 2 retries = 3 total attempts
  const backoffMs = [0, 200, 1000];      // D-11: immediate + 200ms + 1s

  for (let i = 0; i < attempts; i += 1) {
    if (backoffMs[i] > 0) await new Promise((r) => setTimeout(r, backoffMs[i]));
    try {
      const resp = await fetchImpl(url, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(30_000),  // 30s per attempt
      });

      // D-10: auth errors throw, never fall back
      if (resp.status === 401 || resp.status === 403) {
        throw new NegotiationAuthError(
          "anthropic",
          modelId,
          resp.status as 401 | 403,
          `Anthropic /v1/models returned ${resp.status}: check apiKey config.`,
        );
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const body = await resp.json();
      return mergeWithRegistry(modelId, body);  // "live" source
    } catch (err) {
      if (err instanceof NegotiationAuthError) throw err;   // D-10: re-throw auth
      lastErr = err;
      // continue to next attempt; transient errors retry
    }
  }

  // D-09 + D-12: all retries exhausted, fall back + emit event
  emitFallbackEvent({
    adapter: "anthropic",
    modelId,
    errorReason: lastErr instanceof Error ? lastErr.message : String(lastErr),
    fallbackSource: "registry-fallback",
  });
  return synthesizeFromRegistry(modelId, "registry-fallback");
}
```

### Pattern 5: Sanitizer recommendation table (D-14/D-16)

**What:** Registry-driven `Record<KnownFailureMode, SanitizerKey | null>` constant with exhaustive coverage.

**Example:**

```typescript
// Source: NEW packages/lattice/src/capabilities/sanitizer-recommendations.ts

import type { KnownFailureMode } from "./profile.js";

/**
 * D-13 — Phase 36 sanitizer registration keys. Closed union; adding a 4th
 * sanitizer in v1.4 is an intentional typed breaking change.
 */
export type SanitizerKey =
  | "stripReasoningTags"
  | "stripChatTemplateArtifacts"
  | "unwrapInternalEnvelope";

/**
 * D-14 + D-16 — Exhaustive mapping from KnownFailureMode to SanitizerKey
 * (or null when the failure mode is not a sanitizer concern). The
 * `Record<KnownFailureMode, ...>` annotation enforces compile-time
 * exhaustiveness — adding a new mode to KnownFailureMode in v1.4+ will
 * fail the type-check here until the planner decides on a mapping.
 */
export const SANITIZER_BY_FAILURE_MODE: Record<KnownFailureMode, SanitizerKey | null> = {
  internal_envelope_leak: "unwrapInternalEnvelope",
  reasoning_tag_leak: "stripReasoningTags",
  template_artifact_leak: "stripChatTemplateArtifacts",
  system_prompt_echo: null,        // consumer-side prompt engineering, not a sanitizer
  hallucinated_tool_name: null,    // Phase 37 tool-call validator territory
  malformed_tool_arguments: null,  // Phase 37 tool-call validator territory
  premature_termination: null,     // consumer-side max_tokens config
} as const;

/**
 * D-14/D-15 — Maps a list of known failure modes through the recommendation
 * table and filters nulls. `recommendedSanitizers` always contains real keys.
 */
export function getRecommendedSanitizers(
  modes: readonly KnownFailureMode[],
): readonly SanitizerKey[] {
  const seen = new Set<SanitizerKey>();
  for (const mode of modes) {
    const key = SANITIZER_BY_FAILURE_MODE[mode];
    if (key !== null) seen.add(key);
  }
  return [...seen];
}
```

### Anti-Patterns to Avoid

- **Letting `negotiateCapabilities()` swallow auth errors as fallback.** D-10 is explicit: 401/403 throw. Hiding them via fallback masks broken config. The retry loop must check status BEFORE the `catch` block.
- **Using `vi.mock('node:fetch')` or MSW for adapter HTTP tests.** Every existing adapter test uses the constructor-injected `fetch` seam (`makeFakeFetch` returning `Response`). Phase 34 MUST reuse this seam — verified across 5+ existing test files.
- **Building a separate scheduler / interval-based eviction.** D-07 locks lazy expiry on read. A background `setInterval` would pin the Node event loop in library code that may run in CLI tools or Workers.
- **Inlining the registry lookup logic in each adapter's negotiate().** D-04 + D-02 split: the top-level helper owns the consumer-adapter fallback path. Per-adapter negotiate() owns the /models query + intersection. Don't duplicate.
- **Forgetting to clear the inflight Map on rejection** (Pitfall 4 below). A failed promise that stays in the Map permanently locks all future calls for that modelId to the same rejection. The `.finally(() => inflight.delete(modelId))` is mandatory.
- **Sending `Authorization: Bearer ...` to OpenRouter /models.** OpenRouter's /api/v1/models endpoint is **unauthenticated** (live-verified 2026-06-08: HTTP 200 with no Authorization header; Phase 33 RESEARCH confirmed same). The docs page (q5) suggests auth is required, but the docs page is wrong — the endpoint is part of the public-discovery surface. Don't pass `Authorization` here; it's harmless but pollutes telemetry.
- **Assuming OpenAI /v1/models returns capability flags.** It returns only `{id, object, created, owned_by}` (live-doc-verified). The OpenAI negotiator MUST intersect with the static registry to populate the `supports.*` booleans. Don't write code that expects `response.data[i].capabilities` — that's the Anthropic shape.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Promise / single-flight request coalescing | A `LRU` cache or `p-throttle`-style queue | A simple `Map<key, Promise<T>>` populated on first call, cleared in `.finally` | [CITED: https://1xapi.com/blog/nodejs-cache-stampede-single-flight-pattern-2026] — 15 LOC, no library. Adding `promise-inflight` or `p-queue` violates the zero-runtime-deps rule. |
| Retry with exponential backoff | A retry library | Reuse the exact pattern from `scripts/refresh-model-registry.mjs:60-83` (immediate + 200ms + 1s) | Verified pattern; matches D-11; zero deps. Phase 33 already proved the math. |
| HTTP request timeout | `node-fetch` with `timeout` option | `AbortSignal.timeout(30_000)` passed via `signal: ...` | [CITED: MDN AbortSignal.timeout — backported to Node 16, GA in 18, fine in 24]. The existing refresh script uses the older AbortController + setTimeout pattern; new code can use the cleaner static-method form. |
| Typed-error throwable | A discriminated-union interface returned-not-thrown | `class extends Error` mirroring `AgentDeniedError` | [VERIFIED: agent/types.ts:172] — sole v1.2 precedent for throwable typed errors. `instanceof NegotiationAuthError` is the consumer ergonomic. |
| Adapter HTTP test mocking | `msw` (Mock Service Worker), `vi.mock`, `nock` | Constructor-injected `fetch: makeFakeFetch(...)` matching existing pattern | [VERIFIED: anthropic.test.ts:17-31, gemini.test.ts:18-30, openrouter.test.ts:16-28, xai.test.ts:18-30, lm-studio.test.ts:14-28, adapters.test.ts:23-87] — 5+ files. Don't break the convention. |
| Bidirectional Map for canonical-key↔modelId lookup | Reflective lookup | A single `Map<canonicalKey, NegotiatedCapabilities>` keyed by the externally-visible modelId (per adapter); negotiate() owns the prefix | The adapter knows its own id (`anthropic`, `openrouter`, etc.). The cache only needs to key on the externally-visible modelId. Simpler. |

**Key insight:** Phase 34 is mostly mechanical wiring of an existing Phase 33 surface (`getCapabilityProfile`, `findCapabilityProfile`, `stripOpenRouterVariant`) through 7 adapter factories. The temptation will be to reach for `promise-inflight`, `p-throttle`, or `msw` — resist all three. Existing patterns cover every requirement.

## Runtime State Inventory

Phase 34 is purely additive code on existing source files plus 3 new source files (`quirks.ts`, `sanitizer-recommendations.ts`, `negotiate.ts`) plus new tests. There is no rename, no migration, no runtime data store, and no OS-level state.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — Phase 34 has no datastore | None |
| Live service config | None — Phase 34 does not touch CI / npm / external services | None |
| OS-registered state | None | None |
| Secrets/env vars | None new. Existing per-adapter `apiKey` options unchanged. | None |
| Build artifacts | New `dist/` outputs include `quirks.js`, `sanitizer-recommendations.js`, `negotiate.js` (auto-emitted by tsdown — no manual step) | Verify tarball size advisory (~5 KB additional, fine) |

**Nothing found in category:** Verified by Read across all source files and test patterns. Phase 34 is greenfield + extension on existing adapter modules.

## Environment Availability

Phase 34 adds no new external dependencies. All needed tools are confirmed available via Phase 33 verification.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js >=24 | Built-in `fetch`, `AbortSignal.timeout` | YES | Node 24+ pinned in package.json engines | — |
| pnpm 10.33 | Package management | YES | pnpm 10.33 pinned | — |
| TypeScript 6 | Build / types | YES | TS 6 in workspace | — |
| vitest 4 | Test runner | YES | vitest 4 in package.json devDeps | — |
| tsd | Type-level tests | YES | Already configured for tsd in package.json | — |
| `getCapabilityProfile` etc. from Phase 33 | Registry lookup | YES | Shipped 2026-06-08 | — |

**Missing dependencies:** None.

## Common Pitfalls

### Pitfall 1: /models response shape changes silently (Anthropic adds a field)

**What goes wrong:** Anthropic ships a new field in the `capabilities` block (e.g., `code_execution_v2`). The negotiate() code blindly indexes `body.data[i].capabilities.thinking.supported` and crashes when a future Claude model lacks the `thinking` block entirely. Or worse: a Zod schema is added with `.strict()` and rejects the new field.
**Why it happens:** The /models endpoint is a public surface. Anthropic adds capability flags every few months without a versioned API contract.
**How to avoid:** Use lenient parsing — extract individual fields with optional chaining + defaults (`body.data[i].capabilities?.thinking?.supported ?? false`). Do NOT validate the upstream body with `.strict()`. If a Zod schema is used for the negotiation result, use `.passthrough()`. Only require the fields you actually consume.
**Warning signs:** New Claude model arrives → negotiate() throws or returns undefined for known-good model id.

### Pitfall 2: Auth errors surface in `ai.run()` paths when only negotiate() was called

**What goes wrong:** The negotiator throws `NegotiationAuthError` from inside an inflight Promise. The consumer awaits negotiate() in a separate code path (not inside `ai.run()`), but a too-broad `catch` block higher up catches the typed error and reports it as a tripwire failure. Or worse, the inflight Map still holds the rejected promise (Pitfall 4), so every subsequent `ai.run()` call that internally triggers negotiate() re-throws the same auth error.
**Why it happens:** Throwing across an async boundary tangles cleanup.
**How to avoid:**
  1. Clear the inflight Map in `.finally`, not `.then` (Pitfall 4).
  2. Document that `NegotiationAuthError` is throwable from `negotiateCapabilities` ONLY — never from `execute()`. The Phase 34 contract is that auth errors from /models do NOT contaminate the request path.
  3. Don't reuse the per-instance cache for actual run-time auth state; the negotiate() cache and the execute() apiKey are separate concerns.
**Warning signs:** A `try { await adapter.negotiateCapabilities("...") } catch (NegotiationAuthError) { ... }` block on the consumer side somehow corrupts the next `ai.run()` call.

### Pitfall 3: Cache returns stale data when provider changes its model lineup

**What goes wrong:** TTL is 5 minutes. A model is deprecated mid-day; the cache holds the old profile for up to 4 min 59s. Or a new model launches and is invisible to negotiate() until the TTL expires.
**Why it happens:** D-08 default TTL of 5 minutes is a balance. Lower TTL = more /models traffic; higher TTL = staler data.
**How to avoid:** Document `modelsCacheTtlMs: 0` as the "always fresh" mode and recommend it for tests. Document `modelsCacheTtlMs: Infinity` as the "process-lifetime cache" mode for short-lived CLIs. The 5-minute default is for long-running services.
**Warning signs:** Consumer says "I deprecated model X but my agent still routes to it." Response: TTL window expired? Inspect `source: "live"` to confirm; if `"live"`, the cache is fresh and the issue is elsewhere.

### Pitfall 4: Inflight-coalescing Map leaks on rejection

**What goes wrong:** A concurrent caller sees `inflight.get(modelId)` returns the pending Promise. The original fetch rejects (transient 503). The catch block returns the fallback result, but `inflight.delete(modelId)` was inside the catch — except an earlier code path put it inside the `.then`. Every subsequent call to negotiate() for that modelId returns the cached rejection.
**Why it happens:** Promise lifecycle management is subtle. `.then(...)` only fires on success; `.catch(...)` only on rejection; only `.finally(...)` fires on both.
**How to avoid:** ALWAYS use `.finally(() => inflight.delete(modelId))`. Test the negative case: simulate /models throwing, await, then call negotiate() again — the second call MUST hit the network again (or return cached fallback, not the rejection).
**Warning signs:** First 503 causes every subsequent negotiate() call to throw "HTTP 503" — even after the upstream recovered.

### Pitfall 5: Top-level helper and adapter method drift apart

**What goes wrong:** The planner ships `adapter.negotiateCapabilities()` in `anthropic.ts` AND the top-level `negotiateCapabilities(adapter, modelId)` helper in `capabilities/negotiate.ts`. Six months later, a Phase 36 contributor adds an inflight-coalescing layer to the helper but forgets the adapter. Or adds a new `source: "live-only"` value to the helper that the adapter never emits.
**Why it happens:** Two implementations of the same contract.
**How to avoid:** D-02 says the top-level helper is the consumer-facing entry point: it ONLY synthesizes from the registry when adapter.negotiateCapabilities is absent; otherwise it delegates verbatim. The helper has NO inflight coalescing of its own; that lives per-adapter. The helper does NOT add `source` values; it forwards what the adapter returns. Document this in a JSDoc on the helper.
**Warning signs:** A code reviewer asks "should this logic live in the helper or the adapter?" — answer: the adapter, unless the consumer skipped writing a `negotiateCapabilities` method, in which case the helper provides the registry fallback only.

### Pitfall 6: New `capabilities.negotiation.fallback` event breaks v1.2 consumers

**What goes wrong:** The `RunEventKind` union is closed. Adding `"capabilities.negotiation.fallback"` is a typed breaking change for consumers who exhaustively-switch on `RunEventKind` (Phase 33 D-13 enforces this discipline; some consumers will adopt it). The change is intentional but the consumer must update their exhaustive switch.
**Why it happens:** Closed unions across major versions force visible decisions.
**How to avoid:** Document the new event in the changeset. Phase 17 added `recovery.*` events the same way (verified via tracing.ts:29-33 JSDoc comments). The pattern: new event, mention in `.changeset/v1.3.0-*.md`, plus a JSDoc comment block on the addition explaining what triggers it.
**Warning signs:** A consumer's tsd test fails after upgrading to v1.3 with a "missing case `capabilities.negotiation.fallback`" message. Response: yes, expected; update the exhaustive switch.

### Pitfall 7: Quirk fixture tests assert real provider behavior but the fixture is wrong

**What goes wrong:** A quirk-fixture test asserts `expect(adapter.quirks.parallelToolCalls).toBe(true)` for OpenAI. But that's model-dependent — gpt-4o supports parallel; gpt-3.5-turbo's old snapshot does not; gpt-4.1-nano-2025-04-14 has a documented bug (CITED: OpenAI community post). The quirk is per-factory (per-instance), not per-model.
**Why it happens:** The 5 SC-1 booleans describe the ADAPTER's general posture, not a specific model's runtime capability. Model-specific facts live in the registry profile + negotiate() result.
**How to avoid:** Document the quirks block as "what this adapter shape generally supports across its supported model lineup" — coarse signal. Per-model details live in `negotiateCapabilities()`. The quirk fixture tests assert the COARSE flag (e.g., "OpenAI's adapter shape supports parallel_tool_calls when the model does") and the model-specific negotiate() tests assert the FINE flag (e.g., "negotiate('gpt-4o') returns parallelToolCalls: true; negotiate('o1') returns parallelToolCalls: true").
**Warning signs:** "The OpenAI quirks test asserts X but gpt-3.5-turbo-0613 doesn't actually do X." Response: gpt-3.5-turbo is legacy; the quirk reflects the modern lineup; negotiate('gpt-3.5-turbo-0613') is where the model-specific truth lives.

## Code Examples

### Q1 example: Anthropic `/v1/models` happy-path response (live-verified 2026-06-08)

```json
// Source: https://platform.claude.com/docs/en/api/models-list (live docs 2026-06-08)
{
  "data": [
    {
      "id": "claude-opus-4-6",
      "type": "model",
      "display_name": "Claude Opus 4.6",
      "created_at": "2026-02-04T00:00:00Z",
      "max_input_tokens": 0,
      "max_tokens": 0,
      "capabilities": {
        "batch": { "supported": true },
        "citations": { "supported": true },
        "code_execution": { "supported": true },
        "context_management": {
          "supported": true,
          "clear_thinking_20251015": { "supported": true },
          "clear_tool_uses_20250919": { "supported": true },
          "compact_20260112": { "supported": true }
        },
        "effort": {
          "supported": true,
          "high": { "supported": true },
          "medium": { "supported": true },
          "low": { "supported": true },
          "max": { "supported": true },
          "xhigh": { "supported": true }
        },
        "image_input": { "supported": true },
        "pdf_input": { "supported": true },
        "structured_outputs": { "supported": true },
        "thinking": {
          "supported": true,
          "types": {
            "adaptive": { "supported": true },
            "enabled": { "supported": true }
          }
        }
      }
    }
  ],
  "first_id": "claude-opus-4-6",
  "last_id": "claude-haiku-3-5",
  "has_more": true
}
```

Headers:
```
x-api-key: $ANTHROPIC_API_KEY
anthropic-version: 2023-06-01
```

Pagination: `after_id`, `before_id`, `limit` (default 20, max 1000). The negotiator should NOT paginate — it only needs the one row matching `modelId`, which on a small lineup (~10 models) is in the first page. For safety: query `/v1/models?limit=1000` once and cache.

### Q2 example: OpenAI `/v1/models` happy-path response

```json
// Source: https://developers.openai.com/api/reference/resources/models/methods/list (live docs 2026-06-08)
{
  "object": "list",
  "data": [
    {
      "id": "gpt-4o-2024-08-06",
      "object": "model",
      "created": 1686935002,
      "owned_by": "system"
    }
  ]
}
```

Headers: `Authorization: Bearer $OPENAI_API_KEY`. No capabilities exposed. The OpenAI negotiator MUST source `supports.*` from the registry (via `getCapabilityProfile("openai:gpt-4o-2024-08-06")`). The only thing /models tells you is whether the model exists in your account / org — useful for a "is this model id valid?" gate.

### Q3 example: Gemini `/v1beta/models` happy-path response

```json
// Source: https://ai.google.dev/api/models (live docs 2026-06-08)
{
  "models": [
    {
      "name": "models/gemini-2.0-flash",
      "baseModelId": "gemini-2.0-flash",
      "version": "2.0",
      "displayName": "Gemini 2.0 Flash",
      "description": "...",
      "inputTokenLimit": 1000000,
      "outputTokenLimit": 4096,
      "supportedGenerationMethods": ["generateContent"],
      "thinking": false,
      "temperature": 1.0,
      "maxTemperature": 2.0,
      "topP": 0.95,
      "topK": 40
    }
  ],
  "nextPageToken": "..."
}
```

Headers: `x-goog-api-key: $GEMINI_API_KEY` (preferred; the existing `gemini.ts:95` uses `?key=` query param which leaks the key in logs — Phase 34 negotiate() should use the header form). Pagination: `pageSize` (default 50, max 1000), `pageToken`.

The `thinking` field at the top level of each model entry is helpful — directly maps to `NegotiatedCapabilities.supports.extendedThinking`. The `supportedGenerationMethods` array distinguishes models that support `generateContent` (chat) from `embedContent` (embeddings). Phase 34 only cares about the former.

### Q4 example: xAI `/v1/models` — endpoint exists, shape inferred

The endpoint exists (live-probed 2026-06-08: HTTP 401 unauthenticated, indicating the endpoint is real and gated by auth). xAI documentation does NOT publish the response shape. xAI's API is broadly OpenAI-compatible; the safe assumption is the OpenAI shape:

```json
// Source: INFERRED based on xAI's OpenAI-compat positioning (CITED: x.ai/api)
{
  "object": "list",
  "data": [
    {
      "id": "grok-4-0709",
      "object": "model",
      "created": 1720000000,
      "owned_by": "xai"
    }
  ]
}
```

Headers: `Authorization: Bearer $XAI_API_KEY`. The xAI negotiator MUST treat the response as sparse (id/object/created/owned_by) and source `supports.*` from the registry (`getCapabilityProfile("xai:grok-4")`). If xAI later adds capability fields, lenient parsing in Pitfall 1 keeps the code working.

**Planner action:** When xAI publishes the actual /models response shape, update the xAI negotiator's parsing — but the contract (always intersect with registry) does NOT change.

### Q5 example: OpenRouter `/api/v1/models` — Phase 33 already proven

```json
// Source: live verified 2026-06-08 (Phase 33 RESEARCH §Standard Stack and live curl probe)
{
  "data": [
    {
      "id": "openai/gpt-oss-120b:free",
      "canonical_slug": "openai/gpt-oss-120b-20251231",
      "context_length": 131072,
      "architecture": { "modality": "text->text", "tokenizer": "OpenAI" },
      "pricing": { "prompt": "0", "completion": "0" },
      "top_provider": {
        "context_length": 131072,
        "max_completion_tokens": 32768,
        "is_moderated": false
      },
      "supported_parameters": ["tools", "tool_choice", "max_tokens", "..."],
      "default_parameters": { ... }
    }
  ]
}
```

NO Authorization header required (live-verified). Phase 33's `scripts/refresh-model-registry.mjs:60-83` pattern reusable for Phase 34's OpenRouter negotiator — but for negotiate() the planner only needs the row matching `modelId`, not the whole feed. Two viable approaches:
1. Fetch the whole feed (407 KB), filter by id — simple, matches refresh script pattern, ~1 round-trip
2. Fetch only `/api/v1/models/{id}` if such an endpoint exists — research needed; the public endpoint pages do reference `/api/v1/models/{id}/endpoints` for endpoint listings

**Advisory:** approach 1 for Phase 34 (matches Phase 33 pattern; the data is already cached at OpenRouter's edge per their docs). The 407 KB cost is amortized across all `negotiate()` calls within the 5-minute TTL.

### Q7 example: inflight-coalescing Map pattern

```typescript
// Source: https://1xapi.com/blog/nodejs-cache-stampede-single-flight-pattern-2026 (Pattern)
// Source: applied inside the factory closure
const inflight = new Map<string, Promise<NegotiatedCapabilities>>();

async function negotiateCapabilities(modelId: string): Promise<NegotiatedCapabilities> {
  const cached = cache.get(modelId);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const existing = inflight.get(modelId);
  if (existing) return existing;     // share the in-flight promise

  const promise = (async () => {
    try {
      const result = await fetchAndNegotiate(modelId);
      if (ttlMs > 0) cache.set(modelId, { result, expiresAt: Date.now() + ttlMs });
      return result;
    } finally {
      inflight.delete(modelId);      // Pitfall 4: ALWAYS clear, in finally
    }
  })();
  inflight.set(modelId, promise);
  return promise;
}
```

Five concurrent calls to `negotiateCapabilities("claude-opus-4")` produce ONE /models fetch. If the fetch fails, all five see the same error (or fallback); the slot clears so the sixth call retries fresh.

### Q9 example: adding the new event kind to RunEventKind

```typescript
// Source: VERIFIED packages/lattice/src/tracing/tracing.ts:11-33 BEFORE Phase 34

export type RunEventKind =
  | "run.start"
  | "artifact.ingested"
  | "context.packed"
  // ... 13 existing v1.0/v1.1 events ...
  // Phase 20 (v1.2): recovery / eviction-resume markers
  | "recovery.start"
  | "recovery.complete"
  | "recovery.failed";

// Phase 34 ADDITION (verified pattern):

export type RunEventKind =
  | "run.start"
  | "artifact.ingested"
  // ... unchanged 13 existing v1.0/v1.1 events ...
  // Phase 20 (v1.2): recovery / eviction-resume markers
  | "recovery.start"
  | "recovery.complete"
  | "recovery.failed"
  // Phase 34 (v1.3): capability-negotiation fallback marker. Fires when
  // adapter.negotiateCapabilities() falls back from /models to the static
  // Phase 33 registry due to transient (5xx, network, timeout) failure.
  // Auth errors (401, 403) do NOT fire this event — they throw NegotiationAuthError instead.
  | "capabilities.negotiation.fallback";
```

The pattern (verified):
1. Add the new literal as the LAST entry in the union — Phase 20 added 3 the same way
2. Inline JSDoc explaining what triggers it
3. The change is breaking for exhaustive-switch consumers (Pitfall 6) — call this out in the changeset

### Q10 example: vitest fixture pattern for `/models` mocking

```typescript
// Source: VERIFIED packages/lattice/src/providers/anthropic.test.ts:17-31
// Phase 34 EXTENSION pattern (same shape, new test file)

import { describe, expect, it } from "vitest";
import { createAnthropicProvider } from "./anthropic.js";
import anthropicModelsOk from "../../test/__fixtures__/quirks/anthropic-models-ok.json";

interface FakeFetchCapture {
  urls: string[];
  inits: RequestInit[];
}

function makeFakeFetch(
  routes: Record<string, { body: unknown; status?: number }>,
): { fetch: typeof fetch; capture: FakeFetchCapture } {
  const capture: FakeFetchCapture = { urls: [], inits: [] };
  const fakeFetch = (async (url: string | URL, init: RequestInit) => {
    const u = String(url);
    capture.urls.push(u);
    capture.inits.push(init);
    // Match by suffix
    for (const [path, { body, status }] of Object.entries(routes)) {
      if (u.endsWith(path)) {
        return new Response(JSON.stringify(body), {
          status: status ?? 200,
          headers: { "content-type": "application/json" },
        });
      }
    }
    return new Response("Not Found", { status: 404 });
  }) as unknown as typeof fetch;
  return { fetch: fakeFetch, capture };
}

describe("Phase 34 Anthropic negotiateCapabilities", () => {
  it("returns live source when /v1/models succeeds", async () => {
    const { fetch } = makeFakeFetch({
      "/v1/models": { body: anthropicModelsOk },
    });
    const adapter = createAnthropicProvider({
      model: "claude-opus-4-6",
      apiKey: "sk-ant-test",
      fetch,
      modelsCacheTtlMs: 0,  // disable cache for test determinism
    });
    const result = await adapter.negotiateCapabilities("claude-opus-4-6");
    expect(result.source).toBe("live");
    expect(result.supports.structuredOutputs).toBe(true);
    expect(result.supports.extendedThinking).toBe(true);
  });

  it("throws NegotiationAuthError on 401", async () => {
    const { fetch } = makeFakeFetch({
      "/v1/models": { body: { error: "unauthorized" }, status: 401 },
    });
    const adapter = createAnthropicProvider({
      model: "claude-opus-4-6",
      apiKey: "sk-ant-bad",
      fetch,
      modelsCacheTtlMs: 0,
      modelsRetryCount: 0,
    });
    await expect(adapter.negotiateCapabilities("claude-opus-4-6")).rejects.toBeInstanceOf(
      NegotiationAuthError,
    );
  });

  it("falls back with registry-fallback source on transient 503", async () => {
    const { fetch } = makeFakeFetch({
      "/v1/models": { body: { error: "service unavailable" }, status: 503 },
    });
    const adapter = createAnthropicProvider({
      model: "claude-opus-4-6",  // present in Phase 33 registry.static.ts
      apiKey: "sk-ant-test",
      fetch,
      modelsCacheTtlMs: 0,
      modelsRetryCount: 0,  // skip retries for test speed
    });
    const result = await adapter.negotiateCapabilities("claude-opus-4-6");
    expect(result.source).toBe("registry-fallback");
    expect(result.modelId).toBe("claude-opus-4-6");
  });
});
```

### Anchor case study (CONTEXT.md `<specifics>`)

```typescript
// Source: NEW packages/lattice/src/providers/quirks-openrouter.test.ts (snippet)
import openrouterModels from "../../test/__fixtures__/quirks/openrouter-models-ok.json";
// snapshot includes the openai/gpt-oss-120b row from Phase 33 fixture set

describe("Phase 34 OpenRouter negotiation anchor case", () => {
  it("openai/gpt-oss-120b:free yields recommendedSanitizers: ['unwrapInternalEnvelope']", async () => {
    const { fetch } = makeFakeFetch({
      "/api/v1/models": { body: openrouterModels },
    });
    const adapter = createOpenRouterProvider({
      model: "openai/gpt-oss-120b",       // factory-level model selection
      apiKey: "sk-or-test",
      fetch,
      modelsCacheTtlMs: 0,
    });
    const result = await adapter.negotiateCapabilities("openai/gpt-oss-120b:free");
    expect(result.modelId).toBe("openai/gpt-oss-120b:free");
    expect(result.knownFailureModes).toContain("internal_envelope_leak");
    expect(result.recommendedSanitizers).toContain("unwrapInternalEnvelope");
    expect(result.source).toBe("live");
  });

  it("the fuzzy variant via top-level helper resolves to the same profile", async () => {
    // The top-level negotiateCapabilities helper (D-02) — adapter has its own method,
    // so the helper delegates. Tests adapter passthrough.
    const adapter = createOpenRouterProvider({ ... });
    const helperResult = await negotiateCapabilities(adapter, "openai/gpt-oss-120b:free");
    expect(helperResult.recommendedSanitizers).toContain("unwrapInternalEnvelope");
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Treat `/v1/models` as a flat id/created/owned_by list (training-data assumption) | Anthropic's `/v1/models` exposes per-model `capabilities` block (live-verified shape) | 2025-Q3 onward; Anthropic capability fields evolved through 2026 | Phase 34's Anthropic negotiator is the "thick" reference impl — populates supports.* directly from upstream truth. Other adapters fall back to registry intersection. |
| Hand-roll request coalescing | Single-flight Map pattern (`Map<key, Promise<T>>` + `.finally`) | 2025-2026 — pattern stabilized in the Node ecosystem | 15 LOC; zero deps; sufficient for Phase 34 — no library needed. |
| `AbortController` + `setTimeout` for fetch timeout | `AbortSignal.timeout(ms)` static method | Node 16+ (backport); fully GA in Node 18+; ideal in Node 24 | Cleaner code. Existing refresh-model-registry.mjs uses the older pattern — Phase 34 can use the newer one in new TS source. |
| Self-hosted /models endpoint compatibility assumptions | Treat as OpenAI-compat shape, source capability flags from registry | Across-the-board — providers don't share a /models capability schema | Phase 34 architecture: every adapter intersects /models truth with registry. Registry profile is the consistent fallback for supports.* booleans. |

**Deprecated/outdated:**
- The assumption that `cache_control: {type: "ephemeral"}` requires the `prompt-caching-2024-07-31` beta header → since 2025, prompt caching is GA on all active Claude models (CITED: https://platform.claude.com/docs/en/build-with-claude/prompt-caching). Phase 34 should not condition `promptCachingSupported` on the beta header.
- The assumption that OpenAI's structured-outputs require the o1-preview snapshot — gpt-4o-2024-08-06+, gpt-4o-mini, and the o1 family ALL support `json_schema` response_format as of 2026 (CITED: developers.openai.com/api/docs/guides/structured-outputs).
- The "OpenAI is always parallel_tool_calls: true" assumption is wrong for gpt-4.1-nano-2025-04-14 (CITED: community post on it returning duplicate calls when parallel enabled). The Phase 34 OpenAI quirks block should reflect the modern model lineup's general posture; the negotiate() call for a specific model id reflects model-specific truth.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | xAI's `/v1/models` endpoint returns the OpenAI-compatible shape (`{object: "list", data: [{id, object, created, owned_by}]}`) | Q4 / Architecture Patterns | LOW — if shape differs, lenient parsing in Pitfall 1 still extracts what's needed (the id) and registry intersection provides the supports.* booleans. Update parsing when xAI documents. [ASSUMED] |
| A2 | OpenRouter `/api/v1/models` remains unauthenticated for read-only access | Q5 / Anti-Patterns | LOW — Phase 33 verified live; live-probed again 2026-06-08 HTTP 200. If OpenRouter adds auth, the openrouter adapter can pass the apiKey it already has. Non-breaking. [VERIFIED via curl + Phase 33 RESEARCH] |
| A3 | Lattice's `RunEventKind` union is the right vocabulary for negotiation events (vs a new union) | Q9 / Architecture Patterns | LOW — verified by tracing.ts:11-33 + Phase 20's pattern of adding 3 events to this exact union. Consistent. [VERIFIED via Read] |
| A4 | The 5-minute D-08 default TTL is appropriate for production services | Pitfall 3 / Standard Stack | LOW — TTL is consumer-tunable via `modelsCacheTtlMs`. 5 min is the industry default for capability discovery caches. If misjudged, consumer overrides. [ASSUMED based on prior art] |
| A5 | Adding `"capabilities.negotiation.fallback"` to `RunEventKind` is a typed breaking change consumers will accept in v1.3 | Pitfall 6 | LOW — Phase 20 set the precedent with `recovery.*` events; CHANGELOG covers it. v1.3 has no prior consumers (rc.0 is staged but not stable). [ASSUMED based on Phase 20 precedent] |
| A6 | LM Studio's "custom chat template risk" is real enough to warrant a quirk flag | Q6 / Pattern 2 | LOW — verified via lmstudio-bug-tracker GitHub issues. If considered overreach, drop the flag; openai-compat narrowed types already document the conservative posture. [CITED: lmstudio-bug-tracker issue 1342] |
| A7 | OpenAI `parallel_tool_calls: false` is universally supported across the modern lineup (gpt-4o family, o1, o3) | Q6 OpenAI quirks | LOW — CITED: OpenAI community confirms function-calling parallelism opt-out works on gpt-4o, gpt-4o-mini, o1, o3, o3-mini. gpt-4.1-nano-2025-04-14 has a documented quirk — model-specific. The adapter-level quirk reflects general posture. [CITED] |

## Open Questions

1. **Should the OpenRouter negotiator hit `/api/v1/models` (full feed) or a per-model `/api/v1/models/{id}` endpoint?**
   - What we know: Phase 33's refresh script hits the full feed; the response is 407 KB / ~341 rows; OpenRouter docs reference `/api/v1/models/{id}/endpoints` for endpoint listings, suggesting a per-model surface exists for some properties.
   - What's unclear: whether `/api/v1/models/{id}` exists for just the metadata.
   - Recommendation: ship the full-feed version for Phase 34 (matches Phase 33 pattern, edge-cached, single HTTP call). The 407 KB is fine within the 5-min TTL. Planner can investigate the per-id endpoint as a Phase 34 stretch goal if appropriate.

2. **Should Phase 34 also bump the `source` enum with `"live-only"` (live hit, no registry profile)?**
   - What we know: CONTEXT.md Claude's Discretion calls it out as a planner judgment.
   - What's unclear: whether downstream consumers will use the distinction.
   - Recommendation: ship `"live"` only for Phase 34 — keep the type minimal. Add `"live-only"` in v1.4 if a consumer asks. Future Phase 36 / Phase 37 may need it; not Phase 34.

3. **Should the Anthropic quirks block include a `toolUseInputSchemaStrict` field given that Anthropic's tool_use input_schema is strictly validated?**
   - What we know: Anthropic's tool_use blocks use JSON Schema with reasonably strict validation, BUT the new `structured_outputs` capability flag in /v1/models suggests Anthropic distinguishes the two surfaces (`structured_outputs.supported` on response_format vs tool_use input_schema strictness).
   - What's unclear: whether the planner wants a separate `toolUseInputSchemaStrict: true` quirk or whether the universal `supportsToolChoice` + per-model negotiation result is sufficient.
   - Recommendation: include `toolUseInputSchemaStrict: boolean` in `AnthropicQuirks` for clarity. Costs one line; documents the contract.

4. **Should `negotiateCapabilities()` accept an optional `signal: AbortSignal` parameter?**
   - What we know: existing `execute()` accepts `signal` via `ProviderRunRequest`. Negotiate() is shorter-lived but could still benefit from cancellation.
   - What's unclear: whether consumers want to cancel a negotiate call.
   - Recommendation: NOT in the Phase 34 contract — keep the surface minimal. The per-call timeout via `AbortSignal.timeout(30_000)` provides natural protection. Add `signal` in v1.4 if asked.

5. **For the LM Studio adapter (no /models endpoint), should `negotiateCapabilities` still emit the `capabilities.negotiation.fallback` event?**
   - What we know: D-12 specifies the event fires on FALLBACK from /models to registry. LM Studio never had /models to fall back FROM.
   - What's unclear: whether `source: "registry"` (intentional no-endpoint) should emit the event for observability symmetry, or whether the event is reserved for transient failures only.
   - Recommendation: emit ONLY for `source: "registry-fallback"`. `source: "registry"` is the documented happy path for LM Studio + custom openai-compat; emitting the event would be noisy false-positive.

## Security Domain

`security_enforcement` is not explicitly set to `false` in `.planning/config.json` (the key is absent — treat as enabled per researcher instructions). Phase 34 is a low-security-risk addition: read-only HTTP calls to documented public endpoints, no new auth surface, no new data persistence.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (passthrough) | Each adapter reuses its existing `apiKey` option for /models calls. NO new auth surface added. NegotiationAuthError signals broken config — does not introduce a new bypass. |
| V3 Session Management | no | No sessions involved. The cache is in-memory per-instance; no cross-session bleed. |
| V4 Access Control | no | Capability disclosure is a public-discovery surface; no access control needed. |
| V5 Input Validation | yes | The `modelId` parameter is consumer-supplied. Used in URL path construction (Pattern 4: `${baseUrl}/v1/models` — no path injection because modelId is matched POST-fetch in the response, never sent to the upstream as a path segment for the providers that return a full list). For OpenRouter's per-model endpoint (Open Question 1), if used, `encodeURIComponent(modelId)` is required — matches the existing `gemini.ts:95` pattern. |
| V6 Cryptography | no | No new crypto; no signing happens in negotiate() path. Registry profile data is build-time-baked; not signed at runtime. |

### Known Threat Patterns for `lattice` stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cache pollution via untrusted `modelId` keys | Tampering | `Map<string, ...>` (not plain object) survives `__proto__` keys per Phase 33 D-09 verification. No mitigation needed. |
| Path traversal via `modelId` in URL construction | Tampering | The /models query is a fixed URL; consumer's `modelId` is only used to FILTER the response. The xAI/OpenAI/Anthropic/Gemini endpoints all return a flat list; the negotiator iterates. The OpenRouter (Open Question 1) per-id endpoint, if used, MUST `encodeURIComponent` (gemini.ts:95 precedent). |
| Cache stampede on TTL expiry → DDoS upstream provider | Denial of Service | Single-flight inflight Map (Q7) coalesces concurrent calls into ONE upstream fetch. Multi-instance cache (D-06 per-instance) means the worst case is one fetch per `createAnthropicProvider({...})` call per TTL window. |
| API key leakage via /models telemetry | Information Disclosure | Existing per-adapter `apiKey` is passed verbatim — same surface that `execute()` already uses. The fetch URL never contains the key (header-based for Anthropic/OpenAI/xAI; query-string for Gemini matches existing gemini.ts:95 — recommended migration to header in Q3 above). |
| Throw of `NegotiationAuthError` from inside `Promise.all` poisons unrelated awaits | Tampering | The error is per-Promise; standard Promise semantics. Documented: NegotiationAuthError fires from negotiate() only, never from execute(). Pitfall 2 mitigation. |

No SAST-detectable changes. No CVE surface introduced.

## Sources

### Primary (HIGH confidence)

- **Anthropic /v1/models live docs** (live-fetched 2026-06-08) — https://platform.claude.com/docs/en/api/models-list — full response shape with capabilities block, pagination, headers, betas
- **Anthropic rate limits docs** (live-fetched 2026-06-08) — https://platform.claude.com/docs/en/api/rate-limits — tier-based RPM/ITPM/OTPM, `retry-after` semantics, rate-limit headers
- **Anthropic prompt caching docs** (live-fetched 2026-06-08) — https://platform.claude.com/docs/en/build-with-claude/prompt-caching — list of supported models, beta header obsolescence
- **OpenAI /v1/models docs** (live-fetched 2026-06-08) — https://developers.openai.com/api/reference/resources/models/methods/list — sparse id/object/created/owned_by shape
- **Gemini /v1beta/models docs** (live-fetched 2026-06-08) — https://ai.google.dev/api/models — supportedGenerationMethods, inputTokenLimit, pagination
- **xAI /v1/models live probe** (live-probed 2026-06-08 via curl) — `HTTP 401` confirms endpoint exists; docs.x.ai/docs/api-reference confirms no public response schema
- **OpenRouter /api/v1/models live probe** (live-probed 2026-06-08 via curl) — `HTTP 200 size=407183` confirms unauthenticated public access; Phase 33 RESEARCH cross-verifies
- **Phase 33 RESEARCH / SUMMARY / CONTEXT** — `/Users/lakshmanturlapati/Desktop/FSB/lattice/.planning/phases/33-model-capability-registry-200-via-openrouter-feed/` — every claim about `getCapabilityProfile`, `findCapabilityProfile`, `stripOpenRouterVariant`, `KnownFailureMode`
- **Existing Lattice adapter source** (Read-verified 2026-06-08) — `packages/lattice/src/providers/{provider,adapters,anthropic,gemini,openrouter,xai,lm-studio}.ts`, `tracing/tracing.ts`, `capabilities/{profile,lookup}.ts`, `index.ts`, `agent/types.ts`
- **Existing Lattice adapter tests** (Read-verified 2026-06-08) — `packages/lattice/src/providers/{anthropic,gemini,openrouter,xai,lm-studio,adapters,parity}.test.ts` — `makeFakeFetch` pattern across 5+ files

### Secondary (MEDIUM confidence)

- **OpenAI structured outputs guide** (WebSearch 2026-06-08) — https://developers.openai.com/api/docs/guides/structured-outputs — gpt-4o-2024-08-06+ and o1 family support json_schema; strict:true for function calling
- **OpenAI parallel_tool_calls community post** (WebSearch 2026-06-08) — https://community.openai.com/t/what-models-support-parallel-tool-calls-and-when-to-use-it/1310788 — model-specific support matrix; gpt-4.1-nano-2025-04-14 known quirk
- **Anthropic extended thinking docs** (WebSearch 2026-06-08) — https://platform.claude.com/docs/en/build-with-claude/extended-thinking — Claude 3.7+ ships extended thinking; thinking parameter shape
- **Gemini structured outputs docs** (WebSearch 2026-06-08) — https://ai.google.dev/gemini-api/docs/structured-output — responseSchema + responseMimeType
- **OpenRouter provider routing docs** (WebSearch 2026-06-08) — https://openrouter.ai/docs/guides/routing/provider-selection — `order`/`only`/`ignore`/`allow_fallbacks`/`require_parameters`/`max_price`/`sort` snake_case fields
- **OpenRouter models endpoint docs** (live-fetched 2026-06-08) — https://openrouter.ai/docs/api/api-reference/models/get-models — full field list (canonical_slug, top_provider, supported_parameters, pricing, default_parameters)
- **LM Studio Jinja template bug tracker** (WebSearch 2026-06-08) — https://github.com/lmstudio-ai/lmstudio-bug-tracker/issues/1342 — chat template incompatibilities; basis for `customChatTemplateRiskFlag` quirk
- **AbortSignal.timeout MDN reference** (WebSearch 2026-06-08) — https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static — Node 16+ backport; Node 24 fully supports
- **Single-flight pattern reference** (WebSearch 2026-06-08) — https://1xapi.com/blog/nodejs-cache-stampede-single-flight-pattern-2026 — Map<key, Promise<T>> + .finally pattern (Q7)
- **xAI quickstart guide** (WebSearch 2026-06-08) — https://docs.x.ai/developers/quickstart — Bearer auth pattern; OpenAI-compat positioning

### Tertiary (LOW confidence — flagged for validation)

- **xAI /v1/models response shape** — INFERRED OpenAI-shape; live-probe confirms endpoint exists (HTTP 401 unauth) but body shape is undocumented. Planner should verify when implementing (a simple `curl -H "Authorization: Bearer $XAI_KEY" https://api.x.ai/v1/models` will return the truth). Recommendation: lenient parse (id + everything else optional); intersect with registry.
- **OpenRouter per-model endpoint** — `/api/v1/models/{id}` MAY exist (Open Question 1) but is not confirmed. Phase 34 should ship the full-feed approach to match Phase 33; investigate per-id endpoint as a v1.4 optimization.

## Metadata

**Confidence breakdown:**
- Anthropic / models live shape: HIGH — live-doc-verified; includes the rich capabilities block
- OpenAI / models live shape: HIGH — live-doc-verified; confirmed sparse
- Gemini / models live shape: HIGH — live-doc-verified; supportedGenerationMethods + thinking field useful
- xAI / models live shape: MEDIUM — endpoint exists (live-probed); body shape inferred from OpenAI-compat positioning
- OpenRouter / models live shape: HIGH — Phase 33 + live-probe + docs cross-verify
- Per-adapter quirk vocabulary: HIGH — verified via doc citations + existing adapter source
- Inflight coalescing pattern: HIGH — single-flight is industry-standard; 15 LOC
- NegotiationAuthError shape: HIGH — verified against AgentDeniedError precedent
- RunEventKind addition: HIGH — verified Phase 20's 3-event addition is the precedent
- Test mocking pattern: HIGH — verified via 5+ existing adapter test files
- Per-instance cache pattern: HIGH — verified via existing factory closures in every adapter
- Pitfall identification: HIGH — most pitfalls derived from Read of existing patterns + Q4 inflight-leak from coalescing literature

**Research date:** 2026-06-08
**Valid until:** ~2026-07-08 — OpenRouter feed and Anthropic /v1/models capabilities block evolve weekly; re-validate before Phase 36-39. xAI may publish /v1/models docs during the Phase 34 implementation window.

## RESEARCH COMPLETE
