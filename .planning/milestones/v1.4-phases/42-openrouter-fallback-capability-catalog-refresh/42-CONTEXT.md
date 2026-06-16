# Phase 42: OpenRouter Fallback + Capability Catalog Refresh - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 42 adds explicit OpenRouter multi-model fallback support and makes OpenRouter capability catalog refreshes deterministic, reviewable, and non-flaky. In scope: OpenRouter fallback model arrays, resolved-model accounting in result/plan/event/receipt surfaces, registry refresh improvements that capture OpenRouter feed metadata, and tests proving gateway fallback does not make Lattice routing opaque. Out of scope: adding `@openrouter/sdk`, runtime catalog refresh during `ai.run()`, streaming behavior, Anthropic Messages `fallbacks`, OpenRouter Auto Router policy design, hosted gateway behavior, and FSB-via-npm validation.

</domain>

<decisions>
## Implementation Decisions

### OpenRouter Fallback Request Shape
- **D-01:** Add an explicit OpenRouter fallback-model option on `createOpenRouterProvider` rather than a generic raw request-body escape hatch. The planner may choose the exact name, but `fallbackModels` is the preferred shape because it states the Lattice-level intent.
- **D-02:** Keep the adapter on the existing OpenAI-compatible HTTP path. Do not add `@openrouter/sdk` or a new transport abstraction.
- **D-03:** Serialize fallback models in the OpenRouter documented chat-completions shape: primary `model` remains the configured Lattice route model, and fallback candidates are emitted as a `models` array in the request body.
- **D-04:** Preserve caller order in the fallback array. Validate only enough to avoid meaningless payloads, such as empty model ids. Do not invent ranking, deduplication, or automatic model selection inside Lattice.
- **D-05:** Fallback arrays are opt-in. Do not enable silent OpenRouter model fallback by default for capability-critical runs.
- **D-06:** If OpenRouter provider-routing options are needed, route them through the existing typed `gateway` policy surface where possible. Avoid a broad `extraBody` public API in this phase.

### Resolved Model Accounting
- **D-07:** Keep `ExecutionPlan.route.selected.modelId` and the receipt route `capabilityId` as the Lattice-requested primary model. Gateway-side fallback must not rewrite Lattice's deterministic route decision.
- **D-08:** Treat OpenRouter's response-level `model` field as the served/resolved model. When present, propagate it from `ProviderRunResponse.gateway.observedModel` into run events, plan attempt metadata, terminal result metadata, and receipt `model.observed`.
- **D-09:** Add an optional terminal result metadata field for gateway observations. Prefer a small `gateway` field on `RunSuccess` / `RunFailure` over forcing users to mine events for the resolved model.
- **D-10:** Receipt `model.requested` remains the Lattice-requested model. Receipt `model.observed` should carry the OpenRouter served model when OpenRouter reports it.
- **D-11:** Receipt `modelClass` should prefer the observed served model when it has a registry profile, then fall back to the requested model. This makes a fallback receipt classify the model that actually served the request while preserving the requested route.
- **D-12:** Events and plan metadata should name all three concepts distinctly: requested model, fallback candidates, and observed/served model. Avoid ambiguous labels such as just `model` in new metadata.

