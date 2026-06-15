---
phase: 34
phase_name: adapter-quirk-flags-capability-negotiation-api
status: issues_found
reviewed: 2026-06-08
reviewer: gsd-code-reviewer
depth: standard
files_reviewed: 36
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
---

# Phase 34: Code Review Report

## Summary

Phase 34 ships adapter quirk flags + capability negotiation across 7 first-party adapters. The code follows a consistent pattern (TTL cache, inflight coalescing, retry with backoff, auth-error throw, transient fallback with event emission), implements security-conscious error stringification (`stringifyErr` to avoid leaking apiKeys), and ships exhaustive type-level tests. Phase 33 registry integration via `synthesizeNegotiatedCapabilitiesFromRegistry` is clean and reused throughout.

Nine issues found: two correctness concerns (`mergeOpenAIModelsWithRegistry` documented behavior diverges from code; missing `AbortSignal.timeout` on OpenAI/xAI negotiate), three warnings around event-emission consistency and a weak test, and four info-level inconsistencies. No critical security vulnerabilities. The anchor case study (`openrouter:openai/gpt-oss-120b:free` → `unwrapInternalEnvelope`) is correctly implemented and verified by tests.

## Warnings

### WR-01: OpenAI negotiate hangs indefinitely on slow upstream (no fetch timeout)

**File:** `packages/lattice/src/providers/adapters.ts:436-439`

**Issue:** `createOpenAIProvider`'s `fetchAndNegotiate` calls `fetchImpl(url, { method: "GET", headers })` without an `AbortSignal.timeout(...)`. Compare to Anthropic (`anthropic.ts:237`), Gemini (`gemini.ts:203`), and OpenRouter (`openrouter.ts:189`), which all wire `signal: AbortSignal.timeout(30_000)`. A hung OpenAI `/v1/models` endpoint will block negotiation forever, defeating the retry+fallback design (D-09/D-11). Worst case: 5 concurrent inflight-coalesced calls all wait on one indefinite fetch with no recovery path.

**Fix:**
```typescript
const resp = await fetchImpl(url, {
  method: "GET",
  headers,
  signal: AbortSignal.timeout(30_000),
});
```

### WR-02: xAI negotiate hangs indefinitely on slow upstream (no fetch timeout)

**File:** `packages/lattice/src/providers/xai.ts:209-212`

**Issue:** Same as WR-01 — `createXaiProvider`'s `fetchAndNegotiate` lacks `AbortSignal.timeout`. Consistency with Anthropic/Gemini/OpenRouter is broken. Tests do not detect this because fake fetches resolve synchronously; against a real hanging xAI endpoint, negotiation would never settle.

**Fix:**
```typescript
const resp = await fetchImpl(url, {
  method: "GET",
  headers,
  signal: AbortSignal.timeout(30_000),
});
```

### WR-03: `mergeOpenAIModelsWithRegistry` comment/code mismatch on `source` value

**File:** `packages/lattice/src/providers/adapters.ts:377-380`

**Issue:** The comment block on lines 377-379 reads "Model exists in org (/models confirmed) but Phase 33 registry doesn't have it. **Use source: \"live\"** per planning_context note 2 (the model id was verified)." But the code on line 380 returns `synthesizeNegotiatedCapabilitiesFromRegistry("openai", modelId, "registry-fallback")` — source is `"registry-fallback"`, not `"live"`. Either the comment is stale or the implementation is wrong. This makes the source semantic ambiguous: when /models confirms a model that's outside the registry, consumers cannot distinguish "live, no registry data" from "transient failure, fell back to registry".

**Fix:** Pick one and update the other. If the intent is "model verified live but no registry data", construct a `{ source: "live" }` empty-stub shape directly (similar to the synthesize stub but with `source: "live"`). If the intent is to fall back, remove the misleading comment.

### WR-04: Anthropic `mergeAnthropicModelsWithRegistry` never emits fallback event when model missing from /v1/models

**File:** `packages/lattice/src/providers/anthropic.ts:166-171`

