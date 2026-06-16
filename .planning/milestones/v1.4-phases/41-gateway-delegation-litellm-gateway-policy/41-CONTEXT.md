# Phase 41: Gateway Delegation - LiteLLM + Gateway Policy - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 41 adds a first-class LiteLLM gateway helper and typed gateway policy passthrough while preserving Lattice-owned deterministic routing. In scope: `createLiteLLMProvider`, additive gateway metadata/policy fields, plan/event accounting that separates Lattice's selected adapter/model from gateway hints or observed gateway metadata, fake-fetch tests for LiteLLM-style requests, and public-surface/type guard updates. Out of scope: running or embedding LiteLLM, adding a Python SDK/runtime dependency, building a Lattice-owned gateway, OpenRouter multi-model fallback arrays, streaming, realtime sessions, hosted observability, or Phase 49 FSB dogfood.

</domain>

<decisions>
## Implementation Decisions

### LiteLLM Provider Helper
- **D-01:** `createLiteLLMProvider` should be a thin wrapper over `createOpenAICompatibleProvider`, matching the existing `createLmStudioProvider`, `createOpenRouterProvider`, and `createXaiProvider` wrapper pattern.
- **D-02:** The helper should default to provider id `litellm` and a local LiteLLM proxy base URL compatible with LiteLLM's documented local proxy on port `4000`; callers must be able to override `baseUrl` for hosted proxies and `/v1` deployments.
- **D-03:** The helper must not introduce the LiteLLM Python SDK, a LiteLLM process/runtime dependency, or a new transport abstraction. Lattice calls the gateway over OpenAI-compatible HTTP.
- **D-04:** Authentication follows the existing OpenAI-compatible convention: `apiKey` is optional, omitted means no Authorization header, and a provided key is sent as a Bearer token. If additional gateway headers are added, they must be explicit and redactable.
- **D-05:** Capability negotiation should stay registry-only for this phase unless planning finds a cheap, well-specified LiteLLM discovery endpoint. Do not turn Phase 41 into live catalog refresh; that belongs to Phase 42.

### Gateway Policy Passthrough
- **D-06:** Gateway routing hints should use a typed additive object rather than an unstructured metadata bag. The planner may choose the exact name (`gateway`, `gatewayPolicy`, or similar), but it should cover route tags, provider preference hints, and gateway metadata required by GATE-02.
- **D-07:** Gateway hints are advisory to the gateway. They must not mutate Lattice's deterministic route decision, route score, fallback chain, or no-route behavior.
- **D-08:** LiteLLM metadata should be serialized in the request body in the OpenAI-compatible/LiteLLM-supported shape. Unsupported or provider-specific fields should be omitted or isolated, not sprayed into the top-level request body.
- **D-09:** Sensitive gateway data, especially API keys and custom auth headers, must not appear in plans, events, errors, receipts, snapshots, or test snapshots.

### Route Accounting and Events
- **D-10:** `ExecutionPlan.route.selected` remains the Lattice-selected adapter/model, for example `{ providerId: "litellm", modelId: options.model }`. Gateway-side routing hints or resolved upstream model data must live in additive metadata fields.
- **D-11:** Run events should expose gateway usage without making the route opaque. `router.candidates` and `provider.attempt` metadata are good first candidates for fields such as gateway adapter id, route tags, gateway model hint, and observed gateway model.
- **D-12:** If the gateway response exposes a `model` or equivalent resolved-model field, record it as observed gateway metadata. Do not replace Lattice's selected `route.modelId` with that value in Phase 41.
- **D-13:** Receipts should continue to attest to the Lattice route. Any terminal receipt changes for gateway fallback/resolved model should be planned carefully with Phase 42's OpenRouter fallback requirements rather than hidden in the LiteLLM helper.

### Gateway Fallback Defaults
- **D-14:** Default behavior should preserve replayability: no silent gateway fallback should be enabled by Lattice by default for capability-critical runs.
- **D-15:** If a gateway supports fallback/load-balancing hints, expose them only as explicit opt-in gateway policy fields and record the hint separately from Lattice's own fallback chain.
- **D-16:** Tests must prove gateway fallback metadata does not make route selection opaque or non-replayable.

