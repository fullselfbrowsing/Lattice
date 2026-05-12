---
phase: 09-canonical-json-ed25519-signing-and-receipt-issuance
plan: 04
subsystem: receipts
tags:
  - receipts
  - runtime-wiring
  - public-surface
  - phase-9

# Dependency graph
dependency-graph:
  requires:
    - phase: 09-01
      provides: types.ts spine + createMemoryKeySet
    - phase: 09-02
      provides: createInMemorySigner + generateEd25519KeyPairJwk
    - phase: 09-03
      provides: createReceipt + verifyReceipt
  provides:
    - LatticeConfig.signer? + NormalizedLatticeConfig.signer?
    - RunSuccess.receipt? + RunFailure.receipt?
    - maybeIssueReceipt helper wired at every terminal branch of runWithConfig
    - Phase 9 public exports from lattice package root
  affects:
    - Phase 10 (will embed receipt? + contract? into ReplayEnvelope)
    - Phase 11 CLI (will consume verifyReceipt over a file path)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Best-effort receipt emission: signer failures swallowed at the boundary, run result still encodes the verdict"
    - "Conditional spread for exactOptionalPropertyTypes safety: `...(receipt !== undefined ? { receipt } : {})`"
    - "Internal-only createReceipt: not re-exported so v1.2 can change its signature freely"
    - "kid forced from signer.kid by createReceipt; runtime never threads a kid string through receipt input"
    - "contractHash via canonicalize(contract) + SHA-256 — same JCS used in receipt body so external verifiers can reproduce"

key-files:
  created: []
  modified:
    - packages/lattice/src/runtime/config.ts
    - packages/lattice/src/results/result.ts
    - packages/lattice/src/runtime/create-ai.ts
    - packages/lattice/src/runtime/create-ai.test.ts
    - packages/lattice/src/runtime/public-types.ts
    - packages/lattice/src/index.ts
    - packages/lattice/test/public-surface.test.ts

key-decisions:
  - "Branch A's no_route path emits verdict=execution-failed (per 09-CONTEXT.md 'validation-failed: same as execution-failed' generalization) — only the contract-driven path uses no-contract-match"
  - "Successful run computes outputHash via fingerprintArtifactValue(JSON.stringify(validation.outputs)) — the receipt commits to a deterministic stringified output rather than a structured artifact"
  - "Pre-flight failure branches (Branch A) use empty providerId/capabilityId in ReceiptRoute since no route was selected; attemptNumber is 0"
  - "Provider_execution branch uses UNMEASURED_USAGE — costUsd is null, mirrors the existing Phase 7 convention"
  - "Receipt emission is best-effort: a signer that throws is treated as 'no receipt' rather than a run failure; T12 in the integration suite proves graceful degradation"

requirements-completed: [RECEIPT-07, RECEIPT-08, RECEIPT-10]

# Metrics
metrics:
  duration: ~12 minutes
  completed: 2026-05-11
  tasks-executed: 2
  tasks-total: 2
  new-tests: 19
  test-suite-before: 279
  test-suite-after: 298
  full-suite-status: 298/298 passing
---

# Phase 9 Plan 04: Runtime Wiring + Public Surface Summary

The closing plan of Phase 9. Receipts now emit at every terminal branch of `runWithConfig` when a signer is configured, and the verifier, signer factory, keyset factory, and key generator are exported from the package root so external consumers can verify receipts and stand up an in-memory signer in tests. `createReceipt` stays internal — the only way callers issue receipts is through `ai.run` with a configured signer.

## What Was Built

### packages/lattice/src/runtime/config.ts

- `LatticeConfig.signer?: ReceiptSigner` — optional configuration field, additive, exact-optional safe.
- `NormalizedLatticeConfig.signer?: ReceiptSigner` — propagated through `normalizeConfig` only when present.
- The mutable internal shape inside `normalizeConfig` also declares the optional field so strict TS accepts the conditional assignment.

### packages/lattice/src/results/result.ts

- `RunSuccess.receipt?: ReceiptEnvelope` — additive optional field.
- `RunFailure.receipt?: ReceiptEnvelope` — additive optional field.
- Receipts attach at every terminal branch but only when a signer is configured.

### packages/lattice/src/runtime/create-ai.ts — `maybeIssueReceipt` + 6 branch sites