**Issue:** When `/v1/models` returns 200 but the queried modelId is not in `body.data`, Anthropic silently returns `synthesizeNegotiatedCapabilitiesFromRegistry(..., "registry-fallback")` without calling `emitFallbackEvent`. Compare to OpenAI (`adapters.ts:362-366`), Gemini (`gemini.ts:264-273`), and OpenRouter (`openrouter.ts:277-291`) which all emit the fallback event in this scenario. Consumers observing the event stream cannot detect that an Anthropic model was missing from a successful /v1/models response.

**Fix:**
```typescript
if (found === undefined) {
  emitFallbackEvent({
    adapter: "anthropic",
    modelId,
    errorReason: "model not found in /v1/models response",
    fallbackSource: "registry-fallback",
  });
  return synthesizeNegotiatedCapabilitiesFromRegistry("anthropic", modelId, "registry-fallback");
}
```

### WR-05: Anthropic "Test 7: inflight cleanup on rejection" does not verify what it claims

**File:** `packages/lattice/src/providers/anthropic.test.ts:565-621`

**Issue:** The test sets up 5 concurrent calls for `"claude-opus-4"` (first wave) then a 6th call for `"claude-opus-4-6"` (different modelId). Because the inflight Map is keyed by modelId, the 6th call for a *different* modelId would trigger a fresh fetch even if the inflight Map were never cleared for `"claude-opus-4"`. The test passes regardless of whether the `.finally` cleanup actually runs. To properly test Pitfall 4, the 6th call must use the same modelId as the first wave (so the only way it triggers a fresh fetch is if `inflight.delete()` ran in `.finally`).

**Fix:** Use `"claude-opus-4"` for the 6th call; arrange the second fetch response so the merge yields `source: "registry-fallback"` again (the assertion can check `fetchCallCount === 2` to prove a second fetch happened). Alternative: keep `"claude-opus-4-6"` for the 6th call but add an assertion that `inflight.size === 0` after the first wave settles (requires exposing internal state, which is invasive).

## Info

### IN-01: `emitFallbackEvent` event shape diverges across adapters (top-level providerId/modelId)

**Files:** `packages/lattice/src/providers/gemini.ts:332-342`, `packages/lattice/src/providers/openrouter.ts:354-365`

**Issue:** Anthropic (`anthropic.ts:119-129`), xAI (`xai.ts:67-79`), and the shared `emitFallbackEvent` in `adapters.ts:301-315` all populate `providerId` and `modelId` as top-level fields on the `RunEvent`. Gemini and OpenRouter set these only inside `metadata`. Consumers filtering events by `event.providerId === "openrouter"` or `event.modelId === ...` will miss Gemini/OpenRouter fallback events. The `RunEvent` type permits these fields as optional, so it's not a type error — but the inconsistency is a downstream UX trap.

**Fix:** Add `providerId: id` and `modelId: payload.modelId` to the `createRunEvent(...)` call in both Gemini and OpenRouter (matching the Anthropic shape on lines 121-122).

### IN-02: OpenAI/xAI send `Authorization: Bearer ` (empty token) when apiKey is omitted

**Files:** `packages/lattice/src/providers/adapters.ts:424`, `packages/lattice/src/providers/xai.ts:197`

**Issue:** Both factories build the header as `"authorization": \`Bearer ${options.apiKey ?? ""}\``. When `options.apiKey` is undefined, the header is sent as `Authorization: Bearer ` (literal trailing space). This will trigger a 401 immediately (and be caught by the auth-error branch), but it also produces noisy network logs with empty Bearer tokens that some intrusion-detection systems flag. The OpenAI-compat factory's execute path (line 137) handles this conditionally; the negotiate path should too.

**Fix:**
```typescript
const headers: Record<string, string> = {
  "accept": "application/json",
  ...(options.apiKey !== undefined ? { authorization: `Bearer ${options.apiKey}` } : {}),
};
```

### IN-03: `synthesizeNegotiatedCapabilitiesFromRegistry` empty stub always sets `streaming: true`, even for lm-studio

**File:** `packages/lattice/src/capabilities/negotiate.ts:149-162`