### Public Surface and Tests
- **D-17:** Adding `createLiteLLMProvider` is a public root export and must update the Phase 40 public value-export inventory plus package entrypoint type tests.
- **D-18:** If a `LiteLLMProviderOptions` type or `LiteLLMQuirks` type is added, cover it through package-root `tsd` tests. If the helper reuses `OpenAICompatQuirks`, document that explicitly.
- **D-19:** Fake-fetch tests should cover LiteLLM base URL normalization, request body shape, optional/provided auth headers, gateway metadata serialization, non-OK error taxonomy, raw response preservation, and usage normalization.

### the agent's Discretion
- The planner may choose the exact public option names for gateway hints and whether those hints live on provider options, run intent policy, or both, as long as the final shape is typed, additive, and does not blur Lattice's selected route.
- The planner may choose whether LiteLLM gets a dedicated `LiteLLMQuirks` subtype or reuses `OpenAICompatQuirks`. Prefer the smallest surface that still helps users understand gateway-specific behavior.
- The planner may split implementation into one or more plans, but should keep the core wrapper/policy/event/test work together enough that the accounting contract is verified end-to-end.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope
- `.planning/ROADMAP.md` - Phase 41 goal, dependency, and success criteria.
- `.planning/REQUIREMENTS.md` - GATE-01, GATE-02, and GATE-03.
- `.planning/PROJECT.md` - v1.4 provider breadth scope and hosted-gateway out-of-scope boundary.
- `.planning/research/SUMMARY.md` - v1.4 research decisions: thin LiteLLM wrapper, no new routing abstraction, and `allow_fallbacks: false` default rationale.
- `.planning/phases/40-package-version-stamping-public-surface-guardrails/40-CONTEXT.md` - public-surface and dependency boundary guardrails that Phase 41 must obey.

### Provider Wrapper Patterns
- `packages/lattice/src/providers/adapters.ts` - `OpenAICompatibleProviderOptions`, `createOpenAICompatibleProvider`, request construction, usage normalization, and registry-only negotiation path.
- `packages/lattice/src/providers/lm-studio.ts` - closest thin-wrapper pattern for an OpenAI-compatible local gateway/server with optional auth.
- `packages/lattice/src/providers/openrouter.ts` - OpenAI-compatible gateway wrapper pattern with gateway-specific quirks and live model negotiation.
- `packages/lattice/src/providers/xai.ts` - OpenAI-compatible wrapper pattern with provider-specific quirks and sparse `/models` negotiation.
- `packages/lattice/src/providers/quirks.ts` - `AdapterQuirks` and per-adapter subtype pattern.
- `packages/lattice/src/providers/provider.ts` - `ProviderRunRequest`, `ProviderRunResponse`, and `ProviderAdapter` extension rules.

### Runtime Accounting
- `packages/lattice/src/runtime/create-ai.ts` - deterministic route selection, `ProviderRunRequest` construction, `router.candidates`/`provider.attempt` events, attempts, and receipt issuance.
- `packages/lattice/src/plan/plan.ts` - `ExecutionPlan.metadata`, stage metadata, selected route, fallback chain, and attempt record types.
- `packages/lattice/src/tracing/tracing.ts` - allowed run-event kinds and metadata shape.
- `packages/lattice/src/replay/replay.ts` - replay envelope behavior to check before adding gateway metadata that must be replayable/redactable.

### Public Surface and Package Tests
- `packages/lattice/src/index.ts` - package root exports; add LiteLLM exports here intentionally.
- `packages/lattice/test/public-surface.test.ts` - exact public value-export inventory added in Phase 40.
- `packages/lattice/test-d/index.test-d.ts` - package entrypoint smoke test that should include new Phase 41 exports.
- `packages/lattice/test-d/quirks-negotiation.test-d.ts` - type-level coverage for adapter quirks and negotiation surfaces.
- `packages/lattice/src/providers/adapters.test.ts` - OpenAI-compatible fake-fetch, usage, error, sanitizer, and tool-call tests.
- `packages/lattice/src/providers/lm-studio.test.ts` - wrapper tests for default base URL, optional auth, quirks, and registry-only negotiation.
- `packages/lattice/src/providers/openrouter.test.ts` - gateway-specific negotiation/event tests.
- `packages/lattice/src/providers/parity.test.ts` - all-provider parity tests that may need a LiteLLM row or an explicit exclusion.
- `packages/lattice/test/context-provider-replay-tools.test.ts` - OpenAI-compatible gateway-style integration and replay coverage.