### Catalog Refresh and Registry Diff Behavior
- **D-13:** Catalog refresh remains build-time/manual/scheduled. It must never run during `ai.run()` and must never mutate routing data silently at runtime.
- **D-14:** Extend the existing OpenRouter registry refresh path instead of creating a second generator. `scripts/refresh-model-registry.mjs`, `scripts/capabilities/classifier.mjs`, `packages/lattice/src/capabilities/registry.generated.ts`, and the Phase 33 tests are the starting point.
- **D-15:** Generated output must stay deterministic: no timestamps, stable row sorting, stable key order, trailing newline, and bit-exact `--check` behavior.
- **D-16:** Capture OpenRouter feed fields needed by ORCAT-04 when present: context window, pricing, input/output modalities, supported parameters, and any supported-parameter derivations already used for tool/structured-output surfaces.
- **D-17:** Prefer additive typed fields on `ModelCapabilityProfile` or a sibling generated structure over overloading existing fields with loosely shaped metadata. Public type tests must prove the new fields are visible and readonly.
- **D-18:** Feed parsing stays lenient. Unknown, missing, or malformed optional fields should produce explicit warnings or conservative defaults, not generator crashes unless the row cannot produce a stable id.
- **D-19:** Keep PR-time CI network-free. Scheduled/manual refresh may contact OpenRouter and open a reviewable PR; normal CI should validate the committed generated files, fixtures, and renderer behavior without live network calls.
- **D-20:** Refresh failures must be visible but non-flaky in scheduled/manual contexts. Existing `--check` skip-on-fetch-failure behavior is acceptable if logs clearly say the refresh was skipped rather than passed as fresh.
- **D-21:** The current OpenRouter docs show a bearer-authenticated models endpoint, while existing code was built around a public unauthenticated discovery endpoint. Planning should verify the live behavior. If auth is required, add optional script-only auth via environment variable, redact it from logs, and never use runtime user keys for catalog generation.

### Verification and Public Surface
- **D-22:** Tests must prove fallback payload shape, no `@openrouter/sdk` dependency, fallback candidates excluded from Lattice's own fallback chain, response `model` captured as observed model, and observed model propagated into result, plan, event, and receipt surfaces.
- **D-23:** Registry refresh tests must cover deterministic rendering, drift detection, OpenRouter feed fixture transformation, pricing strings, modality arrays, supported parameters, context-window precedence, and unknown-prefix warnings.
- **D-24:** Public-surface guardrails from Phase 40 apply to every new export or public type. Update `public-surface.test.ts`, package-root `tsd`, `publint`, and `attw` evidence for any new value or type surface.
- **D-25:** Do not fold streaming semantics into this phase. OpenRouter streaming through the OpenAI-compatible path belongs to Phases 43 and 44.

### the agent's Discretion
- The planner may choose the exact `fallbackModels` type name and whether it lives only on `OpenRouterProviderOptions` or also has a reusable gateway-policy type, as long as the surface stays typed and OpenRouter-specific.
- The planner may decide whether terminal result metadata reuses `ProviderGatewayMetadata` directly or exposes a narrower public gateway observation type.
- The planner may split fallback support and catalog refresh into separate plans if that keeps tests and review diffs easier to inspect.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope
- `.planning/ROADMAP.md` - Phase 42 goal, dependency, requirements, and success criteria.
- `.planning/REQUIREMENTS.md` - ORCAT-01 through ORCAT-06, plus out-of-scope boundaries for runtime catalog refresh and hosted gateways.
- `.planning/PROJECT.md` - v1.4 provider breadth scope, FSB-via-npm dogfood strategy, and managed control-plane out-of-scope decision.
- `.planning/research/SUMMARY.md` - v1.4 gateway/catalog decisions, especially OpenRouter `models[]`, no new SDK dependency, and runtime-refresh risk.
- `.planning/phases/40-package-version-stamping-public-surface-guardrails/40-CONTEXT.md` - public-surface, package type, and optional dependency guardrails.
- `.planning/phases/41-gateway-delegation-litellm-gateway-policy/41-CONTEXT.md` - gateway policy, fallback accounting, and route/observed-model separation decisions carried into Phase 42.

### OpenRouter References
- `https://openrouter.ai/docs/guides/routing/model-fallbacks` - OpenRouter model fallback behavior, response `model` pricing/accounting note, and OpenAI-compatible `models` array usage.
- `https://openrouter.ai/docs/guides/routing/provider-selection` - provider routing options, sort behavior, `allow_fallbacks`, and multi-model sorting partition behavior.
- `https://openrouter.ai/docs/api/api-reference/models/get-models` - `/api/v1/models` response fields for context length, pricing, modalities, supported parameters, and current authentication documentation.

