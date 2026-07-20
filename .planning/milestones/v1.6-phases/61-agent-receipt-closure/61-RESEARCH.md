# Phase 61: Agent Receipt Closure - Research

**Researched:** 2026-07-17
**Confidence:** HIGH

## Executive Summary

Phase 61 is an evidence-ownership correction over primitives that already exist.
Phase 60 now produces one safe `ReceiptIssuanceOutcome` for every managed checkpoint
and terminal boundary. Public agent types already declare optional iteration and
terminal envelopes, but the runtime discards successful outcomes. Host snapshots
restore the next index without restoring the run identity or completed records, and
crew layers mint new completion envelopes after agent loops have already minted their
own terminal evidence.

The smallest complete implementation is:

1. give every iteration a stable logical identifier and attach the exact managed
   checkpoint envelope to its record;
2. attach the exact terminal outcome to both success and non-audit failure results;
3. persist execution identity plus completed records in additive snapshot fields and
   reject unsafe recovery before transport; and
4. pass crew-root lineage into agent terminal issuance, then reuse those attached
   terminal envelopes for crew arrays, summaries, and per-agent CIDs.

No new dependency, provider method, signer method, storage method, receipt version,
or public result family is required.

## Repository Findings

### Public evidence fields are promises without producers

`IterationRecord.receipt`, `AgentSuccess.receipt`, and `AgentFailureEvidence.receipt`
already use the exact public `ReceiptEnvelope` type. `runAgentInternal` nevertheless
returns every constructed record without `receipt`, and its terminal finalizer returns
the original result after observing a successful issued outcome. The Phase 60
integration test explicitly proves this handoff by seeing an issued internal outcome
while asserting `result.receipt` is undefined.

This means AGREC-01 and AGREC-02 need no new public collector API. The runtime can
attach `outcome.envelope` at the issuance point and preserve exact-optional behavior
for off, skipped, and failed outcomes.

### Checkpoint issuance currently has two ownership hazards

The automatic checkpoint hook is registered on `AFTER_AGENT_ITERATION`. Each record is
pushed before that event, so a successful outcome can be attached to the current last
record without decoding the envelope or reconstructing it.

However, a caller-supplied `HookPipeline` is mutable and has no unregister or clone
method. Parent and child crew loops can reuse that same instance, and every invocation
registers another captured checkpoint handler. Later events can therefore execute
multiple old handlers and mint more than one receipt. The managed agent checkpoint
must become run-scoped rather than an accumulating pipeline registration. Public
`createCheckpointHook` remains available for independent manual use.

The automatic path can instantiate one checkpoint handler per agent invocation and
call it once immediately after the user pipeline's `AFTER_AGENT_ITERATION` run. This
preserves safety/extension lifecycle execution, uses the shared policy and tracer
format, and gives the runtime the exact outcome to attach. `autoRegisterCheckpoint:
false` continues to suppress the managed path.

### Resume currently loses both logical identity and evidence history

`runId` is generated before snapshot load and captured by the registered checkpoint
handler. Resume later restores only `iterationIndex`, conversation, cumulative usage,
and provider name. The `iterations` array remains empty, so final results expose only
post-restart work; a new random run ID also makes new receipt step chains unrelated to
the original logical execution.

`AgentSnapshot` is already exported and explicitly designed for additive optional
fields under the unchanged `agent-snapshot/v1` literal. Add optional:

- `executionId: string`;
- `iterations: readonly IterationRecord[]`.

New snapshots always write both after checkpoint issuance has attached its envelope.
Resume loads and validates them before creating the managed checkpoint handler. It
restores the full ledger, computes subsequent stable iteration IDs from the restored
execution ID and index, and never calls the signer for stored records.

Historical snapshots can remain compatible. Because their serialized payload is the
only stable restart evidence, a bounded hash of that payload can namespace new tail
iterations without pretending prior envelopes existed. New snapshots immediately
persist the explicit identity and ledger on the next safe boundary.

The current corrupt-snapshot behavior clears storage and starts fresh. That is unsafe
once evidence continuity is a requirement: a present but invalid snapshot can
represent completed billable work. Recovery must instead return a bounded
`agent-recovery-failed` result before provider transport. This new failure kind is
additive and keeps raw deserialize or snapshot data out of the result and trace.

### Stable iteration identity should remain opaque and receipt-bound

The numeric `index` is only unique inside a process-local result. Add
`iterationId: string` and derive it from the stable execution ID plus index using a
fixed internal format. The value is an opaque identifier, never user content.

