---
phase: 46-receipt-provenance-kms-signer-shapes
verified_at: 2026-06-16T04:16:14-05:00
status: passed
requirements_verified: [REC-01, REC-02, REC-03, REC-04, REC-05]
automated:
  passed:
    - pnpm --filter @full-self-browsing/lattice test
    - pnpm --filter @full-self-browsing/lattice typecheck
    - pnpm --filter @full-self-browsing/lattice lint:packages
    - node scripts/dogfood-fsb-candidate.mjs --fsb-dir /Users/lakshmanturlapati/Desktop/FSB/automation
  failed: []
human_verification: []
---

# Phase 46 Verification

## Result

Status: passed.

## Requirement Evidence

- **REC-01:** Receipt schema accepts lineage merkle roots.
- **REC-02:** Verifier compatibility for v1.1/v1.2 receipts is preserved while new receipts emit the current schema.
- **REC-03:** Runtime, streaming, and crew receipt paths include lineage roots where lineage exists; Phase 49 FSB candidate smoke verifies lineage round-trip.
- **REC-04:** Remote signer interfaces adapt KMS-style signers to the existing `ReceiptSigner` contract without cloud SDK dependencies.
- **REC-05:** Tests prove remote signer adapters receive canonical DSSE/PAE bytes and preserve `KeySet` verification.

## Automated Evidence

Final Phase 49 gates reran and passed the runtime suite and FSB candidate receipt smoke:

```bash
pnpm --filter @full-self-browsing/lattice test
pnpm --filter @full-self-browsing/lattice typecheck
pnpm --filter @full-self-browsing/lattice lint:packages
node scripts/dogfood-fsb-candidate.mjs --fsb-dir /Users/lakshmanturlapati/Desktop/FSB/automation
```