### OpenRouter Adapter and Gateway Policy
- `packages/lattice/src/providers/openrouter.ts` - OpenRouter wrapper, quirks, live `/api/v1/models` negotiation, registry fallback, and suffix stripping.
- `packages/lattice/src/providers/openrouter.test.ts` - OpenRouter request-shape, negotiation, registry fallback, and sanitizer tests.
- `packages/lattice/src/providers/adapters.ts` - OpenAI-compatible request construction, gateway policy serialization, response `model` extraction, usage normalization, and `ProviderRunResponse.gateway`.
- `packages/lattice/src/providers/provider.ts` - `ProviderRunResponse`, `ProviderGatewayMetadata`, `ProviderAdapter`, and capability model types.
- `packages/lattice/src/policy/policy.ts` - typed `GatewayPolicy` fields and merge behavior.
- `packages/lattice/src/providers/litellm.ts` - Phase 41 gateway default pattern, especially explicit `allowFallbacks: false`.

### Runtime Accounting and Receipts
- `packages/lattice/src/runtime/create-ai.ts` - plan construction, `provider.attempt` events, attempt metadata, result assembly, and receipt issuance branches that currently pass `observed: null`.
- `packages/lattice/src/plan/plan.ts` - selected route, fallback chain, attempt metadata, and plan metadata shapes.
- `packages/lattice/src/results/result.ts` - terminal `RunSuccess` / `RunFailure` result shapes that need additive gateway observation metadata.
- `packages/lattice/src/tracing/tracing.ts` - `RunEventKind` vocabulary and event metadata shape.
- `packages/lattice/src/receipts/types.ts` - existing `ReceiptModel` with `requested` and `observed`.
- `packages/lattice/src/receipts/receipt.ts` - receipt body assembly and v1.2 schema emission.

### Catalog Refresh and Capability Registry
- `scripts/refresh-model-registry.mjs` - build-time OpenRouter feed fetcher, deterministic renderer, `--check`, and skip-on-fetch-failure behavior.
- `scripts/capabilities/classifier.mjs` - OpenRouter model classifier, variant stripping, known failure mode defaults, and supported-parameter derivation.
- `scripts/capabilities/__fixtures__/openrouter-models-snapshot.json` - frozen OpenRouter feed fixture for deterministic tests.
- `packages/lattice/src/capabilities/profile.ts` - public capability profile types to extend additively if ORCAT-04 needs new typed fields.
- `packages/lattice/src/capabilities/registry.generated.ts` - generated OpenRouter registry output.
- `packages/lattice/src/capabilities/registry.static.ts` - hand-maintained supplemental profiles.
- `packages/lattice/test/capabilities-classifier.test.ts` - classifier and registry-rendering stability tests.
- `packages/lattice/test/capabilities-registry-integration.test.ts` - populated registry integration coverage.
- `.github/workflows/registry-drift.yml` - scheduled/manual refresh PR workflow and current network-free PR-time policy.

### Public Surface and Package Tests
- `packages/lattice/src/index.ts` - package root export surface.
- `packages/lattice/test/public-surface.test.ts` - exact public value-export inventory from Phase 40.
- `packages/lattice/test-d/index.test-d.ts` - package entrypoint type smoke tests.
- `packages/lattice/test-d/capabilities.test-d.ts` - capability registry public type coverage.
- `scripts/check-core-package-boundary.mjs` - optional dependency leak guard, including `@openrouter/sdk`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `createOpenRouterProvider` already wraps `createOpenAICompatibleProvider`, defaults to `https://openrouter.ai/api/v1`, exposes `OpenRouterQuirks`, and negotiates capabilities through OpenRouter `/api/v1/models`.
- `createOpenAICompatibleProvider` already serializes typed gateway metadata, extracts a response-level `model` as `observedModel`, normalizes usage, preserves `rawResponse`, and returns `ProviderRunResponse.gateway`.
- `ProviderGatewayMetadata` already has `requestedModel`, `observedModel`, and sanitized policy fields; this is the natural internal shape for resolved-model propagation.
- `ReceiptModel` already has `requested` and `observed`; Phase 42 can populate an existing receipt field instead of inventing a new receipt concept.
- `scripts/refresh-model-registry.mjs` already has deterministic rendering, `--check`, fetch retry, and skip-on-fetch-failure behavior.
- `scripts/capabilities/classifier.mjs` already derives training class, known failure modes, prompt strategy, and tool-call surface from OpenRouter feed rows.
- `.github/workflows/registry-drift.yml` already performs scheduled/manual refresh PR creation without adding PR-time network calls.

