# Phase 34: Adapter Quirk Flags + Capability Negotiation API - Context

**Gathered:** 2026-06-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Each of the 7 real provider adapters discloses its behavioral deviations from OpenAI-canonical shape via a typed `quirks` field, and exposes a runtime `negotiateCapabilities()` method that intersects provider-reported truth (via `/models` when available) with Phase 33's static registry.

**Phase 34 is the second layer of the Phase 33-38 model-aware SDK surface.** It consumes the typed registry from Phase 33 and supplies the dispatch keys (`recommendedSanitizers`) that Phase 36 will register implementations under. It also publishes the per-adapter quirks vocabulary that Phase 35 prompt scaffolds may reference.

**Locked by ROADMAP success criteria (NOT a gray area):**
- `ProviderAdapter` gains `quirks: AdapterQuirks` with 5 universal booleans + documented provider-specific flags
- Each of the 7 first-party adapters (OpenAI, OpenAI-compat, Anthropic, Gemini, xAI, OpenRouter, LM Studio) populates the quirks block; quirk-fixture tests assert values match real provider behavior
- Each adapter ships `negotiateCapabilities(modelId): Promise<NegotiatedCapabilities>`
- Adapters with a /models endpoint (Anthropic, OpenAI, Gemini, OpenRouter) query it and intersect with Phase 33's `getCapabilityProfile()`
- Adapters without a /models endpoint (LM Studio local, custom OpenAI-compat) fall back to static profile with `source: "registry"`
- `NegotiatedCapabilities` exposes `{ modelId, contextWindow, supports: { nativeToolCalling, structuredOutputs, parallelToolCalls, extendedThinking, streaming }, knownFailureModes, recommendedSanitizers, source }`
- Anchor case study: `openrouter:openai/gpt-oss-120b:free` -> `recommendedSanitizers` includes `unwrapInternalEnvelope`

**Out of scope for Phase 34:**
- Actual sanitizer implementations (Phase 36)
- Prompt scaffolds (Phase 35)
- Tool-call validation (Phase 37)
- Receipt v1.2 schema (Phase 38)
- Adding new failure modes to Phase 33's `KnownFailureMode` union

</domain>

<decisions>
## Implementation Decisions

### quirks + negotiateCapabilities placement

