---
phase: 09-canonical-json-ed25519-signing-and-receipt-issuance
plan: 01
subsystem: receipts
tags:
  - receipts
  - canonical-json
  - redaction
  - keyset
  - phase-9
requirements:
  - RECEIPT-01
  - RECEIPT-02
  - RECEIPT-04
  - RECEIPT-05
  - RECEIPT-08
dependency-graph:
  requires:
    - packages/lattice/src/contract/tripwire.ts (TripwireEvidence type)
    - packages/lattice/src/plan/plan.ts (RouteRejectReason type)
    - packages/lattice/src/providers/provider.ts (Usage type)
  provides:
    - packages/lattice/src/receipts/types.ts (CapabilityReceiptBody, ReceiptEnvelope, ReceiptSigner, KeySet, KeyEntry, KeyState, VerifyResult, VerifyError)
    - packages/lattice/src/receipts/canonical.ts (canonicalizeReceiptBody, usageToCanonical, stringifyCostUsd)
    - packages/lattice/src/receipts/redact.ts (redactReceiptBody, DEFAULT_REDACTION_POLICY_ID)
    - packages/lattice/src/receipts/keyset.ts (createMemoryKeySet)
  affects:
    - packages/lattice/package.json (canonicalize dep, @noble/ed25519 devDep)
    - pnpm-workspace.yaml (catalog entries)
    - pnpm-lock.yaml
tech-stack:
  added:
    - canonicalize@3.0.0 (RFC 8785 JCS — runtime dep, exact pin)
    - "@noble/ed25519@3.1.0 (parity oracle, devDep only — used by plan 09-02)"
  patterns:
    - "Type-only file (types.ts) keeps the schema unretrofittable and importable without runtime cost"
    - "Pure-function modules (canonical.ts, redact.ts, keyset.ts) for kernel logic"
    - "Sort-then-canonicalize pattern for stable array fields (redactions[])"
    - "Conversion helper at the single boundary (usageToCanonical) prevents raw floats from reaching signed bytes"
key-files:
  created:
    - packages/lattice/src/receipts/types.ts
    - packages/lattice/src/receipts/canonical.ts
    - packages/lattice/src/receipts/canonical.test.ts
    - packages/lattice/src/receipts/redact.ts
    - packages/lattice/src/receipts/redact.test.ts
    - packages/lattice/src/receipts/keyset.ts
    - packages/lattice/src/receipts/keyset.test.ts
  modified:
    - packages/lattice/package.json
    - pnpm-workspace.yaml
    - pnpm-lock.yaml
decisions:
  - "Pinned canonicalize@3.0.0 (no semver range) — version drift would invalidate every issued receipt"
  - "costUsd serialized as string only — `usageToCanonical` is the single conversion site, asserted by `typeof === \"string\"` in canonical.test.ts"
  - "DEFAULT_REDACTION_POLICY_ID is the literal `\"lattice.default.v1\"` (locked, registry deferred to v1.2)"
  - "Redactor returns a NEW body — never mutates input — and writes the sorted manifest into `body.redactions` so the signed payload self-describes elisions"
  - "KeySet surface is intentionally minimal (`lookup` only) — no enumeration to keep the verification path narrow"
  - "Duplicate kids in createMemoryKeySet: last write wins (deterministic insertion-order semantics)"
metrics:
  duration: ~15 minutes
  completed: 2026-05-11
  tasks-executed: 4
  tasks-total: 4
  new-tests: 33
  test-suite-before: 189
  test-suite-after: 222
  full-suite-status: 222/222 passing
---

# Phase 9 Plan 01: Canonical/Redact/KeySet/Type Spine Summary

Landed the substrate every later receipt plan depends on: locked type schema, RFC 8785 JCS wrapper with cost-as-string serialization, a pure redactor that runs strictly before signing, and a `KeySet` abstraction with `active | retired | revoked` states. All four files compile under strict TypeScript and ship with green tests.