### Established Patterns
- OpenAI-compatible wrappers use fake-fetch tests and do not require live gateway services.
- Gateway hints and observations live in additive metadata and must not mutate `route.selected` or the Lattice fallback chain.
- Public value exports are exact-inventory guarded; type-only surfaces are covered through package-root `tsd`.
- Build-time generator scripts use Node built-ins and are not runtime package dependencies.
- Capability negotiation fallback events use `capabilities.negotiation.fallback` and sanitized error messages.
- OpenRouter variant suffix handling strips only known suffixes such as `:free` and `:thinking`; new routing suffixes should be intentional, not broad colon stripping.

### Integration Points
- Fallback request support connects to `OpenRouterProviderOptions`, `createOpenRouterProvider`, and the underlying OpenAI-compatible body builder in `packages/lattice/src/providers/adapters.ts`.
- Resolved-model propagation connects to `ProviderRunResponse.gateway`, `attemptSucceeded`, `provider.attempt` event metadata, `RunSuccess` / `RunFailure`, and every `maybeIssueReceipt` call that currently passes `model.observed: null`.
- Receipt model-class behavior connects to `resolveReceiptModelClass` in `packages/lattice/src/runtime/create-ai.ts` and `getCapabilityProfile` lookup semantics for OpenRouter ids.
- Catalog refresh connects to `scripts/refresh-model-registry.mjs`, `scripts/capabilities/classifier.mjs`, `ModelCapabilityProfile`, generated registry fixtures, and registry-drift workflow output.
- Verification connects to OpenRouter fake-fetch tests, runtime planning/execution tests, receipt integration tests, classifier/generator tests, public-surface tests, package type tests, and core package-boundary checks.

</code_context>

<specifics>
## Specific Ideas

- Preferred user-facing shape: `createOpenRouterProvider({ model: "openai/gpt-5-mini", fallbackModels: ["anthropic/claude-sonnet-4.5", "google/gemini-3-flash-preview"] })`.
- Request language should read like: "Lattice selected OpenRouter with requested model X; OpenRouter fallback candidates were Y; OpenRouter served observed model Z."
- Result language should let users inspect `result.gateway?.observedModel` without parsing provider-specific raw response bodies.
- Receipt language should read like: `model.requested = X`, `model.observed = Z`, and route remains `{ providerId: "openrouter", capabilityId: X }`.
- Registry refresh diffs should be reviewable as source changes, not runtime state: new/removed model rows, context/pricing/modalities/parameters changes, and classifier warning changes should all be visible in PR review.

</specifics>

<deferred>
## Deferred Ideas

- OpenRouter streaming through the OpenAI-compatible path belongs to Phases 43 and 44.
- Anthropic Messages `fallbacks` support through OpenRouter is out of scope because Lattice's current OpenRouter adapter uses chat completions.
- Full OpenRouter SDK integration remains out of scope; the SDK can be reconsidered only if a future phase needs a feature unavailable through OpenAI-compatible HTTP.
- Runtime catalog refresh with TTL/network calls during `ai.run()` remains out of scope because it can make deterministic routing drift between plan and execution.
- FSB-via-npm dogfood for the new OpenRouter fallback and catalog refresh surfaces belongs to Phase 49.

</deferred>

---

*Phase: 42-openrouter-fallback-capability-catalog-refresh*
*Context gathered: 2026-06-15*