Use the iteration ID in the checkpoint `stepName` and keep `stepIndex` as the ordinal.
The receipt envelope therefore attests both identity and order without changing the
protocol schema. Terminal issuance uses a distinct stable step marker and can accept
an internal `parentReceiptCid` for crew lineage.

The receipt body's `receiptId` may retain its established issuer-generated UUID. The
public correlation authority is the signed step marker plus the exact attached
envelope, not a new receipt-ID format.

### Terminal finalization needs attachment, not a second issue

`finalize` already centralizes no-provider, provider error, validation, denial,
budget, max-iteration, and success branches. When the terminal outcome is `issued`, it
should return a frozen copy of the underlying result with `receipt` set to that exact
envelope. When required issuance fails, the existing typed audit failure still wins.
A prior required checkpoint failure remains terminal and must not trigger another
receipt attempt.

Success currently clears host storage before terminal issuance. Moving the clear
after terminal finalization keeps the normal terminal evidence boundary coherent and
still prevents a subsequent run from loading completed work. It does not claim an
atomic guarantee across an external signer side effect and host storage because the
current `AgentStorage` interface has no transaction/outbox primitive.

### Crews mint replacements instead of reusing agent terminal evidence

Every parent and child calls `runAgentInternal`, which already attempts a terminal
receipt. The dispatcher then calls `issueReceiptFrom` for successful child completion,
and `runAgentCrew` does the same for parent completion. These replacement envelopes
are the values in `CrewResult.receipts`, child summary CID arrays, and
`CrewAgentResult.receiptCids`; the actual agent terminal envelopes are discarded.

Pass internal terminal metadata into `runAgentInternal`:

- crew root `parentReceiptCid`;
- stable `stepName` of `crew-agent-completion:<agent-id>`.

The issued terminal envelope attached to `childResult.receipt` or
`parentResult.receipt` is then the only completion envelope. The dispatcher collects
the child envelope before routing success or non-audit failure, computes its CID once,
and places that CID in the success summary. The orchestrator collects the parent
envelope last. Required audit failures have no envelope.

The normative array order follows existing serial execution: root, child terminal
envelopes in completion order, parent terminal envelope. Per-agent CID indexes should
be populated at collection time with the known agent ID rather than reconstructed by
decoding signed step-name strings after the run.

### Compatibility surface is additive

The root and `./agents` entrypoints already export every affected type. Required
compatibility gates are:

- old `IterationRecord` and historical `AgentSnapshot` object literals still compile;
- new `iterationId`, optional snapshot identity/ledger, terminal receipts, and crew
  CID relations compile from packed root and modular entrypoints;
- no internal dispatcher or receipt collector becomes public;
- `AgentHost`, `AgentStorage`, `ProviderAdapter`, and `ReceiptSigner` gain no required
  method.

## Recommended Architecture

### Runtime identity and attachment helpers

Keep helpers inside `agent/runtime.ts` unless extraction clearly reduces complexity:

- `createAgentExecutionId()` for fresh logical runs;
- `iterationId(executionId, index)` for opaque stable record identity;
- `attachIterationReceipt(iterations, envelope)` for immutable record replacement;
- `attachTerminalReceipt(result, envelope)` for frozen result copying;
- `restoreAgentSnapshot(serialized, adapter)` for structural validation and bounded
  recovery outcomes.

`RunAgentInternalOptions` can add private terminal receipt context without expanding
the public `AgentIntent` contract.

### Snapshot validation

Validate before transport:

- version is `agent-snapshot/v1`;
- `iterationIndex` is a nonnegative integer;
- explicit execution ID is a nonempty bounded string;
- restored records have unique iteration IDs and strictly increasing unique indexes;
- every restored index is lower than the next `iterationIndex`;
- envelope-shaped receipt values have the expected payload type and signature array;
- restored cumulative token counts are finite nonnegative integers and cost is null
  or finite nonnegative.

Do not expose the serialized payload or caught deserialize message. Trace only a
bounded recovery reason such as `deserialize-failed` or `snapshot-invalid`.

### Crew collector

Replace `mintedReceipts(envelope)` with an internal collector that receives the known
agent ID, exact envelope, and computed CID. Use it to append once to the ordered crew
array and once to that agent's CID list. The crew root remains a separate first entry
and `crewRootCid` remains its public index.

