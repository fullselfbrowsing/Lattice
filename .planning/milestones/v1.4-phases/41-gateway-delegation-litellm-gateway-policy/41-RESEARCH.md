# Phase 41: Gateway Delegation - LiteLLM + Gateway Policy - Research

**Status:** Complete
**Mode:** Inline fallback. Subagents were not spawned because this Codex session does not expose a subagent tool.
**Phase:** 41 - Gateway Delegation - LiteLLM + Gateway Policy
**Requirements:** GATE-01, GATE-02, GATE-03

## Research Complete

Phase 41 should be a low-code gateway delegation phase. The existing OpenAI-compatible adapter already handles the network shape LiteLLM needs. The phase should add the named LiteLLM helper, typed gateway hints, and route/accounting metadata without changing Lattice's deterministic router semantics.

## Current State

- `createOpenAICompatibleProvider` already posts to `${baseUrl}/chat/completions`, conditionally sends `Authorization: Bearer <apiKey>`, preserves `rawResponse`, and normalizes OpenAI-style `usage`.
- `createLmStudioProvider`, `createOpenRouterProvider`, and `createXaiProvider` already demonstrate the first-party wrapper pattern over `createOpenAICompatibleProvider`.
- `PolicySpec` has `metadata?: Record<string, unknown>` but no typed `gateway` object.
- `ProviderRunRequest.policy` is `unknown`; runtime passes the merged default/run/override policy through to adapters.
- `CapabilityAdapter` is a closed union in `packages/lattice/src/capabilities/profile.ts`; adding a first-party LiteLLM adapter should add `"litellm"` to the union and `CAPABILITY_ADAPTERS` rather than using an unsafe cast.
- `ExecutionPlan.metadata`, stage metadata, and `RunEvent.metadata` are already additive record slots.
- `ProviderAttemptRecord` has no metadata slot today; adding one would be additive and lets attempts carry observed gateway details without mutating selected route fields.
- `packages/lattice/test/public-surface.test.ts` now enforces an exact root value-export inventory. Any new `createLiteLLMProvider` export must update it intentionally.

## External Findings

Official LiteLLM docs confirm the LiteLLM proxy is an OpenAI-compatible gateway. The proxy quickstart starts on port `4000` and is called with an OpenAI client configured with `base_url`/`baseURL` pointing at the LiteLLM proxy. The request docs also show OpenAI-compatible `/chat/completions`, OpenAI-style `usage`, mapped OpenAI-style errors, and a top-level `metadata` field for pass-through logging/observability data.

References:

- https://docs.litellm.ai/docs/ - proxy quickstart and OpenAI-compatible gateway statement.
- https://docs.litellm.ai/docs/proxy/user_keys - request body examples, metadata pass-through, and OpenAI-compatible input/output/error shape.

## Recommended Implementation Shape

### Gateway Policy Type

Add a typed gateway policy object to `packages/lattice/src/policy/policy.ts`:

```typescript
export type GatewayMetadataValue =
  | string
  | number
  | boolean
  | null
  | readonly GatewayMetadataValue[]
  | { readonly [key: string]: GatewayMetadataValue };

export interface GatewayPolicy {
  readonly routeTags?: readonly string[];
  readonly providerPreferences?: readonly string[];
  readonly metadata?: Record<string, GatewayMetadataValue>;
  readonly allowFallbacks?: boolean;
}
```

Then extend `PolicySpec` with `readonly gateway?: GatewayPolicy;`.

Rationale: route tags, provider preferences, metadata, and fallback preference become explicit and typed. They remain advisory gateway hints and do not affect Lattice route scoring.

### OpenAI-Compatible Adapter Extension

Extend `OpenAICompatibleProviderOptions` with `readonly gateway?: GatewayPolicy;`. The OpenAI-compatible request body should merge provider-level gateway defaults with `request.policy.gateway` and serialize the result under a top-level `metadata` field:

```typescript
metadata: {
  ...providerGateway.metadata,
  ...requestGateway.metadata,
  lattice_gateway: {
    route_tags: [...],
    provider_preferences: [...],
    allow_fallbacks: false
  }
}
```

Omit `metadata` entirely when there are no metadata fields or lattice gateway hints. Do not put API keys or headers in this metadata block.

### LiteLLM Provider Helper

Add `packages/lattice/src/providers/litellm.ts`:

- `DEFAULT_LITELLM_BASE_URL = "http://localhost:4000"`
- `LiteLLMProviderOptions extends Omit<OpenAICompatibleProviderOptions, "id" | "baseUrl">`
- `id?: string`, default `"litellm"`
- `baseUrl?: string`, default `DEFAULT_LITELLM_BASE_URL`
- `gateway?: GatewayPolicy`, default `{ allowFallbacks: false }` merged with caller hints
- delegates `execute`, capabilities, sanitizer, tool-call validation, usage normalization, and raw response preservation to `createOpenAICompatibleProvider`
- uses registry-only `negotiateCapabilities(modelId)` with source `"registry"` and no fallback event
- adds `"litellm"` to the closed `CapabilityAdapter` union and `CAPABILITY_ADAPTERS` runtime list so `synthesizeNegotiatedCapabilitiesFromRegistry("litellm", modelId, "registry")` type-checks without `as any`

Add `LiteLLMQuirks extends AdapterQuirks` with explicit gateway flags:

```typescript
export interface LiteLLMQuirks extends AdapterQuirks {
  readonly gatewayMetadataSupported: boolean;
  readonly gatewayFallbacksSupported: boolean;
  readonly openAIErrorMapping: boolean;
}
```

Recommended values:

