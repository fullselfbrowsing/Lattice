# Phase 46: Receipt Provenance + KMS Signer Shapes - Validation

## Automated Gates

Run after implementation:

```bash
pnpm --filter @full-self-browsing/lattice test -- receipts create-ai dispatcher run-crew public-types public-surface
pnpm --filter @full-self-browsing/lattice build
pnpm --filter @full-self-browsing/lattice test:types
pnpm --filter @full-self-browsing/lattice typecheck
node scripts/check-core-package-boundary.mjs
```

## Acceptance Matrix

| Requirement | Evidence |
|-------------|----------|
| REC-01 | Receipt tests assert v1.3 bodies can include `lineageMerkleRoot` and lineage helper tests assert content-free deterministic roots. |
| REC-02 | Verification tests assert v1.1/v1.2 manually signed receipts still verify and v1.3 receipts verify. |
| REC-03 | Runtime tests assert normal and streaming receipts include lineage roots where lineage exists; crew tests assert child completion receipts include roots when child artifacts carry lineage. |
| REC-04 | Remote signer types/factory export without adding cloud SDK dependencies. |
| REC-05 | Remote signer tests compare callback bytes to `buildPae(PAYLOAD_TYPE, envelope.payload)` and verify the resulting receipt through `KeySet`. |

## Manual Review Points

- Confirm the lineage root hashes descriptor graphs only and does not write artifact values into receipt bodies.
- Confirm receipt version and verifier error messages clearly include v1.3 while preserving the v1 downgrade rejection.
- Confirm KMS naming does not imply core is making cloud network calls.
- Confirm public type exports remain stable and package boundary checks stay clean.