The helper is the single place receipts are built:

```ts
async function maybeIssueReceipt(
  normalized: NormalizedLatticeConfig,
  input: MaybeIssueReceiptInput,
): Promise<ReceiptEnvelope | undefined>;
```

It returns `undefined` when `normalized.signer === undefined` (no signer configured) OR when `signer.sign` throws (graceful degradation per T-09-24 acceptance). On the happy path it:

1. Hashes each input artifact via `fingerprintArtifactValue` (existing storage helper).
2. Hashes the success outputs via the same helper.
3. Computes `contractHash` via inline `sha256HexOfCanonicalContract(contract)` — uses `canonicalize@3.0.0` then SHA-256, matching the JCS reproducibility guarantee.
4. Calls `createReceipt(input, normalized.signer)` which runs the locked redact → canonicalize → PAE → sign → encode pipeline from plan 09-03.

Six insertion sites in `runWithConfig`:

| Branch | Line | contractVerdict | Special embed |
|--------|------|-----------------|---------------|
| selected===undefined, isContractFailure | ~166 | `no-contract-match` | `noRouteReasons` |
| selected===undefined, !isContractFailure | ~166 (same call) | `execution-failed` | — |
| validation-failed last route | ~335 | `validation-failed` | — |
| tripwire-violated | ~411 | `tripwire-violated` | `tripwireEvidence` |
| success | ~497 | `success` | `outputs` (drives outputHash) |
| !anyExecutableAdapter | ~537 | `execution-failed` | — |
| provider_execution all-failed | ~575 | `execution-failed` | — |

Every site uses `...(receipt !== undefined ? { receipt } : {})` to keep the optional field exact-optional safe. `awk` confirms 6 actual `await maybeIssueReceipt` call sites inside `runWithConfig` (a seventh occurrence is the helper definition itself).

### packages/lattice/src/runtime/create-ai.test.ts — 13 integration tests

Added under a new `describe("Phase 9 receipts integration", …)` block:

| # | Test | Asserts |
|---|------|---------|
| T1 | receipt undefined without signer | `result.receipt === undefined` |
| T2 | success receipt emitted with signer | Verify ok, verdict `success` |
| T3 | no-contract-match receipt | Verify ok, verdict `no-contract-match`, noRouteReasons[] non-empty |
| T4 | tripwire-violated receipt | Verify ok, verdict matches error.kind, tripwireEvidence carried |
| T5 | validation-failed receipt | Verify ok, verdict `validation-failed` |
| T6 | execution-failed (no executable adapter) | Verify ok, verdict `execution-failed` |
| T7 | execution-failed (provider boom) | Verify ok, verdict `execution-failed` |
| T8 | model.requested matches route, observed is null | Body field cross-check |
| T9 | inputHashes length matches artifact count, hex format | Each entry is `/^[a-f0-9]{64}$/u` |
| T10 | outputHash hex on success, null on tripwire | Both branches verified |
| T11 | contractHash == SHA-256(canonicalize(contract)) | Manual recomputation in the test |
| T12 | signer throws → no crash, receipt undefined | Graceful degradation |
| T13 | 100 receipts < 5 seconds (property test) | Performance bar from 09-CONTEXT.md |

### packages/lattice/src/runtime/public-types.ts

Re-exports added for the Phase 9 type family:

```
CapabilityReceiptBody, ContractVerdict, KeyEntry, KeySet, KeyState,
ReceiptEnvelope, ReceiptModel, ReceiptRedaction, ReceiptRoute,
ReceiptSignature, ReceiptSigner, ReceiptUsageCanonical,
VerifyError, VerifyErrorKind, VerifyFail, VerifyOk, VerifyResult
```

### packages/lattice/src/index.ts — Phase 9 public surface

Value exports added:

```ts
export { createInMemorySigner, generateEd25519KeyPairJwk } from "./receipts/sign.js";
export { createMemoryKeySet } from "./receipts/keyset.js";
export { verifyReceipt } from "./receipts/verify.js";
```

Type exports added (alphabetically slotted into the existing block): `CapabilityReceiptBody, ContractVerdict, KeyEntry, KeySet, KeyState, ReceiptEnvelope, ReceiptModel, ReceiptRedaction, ReceiptRoute, ReceiptSignature, ReceiptSigner, ReceiptUsageCanonical, VerifyError, VerifyErrorKind, VerifyFail, VerifyOk, VerifyResult`.

