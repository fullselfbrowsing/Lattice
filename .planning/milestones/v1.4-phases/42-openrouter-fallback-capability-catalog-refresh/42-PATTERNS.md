# Phase 42: OpenRouter Fallback + Capability Catalog Refresh - Pattern Map

**Date:** 2026-06-15

## File Role Map

| File | Role | Closest Analog | Pattern to Reuse |
|------|------|----------------|------------------|
| `packages/lattice/src/providers/openrouter.ts` | OpenRouter-specific provider wrapper | `packages/lattice/src/providers/litellm.ts`, `packages/lattice/src/providers/lm-studio.ts` | Thin wrapper around `createOpenAICompatibleProvider` with provider-specific options and quirks |
| `packages/lattice/src/providers/openrouter.test.ts` | Adapter fake-fetch tests | `packages/lattice/src/providers/litellm.test.ts` | Captured request body, optional auth, normalized usage, response model assertions |
| `packages/lattice/src/providers/provider.ts` | Provider response metadata types | Phase 41 `ProviderGatewayMetadata` | Additive readonly fields, no route mutation |
| `packages/lattice/src/results/result.ts` | Public terminal run result type | Existing `receipt?`, `events?` optional fields | Optional top-level field, absent when not applicable |
| `packages/lattice/src/runtime/create-ai.ts` | Plan/event/result/receipt accounting | Phase 41 gateway accounting | Preserve `route.selected`, add gateway metadata to attempts/events/result |
| `packages/lattice/src/receipts/types.ts` | Receipt body schema | Existing `ReceiptModel.observed` | Populate existing field instead of schema expansion |
| `scripts/refresh-model-registry.mjs` | Build-time OpenRouter registry generator | Existing Phase 33 renderer | Stable ordering, explicit key order, no timestamps, check mode |
| `scripts/capabilities/classifier.mjs` | Feed-derived profile classification | Existing supported-parameter derivation | Keep classification pure and build-time only |
| `packages/lattice/src/capabilities/profile.ts` | Public model profile type | Existing optional-free profile type | Add optional readonly fields with focused type tests |
| `.github/workflows/registry-drift.yml` | Scheduled refresh PR workflow | Existing weekly refresh job | Keep live network out of PR-time CI |

## Data Flow

1. `createOpenRouterProvider({ model, fallbackModels })` configures the requested primary model and ordered fallback candidates.
2. OpenRouter execute path posts to `/chat/completions` with `model` and, when configured, top-level `models`.
3. OpenRouter response `model` becomes `ProviderRunResponse.gateway.observedModel`.
4. Runtime copies gateway metadata into `ProviderAttemptRecord.metadata.gateway`, `provider.attempt` event metadata, and terminal `RunSuccess.gateway` / `RunFailure.gateway`.
5. Receipt issuance uses `model.requested = route.modelId` and `model.observed = response.gateway?.observedModel ?? null`.
6. Catalog refresh reads OpenRouter `/api/v1/models`, transforms rows into typed profile data, and writes source-controlled generated output for review.

## Concrete Code Excerpts to Follow

### Thin wrapper pattern

`packages/lattice/src/providers/litellm.ts`:

```typescript
const inner = createOpenAICompatibleProvider({
  ...options,
  id: resolvedId,
  baseUrl: resolvedBaseUrl,
  gateway,
});
```

Use the same delegation shape in OpenRouter. Add fallback request injection around the delegated fetch instead of duplicating OpenAI-compatible execution.

### Gateway metadata response pattern

`packages/lattice/src/providers/adapters.ts`:

```typescript
const gateway = id === "litellm" || mergedGatewayPolicy !== undefined
  ? {
      used: true,
      requestedModel: options.model,
      ...(observedModel !== undefined ? { observedModel } : {}),
      ...(sanitizedGatewayPolicy !== undefined ? { policy: sanitizedGatewayPolicy } : {}),
    }
  : undefined;
```

Extend this pattern for OpenRouter observations and fallback candidates.

### Receipt gap

`packages/lattice/src/runtime/create-ai.ts` currently passes:

```typescript
model: { requested: route.modelId, observed: null }
```

Plan 42-02 should replace this with a helper that uses `response.gateway?.observedModel ?? null` in all response-backed terminal branches.

### Deterministic generator pattern

`scripts/refresh-model-registry.mjs` already renders rows with explicit field order and sorted `(adapter, id)` output. Preserve that behavior when adding optional fields.

## Landmines

- Do not write fallback candidates into `route.fallbackChain`; that chain is Lattice-owned fallback, not OpenRouter gateway fallback.
- Do not set receipt route `capabilityId` to the observed model; use receipt `model.observed`.
- Do not make profile metadata required; static supplemental profiles should remain valid.
- Do not parse pricing strings into JavaScript floats for generated source unless a separate normalized numeric field is introduced with tests.
- Do not fetch OpenRouter in PR-time CI.
- Do not add `@openrouter/sdk`; `scripts/check-core-package-boundary.mjs` already guards against it.

---

*Pattern map for Phase 42 planning*
