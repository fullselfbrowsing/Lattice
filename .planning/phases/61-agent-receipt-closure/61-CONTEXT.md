# Phase 61: Agent Receipt Closure - Context

**Gathered:** 2026-07-17
**Status:** Ready for planning
**Source:** Approved autonomous v1.6 bridge execution, Phase 60 handoff, and repository research

<domain>
## Phase Boundary

This phase closes the evidence contract already declared by the public agent types.
It attaches the exact envelopes issued by the Phase 60 policy to stable iteration and
terminal result identities, persists enough evidence to resume without reminting
completed iterations, and makes crews reuse those same terminal envelopes and CIDs.

The phase does not change receipt cryptography, issuance modes, provider execution,
crew orchestration, host storage methods, or the general hook API. Packed release
validation, live provider canaries, documentation refresh, and comment hygiene remain
Phase 62.

</domain>

<decisions>
## Implementation Decisions

### Public evidence identity

- **D-61-01:** `IterationRecord` gains an additive stable opaque `iterationId`.
  The existing optional `receipt` field carries the exact `ReceiptEnvelope` issued
  for that record, never a reconstruction or CID-only surrogate.
- **D-61-02:** `AgentSuccess.receipt` and `AgentFailure.receipt` carry the exact
  terminal envelope issued by the runtime finalizer. Off mode and unsuccessful
  best-effort issuance omit the field; required issuance failures retain the Phase
  60 typed audit outcome and cannot fabricate an envelope.
- **D-61-03:** Iteration receipts bind to both the stable iteration identifier and
  monotonic index through receipt step markers. Terminal receipts use a distinct
  stable terminal marker so an iteration receipt cannot be mistaken for loop-close
  evidence.
- **D-61-04:** Attachment covers Lattice-managed automatic agent receipts. A caller
  that disables automatic checkpoints and registers an independent manual hook owns
  that hook's external evidence channel; the runtime must not infer or duplicate it.

### Resume continuity

- **D-61-05:** One stable execution ID identifies a logical agent run. It is created
  once, restored before any checkpoint or terminal finalizer is constructed, and is
  the namespace for deterministic iteration IDs across host restarts.
- **D-61-06:** `AgentSnapshot` keeps the `agent-snapshot/v1` literal and gains
  optional execution-identity and completed-iteration ledger fields. New snapshots
  always persist both, including attached envelopes. The optional shape preserves
  deserialization of historical v1 snapshots without a public version fork.
- **D-61-07:** Resume restores the completed iteration ledger before appending new
  records. Returned iteration order is the full logical run, IDs remain unique, and
  already stored envelopes are reused without invoking the signer again.
- **D-61-08:** A historical snapshot without identity derives a stable compatibility
  identity from its serialized snapshot evidence and never fabricates missing prior
  iteration envelopes. Newly written snapshots use the explicit identity path.
- **D-61-09:** A present snapshot that cannot be parsed or fails structural identity,
  index, or receipt-ledger validation terminates before provider work with a bounded
  agent recovery failure. Silently clearing it and starting fresh would risk duplicate
  provider work and receipts.

### Receipt ownership

- **D-61-10:** The agent runtime is the single owner of one managed receipt attempt
  per completed iteration and one terminal receipt attempt per result. The existing
  shared Phase 60 policy helpers remain the only strictness and diagnostics authority.
- **D-61-11:** Managed iteration issuance must be run-scoped and cannot accumulate
  checkpoint handlers on a caller-supplied pipeline reused by parent and child loops.
  Safety and extension hooks still run once per lifecycle event.
- **D-61-12:** A terminal finalizer attaches an issued envelope before returning and
  preserves the underlying success or failure evidence. It does not call the provider,
  retry completed work, or mint a second receipt after a required checkpoint failure.
- **D-61-13:** Snapshots are written only after the completed iteration record has its
  issued envelope attached, so the normal safe resume boundary has one durable
  identity/evidence ledger.

### Crew envelope reuse and order

- **D-61-14:** A crew mints its root envelope once. Parent and child agent loops receive
  the root CID as internal terminal receipt context, so their own terminal envelopes
  are the crew completion envelopes. The dispatcher and orchestrator must not mint
  replacement completion receipts.
- **D-61-15:** `CrewResult.receipts` order is normative: crew root first, then terminal
  child envelopes in serial completion order, then the parent terminal envelope. A
  terminal envelope issued for a non-audit agent failure is still collected; an audit
  issuance failure has no envelope to collect.
- **D-61-16:** Child summary `receipts`, `CrewAgentResult.receiptCids`, and
  `CrewResult.receipts` are populated from the same envelope objects. Every CID is
  computed from the collected envelope and never used as a reason to remint it.
- **D-61-17:** Repeated successful dispatches of the same agent spec are separate
  executions with separate terminal envelopes. Cached terminal failures remain
  single-shot and return their prior structured error without another child run or
  receipt attempt.