**Intentionally NOT exported** (internal-only per 09-CONTEXT.md): `createReceipt`, `redactReceiptBody`, `canonicalizeReceiptBody`, `buildPae`, `encodeEnvelope`, `decodeEnvelope`, `base64Encode`, `base64Decode`, `importEd25519PrivateKey`, `importEd25519PublicKey`, `verifyEd25519Signature`. External consumers can verify and sign, but cannot forge receipt builders against the private API — `createReceipt`'s signature stays changeable for v1.2.

### packages/lattice/test/public-surface.test.ts — 6 public-surface tests

| # | Test | Asserts |
|---|------|---------|
| 1 | All four value exports are functions | `typeof === "function"` for each |
| 2 | `createInMemorySigner` returns the `ReceiptSigner` shape | `kid`, `sign`, `publicKeyJwk.kty === "OKP"` |
| 3 | `createMemoryKeySet` returns a `KeySet` with `lookup` | found + unknown branches |
| 4 | `createReceipt` is NOT on the dynamic import | `"createReceipt" in mod === false` |
| 5 | End-to-end: createAI + signer + verifyReceipt round-trip | `verifyResult.ok === true` |
| 6 | Type-only: all Phase 9 type names compile at the consumer-visible path | compile-time guard |

## Property Test Outcome

The 100-receipt property test (T13) completes in well under 5 seconds on this hardware (combined Phase 9 test file runs in ~30ms total per the vitest report — receipt issuance is firmly bounded by Ed25519 (~30k sig/s) and the SHA-256 input/output hashing per artifact). The 5-second budget is the documented Phase 9 performance bar; actual measurement is far below it.

## Test Suite Status

- Before plan 09-04: **279 tests** (plans 09-01 → 09-03).
- After plan 09-04: **298 tests** across 29 files, all passing.
- Added: 13 integration + 6 public-surface = 19 new tests.

## Task Commits

| Stage | Commit | Description |
|-------|--------|-------------|
| Task 1 RED | `d529e09` | test(09-04): add failing tests for Phase 9 receipts integration |
| Task 1 GREEN | `da32c79` | feat(09-04): wire LatticeConfig.signer + maybeIssueReceipt at all terminal branches |
| Task 2 RED | `af250e6` | test(09-04): add failing tests for Phase 9 public surface exports |
| Task 2 GREEN | `3ecf0b6` | feat(09-04): export Phase 9 public surface from lattice package root |

## Deviations from Plan

None substantive. Two minor deviations recorded as decisions:

1. **Worktree base reset.** The worktree HEAD was at `85c9ba0` ("complete lattice v1 milestone") at start-of-plan, which is downstream of the expected base `f01fd36` ("docs(09-03): complete createReceipt and verifyReceipt plan"). Per the `worktree_branch_check` block in the prompt, HEAD was reset back to `f01fd36` so this plan executes on top of plans 09-01/02/03 only. This is the standard pre-execution reset and is not a deviation from the plan body.
2. **Success path outputHash uses JSON.stringify, not canonicalize.** The plan body's behavior section reads `fingerprintArtifactValue(JSON.stringify(validation.outputs))`. The same approach is used here — the receipt commits to a stringified output for v1.1. Phase 10/11 may tighten this to a canonical form.

## Verification