## What Was Built

### Dependencies
- `canonicalize@3.0.0` added to `packages/lattice/package.json` `dependencies` via the pnpm catalog protocol.
- `@noble/ed25519@3.1.0` added to `devDependencies` only — reserved for the parity oracle in plan 09-02; it must never reach production bundles.
- Both pinned at exact versions via `pnpm-workspace.yaml` catalog (no `^`/`~`).
- `pnpm install --no-frozen-lockfile` completed; lockfile updated; `packages/lattice/node_modules/canonicalize/package.json` reports `"version": "3.0.0"` and `packages/lattice/node_modules/@noble/ed25519/package.json` reports `"version": "3.1.0"`.

### packages/lattice/src/receipts/types.ts
Type-only file. Exports every shape locked in 09-CONTEXT.md with literal wire-format constants:
- `CapabilityReceiptBody` — version `"lattice-receipt/v1"` (string literal type)
- `ReceiptEnvelope` — payloadType `"application/vnd.lattice.receipt+json"` (string literal type)
- `ReceiptUsageCanonical` — `costUsd: string | null` (NOT `number`)
- `ReceiptSigner` interface with `kid`, `publicKeyJwk: JsonWebKey`, and `sign(bytes): Promise<Uint8Array>`
- `KeyState = "active" | "retired" | "revoked"`, `KeyEntry`, `KeySet { lookup(kid): KeyEntry | undefined }`
- `VerifyResult` discriminated union with `VerifyOk` (carries `keyState`) and `VerifyFail` (carries `VerifyError`)
- `VerifyErrorKind` union covering `key-not-found | key-revoked | canonicalization-mismatch | signature-invalid | envelope-malformed | version-mismatch`
- Optional fields use the bare `?` modifier (no `| undefined`) to respect `exactOptionalPropertyTypes`

### packages/lattice/src/receipts/canonical.ts
- `canonicalizeReceiptBody(body): Uint8Array` — RFC 8785 JCS via `canonicalize@3.0.0`, UTF-8 encoded
- `usageToCanonical(usage): ReceiptUsageCanonical` — the single conversion site for `number → string` cost
- `stringifyCostUsd(costUsd: number | null): string | null` — null and non-finite (NaN, ±Infinity) map to null; finite values use `Number.prototype.toString`
- Throws if `canonicalize` returns `undefined` (surfaces programmer error rather than silently producing zero bytes)

### packages/lattice/src/receipts/redact.ts
- `DEFAULT_REDACTION_POLICY_ID = "lattice.default.v1"` constant
- `redactReceiptBody(body, policyId?): RedactionResult` — pure, never mutates input, accepts frozen bodies
- For v1.1, the default policy declares a single manifest entry when `tripwireEvidence.kind === "no-pii"` is present (the tripwire kernel already redacted the observed shape to `{detector, substring}`; this records the redaction in the signed body)
- Sorts the manifest by `path` for canonical-form stability
- Overrides `redactionPolicyId` on the returned body — never trusts the inbound value

### packages/lattice/src/receipts/keyset.ts
- `createMemoryKeySet(entries: readonly KeyEntry[]): KeySet`
- Backed by `Map<string, KeyEntry>`; duplicate kids: last write wins
- Returned object has exactly one method (`lookup`) — verified by a structural test (`Object.keys(set).length === 1`)
- Empty entries array is legal; every lookup returns `undefined`

## RFC 8785 Golden Vectors (Drift Detector Armed)

`canonical.test.ts` ships nine RFC 8785 appendix golden vectors that catch silent drift in `canonicalize@3.0.0` between V8 versions:

