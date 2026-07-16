# Phase 58: Conformance and Client Migration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md; this log preserves the alternatives considered.

**Date:** 2026-07-16
**Phase:** 58-conformance-and-client-migration
**Areas discussed:** Vector corpus boundary, CLI migration policy, independent interoperability proof, specification and delivery gates

---

## Vector Corpus Boundary

| Option | Description | Selected |
|--------|-------------|----------|
| Frozen legacy plus separate standard corpus | Move historical files byte-for-byte into a labeled legacy tree and generate an independently labeled v1.4 corpus. | Yes |
| Rewrite the existing corpus in place | Replace historical signatures and keep one undifferentiated positive/negative tree. | No |
| Keep a mixed flat corpus | Add profile metadata but leave legacy and standard files together. | No |

**User's choice:** Approved the recommended frozen-legacy and separate-standard model as part of end-to-end milestone execution.
**Notes:** The move must retain independent proof that historical bytes did not change.

---

## CLI Migration Policy

| Option | Description | Selected |
|--------|-------------|----------|
| Bridge default plus `--standard-only` | Preserve compatibility while making the verified profile visible and strict operation explicit. | Yes |
| Standard-only by default | Reject historical receipts unless an allow-legacy flag is supplied. | No |
| Reporting only | Show the profile but provide no CLI enforcement switch. | No |

**User's choice:** Approved the v1.6 bridge posture and recommended explicit strict flag.
**Notes:** Verify and replay must apply the same policy throughout their execution path.

---

## Independent Interoperability Proof

| Option | Description | Selected |
|--------|-------------|----------|
| Exact test-only oracle plus reciprocal mint | Pin `securesystemslib==1.4.0`, compare PAE/signatures independently, and verify both language directions. | Yes |
| Cross-language tests only | Let TypeScript and Python validate each other without a third implementation. | No |
| Oracle as a runtime dependency | Delegate production verification to securesystemslib. | No |

**User's choice:** Approved full research and the recommended independent-oracle gate.
**Notes:** The oracle checks standard cryptographic framing only; Lattice policy stays in Lattice.

---

## Specification and Delivery Gates

| Option | Description | Selected |
|--------|-------------|----------|
| Atomic docs, corpus, CI, and packed-consumer migration | Ship every implementer-facing and automated surface together and fail CI on drift. | Yes |
| Documentation-first staged migration | Publish protocol text before updating all executable consumers. | No |
| Tests without packed consumers | Validate the workspace only and defer package-level behavior entirely. | No |

**User's choice:** Approved the recommended complete Phase 58 closure.
**Notes:** Packed coverage is deliberately focused on receipt and CLI protocol behavior; Phase 62 owns the broad compatibility matrix.

## the agent's Discretion

- Exact vector counts and fixture names.
- Whether packed protocol checks extend the existing version-surface script or use a focused companion script.
- Internal generator and harness module layout.

## Deferred Ideas

- Make standard-only the default after a separately announced deprecation window.
- Expand package smoke across every supported Node version and provider wire family in Phase 62.