End-of-plan sweep (matches the plan's `<verification>` block):

```
cd packages/lattice && pnpm typecheck && pnpm vitest run && pnpm build && pnpm lint:packages
```

All four steps exit 0. `dist/index.d.ts` contains Phase 9 type names: 18 total occurrences across `CapabilityReceiptBody | ReceiptEnvelope | ReceiptSigner | KeySet | VerifyResult | createInMemorySigner | verifyReceipt | createMemoryKeySet`. `pnpm lint:packages` (publint + attw) is green; the ESM-only profile reports the expected "node16 (from CJS)" advisory which is ignored per `package.json` resolutions.

## Forward Links for Phase 10

Phase 10 will:
- Embed `receipt?: ReceiptEnvelope` and `contract?: CapabilityContract` into `ReplayEnvelope`, completing the offline-replay-+-attestation cycle.
- Add receipt-aware `replayOffline` that re-runs verification and surfaces the discrepancy when a replay produces a different verdict from the recorded receipt.
- Optionally introduce a `lattice receipt verify` CLI subcommand once Phase 11 lands.

The runtime is now fully receipt-aware. Phase 9 is structurally complete.

## Threat Mitigations Realized

| Threat ID | Mitigation as built |
|-----------|---------------------|
| T-09-23 (terminal-branch tampering) | Every terminal branch in `runWithConfig` calls `maybeIssueReceipt`; `grep -c 'await maybeIssueReceipt' create-ai.ts` returns 6. |
| T-09-24 (signer-failure repudiation) | `maybeIssueReceipt` swallows signer errors and returns undefined; T12 proves the run still succeeds. |
| T-09-25 (input-hash information disclosure) | inputHashes only contain SHA-256 hex digests (T9 regex assertion). Raw artifact bytes never enter the receipt. |
| T-09-26 (contract-hash tampering) | contractHash is reproducible from `canonicalize(contract) + SHA-256` — T11 recomputes the digest in-test and asserts byte equality. |
| T-09-27 (public surface elevation) | `createReceipt`, `redactReceiptBody`, `canonicalizeReceiptBody`, envelope primitives, key import helpers, and `verifyEd25519Signature` are NOT in `index.ts`. External callers can only verify and run; they cannot forge a builder. |
| T-09-28 (DoS via slow receipt issuance) | T13 property test enforces 100 receipts in <5s; current implementation completes well below the budget. |

## Self-Check: PASSED

Verified post-execution:

- `[ -f packages/lattice/src/runtime/config.ts ]` — FOUND
- `[ -f packages/lattice/src/results/result.ts ]` — FOUND
- `[ -f packages/lattice/src/runtime/create-ai.ts ]` — FOUND
- `[ -f packages/lattice/src/runtime/create-ai.test.ts ]` — FOUND
- `[ -f packages/lattice/src/runtime/public-types.ts ]` — FOUND
- `[ -f packages/lattice/src/index.ts ]` — FOUND
- `[ -f packages/lattice/test/public-surface.test.ts ]` — FOUND
- Commits in `git log`:
  - `d529e09` test(09-04): add failing tests for Phase 9 receipts integration — FOUND
  - `da32c79` feat(09-04): wire LatticeConfig.signer + maybeIssueReceipt at all terminal branches — FOUND
  - `af250e6` test(09-04): add failing tests for Phase 9 public surface exports — FOUND
  - `3ecf0b6` feat(09-04): export Phase 9 public surface from lattice package root — FOUND
- `pnpm typecheck`: exits 0
- `pnpm vitest run`: 298/298 passing
- `pnpm build`: exits 0
- `pnpm lint:packages`: exits 0 (publint + attw both green)

## Phase 9 Requirement Coverage Map

| REQ-ID | File:line proving coverage |
|--------|----------------------------|
| RECEIPT-01 | `packages/lattice/src/receipts/types.ts:42-59` (CapabilityReceiptBody schema) |
| RECEIPT-02 | `packages/lattice/src/receipts/canonical.ts:49-59` (canonicalizeReceiptBody) |
| RECEIPT-03 | `packages/lattice/src/receipts/envelope.ts:31-94` (PAYLOAD_TYPE + encodeEnvelope) |
| RECEIPT-04 | `packages/lattice/src/receipts/redact.ts` + `receipt.ts:103` (redact-then-sign ordering) |
| RECEIPT-05 | `packages/lattice/src/receipts/keyset.ts:18-28` (KeyState lifecycle) |
| RECEIPT-06 | `packages/lattice/src/receipts/verify.ts:72-152` (typed VerifyError union) |
| RECEIPT-07 | `packages/lattice/src/runtime/create-ai.ts` 6 terminal branches (every verdict emits a receipt) |
| RECEIPT-08 | `packages/lattice/src/index.ts` Phase 9 value+type exports |
| RECEIPT-10 | `packages/lattice/src/receipts/sign.ts` + index export (ReceiptSigner — runtime never sees raw keys) |

RECEIPT-09 is the schema-version marker baked into `version: "lattice-receipt/v1"` (types.ts line 43, enforced by `asReceiptBody` in verify.ts line 39).

---
*Phase: 09-canonical-json-ed25519-signing-and-receipt-issuance*
*Completed: 2026-05-11*
