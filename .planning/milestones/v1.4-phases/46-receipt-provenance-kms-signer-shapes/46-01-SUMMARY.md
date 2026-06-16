# Plan 46-01 Summary: Receipt v1.3 Provenance Schema

**Status:** Complete
**Commit:** e656011

## Completed

- Added `lattice-receipt/v1.3` to `CapabilityReceiptBody`.
- Added optional `lineageMerkleRoot?: string` to receipt bodies and `CreateReceiptInput`.
- Updated `createReceipt()` to mint v1.3 receipts.
- Updated `verifyReceipt()` to accept v1.1, v1.2, and v1.3 while preserving the v1/undefined downgrade rejection.
- Added `computeArtifactLineageMerkleRoot()`:
  - hashes descriptor-only artifact refs
  - excludes raw artifact values
  - normalizes top-level artifact order and parent order
  - returns `undefined` when no lineage exists

## Verification

```bash
pnpm --filter @full-self-browsing/lattice test -- lineage receipt verify
pnpm --filter @full-self-browsing/lattice typecheck
```

Both passed.

