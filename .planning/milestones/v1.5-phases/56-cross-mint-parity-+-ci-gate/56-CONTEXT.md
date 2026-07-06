# Phase 56: Cross-Mint Parity + CI Gate - Context

**Gathered:** 2026-07-06
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) - roadmap and prior phase context accepted

<domain>
## Phase Boundary

Close the milestone by proving TypeScript accepts a Python-minted receipt and by adding a
single conformance CI job for receipt/spec/conformance/Python-client drift.

</domain>

<decisions>
## Implementation Decisions

### Cross-Mint Test
- Add the parity test to `conformance/verify-ts` so it can import TS verifier source directly.
- Gate the test behind `LATTICE_RUN_CROSS_MINT=1` so the normal Node test suite does not require Python dependencies.
- Spawn `python -m lattice_receipt mint-json`, then verify the envelope with TypeScript `verifyReceipt`.

### CI Gate
- Add `.github/workflows/conformance.yml` with path filters for `spec/`, `conformance/`, `clients/python/`, receipt source, and the fingerprint source.
- Run manifest check, TS harness, Python pytest, and cross-mint parity in order.
- Use SHA-pinned setup actions to match the repository's existing CI safety posture.

### the agent's Discretion
- Exact workflow name and path-filter breadth are at the agent's discretion as long as receipt drift is covered.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Existing `.github/workflows/ci.yml` provides pinned action patterns.
- `conformance/verify-ts` already imports `verifyReceipt` directly.
- Python CLI from Phase 55 provides subprocess minting.

### Established Patterns
- Main CI is Node-only; Python parity is isolated in a conformance workflow.

### Integration Points
- `.github/workflows/conformance.yml`
- `conformance/verify-ts/src/cross_mint_parity.test.ts`

</code_context>

<specifics>
## Specific Ideas

No additional user-specific requests beyond autonomous completion.

</specifics>

<deferred>
## Deferred Ideas

Branch-protection configuration is outside the repository; the workflow exposes the required `conformance` job.

</deferred>

