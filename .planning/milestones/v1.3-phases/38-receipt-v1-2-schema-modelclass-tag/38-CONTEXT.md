# Phase 38: Receipt v1.2 Schema + modelClass Tag - Context

**Gathered:** 2026-06-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 38 bumps newly minted Capability Receipts to `lattice-receipt/v1.2` and
adds an optional `modelClass` field sourced from the Phase 33 model capability
registry. The field carries `TrainingClass` and lets downstream consumers audit
which broad model lineage produced a receipt.

This phase is a receipt-schema and runtime-issuance change. It must preserve the
Phase 26 CRYPTO-01 downgrade defense: v1 receipts remain rejected, v1.1 receipts
remain valid, and v1.2 receipts verify cleanly.

In scope:
- Widen receipt version types to include `lattice-receipt/v1.2`.
- Add optional `modelClass?: TrainingClass` to `CapabilityReceiptBody` and
  `CreateReceiptInput`.
- Make `createReceipt` mint v1.2 receipts by default.
- Populate `modelClass` for `ai.run` terminal receipts when the selected route
  maps to a registry-known model.
- Keep v1.1 verification compatibility and CRYPTO-01 v1 rejection.
- Add receipt, verifier, runtime, public-surface, and package type tests.
- Author and complete `RECEIPT12-01` through `RECEIPT12-04` in
  `.planning/REQUIREMENTS.md` during planning/execution.

Out of scope:
- Provider-native tool use.
- New registry classifier work.
- Adding model-class metadata to synthetic checkpoint receipts by default.
- Making `verifyReceipt` depend on a current registry lookup.
- Phase 39 `parentReceiptCid` and multi-agent receipt chaining.

</domain>

<decisions>
## Implementation Decisions

### v1.2 Issuance Policy

- **D-01:** `createReceipt` should always mint `lattice-receipt/v1.2` after
  Phase 38 lands. Do not keep the previous v1.1 minting rule and do not expose a
  public caller-selected schema-version option.
- **D-02:** `modelClass` remains optional. Unknown models, fake providers, and
  synthetic receipt contexts omit it rather than falling back to a guessed class.
- **D-03:** `verifyReceipt` must continue accepting signed v1.1 receipts. The
  minting default moves forward to v1.2, but old v1.1 fixtures and receipts stay
  valid.

### modelClass Source of Truth

- **D-04:** For runtime-issued terminal receipts, derive `modelClass` via strict
  route lookup only:
  `getCapabilityProfile("${providerId}:${modelId}")?.trainingClass`.
- **D-05:** Do not use `findCapabilityProfile(modelId)` as a fallback when
  writing receipts. Fuzzy matching can pick the wrong adapter-specific profile,
  which would weaken receipt audit value.
- **D-06:** Do not add `modelClass` to `ProviderRunResponse` or ask adapters to
  report it. The selected route already supplies `providerId` and `modelId`;
  the runtime receipt issuance path is the right integration point.
- **D-07:** `modelClass` correctness is an issuance invariant, not a verifier
  dependency on current registry state. `verifyReceipt` remains a pure
  crypto/schema verifier over the signed payload. Tests should prove runtime
  issuance writes the registry value when known and omits it when unknown.

### Receipt Coverage Surface

- **D-08:** Populate `modelClass` on `ai.run` terminal receipts first:
  success, no-route/no-contract-match, validation-failed, tripwire-violated, and
  execution-failed branches where a real selected route/model exists.
- **D-09:** Synthetic no-route receipts usually have no selected provider route;
  these should omit `modelClass`.
- **D-10:** `createCheckpointHook` receipts should not try to infer
  `modelClass` by default because their default model and route are synthetic
  observability values. If a caller later supplies real `model`/`route` plus
  `modelClass` through `CreateReceiptInput`, the receipt API may carry it, but
  Phase 38 does not auto-populate checkpoint receipts.
- **D-11:** Agent iteration checkpoint receipts remain unchanged unless they
  explicitly pass real model context in a future phase. Do not broaden this
  phase into agent receipt redesign.