```typescript
{
  supportsToolChoice: false,
  parallelToolCalls: false,
  structuredOutputs: false,
  responseFormatHonored: false,
  streamingDiverges: true,
  gatewayMetadataSupported: true,
  gatewayFallbacksSupported: true,
  openAIErrorMapping: true
}
```

### Route and Event Accounting

Keep `ExecutionPlan.route.selected.providerId` and `.modelId` as the Lattice-selected adapter/model. Gateway details should be additive:

- `ExecutionPlan.metadata.gateway`: sanitized merged gateway hints and `selectedProviderId`.
- `router.candidates` event metadata: selected route plus sanitized gateway hints when present.
- `provider.attempt` started event metadata: `gateway.used`, `gateway.providerId`, `gateway.requestedModel`, and sanitized hints.
- Add a success `provider.attempt` event after adapter execution with `status: "succeeded"` and `gateway.observedModel` when response has a `model` string.
- Add `metadata?: Record<string, unknown>` to `ProviderAttemptRecord` so successful attempts can carry gateway observed model without changing `providerId`/`modelId`.

Receipts should continue to attest to the Lattice route in Phase 41. Resolved-model terminal receipt semantics are Phase 42 scope.

## Pitfalls

| Code | Pitfall | Prevention |
|---|---|---|
| GW-1 | Treating LiteLLM as a new transport or embedding the Python SDK. | Delegate to `createOpenAICompatibleProvider`; add no production dependency. |
| GW-2 | Letting gateway fallback rewrite Lattice's selected route. | Keep selected route fields unchanged; store gateway hints/observations in metadata only. |
| GW-3 | Spraying arbitrary raw extra body fields into OpenAI-compatible requests. | Add typed `GatewayPolicy`; serialize only `metadata` and `lattice_gateway` fields in Phase 41. |
| GW-4 | Logging or snapshotting sensitive API keys or custom auth headers. | Keep auth in request headers only; never mirror it into plan/event metadata. |
| GW-5 | Assuming LiteLLM model discovery should be implemented now. | Use registry-only negotiation; Phase 42 handles richer gateway/catalog work. |
| GW-6 | Bypassing the closed capability adapter guard with `as any`. | Add `"litellm"` to `CapabilityAdapter`, `CAPABILITY_ADAPTERS`, and type tests. |
| GW-7 | Adding a public export without updating Phase 40 guards. | Update `EXPECTED_PUBLIC_VALUE_EXPORTS` and package-root `tsd` tests in the closure plan. |

## Validation Architecture

### Test Infrastructure

| Property | Value |
|---|---|
| Framework | Vitest 4.1.5, tsd 0.33.0, pnpm workspace scripts |
| Config file | `packages/lattice/vitest.config.ts`, package `tsd` config in `packages/lattice/package.json` |
| Quick run command | `pnpm --filter @full-self-browsing/lattice test -- litellm runtime public-surface` |
| Full suite command | `pnpm -r build && pnpm -r typecheck && pnpm -r test && pnpm -r test:types && pnpm -r lint:packages && node scripts/check-tarball-leak.mjs && node scripts/verify-rename.mjs && node scripts/check-package-version-surfaces.mjs && node scripts/check-core-package-boundary.mjs` |
| Estimated runtime | about 2-4 minutes full suite |

### Required Checks

- `packages/lattice/src/providers/litellm.test.ts` proves default id/baseUrl, baseUrl trimming, optional/provided auth, metadata body serialization, registry-only negotiation, non-OK error behavior, raw response preservation, observed `model`, and usage normalization.
- `packages/lattice/test/runtime.test.ts` or `packages/lattice/test/planning-execution.test.ts` proves `policy.gateway` reaches the provider request and `plan.metadata.gateway`/events expose gateway hints without mutating `route.selected`.
- `packages/lattice/src/providers/parity.test.ts` either includes LiteLLM in provider parity or records why it is excluded. Recommended: include it as an eighth OpenAI-compatible wrapper row.
- `packages/lattice/test/public-surface.test.ts` includes `createLiteLLMProvider`.
- `packages/lattice/test-d/index.test-d.ts` imports `createLiteLLMProvider`, `LiteLLMProviderOptions`, `LiteLLMQuirks`, and `GatewayPolicy` from the package root.
- `packages/lattice/test-d/capabilities.test-d.ts` asserts `"litellm"` is assignable to `CapabilityAdapter`.
- Package hygiene commands continue to pass and prove no LiteLLM runtime dependency leaked into core.

### Threats

| Threat | Severity | Mitigation |
|---|---|---|
| T-41-01: LiteLLM helper drifts from OpenAI-compatible behavior | medium | Delegate to `createOpenAICompatibleProvider`; wrapper tests assert `/chat/completions` and normalized usage. |
| T-41-02: gateway metadata makes deterministic routing opaque | high | Runtime tests assert `route.selected.providerId === "litellm"` and gateway details live under metadata. |
| T-41-03: silent gateway fallback breaks replay semantics | high | Default `allowFallbacks: false`; events and plans record hints separately from Lattice fallback chain. |
| T-41-04: API key leaks into metadata or errors | high | Tests inspect plan/event metadata and request body for absence of `sk-`. |
| T-41-05: public API addition bypasses package guards | medium | Public value inventory, `tsd`, `publint`, `attw`, and package boundary scripts run in final gate. |

## Research Flags

- No live LiteLLM process is required; use fake fetch tests only.
- Do not add `litellm`, Python, Docker, or gateway runtime dependencies.
- Do not implement OpenRouter `models[]` fallback arrays or terminal receipt resolved-model semantics in Phase 41.
- Do not add streaming behavior in Phase 41.