- **D-01 (quirks location):** `quirks?: AdapterQuirks` is OPTIONAL on the public `ProviderAdapter` interface in `packages/lattice/src/providers/provider.ts`. The 7 first-party adapter factories narrow the return type to require `quirks`. Consumer-provided v1.2 adapters (any adapter that conforms to v1.0's 4-field `ProviderAdapter`) continue to work without modification -- this is intentionally non-breaking.
- **D-02 (negotiateCapabilities location):** `negotiateCapabilities?(modelId: string): Promise<NegotiatedCapabilities>` is OPTIONAL on `ProviderAdapter`. The 7 first-party adapters implement it. A top-level helper function `negotiateCapabilities(adapter: ProviderAdapter, modelId: string): Promise<NegotiatedCapabilities>` orchestrates: if `adapter.negotiateCapabilities` exists, delegate to it; otherwise synthesize from Phase 33 registry.
- **D-03 (quirks shape):** Per-adapter typed sub-interface. `AdapterQuirks` is the base with the 5 SC-1 universal booleans (`supportsToolChoice`, `parallelToolCalls`, `structuredOutputs`, `responseFormatHonored`, `streamingDiverges`). Each adapter narrows: `AnthropicQuirks extends AdapterQuirks { promptCachingSupported: boolean; extendedThinkingSupported: boolean }`, `OpenAIQuirks extends AdapterQuirks { strictModeSupported: boolean; structuredOutputsTier2: boolean }`, etc. Consumers reading `adapter.quirks` get adapter-specific autocomplete after a `if (adapter.id === 'anthropic')` discriminant check.
- **D-04 (consumer-adapter fallback):** When `adapter.negotiateCapabilities` is absent, the top-level helper looks up canonical key `${adapter.id}:${modelId}` via Phase 33's `getCapabilityProfile`, maps the resulting `ModelCapabilityProfile` to a `NegotiatedCapabilities` shape, and returns it with `source: "registry"` (same value as adapters that intentionally have no /models endpoint -- LM Studio, openai-compat). Consumer adapters get useful behavior out of the box without writing migration code.

### /models endpoint caching policy

- **D-05 (caching mode):** In-memory TTL Map. Default TTL = 5 minutes. Per-adapter instance (each `createAnthropicProvider({...})` call gets its own Map). Standard SDK pattern.
- **D-06 (cache scope):** Per-instance cache. Two `createAnthropicProvider({apiKey: ...})` calls with different keys do NOT share. Matches Lattice's existing config-per-instance pattern; no cross-contamination if one consumer's call burns the quota.
- **D-07 (eviction policy):** Lazy expiry on read. No background `setInterval`/timer (would pin the Node event loop -- anti-pattern for libraries serving CLI tools, Workers). Entry stays in Map until next read; on read, check `expiresAt < now` -> refetch.
- **D-08 (TTL configurability):** `modelsCacheTtlMs` factory option per adapter. Default 5 min if omitted; `0` disables (always refetch -- testing); `Infinity` disables expiry (process-lifetime within the instance). Tests pass 0 to validate every call hits the wire.

### /models fetch-failure policy

- **D-09 (default failure handling):** Fall back to Phase 33 registry with `source: "registry-fallback"` -- a DISTINCT `source` value from `"registry"` (intentional no-endpoint adapter) and `"live"` (/models succeeded). Consumer can observe via the `source` field whether the result was live or fallback. Mirrors D-18 in Phase 33's OpenRouter drift gate.
- **D-10 (auth-error policy):** 401/403 throw `NegotiationAuthError` (typed exported class). Auth errors indicate broken `apiKey` config -- silently falling back would hide a real bug. Only transient errors (network, timeout, 5xx) fall back.
- **D-11 (retry policy):** 2 retries with exponential backoff on transient errors: immediate + 200ms + 1s = 3 total attempts before fallback. Total budget ~1.2s + base RTT. Matches `scripts/refresh-model-registry.mjs` retry pattern from Phase 33 (which uses 3-retry exponential backoff). Tests can override via `modelsRetryCount` factory option (default 2; 0 disables).
- **D-12 (observability):** Emit `capabilities.negotiation.fallback` event via Lattice's existing `RunEventKind` vocabulary (the v1.2 trace surface). Event payload: `{ adapter: CapabilityAdapter, modelId: string, errorReason: string, fallbackSource: "registry-fallback" | "registry" }`. Consumers wire it via existing tracing hooks. Forward-compatible if Phase 36 wants to react to fallbacks.

### recommendedSanitizers source / Phase 36 coupling

- **D-13 (SanitizerKey type):** Closed string-literal union `type SanitizerKey = "stripReasoningTags" | "stripChatTemplateArtifacts" | "unwrapInternalEnvelope"` mirroring Phase 36's planned sanitizer registry. Phase 36 ships implementations registered under exactly these 3 ids. Adding a 4th sanitizer in v1.4 is a typed breaking change (mirrors Phase 33's `KnownFailureMode` discipline). `NegotiatedCapabilities.recommendedSanitizers: readonly SanitizerKey[]`.
- **D-14 (derivation table):** Registry-driven via `SANITIZER_BY_FAILURE_MODE: Record<KnownFailureMode, SanitizerKey | null>` constant. Initial mapping:
  - `internal_envelope_leak` -> `"unwrapInternalEnvelope"`
  - `reasoning_tag_leak` -> `"stripReasoningTags"`
  - `template_artifact_leak` -> `"stripChatTemplateArtifacts"`
  - `system_prompt_echo` -> `null` (consumer-side prompt engineering, not a sanitizer)
  - `hallucinated_tool_name` -> `null` (Phase 37 tool-call validator territory, not a sanitizer)
  - `malformed_tool_arguments` -> `null` (Phase 37 tool-call validator territory)
  - `premature_termination` -> `null` (consumer-side max_tokens config)
