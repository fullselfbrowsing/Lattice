# Phase 38 Pattern Map: Receipt v1.2 Schema + modelClass Tag

## Pattern Mapping Complete

Phase 38 should follow the existing receipt spine and runtime terminal receipt
hook. The change is additive in shape but breaking in minted schema version.

## Receipt Type Spine Pattern

Reference files:

- `packages/lattice/src/receipts/types.ts`
- `packages/lattice/src/receipts/receipt.ts`
- `packages/lattice/src/receipts/verify.ts`
- `packages/lattice/src/receipts/redact.ts`
- `packages/lattice/src/receipts/canonical.ts`

Existing pattern:

1. Receipt body fields live in `CapabilityReceiptBody`.
2. Public minting input lives in `CreateReceiptInput`.
3. `createReceipt` owns `version`, `kid`, redactions, and usage canonicalization.
4. Body assembly happens before `redactReceiptBody`.
5. Signed bytes are `canonicalizeReceiptBody(redactedBody)`.
6. Verifier re-parses, shape-checks, applies version gates, then performs key
   lookup, canonical byte comparison, signature verification, and kid check.

Phase 38 should add `modelClass` in body assembly before redaction and keep the
redact -> canonicalize -> PAE -> sign ordering unchanged.

## Version Gate Pattern

Reference files:

- `packages/lattice/src/receipts/verify.ts`
- `packages/lattice/src/receipts/verify.test.ts`
- `.planning/phases/26-release-hygiene-docs-receipt-downgrade-defense/26-CONTEXT.md`

Existing pattern:

1. `asReceiptBody` accepts known historical literals.
2. Unknown future literals produce `version-mismatch`.
3. CRYPTO-01 rejects absent/v1 bodies before key lookup.
4. v1.1 receipts verify under normal cryptographic checks.

Phase 38 should widen the historical known set to v1/v1.1/v1.2 and keep the
minimum floor at v1.1.

## Runtime Terminal Receipt Pattern

Reference files:

- `packages/lattice/src/runtime/create-ai.ts`
- `packages/lattice/src/runtime/create-ai.test.ts`
- `packages/lattice/src/results/result.ts`

Existing pattern:

1. Every `ai.run` terminal branch calls `maybeIssueReceipt`.
2. `maybeIssueReceipt` computes input hashes, output hash, and contract hash.
3. Signer failures are swallowed so receipt minting never crashes the run.
4. Route/model data is passed in by the caller branch.

Phase 38 should add model-class resolution inside `maybeIssueReceipt`, using
only the selected route/model data already present there.

## Capability Registry Lookup Pattern

Reference files:

- `packages/lattice/src/capabilities/profile.ts`
- `packages/lattice/src/capabilities/lookup.ts`
- `packages/lattice/src/capabilities/registry.static.ts`
- `packages/lattice/src/capabilities/registry.generated.ts`

Existing pattern:

1. Strict lookup is `getCapabilityProfile("${adapter}:${id}")`.
2. Fuzzy lookup is `findCapabilityProfile(id)` and may scan across adapters.
3. Static profiles provide direct-adapter fixtures such as
   `lm-studio:local-template`.

Phase 38 must use strict lookup only:

```ts
getCapabilityProfile(`${route.providerId}:${model.requested}`)?.trainingClass
```

Do not suffix-strip, adapter-scan, or fall back to OpenRouter equivalents for
receipts.

## Public Export Pattern

Reference files:

- `packages/lattice/src/index.ts`
- `packages/lattice/src/runtime/public-types.ts`
- `packages/lattice/test/public-surface.test.ts`
- `packages/lattice/test-d/capabilities.test-d.ts`

Existing pattern:

1. Root index exports values and types explicitly.
2. Runtime public type barrel re-exports types consumed by the root type block.
3. `test/public-surface.test.ts` verifies runtime public availability.
4. `test-d/*.test-d.ts` verifies package import type behavior.

Phase 38 should ensure `TrainingClass` is available alongside
`CapabilityReceiptBody` for consumers typing receipt bodies.

## Files To Modify

- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`
- `packages/lattice/src/receipts/types.ts`
- `packages/lattice/src/receipts/receipt.ts`
- `packages/lattice/src/receipts/verify.ts`
- `packages/lattice/src/receipts/receipt.test.ts`
- `packages/lattice/src/receipts/verify.test.ts`
- `packages/lattice/src/receipts/canonical.test.ts`
- `packages/lattice/src/runtime/create-ai.ts`
- `packages/lattice/src/runtime/create-ai.test.ts`
- `packages/lattice/src/contract/checkpoint.test.ts`
- `packages/lattice/src/agent/integration.test.ts`
- `packages/lattice/src/runtime/survivability.test.ts`
- `packages/lattice/src/index.ts`
- `packages/lattice/src/runtime/public-types.ts`
- `packages/lattice/test/public-surface.test.ts`
- `packages/lattice/test-d/receipt-v12.test-d.ts`

## Files To Create

- `.changeset/v1.3.0-receipt-v12-model-class.md`

## Integration Guidance

Implement schema/verifier first, then runtime model-class issuance, then public
type surface and final release notes. Do not change provider adapter responses.
The registry source of truth is already present from Phase 33.
