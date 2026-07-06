# Phase 54: Python Replay - Context

**Gathered:** 2026-07-06
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) - roadmap and prior phase context accepted

<domain>
## Phase Boundary

Add replay support to the Python client by recomputing `outputHash` only after receipt
verification succeeds, preserving the verify-first security invariant.

</domain>

<decisions>
## Implementation Decisions

### Replay Contract
- Expose `replay(envelope_dict, keyset, outputs)` returning a typed match/mismatch result.
- Reuse `verify()` and raise `VerifyError` if receipt verification fails.
- Compute output hashes according to the v1.5 conformance boundary: null, string, and bytes are first-class; JSON-compatible objects use compact UTF-8 JSON for the implementation-defined branch.

### the agent's Discretion
- Replay result dataclass shape and helper naming are at the agent's discretion.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `spec/SPEC.md` section 6 defines the outputHash dispatch.
- `packages/lattice/src/storage/fingerprint.ts` is the TypeScript source of truth.
- Phase 53 verify helper is the security gate for replay.

### Established Patterns
- Replay must never compute outputHash after a failed verification.

### Integration Points
- Replay tests extend `clients/python/tests/`.

</code_context>

<specifics>
## Specific Ideas

No additional user-specific requests beyond autonomous completion.

</specifics>

<deferred>
## Deferred Ideas

Object-output byte parity remains outside v1.5 conformance scope per `spec/SPEC.md`.

</deferred>

