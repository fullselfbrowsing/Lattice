---
phase: 57-protocol-semantics
plan: 01
subsystem: receipt-protocol
tags: [dsse, ed25519, receipts, compatibility, typescript]

requires:
  - phase: 57-protocol-semantics
    provides: approved v1.4 profile and bounded legacy policy contract
provides:
  - Standard DSSE PAE over raw canonical receipt bytes
  - Authenticated lattice-receipt/v1.4 and dsse-v1 issuance
  - Observable allow/reject historical verification bridge
  - Public TypeScript policy and verification-profile types
affects: [58-conformance-and-client-migration, receipts, replay, audit, agents]

tech-stack:
  added: []
  patterns:
    - Raw-byte standard PAE with envelope base64 as transport only
    - Authenticated version/profile matrix with verifier-only compatibility
    - Verification success reports the cryptographic profile that succeeded

key-files:
  created: []
  modified:
    - packages/lattice/src/receipts/envelope.ts
    - packages/lattice/src/receipts/types.ts
    - packages/lattice/src/receipts/receipt.ts
    - packages/lattice/src/receipts/verify.ts
    - packages/lattice/src/receipts/verify.test.ts
    - packages/lattice/src/index.ts

key-decisions:
  - "Canonical standard base64 is validated before historical verification retains exact transport text."
  - "Pre-v1.4 bodies are standard-first; v1.4/dsse-v1 failures are standard-only and cannot fall back."
  - "Receipt CID remains the hash of canonical payload bytes and is independent of signature profile."

patterns-established:
  - "Compatibility is read-only: the historical PAE builder is private to verify.ts."
  - "Direct verifyReceipt callers default to allow, while strict callers pass legacyPolicy: reject."

requirements-completed: [SIGBR-01, SIGBR-02, SIGBR-03, SIGBR-04, SIGBR-05, SIGBR-06]

duration: 9min
completed: 2026-07-16
---

# Phase 57 Plan 01: TypeScript Protocol Semantics Summary

**Raw-byte DSSE v1.4 issuance with an authenticated profile, bounded historical verification, stable content identity, and public policy diagnostics**

## Performance

- **Duration:** 9 min
- **Started:** 2026-07-16T20:12:30Z
- **Completed:** 2026-07-16T20:21:40Z
- **Tasks:** 3
- **Files modified:** 18

## Accomplishments

- Replaced base64-text signing with byte-correct DSSE PAE and forced every TypeScript issuer to mint `lattice-receipt/v1.4` plus signed `signatureProfile: "dsse-v1"`.
- Added standard-first historical verification with explicit allow/reject policy, typed profile/deprecation results, strict corrected-profile no-fallback, and independent profile/key/CID regression tests.
- Exported the additive policy/profile contract through root and audit entrypoints while keeping all existing two-argument verifier callers source-compatible.

## Task Commits

Each task was committed atomically:

1. **Task 1: Make PAE byte-correct and issue authenticated v1.4 receipts** - `ba19245`
2. **Task 2: Add the observable, downgrade-resistant TypeScript legacy read bridge** - `d70c92f`
3. **Task 3: Publish additive types and close all TypeScript compatibility regressions** - `ee50e58`

## Files Created/Modified

- `packages/lattice/src/receipts/envelope.ts` - Standard raw-byte PAE and canonical standard-base64 validation.
- `packages/lattice/src/receipts/types.ts` - v1.4/profile body branch plus policy, result, and failure types.
- `packages/lattice/src/receipts/receipt.ts` - Corrected-only v1.4/dsse-v1 issuer.
- `packages/lattice/src/receipts/verify.ts` - Standard-first verifier with a quarantined historical read bridge.
- `packages/lattice/src/receipts/verify.test.ts` - Version/profile/policy/signature downgrade matrix.
- `packages/lattice/src/receipts/cid.test.ts` - Proof that standard and legacy signatures over identical payload bytes share content identity.
- `packages/lattice/src/index.ts` and `packages/lattice/src/audit.ts` - Public policy/profile type exports.
- `packages/lattice/test/public-surface.test.ts` and `packages/lattice/test-d/index.test-d.ts` - Consumer-visible runtime and declaration coverage.

## Decisions Made

- Kept the existing receipt media type and payload-byte CID definition; the authenticated body profile identifies corrected writes without redefining content identity.
- Kept `verifyReceipt(envelope, keySet)` compatible by defaulting legacy policy to `allow`; strict consumers opt into `reject` with a third options argument.
- Rejected version/profile mismatches before key and signature branching so a stripped or backported profile cannot become legacy-eligible.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Rebuilt declarations before the tsd public-surface gate**
- **Found during:** Task 3
- **Issue:** `test:types` reads `dist/index.d.ts`; the stale pre-change declaration build did not contain the new exports.
- **Fix:** Ran the package build before `test:types`.
- **Files modified:** Generated `dist/` output only, which is ignored.
- **Verification:** Build and all 1,310 typechecked/runtime/type-surface tests passed.
- **Committed in:** No source change required.

**2. [Rule 3 - Blocking] Preserved test builders across the discriminated body union**
- **Found during:** Task 1
- **Issue:** Two legacy test factories spread `Partial<CapabilityReceiptBody>`, which loses the version/profile correlation under exact optional property types.
- **Fix:** Kept the strict public union and cast only the test-factory return after fixture assembly.
- **Files modified:** `canonical.test.ts`, `redact.test.ts`.
- **Verification:** Typecheck and full suite passed.
- **Committed in:** `ba19245`.

---

**Total deviations:** 2 auto-fixed blocking issues
**Impact on plan:** No scope change; both fixes preserve the intended strict type and executable verification gate.

## Issues Encountered

The delegated GSD planner/checker runtime stalled before implementation; the approved workflow was completed inline with deterministic plan and test gates.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The TypeScript protocol is stable for Python parity in Plan 57-02.
- Phase 58 can migrate schemas, vectors, CLI output, independent oracle coverage, and CI after Python mirrors these literals and rules.

---
*Phase: 57-protocol-semantics*
*Completed: 2026-07-16*
