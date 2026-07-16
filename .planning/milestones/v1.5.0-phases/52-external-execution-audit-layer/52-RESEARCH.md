# Phase 52 Research: External Execution Audit Layer

## Existing Primitives

- `createReceipt(input, signer)` emits `lattice-receipt/v1.3` DSSE envelopes and remains verifier-compatible with v1.1/v1.2/v1.3 readers.
- Runtime receipt issuance computes:
  - input hashes from artifact values with `fingerprintArtifactValue`
  - output hash from raw output values
  - contract hash from RFC 8785 canonical JSON
  - optional lineage Merkle root from artifact lineage descriptors
- CLI sidecar loader accepts `lattice-sidecar/v1`, requires `task`, `outputs`, `policy`, and `contract`, and ignores unknown top-level fields.
- CLI `repro` and `eval` already operate on receipt + sidecar + fixture directories.

## Implementation Notes

- The audit helper can reuse `fingerprintArtifactValue`, `computeArtifactLineageMerkleRoot`, `createReceipt`, `createExecutionPlan`, and replay types.
- Keep raw request and response envelopes in the sidecar under an `externalExecution` object, along with their hashes. This avoids changing receipt schema and keeps redaction/signature behavior stable.
- The replay envelope can be constructed directly for the external execution result. It should include a synthetic completed plan and the signed receipt.
- Use `lattice-sidecar/v1` so current CLI loaders can consume the sidecar fields they already understand.

## Risks

- Raw envelopes may contain secrets. The helper should not print or expose them through receipts; they stay in caller-controlled sidecar storage.
- Sidecar output specs cannot represent Standard Schema validators. This is an existing v1 sidecar limitation; raw output values still allow offline exact replay/diff.
- Adding the helper to root exports risks dragging audit into runtime. Export through `audit.ts` and root re-export only the helper/types.
