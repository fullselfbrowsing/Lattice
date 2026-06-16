# Phase 41: Gateway Delegation - LiteLLM + Gateway Policy - Patterns

**Generated:** 2026-06-15
**Mode:** Inline fallback. Subagents were not spawned because this Codex session does not expose a subagent tool.

## Scope Surfaces

Phase 41 likely touches:

- `packages/lattice/src/policy/policy.ts` - add typed `GatewayPolicy`.
- `packages/lattice/src/providers/adapters.ts` - allow OpenAI-compatible requests to serialize typed gateway metadata and return observed gateway model metadata.
- `packages/lattice/src/providers/litellm.ts` - new LiteLLM wrapper.
- `packages/lattice/src/providers/quirks.ts` - optional `LiteLLMQuirks` subtype.
- `packages/lattice/src/providers/provider.ts` - additive response/attempt metadata types if needed.
- `packages/lattice/src/capabilities/profile.ts` - closed first-party adapter union and runtime adapter list.
- `packages/lattice/src/runtime/create-ai.ts` - plan/event metadata for gateway hints and observed model.
- `packages/lattice/src/plan/plan.ts` - additive attempt metadata if runtime needs to persist observed gateway details.
- `packages/lattice/src/index.ts` - public root exports.
- `packages/lattice/src/providers/litellm.test.ts`, `packages/lattice/src/providers/parity.test.ts`, `packages/lattice/test/runtime.test.ts`, `packages/lattice/test/public-surface.test.ts`, and `packages/lattice/test-d/*.test-d.ts` - behavior, public surface, and package type coverage.

## Existing Analogs

### OpenAI-Compatible Wrapper

Analogs:

- `packages/lattice/src/providers/lm-studio.ts`
- `packages/lattice/src/providers/openrouter.ts`
- `packages/lattice/src/providers/xai.ts`

Pattern:

- Define an options interface that omits `"id"` and `"baseUrl"` from `OpenAICompatibleProviderOptions`.
- Resolve a default id and default base URL.
- Delegate `execute()` and capabilities to `createOpenAICompatibleProvider`.
- Override `quirks` and `negotiateCapabilities` where the wrapper has a clearer adapter identity.

Planner guidance:

- `createLiteLLMProvider` should follow the LM Studio shape first.
- The wrapper should not duplicate OpenAI-compatible request construction unless the generic adapter cannot support typed gateway metadata cleanly.

### Registry-Only Negotiation

Analogs:

- `createOpenAICompatibleProvider(...).negotiateCapabilities`
- `createLmStudioProvider(...).negotiateCapabilities`

Pattern:

- No `/models` fetch.
- Return `synthesizeNegotiatedCapabilitiesFromRegistry(adapterId, modelId, "registry")`.
- Do not emit `capabilities.negotiation.fallback` for the intentional registry-only happy path.
- First-party adapter ids live in the closed `CapabilityAdapter` union and `CAPABILITY_ADAPTERS` runtime list.

Planner guidance:

- `createLiteLLMProvider` should use `synthesizeNegotiatedCapabilitiesFromRegistry("litellm", modelId, "registry")`.
- Add `"litellm"` to `CapabilityAdapter` and `CAPABILITY_ADAPTERS`; do not use `as any`.

### Runtime Metadata

Analogs:

- `createExecutionPlan({ metadata })` in `buildPlan`
- `markStage(..., metadata)` in `plan.ts`
- `createRunEvent(..., { metadata })` in `create-ai.ts`

Pattern:

- Core route fields remain strict and deterministic.
- Explanatory details are attached through additive metadata records.
- Event metadata is also forwarded to `normalized.tracing?.event`.

Planner guidance:

- Add gateway metadata through these existing slots before creating new top-level plan fields.
- If attempt-level observed model is needed, add an additive `metadata?: Record<string, unknown>` field to `ProviderAttemptRecord`.

### Public Surface Guardrails

Analogs:

- `packages/lattice/test/public-surface.test.ts`
- `packages/lattice/test-d/index.test-d.ts`
- `packages/lattice/test-d/quirks-negotiation.test-d.ts`

Pattern:

- Runtime values are exact-inventory checked through `Object.keys`.
- Type-only exports are asserted through package-root `tsd`.
- New public API needs both behavior tests and package-shape gates.

Planner guidance:

- Add `createLiteLLMProvider` to `EXPECTED_PUBLIC_VALUE_EXPORTS`.
- Export `LiteLLMProviderOptions`, `LiteLLMQuirks`, `GatewayPolicy`, and `GatewayMetadataValue` through the package root and assert them in `tsd`.

## Data Flow

1. User configures a provider with `createLiteLLMProvider({ model, baseUrl?, apiKey?, gateway? })`.
2. Runtime merges defaults, run policy, and routing policy into `PolicySpec`.
3. Router deterministically selects provider id `litellm` and model id from the adapter capability.
4. Runtime records sanitized gateway hints in `ExecutionPlan.metadata.gateway` and `router.candidates` event metadata.
5. Provider request receives `ProviderRunRequest.policy`.
6. OpenAI-compatible adapter merges provider-level and request-level `GatewayPolicy`.
7. Request body includes OpenAI-compatible `model`, `messages`, and top-level `metadata` only when gateway metadata exists.
8. Fake LiteLLM response returns OpenAI-compatible `choices`, `usage`, and optional `model`.
9. Adapter returns normalized usage, raw response, and observed gateway model metadata.
10. Runtime records observed gateway model in attempt/event metadata without replacing `route.selected.modelId`.

## Risks to Preserve in Plans

- Do not add a LiteLLM runtime dependency.
- Do not make `policy.gateway` affect Lattice route scoring.
- Do not put secrets in request body metadata, plan metadata, event metadata, errors, or snapshots.
- Do not change receipt route semantics in Phase 41.
- Do not implement OpenRouter fallback arrays in this phase.
- Do not bypass Phase 40 public-surface guardrails.
- Do not bypass the Phase 34 capability adapter guard with unsafe casts.
