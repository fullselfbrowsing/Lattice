---
phase: 38-receipt-v1-2-schema-modelclass-tag
status: passed
verified_at: 2026-06-09T23:40:34.000Z
verifier: inline-gsd-execute
requirements:
  - RECEIPT12-01
  - RECEIPT12-02
  - RECEIPT12-03
  - RECEIPT12-04
---

# Phase 38 Verification

**Verdict:** PASSED

Phase 38 delivered the receipt v1.2 schema bump, optional signed `modelClass`
field, strict runtime registry issuance, public type reachability, release
notes, and planning completion bookkeeping.

## Requirement Coverage

- `RECEIPT12-01` — PASS. Receipt types include `lattice-receipt/v1.2`; `CapabilityReceiptBody` and `CreateReceiptInput` carry optional `modelClass`; `createReceipt` mints v1.2 without caller-selected version.
- `RECEIPT12-02` — PASS. `verifyReceipt` accepts signed v1.1/v1.2, rejects unknown future versions as `version-mismatch`, and keeps the CRYPTO-01 absent/v1 downgrade floor including forged v1 + `modelClass`.
- `RECEIPT12-03` — PASS. `ai.run` terminal receipts derive `modelClass` only via strict `getCapabilityProfile("${providerId}:${modelId}")`; known `lm-studio:local-template` branches include `local_quantized`; fake, unknown, no-route, checkpoint, and agent receipts omit it. `ProviderRunResponse` remains unchanged.
- `RECEIPT12-04` — PASS. Regression coverage spans receipt minting/verifier/canonical tests, runtime include/omit tests, checkpoint omit tests, public-surface smoke tests, tsd type tests, and changeset release notes.

## Verification Commands

- `pnpm --filter @full-self-browsing/lattice test receipts/receipt receipts/verify receipts/canonical` — PASS, 3 files / 63 tests.
- `pnpm --filter @full-self-browsing/lattice test runtime/create-ai contract/checkpoint agent/integration runtime/survivability` — PASS, 4 files / 69 tests.
- `pnpm --filter @full-self-browsing/lattice test public-surface` — PASS, 1 file / 34 tests.
- `pnpm --filter @full-self-browsing/lattice test receipts/receipt receipts/verify receipts/canonical contract/checkpoint runtime/create-ai agent/integration runtime/survivability public-surface` — PASS, 8 files / 166 tests.
- `pnpm --filter @full-self-browsing/lattice build` — PASS.
- `pnpm --filter @full-self-browsing/lattice typecheck` — PASS.
- `pnpm --filter @full-self-browsing/lattice exec tsd` — PASS after build refreshed package declarations.

## Artifacts Checked

- `packages/lattice/src/receipts/types.ts`
- `packages/lattice/src/receipts/receipt.ts`
- `packages/lattice/src/receipts/verify.ts`
- `packages/lattice/src/runtime/create-ai.ts`
- `packages/lattice/src/runtime/public-types.ts`
- `packages/lattice/test-d/receipt-v12.test-d.ts`
- `.changeset/v1.3.0-receipt-v12-model-class.md`
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- `.planning/STATE.md`

## Residual Risk

- `pnpm exec tsd` reads built declarations, so future public type changes must run `pnpm --filter @full-self-browsing/lattice build` before tsd.
- `.planning/config.json` had a pre-existing newline-only working-tree change and was intentionally not included in Phase 38 commits.

## Next Step

Phase 39 discussion/planning is next. It must author the remaining `DELEG`
requirements before execution.
