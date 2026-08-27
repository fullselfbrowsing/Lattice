# Phase 61 Pattern Map

## Data Flow

`runAgentInternal` owns logical execution identity, constructs each
`IterationRecord`, receives one managed checkpoint outcome, persists the completed
ledger, and finalizes one `AgentResult`. Crew code supplies lineage metadata and
collects returned terminal envelopes; it does not become an issuer.

## File Map

| Target | Role | Closest Existing Pattern | Constraint |
|---|---|---|---|
| `agent/types.ts` | Add stable iteration and recovery result types | Existing exact-optional `receipt` fields | Add fields/union member only; keep old literals assignable |
| `agent/runtime.ts` | Identity, managed checkpoint attachment, terminal attachment, resume validation | `runtime/create-ai.ts:1825-1841` returns `{ ...result, receipt: outcome.envelope }` | One outcome, no provider retry, frozen evidence arrays |
| `agent/host.ts` | Snapshot identity and completed ledger | Optional `ancestry` on unchanged `agent-snapshot/v1` | New snapshot fields stay optional for historical payloads |
| `contract/checkpoint.ts` | Exact managed iteration outcome | Existing `onReceiptOutcome` and `step.transition` envelope | Do not alter public manual-hook semantics |
| `agent/crew/dispatcher.ts` | Reuse child terminal envelope and CID | Existing serial dispatch and `receiptCid(envelope)` | Collect before failure routing; remove replacement issuance |
| `agent/crew/run-crew.ts` | Root-first ordered collection and parent reuse | Existing frozen `CrewResult` and per-agent CID map | Root, serial child terminals, parent terminal |
| public/type tests | Additive packed contract | Existing root/modular inventory and tsd literals | Preserve historical `IterationRecord` and `AgentSnapshot` literals |

## Concrete Analogs

### Exact terminal attachment

`runtime/create-ai.ts` is the authority for attaching a successful policy outcome:

```ts
if (outcome.status === "issued") {
  return { ...result, receipt: outcome.envelope };
}
```

The agent finalizer should use the same exact-envelope rule while retaining its
required audit-failure precedence.

### Additive snapshot evolution

`AgentSnapshot.ancestry` proves that optional fields can extend the exported v1 shape
without changing `version: "agent-snapshot/v1"`. Identity and iteration-ledger fields
follow that compatibility pattern; new writers populate them, old payloads omit them.

### Immutable public assembly

`buildFailure`, `buildAuditFailure`, and `freezeCrewResult` copy usage, iterations,
receipts, and CID arrays at the public boundary. Attachment helpers should replace
one record/result and freeze the copied arrays instead of mutating an envelope or a
previously returned result.

### CID ownership

The current dispatcher already computes `await receiptCid(envelope)` immediately
after minting. Keep that operation but feed it the terminal envelope returned by the
child runtime. Pass the known agent ID alongside collection so `run-crew.ts` no longer
decodes signed step names to rebuild ownership.

## Test Patterns

- Real Ed25519 signer/keyset round trips in `agent/integration.test.ts` and
  `survivability-integration.test.ts` prove envelope identity and verification.
- In-memory host storage in `host-integration.test.ts` exposes every serialized safe
  boundary and supports preloaded resume snapshots.
- Signer/provider counters in Phase 60 agent and crew tests prove exactly-once work.
- `test-d/modular-entrypoints.test-d.ts` and `test-d/agent-crew.test-d.ts` preserve
  packed consumer literals while exercising additive fields.

## Avoid

- Do not decode an envelope to reconstruct a result that can receive the original
  object directly.
- Do not register run-captured automatic handlers permanently on a shared pipeline.
- Do not clear an invalid present snapshot and restart provider work.
- Do not add a second crew completion issuer or sort receipts by CID/agent ID.
- Do not make snapshot identity/ledger fields required for historical consumers.

---
*Mapped: 2026-07-17*