- **D-15 (mapping location):** New module `packages/lattice/src/capabilities/sanitizer-recommendations.ts` -- sibling to `profile.ts` and `lookup.ts`. Exports `SanitizerKey` union + `SANITIZER_BY_FAILURE_MODE` record + helper `getRecommendedSanitizers(modes: readonly KnownFailureMode[]): readonly SanitizerKey[]` that maps each mode through the table and filters nulls. Phase 36 will import `SanitizerKey` from here when registering implementations.
- **D-16 (null encoding):** `Record<KnownFailureMode, SanitizerKey | null>` -- exhaustive across all 7 KnownFailureMode values; modes without a sanitizer are explicitly `null`. `getRecommendedSanitizers` filters nulls so `recommendedSanitizers` always contains real keys. Preserves the exhaustive-switch gate over `KnownFailureMode` -- future additions to the union force an explicit decision (sanitizer key OR null).

### Claude's Discretion

These are implementation details downstream agents (researcher, planner) decide:

- Exact field names for per-adapter quirks (e.g., `promptCachingSupported` vs `supportsPromptCaching` -- consistent style across adapters)
- Quirk fixture file format (JSON vs TS literal) and per-adapter test layout
- Whether `negotiateCapabilities()` does inflight-request coalescing (multiple concurrent calls for the same modelId share one fetch -- advisory: yes, simple to implement)
- Exact `NegotiationAuthError` class shape (extends Error; carries `adapter`, `httpStatus`, original message)
- Whether `source: "live"` distinguishes "/models hit, registry intersected" from "/models hit, registry had no profile" -- advisory: yes, add `source: "live-only"` if needed (Claude's call during planning)
- Logging format for the `capabilities.negotiation.fallback` event payload
- Test fixture strategy: mock /models endpoint responses per adapter (each adapter has its own happy-path + 401 + 503 fixture)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 33 surface (foundation -- consumed by every Phase 34 task)
- `/Users/lakshmanturlapati/Desktop/FSB/lattice/.planning/phases/33-model-capability-registry-200-via-openrouter-feed/33-CONTEXT.md` -- D-05 (adapter+originFamily), D-06 (closed adapter enum), D-08 (canonical key), D-12/D-13 (KnownFailureMode union)
- `/Users/lakshmanturlapati/Desktop/FSB/lattice/.planning/phases/33-model-capability-registry-200-via-openrouter-feed/33-SUMMARY.md` -- live registry state (337 profiles)
- `/Users/lakshmanturlapati/Desktop/FSB/lattice/packages/lattice/src/capabilities/profile.ts` -- `ModelCapabilityProfile`, `CapabilityAdapter`, `KnownFailureMode`, etc.
- `/Users/lakshmanturlapati/Desktop/FSB/lattice/packages/lattice/src/capabilities/lookup.ts` -- `getCapabilityProfile`, `findCapabilityProfile`
- `/Users/lakshmanturlapati/Desktop/FSB/lattice/packages/lattice/src/capabilities/index.ts`

### Primary research input (drives Phase 33-38)
- `/Users/lakshmanturlapati/Desktop/FSB/automation/lattice/MULTI-MODEL-OUTPUT-CONTRACT-RESEARCH.md` -- Improvement 5 (negotiation API) + Improvement 7 (adapter quirk flags) are this phase's source; Part 6 has the proposed `NegotiatedCapabilities` shape

### Existing adapter surface (do not break)
- `/Users/lakshmanturlapati/Desktop/FSB/lattice/packages/lattice/src/providers/provider.ts` -- existing `ProviderAdapter` interface (4 fields); D-01 and D-02 add optional fields here
- `/Users/lakshmanturlapati/Desktop/FSB/lattice/packages/lattice/src/providers/adapters.ts` -- `createOpenAIProvider`, `createOpenAICompatibleProvider`, `createAISdkProvider` factories
- `/Users/lakshmanturlapati/Desktop/FSB/lattice/packages/lattice/src/providers/anthropic.ts` -- Anthropic factory (has /models endpoint to query)
- `/Users/lakshmanturlapati/Desktop/FSB/lattice/packages/lattice/src/providers/gemini.ts` -- Gemini factory (has /models endpoint -- already has some models code, check before duplicating)
- `/Users/lakshmanturlapati/Desktop/FSB/lattice/packages/lattice/src/providers/openrouter.ts` -- OpenRouter factory (the /models endpoint already used by Phase 33's refresh script -- pattern reusable)
- `/Users/lakshmanturlapati/Desktop/FSB/lattice/packages/lattice/src/providers/xai.ts` -- xAI factory (verify whether /models exists; xAI has been adding endpoints)
- `/Users/lakshmanturlapati/Desktop/FSB/lattice/packages/lattice/src/providers/lm-studio.ts` -- LM Studio (local; no remote /models endpoint -- source: "registry" path)

### Observability vocabulary (for D-12 event)
- `/Users/lakshmanturlapati/Desktop/FSB/lattice/packages/lattice/src/runtime/run-events.ts` (or wherever `RunEventKind` lives) -- add `capabilities.negotiation.fallback` as a new event kind
- v1.2 Phase 19-22 SUMMARYs for the existing event-vocabulary conventions

### Roadmap + requirements
- `/Users/lakshmanturlapati/Desktop/FSB/lattice/.planning/ROADMAP.md` -- Phase 34 section + risks (no specific Phase 34 risk entry)
- `/Users/lakshmanturlapati/Desktop/FSB/lattice/.planning/REQUIREMENTS.md` -- existing 59 REQ-IDs (CAPS-01..05 from Phase 33); QUIRK-01..03 + NEG-01..02 to be authored in Phase 34 plan

### Phase 36 forward-compat (Phase 34 ships dispatch keys, Phase 36 ships implementations)
- Phase 36 will register sanitizers under the exact `SanitizerKey` ids defined in D-13. Phase 36's planner reads this CONTEXT.md to know the union shape.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`getCapabilityProfile` + `findCapabilityProfile` from Phase 33** -- the registry fallback in D-04 uses these directly. No new lookup code needed.
- **`scripts/refresh-model-registry.mjs` retry/backoff pattern from Phase 33** -- the 3-attempt exponential backoff in D-11 mirrors this pattern. Reuse the math: immediate, 200ms, 1s.
- **Existing factory pattern in adapters.ts/anthropic.ts/gemini.ts/etc.** -- D-08 (`modelsCacheTtlMs` factory option) extends the existing options-object pattern. No new factory architecture.
- **`RunEventKind` from v1.2 Phase 17 (BAND-01..05)** -- the `capabilities.negotiation.fallback` event in D-12 extends this existing observability vocabulary. New event kind; same wiring as existing events.

### Established Patterns

- **Per-instance state in factories** -- every existing factory closes over instance state (`apiKey`, `baseUrl`, etc.). D-05/D-06 cache lives in the same closure -- not module-level.
- **Closed string-literal unions throughout v1.1/v1.2** -- D-13's `SanitizerKey` follows this pattern (see `KnownFailureMode`, `ResumePolicy`, `RunEventKind`).
- **Per-package src/index.ts re-export discipline (PKG-01/INDEX-01)** -- new public exports MUST land in `packages/lattice/src/index.ts`: `AdapterQuirks`, `SanitizerKey`, `NegotiatedCapabilities`, the top-level `negotiateCapabilities` helper, `NegotiationAuthError`, `SANITIZER_BY_FAILURE_MODE`, `getRecommendedSanitizers`.
- **`Record<KnownFailureMode, X>` over partial** -- Phase 33's D-14 used `Record<TrainingClass, ...>` for the same exhaustiveness reason; D-16 follows the same pattern.

### Integration Points

- **Public surface** -- `packages/lattice/src/index.ts` adds ~7 new exports per D-01..D-16
- **tsd type-level tests** (`packages/lattice/test-d/`) -- new test file `test-d/quirks-negotiation.test-d.ts` for exhaustive switch over `SanitizerKey`, `AdapterQuirks` discriminant narrowing, and `NegotiatedCapabilities` shape
- **vitest per-adapter quirk fixtures** -- new fixture pattern under `packages/lattice/test/__fixtures__/quirks/` (or similar) with one happy-path + one /models-401 + one /models-503 fixture per adapter that has a /models endpoint
- **No router touching** -- like Phase 33, Phase 34 is parallel to v1.0 routing. The router still consumes `ModelCapability` (provider.ts); `NegotiatedCapabilities` is a second, opt-in query surface.

</code_context>

<specifics>
## Specific Ideas

**Anchor case study (CARRIED FORWARD from Phase 33):** `session_1780792387779` -- `openai/gpt-oss-120b:free` on OpenRouter emitting `{"summary": "Greeted the user."}` to the user.

Phase 34 verification MUST assert this end-to-end:
1. `const adapter = createOpenRouterProvider({ apiKey: process.env.OPENROUTER_API_KEY })`
2. `const result = await adapter.negotiateCapabilities("openrouter:openai/gpt-oss-120b")` (or via the top-level helper, depending on test setup)
3. `result.modelId === "openrouter:openai/gpt-oss-120b"`
4. `result.knownFailureModes.includes("internal_envelope_leak")`
5. `result.recommendedSanitizers.includes("unwrapInternalEnvelope")`
6. `result.source === "live"` (or `"registry-fallback"` if OpenRouter /models 5xx'd during the test -- both acceptable)

The fuzzy variant must work too: `await negotiateCapabilities(openrouterAdapter, "openai/gpt-oss-120b:free")` should resolve to the same profile via `findCapabilityProfile`'s suffix-strip path.

**Anti-shape for the negotiate output (do NOT do this):** `NegotiatedCapabilities.supports.nativeToolCalling: boolean` -- when the profile's `toolCallSurface` is `"native_strict"`, this is `true`; when it's `"native_lenient"`, this is `true` (the boolean LOSES the strict vs lenient distinction). Consumers who need the underlying enum should look at the profile directly via `getCapabilityProfile`. `NegotiatedCapabilities` is the simplified consumer-facing view; the registry profile is the source of truth.

**Per-adapter quirks initial vocabulary (research-doc Improvement 7 sketch, planner to refine):**
- AnthropicQuirks: + `promptCachingSupported`, `extendedThinkingSupported`
- OpenAIQuirks: + `strictModeSupported`, `structuredOutputsTier2`
- OpenAICompatQuirks: + `responseFormatHonored` (may differ from base flag for self-hosted servers)
- AnthropicQuirks: + `toolUseInputSchemaStrict`
- GeminiQuirks: + `responseSchemaSupported`, `safetySettingsConfigurable`
- xAIQuirks: + `reasoningTokensReported`
- OpenRouterQuirks: + `providerRoutingArraySupported`, `floorPricingHints`
- LmStudioQuirks: + `customChatTemplateRiskFlag` (LM Studio servers can ship with broken templates)

These are starting hints; the per-adapter quirks discovery is a Phase 34 plan task that requires reading each provider's docs.

</specifics>

<deferred>
## Deferred Ideas

- **Phase 36 sanitizer implementations** -- D-13 locks the 3 SanitizerKey ids that Phase 36 will register. The implementations themselves (`stripReasoningTags`, `stripChatTemplateArtifacts`, `unwrapInternalEnvelope`) ship in Phase 36.
- **inflight-request coalescing for negotiate()** -- if 5 concurrent calls hit the same `negotiate("anthropic:claude-opus-4")` at once, do they share one /models fetch? Advisory: yes (simple Promise<T> cache), but Claude's discretion during planning.
- **Telemetry headers on /models calls** -- whether `User-Agent: lattice/1.3.0` is sent on outbound /models requests to help providers track our usage. Advisory: yes. Detail for the planner.
- **`source: "live-only"` distinct from `"live"`** -- if /models returned data but `getCapabilityProfile` had no static profile to intersect with, the result is /models-only data. Whether to distinguish in `source` is a Claude-discretion call.
- **NegotiationAuthError -> ConsumerCallback for refresh** -- consumers with OAuth tokens may want a refresh hook on 401. Advisory: NOT in Phase 34; design for v1.4 if a consumer asks.
- **Quirks-aware routing** -- the v1.0 router does NOT read quirks. Future phase may want a quirks-aware routing strategy (e.g., "prefer adapters with `supportsToolChoice: true` when the request uses tool_choice"). Not Phase 34's responsibility; not even v1.3.

### Reviewed Todos (not folded)

None -- no pending todos matched Phase 34's scope at discuss time.

</deferred>

---

*Phase: 34-Adapter Quirk Flags + Capability Negotiation API*
*Context gathered: 2026-06-08*
