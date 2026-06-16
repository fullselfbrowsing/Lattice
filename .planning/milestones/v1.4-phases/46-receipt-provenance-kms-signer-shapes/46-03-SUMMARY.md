# Plan 46-03 Summary: Remote Receipt Signer Shape

**Status:** Complete
**Commit:** ce79563

## Completed

- Added `createRemoteReceiptSigner()` as a cloud-SDK-free adapter to the existing `ReceiptSigner` contract.
- Added remote signer request/result/provider option types.
- Remote signer callbacks receive the exact DSSE PAE bytes, annotated with `payloadFormat: "dsse-pae"` and `algorithm: "Ed25519"`.
- Added tests that record callback bytes, compare them to `buildPae(PAYLOAD_TYPE, envelope.payload)`, delegate signing to an in-memory Ed25519 signer, and verify through `KeySet`.
- Exported the factory and type surface through package root/public type barrels.
- Added public-surface and `tsd` guards.

## Verification

```bash
pnpm --filter @full-self-browsing/lattice test -- remote-signer public-surface public-types
pnpm --filter @full-self-browsing/lattice build
pnpm --filter @full-self-browsing/lattice test:types
pnpm --filter @full-self-browsing/lattice typecheck
```

All passed.

