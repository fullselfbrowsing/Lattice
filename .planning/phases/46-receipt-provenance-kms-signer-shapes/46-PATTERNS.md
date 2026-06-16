# Phase 46: Receipt Provenance + KMS Signer Shapes - Patterns

## Receipt Version Pattern

Previous receipt schema phases widened the accepted version union and kept old shapes verifiable. Follow that pattern:

- Mint v1.3 from `createReceipt()`.
- Accept v1.1, v1.2, and v1.3 in `verifyReceipt()`.
- Preserve the downgrade gate for undefined/v1 receipts.
- Keep new fields optional so old receipts remain structurally valid.

## Optional Field Pattern

Use conditional object spreads for `lineageMerkleRoot`, matching `modelClass`, `parentReceiptCid`, and step-marker fields. This prevents `undefined` from entering canonical JSON.

## Descriptor-Only Provenance Pattern

Use `toArtifactRef()` before hashing. Artifact refs contain ids, kinds, metadata, fingerprints, storage refs, and lineage descriptors, but no raw `value`. This matches the artifact system's existing replay-safe descriptor boundary.

## Best-Effort Receipt Pattern

Runtime receipt minting catches signer/helper failures and returns `undefined`. Lineage computation must live inside the same best-effort block so a malformed lineage descriptor cannot crash `ai.run()`.

## Public Surface Pattern

Any new runtime value export goes through:

- `packages/lattice/src/index.ts`
- `packages/lattice/src/runtime/public-types.ts` for type exports
- `packages/lattice/test/public-surface.test.ts`
- `packages/lattice/test-d/package-types.test-d.ts`

## Core Boundary Pattern

KMS support must be an adapter shape, not an SDK dependency. The existing `node scripts/check-core-package-boundary.mjs` gate should continue to pass without AWS/GCP packages.

