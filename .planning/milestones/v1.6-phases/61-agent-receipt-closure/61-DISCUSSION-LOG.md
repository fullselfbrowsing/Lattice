# Phase 61: Agent Receipt Closure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution.
> Decisions are captured in `61-CONTEXT.md`; this log preserves alternatives.

**Date:** 2026-07-17
**Phase:** 61-agent-receipt-closure
**Mode:** Approved autonomous selection
**Areas discussed:** Public evidence identity, Resume continuity, Receipt ownership, Crew ordering

---

## Public Evidence Identity

| Option | Description | Selected |
|--------|-------------|----------|
| Stable identity plus exact envelope | Add an opaque iteration ID and fill the existing receipt field with the issued envelope. | yes |
| Index plus CID only | Keep numeric index as identity and expose only a content identifier. | |
| Envelope without explicit identity | Attach evidence but leave cross-resume correlation implicit. | |

**Selection:** Stable identity plus exact envelope.
**Notes:** Auto-selected as the smallest truthful public contract. It preserves the
declared envelope type and makes resume correlation explicit.

## Resume Continuity

| Option | Description | Selected |
|--------|-------------|----------|
| Additive v1 snapshot fields | Persist logical execution identity and the completed receipt ledger without changing storage methods. | yes |
| New snapshot version | Fork the snapshot literal and require migration handling. | |
| Receipt IDs only | Persist identifiers but not the exact envelopes/results callers need. | |

**Selection:** Additive `agent-snapshot/v1` fields.
**Notes:** Historical snapshots remain readable. Invalid present snapshots fail before
provider work rather than silently restarting and risking duplicate side effects.

## Receipt Ownership

| Option | Description | Selected |
|--------|-------------|----------|
| Runtime-owned single mint | The runtime issues once and all outer layers attach or reuse the outcome. | yes |
| Pipeline and crew both mint | Preserve separate semantic completion receipts. | |
| Caller-owned collection | Leave public result fields empty unless consumers subscribe externally. | |

**Selection:** Runtime-owned single mint.
**Notes:** This carries Phase 60 strictness forward and removes mutable-pipeline handler
accumulation plus crew replacement minting.

## Crew Ordering

| Option | Description | Selected |
|--------|-------------|----------|
| Root, serial children, parent | Execution order is visible and deterministic. | yes |
| Group by agent ID | Reorder evidence after execution. | |
| Sort by CID | Stable but semantically unrelated to execution. | |

**Selection:** Root, serial child terminals, parent terminal.
**Notes:** Child summaries and per-agent indexes compute CIDs from these same envelope
objects. Repeated successful dispatches remain distinct executions.

## The agent's Discretion

- Opaque ID encoding, helper placement, and internal collector shape.
- Exact snapshot structural validation implementation.

## Deferred Ideas

- A transactional signer/storage outbox for the narrow crash window between a remote
  signing side effect and snapshot persistence belongs to a future host-contract phase.
- Phase 62 owns packed release validation, provider canaries, docs, and comment hygiene.
