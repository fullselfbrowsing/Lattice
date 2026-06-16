---
status: complete
phase: 42-openrouter-fallback-capability-catalog-refresh
source:
  - 42-01-SUMMARY.md
  - 42-02-SUMMARY.md
  - 42-03-SUMMARY.md
started: 2026-06-16T04:55:38Z
updated: 2026-06-16T05:05:35Z
---

## Current Test

[testing complete]

## Tests

### 1. OpenRouter fallback request surface
expected: A developer can pass `fallbackModels` to `createOpenRouterProvider`. The configured primary `model` remains the Lattice-selected route model, and the fallback candidates are sent to OpenRouter as its ordered `models` array only when fallback models are configured. No `@openrouter/sdk` dependency or broad raw request-body escape hatch is introduced.
result: pass

### 2. OpenRouter gateway metadata
expected: An OpenRouter provider response exposes sanitized gateway metadata with `requestedModel`, `fallbackModels`, and `observedModel`, without requiring users to parse raw provider responses.
result: pass

### 3. Runtime result and receipt observed-model accounting
expected: `ai.run()` surfaces optional `result.gateway` metadata, signs receipts with `model.requested` and `model.observed`, keeps receipt `route.capabilityId` on the requested model, and classifies `modelClass` from the observed served model when registry-known.
result: pass

### 4. Deterministic Lattice routing with gateway fallback
expected: OpenRouter gateway fallback candidates remain gateway metadata only. They do not enter `plan.route.fallbackChain`, and the selected route remains the requested OpenRouter primary model.
result: pass

### 5. Capability catalog refresh metadata and determinism
expected: The OpenRouter registry refresh captures context windows, raw pricing strings, supported modalities, and supported parameters where the feed provides them, renders generated registry rows deterministically, and keeps PR-time checks non-flaky.
result: pass

### 6. Package and public-surface guardrails
expected: New Phase 42 public types and runtime exports are available from the package root, package lint/type checks pass, and package-boundary checks prove no OpenRouter SDK or native dependency leak was introduced.
result: pass

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