| # | Input | Expected output |
|---|-------|-----------------|
| 1 | `{}` | `{}` |
| 2 | `{"a":"value"}` | `{"a":"value"}` |
| 3 | `{"b":1,"a":2}` | `{"a":2,"b":1}` |
| 4 | `{"x":{"b":2,"a":1}}` | `{"x":{"a":1,"b":2}}` |
| 5 | `{"n":1}` | `{"n":1}` |
| 6 | `{"z":-0}` | `{"z":0}` |
| 7 | `{"name":"a\u00e9"}` | `{"name":"aé"}` (UTF-8 raw) |
| 8 | `{"arr":[3,1,2]}` | `{"arr":[3,1,2]}` (order preserved) |
| 9 | `{"q":"\""}` | `{"q":"\""}` (JSON-escaped) |

Any future `canonicalize` bump that breaks any of these MUST fail loud, blocking the dependency upgrade until the drift is investigated.

## Test Counts

- Before: 189 tests in the lattice package baseline
- After: **222 tests** across 25 files, all green
- New tests added by this plan:
  - canonical.test.ts: **17** (3 `usageToCanonical`, 3 `stringifyCostUsd`, 3 `canonicalizeReceiptBody`, 9 RFC 8785 golden vectors — note: total is 17 because `stringifyCostUsd` adds an extra null-input case and `usageToCanonical` covers two of the three core conversion concerns)
  - redact.test.ts: **10** (purity, frozen input, no-pii manifest, non-no-pii empty, no-evidence empty, policy id override, default policy id, sort stability, redact→canonicalize byte equality, plus the DEFAULT_REDACTION_POLICY_ID identity test)
  - keyset.test.ts: **6** (lookup found, unknown kid, empty entries, duplicate last-wins, all three KeyState values, no-enumeration structural guarantee)

## Forward Links

- **Plan 09-02** (running in parallel, Wave 1): will import `ReceiptSigner` and (via type-only imports) `ReceiptSignature`/`ReceiptEnvelope` from `types.ts`. No runtime coupling — types.ts is the only cross-plan import surface.
- **Plan 09-03**: will compose `redactReceiptBody → canonicalizeReceiptBody → sign` in the receipt builder, and `keySet.lookup → verifyEd25519 → re-canonicalize` in `verifyReceipt`.
- **Plan 09-04**: will wire `LatticeConfig.signer?: ReceiptSigner` and `KeySet` into the runtime; will export `createMemoryKeySet` and types from `packages/lattice/src/index.ts`.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `fa6d5a1` | Add receipt type spine and canonicalize/ed25519 deps |
| 2 | `6b1181d` | Add JCS canonicalize wrapper with cost-as-string serialization |
| 3 | `80657ce` | Add receipt redactor that runs before canonicalize and signing |
| 4 | `59efabe` | Add in-memory KeySet factory with active/retired/revoked states |

## Deviations from Plan

None — plan executed exactly as written. The plan's acceptance criterion `test -f node_modules/canonicalize/package.json` was satisfied by `packages/lattice/node_modules/canonicalize/package.json` instead of the repo-root `node_modules/canonicalize/` (pnpm workspace hoisting routes workspace-local deps to the package's own `node_modules`). Version pinning verified: `packages/lattice/node_modules/canonicalize/package.json` contains `"version": "3.0.0"` and `packages/lattice/node_modules/@noble/ed25519/package.json` contains `"version": "3.1.0"`.

## Worktree Note

The execution worktree HEAD was reset from `85c9ba0` ("complete lattice v1 milestone") to `945757b` ("docs(09): create phase plan") at start-of-plan per the embedded `worktree_branch_check`. The base reset brought in phases 7 and 8 (`packages/lattice/src/contract/` and friends) that types.ts imports from.

## Verification

Final automated sweep (matches plan's end-of-plan verify block):

```
cd packages/lattice && pnpm typecheck && pnpm vitest run src/receipts/
```

Both exit 0. Full suite (`pnpm vitest run`) also exits 0 with 222/222 tests passing.

## Self-Check: PASSED

All claimed files exist; all four commits are reachable from `HEAD`; typecheck and full vitest suite green.