### Downgrade and Compatibility Tests

- **D-12:** The test bar is the full crypto/compatibility matrix:
  - v1 receipts are rejected with `schema-version-too-low`.
  - forged v1 receipts that include `modelClass` are still rejected with
    `schema-version-too-low`.
  - v1.1 receipts verify cleanly.
  - v1.2 receipts verify cleanly.
  - v1.2 DSSE/JCS round-trip remains byte-stable.
  - runtime receipts include `modelClass` when strict registry lookup succeeds.
  - runtime receipts omit `modelClass` for fake/unknown/synthetic models.
- **D-13:** Update `asReceiptBody` to accept v1.2 as a known shape while still
  treating unknown future literals such as v2 as `version-mismatch`.
- **D-14:** Keep CRYPTO-01's minimum-version gate exact: absent version and
  `lattice-receipt/v1` fail before key lookup or signature verification.

### Requirements and Public Surface

- **D-15:** Planning must author `RECEIPT12-01` through `RECEIPT12-04` before
  implementation so roadmap coverage moves from 75 authored REQ-IDs to 79.
- **D-16:** Public type exports must stay coherent through
  `packages/lattice/src/index.ts` and `packages/lattice/src/runtime/public-types.ts`.
  If `TrainingClass` is not already exported from the package root in a way
  consumers can use with `CapabilityReceiptBody`, add/verify that export.

### the agent's Discretion

The planner may choose exact helper function names and test file splits. Prefer a
small internal helper near `maybeIssueReceipt` for strict registry lookup. Do not
add a global `createAI({ modelClass })` option or any new adapter API.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope
- `.planning/ROADMAP.md` - Phase 38 goal, success criteria, and risk entry for
  receipt schema v1.2.
- `.planning/REQUIREMENTS.md` - v1.3 requirement ledger; Phase 38 must author
  `RECEIPT12-01` through `RECEIPT12-04`.
- `.planning/STATE.md` - Current milestone state and Phase 38 next-action note.

### Prior Decisions
- `.planning/phases/26-release-hygiene-docs-receipt-downgrade-defense/26-CONTEXT.md`
  - CRYPTO-01 downgrade defense and `schema-version-too-low` behavior.
- `.planning/phases/33-model-capability-registry-200-via-openrouter-feed/33-CONTEXT.md`
  - `TrainingClass`, canonical registry key, and D-15 `modelClass` shape.
- `.planning/phases/34-adapter-quirk-flags-capability-negotiation-api/34-CONTEXT.md`
  - strict registry/capability lookup conventions and adapter identity.
- `.planning/phases/37-tool-call-validation-layer-opt-in/37-CONTEXT.md`
  - recent adapter-hardening pattern and package-root export discipline.

### Receipt Code
- `packages/lattice/src/receipts/types.ts` - `CapabilityReceiptBody`,
  `ReceiptModel`, `VerifyErrorKind`, and public receipt types.
- `packages/lattice/src/receipts/receipt.ts` - `CreateReceiptInput` and
  `createReceipt` minting rule.
- `packages/lattice/src/receipts/verify.ts` - `asReceiptBody`, CRYPTO-01
  downgrade gate, and verifier decision tree.
- `packages/lattice/src/receipts/canonical.ts` - JCS canonicalization for
  receipt bodies.
- `packages/lattice/src/receipts/envelope.ts` - DSSE payload and PAE envelope
  helpers.
- `packages/lattice/src/receipts/receipt.test.ts`,
  `packages/lattice/src/receipts/verify.test.ts`,
  `packages/lattice/src/receipts/canonical.test.ts`,
  `packages/lattice/src/receipts/envelope.test.ts` - existing receipt test
  patterns.

### Runtime Issuance
- `packages/lattice/src/runtime/create-ai.ts` - `maybeIssueReceipt` and all
  terminal receipt branches for `ai.run`.
- `packages/lattice/src/runtime/create-ai.test.ts` - runtime receipt integration
  tests.
