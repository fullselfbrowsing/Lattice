# Phase 10: Receipts inside the Replay Envelope - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

A `ReplayEnvelope` carries optional `receipt?: ReceiptEnvelope` and `contract?: CapabilityContract` fields so that a single receipt is sufficient to materialize an offline replay session deterministically. The CLI (Phase 11) consumes this materialization API.

Out of scope: CLI commands (Phase 11), eval gate (Phase 12), drift warnings beyond the existing Phase 5 ReplayEnvelope baseline.
</domain>

<decisions>
## Implementation Decisions

### ReplayEnvelope Extension
- Add optional `receipt?: ReceiptEnvelope` to the existing `ReplayEnvelope` shape in `packages/lattice/src/replay/replay.ts`. Optional — preserves v1.0 envelope compatibility.
- Add optional `contract?: CapabilityContract` to the existing `ReplayEnvelope` shape. Optional — recorded so replays can re-run pre-flight checks deterministically.
- Both fields use type-only imports from `receipts/types.js` and `contract/contract.js` to keep `replay.ts` runtime-import-free of the receipts module (so verify-only consumers don't pay for the full receipt builder).

### Materialization API
- New exported function `materializeReplayEnvelope(receipt, artifactLoader)` in `packages/lattice/src/replay/materialize.ts`:
  - Input: `ReceiptEnvelope` plus an async `artifactLoader(hash: string): Promise<ArtifactInput>` callback for resolving content-addressed artifact bodies.
  - Output: `Promise<ReplayEnvelope>` — fully populated with task, artifacts, outputs, policy, the receipt, and (when present in the receipt) the contract.
  - The function VERIFIES the receipt (via `verifyReceipt`) before materializing. On verify failure, throws a typed `MaterializationError` (NEW) discriminated by kind: `"verify-failed" | "artifact-load-failed" | "envelope-malformed"`.
- The function does NOT execute the run — it just produces a `ReplayEnvelope` that the caller passes to existing `replayOffline()`.

### Round-trip Guarantee
- The receipt's `outputHash` field MUST match the SHA-256 of the canonicalized output produced by `replayOffline(envelope)`. If they differ, the offline replay drifted from the original — surfaced as a Phase 5 `DriftWarning` (already exists in v1.0).
- New round-trip test: createReceipt → materializeReplayEnvelope (with in-memory artifact loader) → replayOffline → verify `outputHash` matches.

### Public Surface
- Export from `packages/lattice/src/index.ts`: `materializeReplayEnvelope`, `MaterializationError`.
- No new types beyond the existing `ReplayEnvelope` augmentation and the new error type.

### Claude's Discretion
- File layout under `packages/lattice/src/replay/`: keep `replay.ts` as-is (just type augmentation) and add `materialize.ts` for the new function. `materialize.test.ts` co-located.
- Artifact loader interface: `(hash: string) => Promise<ArtifactInput>`. Simple, async, error propagation via rejection.
- The materializer constructs the `ReplayEnvelope.task`, `artifacts[]`, `outputs`, `policy` fields from the receipt's hashes plus the artifact loader. If the receipt doesn't carry enough info to reconstruct a `RunIntent` (e.g., no task field stored), accept that as a v1.1 limitation and document.

### Limitation note (v1.1 scope)
The receipt body schema does NOT include the original task string, the outputs contract map, or the policy snapshot. That's by design — receipts are minimal attestations, not full audit logs. Phase 10's materialization is best-effort: callers may need to supply additional inputs (task, outputs schema, policy) alongside the receipt. The materializer signature is `materializeReplayEnvelope(receipt, { artifactLoader, task?, outputs?, policy? })`. When `task`/`outputs`/`policy` are absent, the envelope's `task` defaults to an empty string and outputs default to an empty map — replay still works, but reconstructing the EXACT original `RunIntent` requires the caller to supply those fields. This is the intended v1.1 contract; Phase 11's `lattice repro` CLI explicitly accepts a sidecar JSON file for these inputs.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/lattice/src/replay/replay.ts` — existing v1.0 `ReplayEnvelope` + `replayOffline()`. Add type augmentation, do NOT change runtime behavior.
- `packages/lattice/src/receipts/verify.ts` — pure `verifyReceipt`. Reuse before materializing.
- `packages/lattice/src/storage/fingerprint.ts` — SHA-256 helpers for output hash comparison.
- `packages/lattice/src/results/result.ts` — `RunSuccess.receipt?` already exists from Phase 9; Phase 10 reads from it.

### Integration Points
- `ReplayEnvelope` interface: add `receipt?: ReceiptEnvelope`, `contract?: CapabilityContract` (type-only imports).
- New file: `packages/lattice/src/replay/materialize.ts`.
- `index.ts`: export `materializeReplayEnvelope`, `MaterializationError`.

### Established Patterns
- Pure async functions for kernel work.
- Typed error unions, not exceptions.
- Optional fields throughout.
</code_context>

<specifics>
## Specific Ideas

- The artifact loader contract is intentionally minimal: `(hash: string) => Promise<ArtifactInput>`. The CLI (Phase 11) will provide a filesystem-backed loader that reads from `.lattice/fixtures/<sha256>.bin`. This phase implements only the in-memory variant for testing.
- The materializer MUST verify the receipt before doing anything else. Tampered receipts must not produce valid replay envelopes.
- Round-trip test against all Phase 9 verdicts (success, tripwire-violated, no-contract-match) — materializing a failure-receipt produces a `ReplayEnvelope` that replays to the same failure (or near-equivalent — failure replay semantics inherit Phase 5's existing behavior).
</specifics>

<deferred>
## Deferred Ideas

- Full RunIntent reconstruction from receipt (would require storing task/outputs/policy in receipt body — receipts stay minimal in v1.1).
- Filesystem-backed artifact loader (Phase 11 in `lattice-cli`).
- `lattice receipt diff` for comparing two materialized envelopes (deferred to v1.2).
- Cross-version envelope migration (single version v1 in v1.1).
</deferred>
