---
phase: 10
plan: "01"
subsystem: replay
tags: [receipts, replay-envelope, materialize, verify-first]
requires: [phase-09-receipts, phase-05-replay]
provides:
  - materializeReplayEnvelope
  - MaterializationError
  - ReplayEnvelope.receipt
  - ReplayEnvelope.contract
affects:
  - packages/lattice/src/replay/replay.ts
  - packages/lattice/src/index.ts
  - packages/lattice/src/runtime/public-types.ts
  - packages/lattice/test/public-surface.test.ts
tech-stack:
  added: []
  patterns:
    - Verify-FIRST ordering for artifact loaders
    - Discriminated union error types (no thrown Error subclasses)
    - Type-only imports keep replay.ts free of receipts runtime dependency
key-files:
  created:
    - packages/lattice/src/replay/materialize.ts
    - packages/lattice/src/replay/materialize.test.ts
  modified:
    - packages/lattice/src/replay/replay.ts
    - packages/lattice/src/index.ts
    - packages/lattice/src/runtime/public-types.ts
    - packages/lattice/test/public-surface.test.ts
decisions:
  - Materializer throws typed MaterializationError objects discriminated by kind
  - Artifact loader contract is async hash -> ArtifactInput
  - v1.1 limitation: task/outputs/policy/contract supplied via options when needed
  - replayOffline outputs come from caller-supplied options.outputs (receipt body does not carry them)
metrics:
  duration: ~12 minutes
  completed: 2026-05-11
  tasks: 2
  files_created: 2
  files_modified: 4
---

# Phase 10 Plan 01: Receipts inside the Replay Envelope Summary

Wire signed receipts into the ReplayEnvelope shape and ship a verify-first
materializer that reconstructs a `ReplayEnvelope` from a `ReceiptEnvelope`
plus a pluggable artifact loader.

## What Was Built

1. **`ReplayEnvelope` extension** (`packages/lattice/src/replay/replay.ts`)
   - Added optional `receipt?: ReceiptEnvelope` and `contract?: CapabilityContract`
     fields. Both use type-only imports from `receipts/types.js` and
     `contract/contract.js`, so `replay.ts` remains runtime-import-free of the
     receipts module — verify-only consumers do not pay for the full receipt
     builder.

2. **`materializeReplayEnvelope`** (`packages/lattice/src/replay/materialize.ts`)
   - Pure async function:
     `materializeReplayEnvelope(receipt, { artifactLoader, keySet, task?, outputs?, policy?, contract? }) -> Promise<ReplayEnvelope>`
   - **Verify-FIRST**: calls `verifyReceipt` BEFORE touching the artifact
     loader. Tampered or revoked receipts short-circuit with
     `MaterializationError { kind: "verify-failed" }` and the loader is never
     invoked (explicitly asserted by tests).
   - Loads each artifact body in `body.inputHashes` order. Loader rejections
     surface as `MaterializationError { kind: "artifact-load-failed" }`.
   - Reconstructs an `ExecutionPlan` that reproduces the receipt's
     route/usage fields. v1.1 limitation: receipt body does not carry the
     original task/outputs/policy, so those are caller-supplied via options.
   - Attaches the receipt itself and (when provided) the contract to the
     returned envelope so a single materialization is enough to round-trip
     through `replayOffline`.

3. **`MaterializationError` discriminated union**
   - Kinds: `"verify-failed" | "artifact-load-failed" | "envelope-malformed"`.
   - Exported as a type from the package root.

4. **Public surface exports** (`packages/lattice/src/index.ts`,
   `packages/lattice/src/runtime/public-types.ts`)
   - Runtime: `materializeReplayEnvelope`.
   - Type: `MaterializationError`, `MaterializeReplayEnvelopeOptions`,
     `ArtifactLoader`, plus `ReplayEnvelope` (previously absent from index.ts).

5. **Tests**
   - `src/replay/materialize.test.ts` — five behavioral tests covering verify-first
     ordering, round-trip outputHash match, artifact-load-failed propagation,
     contract attachment, and v1.1 default semantics.
   - `test/public-surface.test.ts` — Phase 10 block asserts the new exports.

## Verification

- `pnpm tsc --noEmit` exits 0 (all packages typecheck under
  `exactOptionalPropertyTypes` and `verbatimModuleSyntax`).
- `pnpm vitest run` → **307/307 tests pass**, 30 test files (including the
  new `materialize.test.ts`).
- Round-trip integration confirmed: `createReceipt` → `materializeReplayEnvelope`
  → `replayOffline` → SHA-256 of canonicalized outputs equals the receipt's
  `outputHash`.

## Deviations from Plan

None — plan executed as written. One minor TS adjustment during GREEN:
`MaterializationError` is imported with `import type` in the test file to
satisfy `verbatimModuleSyntax`.

## Key Decisions Made

| Decision | Rationale |
|----------|-----------|
| Throw plain `MaterializationError` shapes (not Error subclasses) | Matches existing typed error union style in the codebase (`VerifyResult`, `LatticeRunError`). |
| Skip empty-string hashes in `body.inputHashes` | Phase 9 emits `""` for unfingerprintable artifact values; the materializer mirrors that semantics rather than failing. |
| `catalogVersion` set to `"materialized"` on synthesized plans | Distinguishes materialized envelopes from live-recorded ones at a glance. |
| Caller supplies `outputs` to enable `replayOffline` ok-result | Receipts intentionally do not carry the full output payload (minimal attestation, not a full audit log). |

## Self-Check: PASSED

- packages/lattice/src/replay/materialize.ts — FOUND
- packages/lattice/src/replay/materialize.test.ts — FOUND
- packages/lattice/src/replay/replay.ts (modified) — FOUND
- packages/lattice/src/index.ts (modified) — FOUND
- packages/lattice/src/runtime/public-types.ts (modified) — FOUND
- packages/lattice/test/public-surface.test.ts (modified) — FOUND
- Commit 234c864 (RED) — present in git log
- Commit 9f635b8 (GREEN) — present in git log