- `packages/lattice/src/contract/checkpoint.ts` - synthetic checkpoint receipt
  hook; do not auto-infer `modelClass` here by default.
- `packages/lattice/src/agent/runtime.ts` - auto-checkpoint registration path
  that composes with `createCheckpointHook`.

### Model Registry
- `packages/lattice/src/capabilities/profile.ts` - `TrainingClass` and
  `ModelCapabilityProfile.trainingClass`.
- `packages/lattice/src/capabilities/lookup.ts` - strict
  `getCapabilityProfile(canonicalKey)` and fuzzy `findCapabilityProfile(id)`.
- `packages/lattice/src/capabilities/registry.static.ts` and
  `packages/lattice/src/capabilities/registry.generated.ts` - registry data
  sources used by strict lookup.
- `packages/lattice/src/capabilities/index.ts` - capability module public
  exports.

### Public Surface
- `packages/lattice/src/index.ts` - root exports for receipt and capability
  types.
- `packages/lattice/src/runtime/public-types.ts` - public type aggregation.
- `packages/lattice/test/public-surface.test.ts` and `packages/lattice/test-d/`
  - package consumer smoke/type tests.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `createReceipt` already centralizes receipt version assignment, body assembly,
  redaction, canonicalization, signing, and DSSE envelope creation.
- `verifyReceipt` already has an explicit version-shape check followed by the
  CRYPTO-01 minimum-version gate; Phase 38 mostly widens allowed versions and
  keeps the v1 branch intact.
- `maybeIssueReceipt` in `runtime/create-ai.ts` is the single helper all `ai.run`
  terminal branches use. It is the cleanest place to add strict registry lookup.
- `getCapabilityProfile` already gives exact `${adapter}:${modelId}` lookup and
  returns a profile carrying `trainingClass`.
- `TrainingClass` is already documented in `profile.ts` as the field Phase 38
  should carry.

### Established Patterns

- Receipt fields are signed only after redaction and JCS canonicalization.
  `modelClass` must be assembled before redaction/canonicalization, like other
  signed body fields.
- Public API changes are additive and root-exported.
- Existing tests use real ephemeral Ed25519 signers and `verifyReceipt` to assert
  round-trip behavior.
- Runtime receipt emission is best-effort; signer failures must still degrade to
  `receipt: undefined` rather than failing the run.

### Integration Points

- Add optional `modelClass` to `CapabilityReceiptBody` and `CreateReceiptInput`.
- Update `createReceipt` version constant from v1.1 to v1.2.
- Update `verifyReceipt.asReceiptBody` to accept v1.2 and preserve v1 rejection.
- Add strict model-class lookup inside or immediately before `maybeIssueReceipt`.
- Ensure public type tests cover `CapabilityReceiptBody["modelClass"]` as
  `TrainingClass | undefined`.

</code_context>

<specifics>
## Specific Ideas

- Preferred runtime helper shape:
  `resolveReceiptModelClass(route: ReceiptRoute, model: ReceiptModel): TrainingClass | undefined`.
  It should use `route.providerId` and `model.requested` or the selected route
  model id to build the canonical key. Planner should verify which value is most
  reliable in each terminal branch.
- Test a known static profile such as `anthropic:claude-opus-4` or
  `lm-studio:local-template` so runtime include/omit behavior does not depend on
  the large generated OpenRouter snapshot.
- Add a forged downgrade test where the body is v1, includes `modelClass`, is
  otherwise valid and signed, and still fails as `schema-version-too-low`.

</specifics>

<deferred>
## Deferred Ideas

- `parentReceiptCid` and crew receipt chains belong to Phase 39.
- Automatic `modelClass` population for checkpoint/agent iteration receipts can
  be revisited when those receipts carry real provider route context.
- Verifier-side registry consistency checks are deferred. They would make
  verification depend on the verifier's current registry snapshot and could make
  old signed receipts appear invalid after registry refreshes.

</deferred>

---

*Phase: 38-receipt-v1-2-schema-modelclass-tag*
*Context gathered: 2026-06-09*