**Issue:** The not-found stub hard-codes `streaming: true` regardless of `adapter`. This contradicts the registry-found mapping (`mapProfileToNegotiatedCapabilities` line 198: `streaming = profile.adapter !== "lm-studio"`). When LM Studio queries for an unknown model, it gets `streaming: true` (inconsistent with the documented LM Studio heuristic of conservative defaults). The user-observable test `lm-studio.test.ts` Test 4 does not check this field, so the inconsistency is latent.

**Fix:** Pass the adapter into the not-found branch and conditionally set streaming, or align the stub with `mapProfileToNegotiatedCapabilities`:
```typescript
streaming: adapter !== "lm-studio",
```

### IN-04: Unsafe `as CapabilityAdapter` cast in top-level helper hides consumer adapter typos silently

**File:** `packages/lattice/src/capabilities/negotiate.ts:110`

**Issue:** `adapter.id as CapabilityAdapter` will accept any string at compile time and produce empty stubs at runtime. A consumer who passes `{ id: "openrouter-prod" }` (typo'd) gets an empty-stub `NegotiatedCapabilities` with no warning. Not strictly a bug — graceful degradation is documented — but the unsafe cast obscures the failure mode. Consider validating adapter.id against the closed `CapabilityAdapter` union and emitting a warning when it doesn't match, OR adding a runtime test in the not-found branch to surface "adapter id `X` is not in the closed CapabilityAdapter enum" via a console.warn or no-op event.

**Fix:** Optional — add an `if (!isCapabilityAdapter(adapter.id))` guard (where `isCapabilityAdapter` checks the closed union) that returns the empty stub without attempting registry lookup. Low priority since current behavior is already graceful.

## Files Reviewed (36)

- `.changeset/v1.3.0-adapter-quirks-negotiation.md`
- `packages/lattice/src/capabilities/index.ts`
- `packages/lattice/src/capabilities/negotiate.ts`
- `packages/lattice/src/capabilities/sanitizer-recommendations.ts`
- `packages/lattice/src/index.ts`
- `packages/lattice/src/providers/adapters.ts`
- `packages/lattice/src/providers/adapters.test.ts`
- `packages/lattice/src/providers/anthropic.ts`
- `packages/lattice/src/providers/anthropic.test.ts`
- `packages/lattice/src/providers/gemini.ts`
- `packages/lattice/src/providers/gemini.test.ts`
- `packages/lattice/src/providers/lm-studio.ts`
- `packages/lattice/src/providers/lm-studio.test.ts`
- `packages/lattice/src/providers/openrouter.ts`
- `packages/lattice/src/providers/openrouter.test.ts`
- `packages/lattice/src/providers/provider.ts`
- `packages/lattice/src/providers/quirks.ts`
- `packages/lattice/src/providers/xai.ts`
- `packages/lattice/src/providers/xai.test.ts`
- `packages/lattice/src/tracing/tracing.ts`
- `packages/lattice/test-d/quirks-negotiation.test-d.ts`
- `packages/lattice/test/__fixtures__/quirks/anthropic-models-401.json`
- `packages/lattice/test/__fixtures__/quirks/anthropic-models-503.json`
- `packages/lattice/test/__fixtures__/quirks/anthropic-models-ok.json`
- `packages/lattice/test/__fixtures__/quirks/gemini-models-401.json`
- `packages/lattice/test/__fixtures__/quirks/gemini-models-503.json`
- `packages/lattice/test/__fixtures__/quirks/gemini-models-ok.json`
- `packages/lattice/test/__fixtures__/quirks/openai-models-401.json`
- `packages/lattice/test/__fixtures__/quirks/openai-models-503.json`
- `packages/lattice/test/__fixtures__/quirks/openai-models-ok.json`
- `packages/lattice/test/__fixtures__/quirks/openrouter-models-503.json`
- `packages/lattice/test/__fixtures__/quirks/openrouter-models-ok.json`
- `packages/lattice/test/__fixtures__/quirks/xai-models-401.json`
- `packages/lattice/test/__fixtures__/quirks/xai-models-ok.json`
- `packages/lattice/test/capabilities-negotiate-helper.test.ts`
- `packages/lattice/test/capabilities-negotiate-integration.test.ts`
- `packages/lattice/test/capabilities-sanitizer-recommendations.test.ts`
