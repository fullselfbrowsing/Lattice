# Phase 38 Research: Receipt v1.2 Schema + modelClass Tag

## Research Complete

Phase 38 is a narrow receipt-schema and runtime-issuance change. The codebase
already has the pieces needed:

- `TrainingClass` is defined in `packages/lattice/src/capabilities/profile.ts`.
- Strict registry lookup is `getCapabilityProfile(canonicalKey)` in
  `packages/lattice/src/capabilities/lookup.ts`.
- `createReceipt` in `packages/lattice/src/receipts/receipt.ts` owns the schema
  version and signed body assembly.
- `verifyReceipt` in `packages/lattice/src/receipts/verify.ts` owns accepted
  version literals and the CRYPTO-01 downgrade floor.
- `maybeIssueReceipt` in `packages/lattice/src/runtime/create-ai.ts` is the
  central terminal receipt hook for `ai.run`.

No provider adapter contract change is required. `modelClass` can be computed
in runtime receipt issuance because `maybeIssueReceipt` already receives the
selected route/provider id and model id.

## Current Code Facts

### Receipt Body

`CapabilityReceiptBody.version` is currently:

```ts
"lattice-receipt/v1" | "lattice-receipt/v1.1"
```

`createReceipt` always assigns `"lattice-receipt/v1.1"` and has no
`modelClass` field in `CreateReceiptInput`.

### Verifier

`asReceiptBody` accepts `undefined`, v1, and v1.1 so absent/v1 bodies can reach
the CRYPTO-01 floor. Unknown literals such as v2 fail as `version-mismatch`.
The floor rejects `undefined` and v1 before key lookup.

Phase 38 should extend the accepted structural literals to include v1.2 and keep
that floor exactly intact.

### Runtime Issuance

`maybeIssueReceipt` is called from these terminal `ai.run` branches:

- no selected route / no-contract-match
- no selected route / no_route
- validation failed after a provider response
- tripwire violated after valid output
- success
- no executable adapter
- provider execution failed after attempts

The real selected-route branches pass `providerId` and `modelId` through
`ReceiptRoute` and `ReceiptModel`. Synthetic no-route branches pass empty route
ids and should naturally omit `modelClass`.

### Registry

Stable registry-known test fixtures:

- `lm-studio:local-template` -> `local_quantized`
- `anthropic:claude-opus-4` -> `frontier_rlhf`
- `openrouter:openai/gpt-oss-120b` -> `open_weight_instruct`

`createFakeProvider({ id: "lm-studio", modelId: "local-template" })` can drive
runtime tests through the normal router while using a static registry-known
model. `createFakeProvider()` with its default fake model remains an unknown
model and should omit `modelClass`.

## Implementation Strategy

1. Update receipt types:
   - Import `TrainingClass` as a type.
   - Add v1.2 to `CapabilityReceiptBody.version`.
   - Add optional `modelClass?: TrainingClass`.
   - Add optional `modelClass?: TrainingClass` to `CreateReceiptInput`.

2. Update minting:
   - `createReceipt` always emits `"lattice-receipt/v1.2"`.
   - Conditional-spread `modelClass` into the body before redaction and
     canonicalization.
   - Do not expose an input `version` field.

3. Update verification:
   - `asReceiptBody` accepts v1.2.
   - Unknown future literals still return `version-mismatch`.
   - CRYPTO-01 unchanged: absent or v1 fails as `schema-version-too-low` where
     the structural gate allows it.
   - No registry lookup in `verifyReceipt`.

4. Update runtime issuance:
   - Import `getCapabilityProfile`.
   - Add a local helper:
     `resolveReceiptModelClass(route: ReceiptRoute, model: ReceiptModel): TrainingClass | undefined`.
   - Use only `getCapabilityProfile(`${route.providerId}:${model.requested}`)`.
   - Do not use `findCapabilityProfile`.
   - Do not mutate `ProviderRunResponse` or adapter option types.

5. Update tests:
   - Core receipt tests expect new minting default v1.2.
   - Verifier tests prove v1.1 still verifies via hand-crafted signed body.
   - Forged v1 + `modelClass` rejects with `schema-version-too-low`.
   - Runtime tests assert include/omit behavior.
   - Checkpoint/agent iteration receipts verify and omit `modelClass`.
   - Public type tests prove `CapabilityReceiptBody["modelClass"]` is
     `TrainingClass | undefined`.

## Validation Architecture

Test framework: Vitest 4.1.5 plus tsd.

Focused commands:

```bash
pnpm --filter @full-self-browsing/lattice test receipts/receipt receipts/verify receipts/canonical contract/checkpoint runtime/create-ai agent/integration runtime/survivability public-surface
pnpm --filter @full-self-browsing/lattice typecheck
pnpm --filter @full-self-browsing/lattice exec tsd
```

Full final command:

```bash
pnpm --filter @full-self-browsing/lattice test receipts/receipt receipts/verify receipts/canonical contract/checkpoint runtime/create-ai agent/integration runtime/survivability public-surface && pnpm --filter @full-self-browsing/lattice build && pnpm --filter @full-self-browsing/lattice typecheck && pnpm --filter @full-self-browsing/lattice exec tsd
```

Required automated assertions:

- Fresh `createReceipt(...)` payload body has
  `version === "lattice-receipt/v1.2"`.
- `CreateReceiptInput` accepts `modelClass: "local_quantized"` and the signed
  body preserves it.
- A signed v1.1 body verifies successfully.
- A signed v1.2 body verifies successfully.
- A signed v1 body with `modelClass` fails before key lookup as
  `schema-version-too-low`.
- A v2 body still fails as `version-mismatch`.
- Runtime success receipt for `lm-studio:local-template` includes
  `modelClass: "local_quantized"`.
- Runtime fake/unknown/no-route receipt omits `modelClass`.
- Checkpoint and agent iteration receipts omit `modelClass` by default.
- Package type tests prove `TrainingClass` is usable with
  `CapabilityReceiptBody["modelClass"]`.

## Risks

- Updating `createReceipt` to v1.2 changes every receipt minted by checkpoint
  hooks too. This is intended by D-01 but tests and comments must stop assuming
  v1.1 minting.
- Verifier shape changes must not accidentally let unknown future schemas reach
  key lookup.
- Runtime model classification must not use fuzzy lookup; using
  `findCapabilityProfile` would classify ambiguous or suffix-normalized models
  against the Phase 38 decision.
- Planning docs must not claim adapter-level population. The implementation
  should populate at runtime receipt issuance only.
