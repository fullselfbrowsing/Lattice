# Phase 46: Receipt Provenance + KMS Signer Shapes - Context

**Gathered:** 2026-06-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 46 extends signed Capability Receipts so they can commit to artifact lineage without embedding artifact payloads, and adds a core-safe remote signer adapter shape for production KMS-backed signing. In scope: an additive v1.3 receipt body field for a lineage merkle root; verifier compatibility for v1.1/v1.2/v1.3; runtime receipt issuance that computes the root from existing artifact lineage descriptors; streaming receipt coverage after stream collection; crew child completion receipt coverage when child artifact lineage exists; and a generic remote signer factory that adapts AWS KMS, Google Cloud KMS, or equivalent remote signing services to the existing `ReceiptSigner` contract without importing cloud SDKs.

Out of scope: changing DSSE envelope format, replacing Ed25519 verification, storing artifact content in receipts, adding cloud provider SDK dependencies to `@full-self-browsing/lattice`, implementing provider-specific AWS/GCP clients, or expanding receipt verification to non-Ed25519 algorithms.

</domain>

<decisions>
## Implementation Decisions

### Receipt Provenance Shape
- Add `lineageMerkleRoot?: string` to `CapabilityReceiptBody` and `CreateReceiptInput`. Use a `sha256:<hex>` string so it matches existing receipt CID style and is inspectable without content.
- Treat v1.3 as the new minted receipt version. `verifyReceipt` must continue to accept v1.1 and v1.2 receipts while rejecting v1/undefined through the existing downgrade gate.
- The lineage root commits to sanitized artifact refs and nested lineage descriptors, not raw `value` payloads. Existing `toArtifactRef()` is the starting point because it strips values.
- Compute a deterministic merkle root only when at least one artifact in the set has `lineage`. Receipts without lineage omit the field rather than writing an empty root.
- Keep the root algorithm local and deterministic: canonicalize each sanitized lineage-bearing artifact graph, hash leaves with SHA-256, sort leaves, then pair-hash to one root.

### Runtime Issuance
- Add a receipt-lineage helper under `receipts/` so `create-ai`, agent crew, and direct receipt tests share the same implementation.
- Preserve existing `inputHashes` semantics. Do not mix output artifact refs into `inputHashes`; add a separate lineage-artifact path for merkle-root computation.
- In `createAI().run`, compute lineage roots from input artifacts plus output artifact refs where available. This covers normal runs and streaming runs because Phase 43 collects streams before returning a normalized response.
- In crew completion receipts, compute lineage roots from child result artifacts where available. Root/start receipts can remain lineage-free.
- Keep checkpoint receipts lineage-free unless a caller explicitly passes a lineage root through `CreateReceiptInput`; checkpoint contexts carry step markers, not artifact graphs.

### KMS Signer Surface
- Add a generic `createRemoteReceiptSigner()` factory that returns the existing `ReceiptSigner` shape.
- The callback receives the exact bytes passed to `ReceiptSigner.sign()`, annotated as DSSE PAE bytes. It also receives `kid`, `publicKeyJwk`, optional `keyRef`, and optional provider metadata.
- Core does not call AWS or Google clients. Host apps adapt the callback to AWS KMS `Sign`, Google Cloud KMS `AsymmetricSign`, HSMs, keyrings, or internal signing services.
- Preserve current verification semantics: the test signer uses an Ed25519-compatible public JWK and verifies through `createMemoryKeySet` + `verifyReceipt`.
- Tests must prove the remote callback receives canonical DSSE PAE bytes, not raw canonical JSON or an already-hashed digest.

### the agent's Discretion
- The implementation may add small helper modules under `receipts/` and minimal type additions to agent result surfaces if that is the cleanest way to expose child result artifacts to crew receipts.
- Public exports should be guarded by existing package-root surface tests and type tests.
- No live cloud calls are required; KMS behavior is represented by a local callback that records bytes and delegates to an in-memory Ed25519 signer.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/lattice/src/artifacts/artifact.ts` exposes `toArtifactRef()`, which strips `value` and keeps descriptor metadata, storage, fingerprint, and lineage.
- `packages/lattice/src/artifacts/lineage.ts` defines nested lineage descriptors with `parents` and `transform`.
- `packages/lattice/src/receipts/envelope.ts` owns DSSE `PAYLOAD_TYPE`, base64 helpers, `buildPae()`, and envelope encode/decode.
- `packages/lattice/src/receipts/canonical.ts` owns JCS canonicalization for receipt bodies.
- `packages/lattice/src/receipts/sign.ts` owns the in-memory Ed25519 signer and verifier.

### Established Patterns
- Receipt creation order is strict: redact -> canonicalize -> DSSE PAE -> sign -> envelope.
- Optional receipt fields use conditional spreads to preserve `exactOptionalPropertyTypes`.
- `maybeIssueReceipt()` in `runtime/create-ai.ts` treats receipt minting as best-effort and must not crash runs on signer failure.
- Crew completion receipts are synthetic `lattice-crew/agent-completion` receipts chained to the crew-root CID through `parentReceiptCid`.
- Public exports are protected by `packages/lattice/test/public-surface.test.ts`, `runtime/public-types.test.ts`, and `test-d/package-types.test-d.ts`.

### Integration Points
- `CapabilityReceiptBody` and `ReceiptSigner` live in `packages/lattice/src/receipts/types.ts`.
- `createReceipt()` lives in `packages/lattice/src/receipts/receipt.ts` and currently mints v1.2.
- `verifyReceipt()` lives in `packages/lattice/src/receipts/verify.ts` and currently accepts v1/v1.1/v1.2 structurally while rejecting v1 at the downgrade gate.
- Runtime terminal receipt issuance flows through `maybeIssueReceipt()` in `packages/lattice/src/runtime/create-ai.ts`.
- Crew child completion receipt issuance flows through `packages/lattice/src/agent/crew/dispatcher.ts`; parent/root completion receipt issuance flows through `packages/lattice/src/agent/crew/run-crew.ts`.

</code_context>

<specifics>
## Specific Ideas

Official docs used for KMS shape constraints:
- AWS KMS `Sign` accepts a `Message` byte blob, `MessageType`, and `SigningAlgorithm`; AWS documents `RAW` versus `DIGEST` semantics and includes Ed25519 signing algorithms in the current API reference: https://docs.aws.amazon.com/kms/latest/APIReference/API_Sign.html
- Google Cloud KMS `AsymmetricSign` accepts either `data` or `digest`, with examples that compute a digest before calling the API and return a signature byte array: https://docs.cloud.google.com/kms/docs/create-validate-signatures
- DSSE rationale emphasizes signing the payload type through PAE so signer and verifier interpret the payload consistently: https://github.com/secure-systems-lab/dsse/blob/master/background.md

</specifics>

<deferred>
## Deferred Ideas

Provider-specific KMS packages, ECDSA/RSA receipt verification, multi-signature envelopes, hosted key lookup, and receipt CLI diff output are deferred. Phase 48 owns receipt comparison CLI work.

</deferred>
