# Phase 46: Receipt Provenance + KMS Signer Shapes - Research

## Sources

- AWS KMS `Sign` API: https://docs.aws.amazon.com/kms/latest/APIReference/API_Sign.html
- Google Cloud KMS creating and validating signatures: https://docs.cloud.google.com/kms/docs/create-validate-signatures
- DSSE background and PAE rationale: https://github.com/secure-systems-lab/dsse/blob/master/background.md

## Findings

### DSSE Bytes Are the Signer Boundary

Lattice already signs DSSE Pre-Authentication Encoding bytes produced by `buildPae(PAYLOAD_TYPE, payload)`. The remote signer callback must receive those exact bytes. Sending canonical JSON directly would drop DSSE's payload-type binding. Sending a digest by default would force cloud-specific hashing semantics into core and would weaken the existing verifier test surface.

### AWS KMS Shape

AWS KMS `Sign` takes `Message`, `MessageType`, and `SigningAlgorithm`. Current docs distinguish `RAW` from `DIGEST`, warn that using `DIGEST` with unhashed input can compromise signing, and list Ed25519 signing algorithms. A core-safe Lattice interface should not choose AWS request parameters itself; it should hand host code exact DSSE PAE bytes and enough metadata for the host app to choose `MessageType` and algorithm safely.

### Google Cloud KMS Shape

Google Cloud KMS `AsymmetricSign` supports signing with asymmetric keys and exposes data/digest paths. Current docs state that `data` and `digest` are mutually exclusive and examples compute a digest before signing for common algorithms. A generic Lattice callback should avoid assuming a specific Google client request shape; host code can hash or pass raw data according to its configured key algorithm.

### Existing Verification Constraint

`verifyReceipt()` verifies Ed25519 signatures through `publicKeyJwk` from `KeySet`. Phase 46 should not expand algorithms. Remote signer tests should therefore use a callback that delegates to an Ed25519 in-memory signer while recording the bytes received.

## Implementation Notes

- Use `sha256:<hex>` for lineage roots.
- Keep lineage roots additive and optional.
- Compute roots from sanitized refs and lineage descriptors, not values.
- Add public remote signer types/factory, but keep cloud SDK imports out of core and boundary tests.

