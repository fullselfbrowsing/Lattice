---
phase: 46-receipt-provenance-kms-signer-shapes
phase_number: 46
status: clean
depth: standard
files_reviewed: 23
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
reviewed_at: 2026-06-16T07:48:07Z
reviewer: codex-inline
---

# Phase 46 Code Review

## Scope

Reviewed the Phase 46 non-planning diff for receipt v1.3 provenance, lineage root hashing, runtime receipt issuance, crew child completion receipts, remote signer adapter shape, public exports, and type tests:

- `packages/lattice/src/agent/crew/dispatcher.test.ts`
- `packages/lattice/src/agent/crew/dispatcher.ts`
- `packages/lattice/src/agent/crew/run-crew.ts`
- `packages/lattice/src/agent/runtime.ts`
- `packages/lattice/src/agent/types.ts`
- `packages/lattice/src/contract/checkpoint.test.ts`
- `packages/lattice/src/index.ts`
- `packages/lattice/src/receipts/lineage.test.ts`
- `packages/lattice/src/receipts/lineage.ts`
- `packages/lattice/src/receipts/receipt.test.ts`
- `packages/lattice/src/receipts/receipt.ts`
- `packages/lattice/src/receipts/remote-signer.test.ts`
- `packages/lattice/src/receipts/remote-signer.ts`
- `packages/lattice/src/receipts/types.ts`
- `packages/lattice/src/receipts/verify.test.ts`
- `packages/lattice/src/receipts/verify.ts`
- `packages/lattice/src/runtime/create-ai.test.ts`
- `packages/lattice/src/runtime/create-ai.ts`
- `packages/lattice/src/runtime/public-types.test.ts`
- `packages/lattice/src/runtime/public-types.ts`
- `packages/lattice/test-d/package-types.test-d.ts`
- `packages/lattice/test-d/receipt-v12.test-d.ts`
- `packages/lattice/test/public-surface.test.ts`

## Findings

No remaining issues found.

## Notes

- Receipt v1.3 is additive. `verifyReceipt()` still accepts signed v1.1/v1.2 bodies and still rejects absent/v1 schema versions through the downgrade gate.
- `lineageMerkleRoot` is descriptor-only: the helper starts from artifact refs and tests prove raw artifact `value` changes do not affect the root.
- Runtime lineage roots use a separate lineage-artifact input so `inputHashes` remain input-only.
- Remote signer callbacks receive DSSE PAE bytes, not raw canonical JSON. Tests compare callback bytes to `buildPae(PAYLOAD_TYPE, envelope.payload)` and verify through `KeySet`.
- Core remains cloud-SDK-free; AWS/GCP/KMS specifics stay outside the package behind the callback.

## Verification Reviewed

- `pnpm --filter @full-self-browsing/lattice test -- receipts create-ai dispatcher run-crew public-types public-surface` passed.
- `pnpm --filter @full-self-browsing/lattice build && pnpm --filter @full-self-browsing/lattice test:types` passed.
- `pnpm --filter @full-self-browsing/lattice typecheck` passed.
- `node scripts/check-core-package-boundary.mjs` passed.