Remove child and parent completion issuance helpers after every path uses attached
agent terminal evidence. Retain `receiptCid` only for indexing the actual envelope.

## Threat Model

| Ref | Threat | Severity | Required mitigation |
|---|---|---:|---|
| T-61-01 | Issued iteration or terminal evidence is discarded or reconstructed | High | attach the exact `ReceiptIssuanceOutcome.envelope` at the runtime issuance point |
| T-61-02 | Reused mutable pipelines accumulate checkpoint handlers and mint duplicates | Critical | run-scoped managed checkpoint invocation; exact signer-count tests across reused pipelines/crews |
| T-61-03 | Resume creates a new logical identity or remints completed iterations | Critical | persist/restore execution ID plus completed envelope ledger before new work |
| T-61-04 | Invalid snapshot silently restarts completed billable work | Critical | bounded terminal recovery failure before provider transport |
| T-61-05 | Snapshot ledger duplicates or reorders iteration identities | High | structural validation and generated unique/ordered ledger tests |
| T-61-06 | Crew mints replacement completion receipts | Critical | child/parent terminal receipt context and exact envelope reuse |
| T-61-07 | Crew CID arrays do not identify the exposed envelopes | High | compute each CID from the collected envelope and assert object/CID correspondence |
| T-61-08 | Receipt or snapshot internals leak through recovery diagnostics | High | bounded reason taxonomy; secret-sentinel serialization tests |

## Validation Architecture

Use existing Vitest infrastructure and the repository fast-check wrapper. Keep task
feedback focused and reserve the full package/build/declaration gate for the closure
plan.

Agent attachment feedback:

`pnpm --filter @full-self-browsing/lattice exec vitest run src/contract/checkpoint.test.ts src/agent/runtime.test.ts src/agent/integration.test.ts`

Resume feedback:

`pnpm --filter @full-self-browsing/lattice exec vitest run src/agent/host-integration.test.ts src/agent/survivability-integration.test.ts`

Crew feedback:

`pnpm --filter @full-self-browsing/lattice exec vitest run src/agent/crew/dispatcher.test.ts src/agent/crew/run-crew.test.ts src/agent/crew/crew-integration.test.ts`

Public closure feedback:

`pnpm --filter @full-self-browsing/lattice exec vitest run test/agent-receipt-closure.test.ts test/public-surface.test.ts test/modular-entrypoints.test.ts`

Final gate:

`pnpm --filter @full-self-browsing/lattice typecheck && pnpm --filter @full-self-browsing/lattice test && pnpm --filter @full-self-browsing/lattice build && pnpm --filter @full-self-browsing/lattice test:types && pnpm check:module-boundaries`

Generated cases should cover fresh/resumed indexes, legacy/additive/invalid snapshots,
off/best-effort/required modes, signer counts, success/failure terminals, repeated
shared-pipeline use, multiple serial child dispatches, and CID/envelope equality.

## Planning Implications

Use four plans with no more than two tasks each:

1. attach stable iteration and terminal evidence through the single-agent runtime;
2. persist and validate resume identity plus the completed receipt ledger;
3. remove crew completion replacement minting and define exact envelope/CID order;
4. close root/modular/packed contracts with generated cross-surface evidence and the
   full package gate.

Plans 2 and 3 both depend on Plan 1 but can otherwise be reasoned about independently.
The closure plan depends on both and must not absorb Phase 62 documentation or canary
scope.

## Sources

### Repository

- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/phases/60-audit-evaluation-and-cost-integrity/60-CONTEXT.md`
- `.planning/phases/60-audit-evaluation-and-cost-integrity/60-02-SUMMARY.md`
- `packages/lattice/src/agent/{types,runtime,host}.ts`
- `packages/lattice/src/agent/{integration,host-integration,survivability-integration}.test.ts`
- `packages/lattice/src/agent/crew/{run-crew,dispatcher}.ts`
- `packages/lattice/src/contract/checkpoint.ts`
- `packages/lattice/src/receipts/{policy,receipt,cid,types}.ts`
- `packages/lattice/src/runtime/survivability.ts`
- `packages/lattice/src/{index,agents}.ts`
- `packages/lattice/test/{public-surface,modular-entrypoints}.test.ts`
- `packages/lattice/test-d/{public-api,modular-entrypoints,agent-crew}.test-d.ts`

No external dependency or unstable provider behavior is needed for this phase; the
authoritative problem and acceptance surface are repository-local.

---
*Research completed: 2026-07-17*