### The agent's Discretion

- Exact helper/module names, the opaque iteration-ID encoding, snapshot validation
  helper placement, and whether receipt collection uses an internal observer or
  returned outcome are implementation details.
- Existing public fields remain additive and exact-optional. No required provider,
  host, signer, or storage method may be added.

</decisions>

<canonical_refs>
## Canonical References

**Downstream work must read these before planning or implementing.**

### Requirements and prior policy

- `.planning/ROADMAP.md` - Phase 61 goal, dependency, and four success criteria.
- `.planning/REQUIREMENTS.md` - AGREC-01 through AGREC-04 and the no-new-orchestration boundary.
- `.planning/phases/60-audit-evaluation-and-cost-integrity/60-CONTEXT.md` - shared receipt modes, strictness, safe diagnostics, and explicit Phase 61 deferral.
- `.planning/phases/60-audit-evaluation-and-cost-integrity/60-02-SUMMARY.md` - internal terminal outcome channel and current crew completion issuance handoff.
- `.planning/phases/60-audit-evaluation-and-cost-integrity/60-VERIFICATION.md` - proved no-repeat and policy behavior that attachment must preserve.

### Agent identity, resume, and receipt boundaries

- `packages/lattice/src/agent/types.ts` - declared iteration and terminal receipt fields.
- `packages/lattice/src/agent/runtime.ts` - checkpoint registration, terminal finalizer, result construction, and resume flow.
- `packages/lattice/src/agent/host.ts` - additive `agent-snapshot/v1` contract.
- `packages/lattice/src/runtime/survivability.ts` - opaque snapshot and safe-boundary model.
- `packages/lattice/src/contract/checkpoint.ts` - exact issued-envelope outcome from managed iteration checkpoints.
- `packages/lattice/src/receipts/policy.ts` - Phase 60 issuance policy and bounded outcomes.
- `packages/lattice/src/receipts/receipt.ts` - receipt identifiers, step markers, and envelope construction.

### Crew ownership and public compatibility

- `packages/lattice/src/agent/crew/run-crew.ts` - root/parent completion minting, receipt order, and per-agent CID index.
- `packages/lattice/src/agent/crew/dispatcher.ts` - child terminal minting and summary receipt CIDs.
- `packages/lattice/src/agents.ts` - modular public agent and crew exports.
- `packages/lattice/src/index.ts` - beginner-root public types.
- `packages/lattice/test/public-surface.test.ts` and `packages/lattice/test-d/modular-entrypoints.test-d.ts` - exact additive public and packed compatibility gates.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `ReceiptIssuanceOutcome` already carries the exact issued envelope and the safe
  skipped/failed variants needed for attachment without a second signer call.
- `createCheckpointHook` already emits the exact managed iteration envelope to its
  bounded observer; the runtime currently discards that successful value.
- `RunAgentInternalOptions.onReceiptOutcome` already exposes terminal and checkpoint
  outcomes inside the package and can be narrowed or enriched without a root export.
- `receiptCid` computes the crew CID directly from an envelope, and child summaries
  already accept receipt CID strings.

### Established Patterns

- Agent results and crew results are frozen additive objects with exact-optional
  evidence fields.
- Host resume stores opaque `SerializedSnapshot` values through unchanged
  `save/load/clear` methods and uses the survivability adapter for shape round trips.
- Phase 60 preflights required receipt policy before host access and prevents signer
  faults from repeating provider or child work.
- Crew execution is serial, so terminal completion order is deterministic without a
  sorting layer.

### Confirmed Gaps

- `IterationRecord.receipt`, `AgentSuccess.receipt`, and `AgentFailure.receipt` are
  declared but never populated.
- Resume restores only index, conversation, usage, and provider; it creates a new
  run ID and returns only post-resume iteration records.
- New checkpoint handlers accumulate when a shared mutable pipeline is reused across
  agent runs, which can mint more than one receipt for a lifecycle event.
- Child and parent loops mint terminal receipts that crews ignore; dispatcher and
  orchestrator then mint separate completion envelopes and derive CIDs from those
  replacements.
- Crew child and parent completion receipts currently use different generated run-ID
  authorities and are indexed later by decoding step-name strings.

</code_context>

<specifics>
## Specific Ideas

The bridge is an ownership correction, not a new audit subsystem: capture once at the
runtime issuance point, persist at the safe iteration boundary, and pass the same
immutable envelope outward through agent and crew results.

</specifics>

<deferred>
## Deferred Ideas

- Atomic exactly-once recovery across a crash between an external signer side effect
  and host snapshot persistence requires a transactional host/outbox contract. This
  phase guarantees the existing post-iteration safe boundary and does not add host
  storage methods.
- General agent orchestration changes, parallel child execution, packed Node/provider
  canaries, documentation, and production comment cleanup remain outside Phase 61.

</deferred>

---
*Phase: 61-agent-receipt-closure*
*Context gathered: 2026-07-17*
