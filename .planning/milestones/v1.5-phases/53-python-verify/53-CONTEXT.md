# Phase 53: Python Verify - Context

**Gathered:** 2026-07-06
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) - roadmap and prior phase context accepted

<domain>
## Phase Boundary

Build the smallest trusted Python receipt client operation: verify a Lattice DSSE receipt
envelope against a KeySet and return the same typed verdict taxonomy as the TypeScript
reference implementation.

</domain>

<decisions>
## Implementation Decisions

### Verification Contract
- Use `clients/python/` so no npm package boundary or tarball surface changes.
- Expose `verify(envelope_dict, keyset)` with typed `VerifyOk` / `VerifyFail` results.
- Reuse the committed conformance vectors directly from `conformance/vectors/`.
- Preserve the spec's first-match-wins decision tree, especially downgrade defense before key lookup.

### Dependencies
- Use `rfc8785` for RFC 8785 JCS canonicalization.
- Use `cryptography` for Ed25519 JWK-backed signature verification.

### the agent's Discretion
- Internal helper layout, test fixture loading, and Python packaging details are at the agent's discretion.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/lattice/src/receipts/verify.ts` is the normative decision tree.
- `conformance/verify-ts/src/*.test.ts` is the proven harness pattern to mirror.
- `conformance/vectors/positive/*.json` and `negative/*.json` are the ground truth.

### Established Patterns
- Conformance packages read vectors from disk at test time.
- Signature hex in vector files must be converted to standard base64 before envelope verification.

### Integration Points
- Python tests live under `clients/python/tests/`.
- CI conformance wiring lands in Phase 56.

</code_context>

<specifics>
## Specific Ideas

No additional user-specific requests beyond autonomous completion.

</specifics>

<deferred>
## Deferred Ideas

PyPI publishing remains deferred to v1.6+.

</deferred>

