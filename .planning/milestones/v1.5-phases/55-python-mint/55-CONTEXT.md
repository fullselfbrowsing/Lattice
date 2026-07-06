# Phase 55: Python Mint - Context

**Gathered:** 2026-07-06
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) - roadmap and prior phase context accepted

<domain>
## Phase Boundary

Add Python minting for already-assembled receipt bodies: JCS canonical bytes, standard
base64 payload, DSSE PAE, Ed25519 signature, and DSSE envelope assembly.

</domain>

<decisions>
## Implementation Decisions

### Mint Contract
- Expose `mint(body_dict, private_jwk)` returning envelope plus canonical/PAE/signature intermediate values for conformance.
- Require body `kid` to be the envelope `signatures[0].keyid`.
- Reject unsafe numeric values and raw float `costUsd` before signing.
- Do not implement runtime redaction or provider integration in Python v1.5; consumers pass the receipt body to sign.

### the agent's Discretion
- CLI shape for parity tests and exact dataclass names are at the agent's discretion.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/lattice/src/receipts/receipt.ts` defines the TypeScript minting order.
- `conformance/vectors/positive/vec-00-v1.3.json` provides a deterministic body and expected intermediates.
- The committed example private JWK is test-only material used only for conformance.

### Established Patterns
- Compare canonical bytes and PAE before relying on signature success.

### Integration Points
- Python CLI `python -m lattice_receipt mint-json` supports the Phase 56 TS parity test.

</code_context>

<specifics>
## Specific Ideas

No additional user-specific requests beyond autonomous completion.

</specifics>

<deferred>
## Deferred Ideas

Full runtime receipt assembly/redaction remains TypeScript-first and outside this Python client.

</deferred>

