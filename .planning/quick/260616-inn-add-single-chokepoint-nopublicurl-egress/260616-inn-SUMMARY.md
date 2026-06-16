---
quick_id: 260616-inn
date: "2026-06-16"
status: complete
commits:
  - hash: fb81fa2
    message: "feat(providers): add assertNoPublicUrlEgress shared chokepoint + unit tests"
  - hash: 6567bff
    message: "feat(providers): wire assertNoPublicUrlEgress into all three adapter egress paths + parity tests"
  - hash: 32aa896
    message: "chore(ci): full CI gate for noPublicUrl chokepoint"
---

# 260616-inn: Add Single Chokepoint — noPublicUrl Egress Assertion

## One-liner

Single `assertNoPublicUrlEgress` chokepoint wired at all 6 run-request fetch sites (OpenAI-compat, Anthropic, Gemini — execute + executeStream), throwing `NoPublicUrlEgressError` when a forbidden artifact-derived public URL appears in the serialized body under `noPublicUrl: true`.

## What Was Built

### no-public-url.ts (new)
- `NoPublicUrlEgressError extends Error`: typed error class with `providerId`, `artifactId`, `offendingUrl` fields; `name = "NoPublicUrlEgressError"`; correct prototype chain via `Object.setPrototypeOf`
- `assertNoPublicUrlEgress(request, providerId, serializedBody)`: zero-cost no-op when `policy.noPublicUrl !== true`; scans `artifact.value` and all `artifact.metadata` string values with `isHttpUrl`; throws iff a forbidden URL appears as a substring in `serializedBody`; data: URLs excluded naturally; gateway metadata excluded by scope (not in `request.artifacts`)

### Adapter wiring (6 sites)
- `adapters.ts` execute: extract `bodyStr`, call assertion, use `bodyStr` in fetch init
- `adapters.ts` streamOpenAICompatibleResponse: same pattern with `streamBodyStr`
- `anthropic.ts` execute: extract `bodyStr` from `JSON.stringify(messagesBody.body)`, call assertion before `fetchImpl`
- `anthropic.ts` streamAnthropicResponse: same
- `gemini.ts` execute: extract `bodyStr` from `JSON.stringify(requestBody)`, call assertion before `fetchImpl`
- `gemini.ts` streamGeminiResponse: same
- Model-listing/negotiation fetches: NOT wrapped (by design)

### Exports
- `NoPublicUrlEgressError` exported from `packages/lattice/src/index.ts` (public API)
- `assertNoPublicUrlEgress` is internal only

### Tests
- `no-public-url.test.ts`: 8 unit tests (no-op when policy unset, no-op when false, throws on value-URL-in-body, throws on metadata-URL-in-body, no throw for data: URL, no throw when URL stripped from body, error fields, instanceof)
- `parity.test.ts`: 6 new tests in `noPublicUrl defense-in-depth chokepoint parity (260616-inn)`:
  - Test 1 (RED→GREEN): OpenAI-compat mis-packaged url-transport with noPublicUrl
  - Test 2 (RED→GREEN): Anthropic base64-mislabeled metadata.base64Data
  - Test 3 (RED→GREEN): Gemini base64-mislabeled metadata.base64Data
  - Test 4 (GREEN always): no-false-positive — URL stripped from body
  - Test 5 (GREEN always): gateway.metadata scope — not artifact-derived, not thrown
  - Test 6 (GREEN always): positive baseline — noPublicUrl not set
- `test/public-surface.test.ts`: added `NoPublicUrlEgressError` to expected public exports inventory

## CI Gate Results

| Step | Result |
|------|--------|
| `pnpm -r build` | PASS |
| `pnpm -r typecheck` | PASS (clean) |
| `pnpm -r test` | PASS — 1051/1051 (78 files, lattice) + 160/160 (17 files, lattice-cli) |
| `pnpm -r test:types` | PASS — 1245/1245 (96 type test files), no type errors |
| `pnpm -r lint:packages` | PASS — attw + publint + check-cli-deps clean |
| `node scripts/verify-rename.mjs` | PASS — 265 files scanned |
| `node scripts/check-tarball-leak.mjs` | PASS — 2 tarballs OK |
| `node scripts/check-package-version-surfaces.mjs` | PASS |
| `node scripts/check-core-package-boundary.mjs` | PASS |
| `node scripts/check-workflow-safety.mjs` | PASS |

## Deviations

### Auto-fix: Public Surface Inventory (Rule 1 — Bug)
- **Found during:** Task 3 CI gate
- **Issue:** `pnpm -r test` failed because `NoPublicUrlEgressError` was not in `EXPECTED_PUBLIC_VALUE_EXPORTS` in `test/public-surface.test.ts`
- **Fix:** Added `"NoPublicUrlEgressError"` to the expected exports array (alphabetically sorted after `NegotiationAuthError`)
- **Files modified:** `packages/lattice/test/public-surface.test.ts`
- **Commit:** `32aa896`

### Deviation: RED gate test scenarios revised
- **Reason:** The initial parity test design (mislabeled artifact without providerPackaging) did not result in PUBLIC_URL appearing in the serialized body for any adapter (adapters skip artifacts without a packaging plan). Tests were revised before the wiring to use realistic scenarios:
  - Tests 2 & 3 (Anthropic/Gemini): added `providerPackaging: transport="base64"`, which causes `artifactBase64Data()` to read `metadata.base64Data` (the PUBLIC_URL) and embed it in the body
  - Test 1 (OpenAI-compat): changed to `artifact.url(PUBLIC_URL)` with `providerPackaging: transport="url"`, simulating the case where packaging mistakenly assigns url transport despite noPublicUrl — the h31 body builder then emits `url: PUBLIC_URL` in the body
- **Impact:** Tests correctly prove the chokepoint catches the mislabeling vectors that actually reach the body; the defensive goal (catching anything that escapes per-site gating) is correctly tested

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced.