### LiteLLM References
- `https://docs.litellm.ai/docs/` - LiteLLM proxy quickstart; confirms the gateway is OpenAI-compatible and commonly runs on port `4000`.
- `https://docs.litellm.ai/docs/proxy/user_keys` - LiteLLM request examples, supported OpenAI-compatible endpoints, metadata pass-through, and mapped OpenAI-style errors.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createOpenAICompatibleProvider` already performs the POST to `${baseUrl}/chat/completions`, builds OpenAI-style messages, conditionally sends Bearer auth, preserves `rawResponse`, and normalizes OpenAI-style usage.
- `createLmStudioProvider` shows how to delegate `execute()` and capabilities to OpenAI-compatible HTTP while overriding id, default base URL, quirks, and registry-only negotiation.
- `ProviderRunRequest.policy`, `ExecutionPlan.metadata`, stage metadata, and run-event metadata already provide additive places for gateway hints without changing the core route candidate shape.
- `packages/lattice/test/public-surface.test.ts` will fail unless `createLiteLLMProvider` is intentionally added to the public value export inventory.

### Established Patterns
- First-party provider factories narrow their return type to expose quirks and `negotiateCapabilities`.
- Consumer adapters without a stable `/models` endpoint use `source: "registry"` and do not emit fallback events for the intentional no-endpoint happy path.
- OpenAI-compatible wrappers use fake-fetch tests instead of requiring live gateway services.
- Public types are checked through package-root `tsd`; runtime value exports are checked through the Phase 40 inventory.
- Sensitive headers are already treated carefully in negotiation error metadata; Phase 41 should preserve that standard for gateway headers and policy metadata.

### Integration Points
- Provider helper work connects to a new `packages/lattice/src/providers/litellm.ts` file, `packages/lattice/src/providers/quirks.ts` if a new quirks subtype is needed, and `packages/lattice/src/index.ts`.
- Gateway policy passthrough connects to `OpenAICompatibleProviderOptions`, `ProviderRunRequest`, `RunIntent`/policy plumbing in `packages/lattice/src/runtime/create-ai.ts`, or a narrowly scoped provider option depending on the planned API.
- Route/event accounting connects to `buildPlan`, `provider.attempt` event emission, `ExecutionPlan.metadata`, and replay/redaction helpers.
- Verification connects to provider fake-fetch tests, runtime plan/event tests, public-surface tests, package `tsd`, and parity tests.

</code_context>

<specifics>
## Specific Ideas

- Start from the smallest user-facing API: `createLiteLLMProvider({ model, baseUrl?, apiKey?, gateway? })`, delegating to the OpenAI-compatible provider.
- For LiteLLM metadata, prefer a typed object that serializes to the documented `metadata` request-body field rather than a fully open `extraBody` escape hatch.
- The plan/event language should read like: Lattice selected `litellm` + model `X`; gateway hints were `Y`; gateway response observed model `Z` if available.
- Use fake responses with OpenAI-style `usage`, OpenAI-style error bodies, LiteLLM metadata, and a response-level `model` field to prove normalization and accounting.

</specifics>

<deferred>
## Deferred Ideas

- OpenRouter `models[]` fallback arrays, resolved model on terminal receipt, and gateway fallback replay semantics belong to Phase 42.
- Streaming gateway behavior belongs to Phases 43 and 44.
- Full FSB-via-npm dogfood across the new gateway surface belongs to Phase 49, though Phase 41 should leave clear notes for that downstream validation.
- Hosted gateway/control-plane behavior remains out of scope for v1.4.

</deferred>

---

*Phase: 41-gateway-delegation-litellm-gateway-policy*
*Context gathered: 2026-06-15*
