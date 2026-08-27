---
phase: 57-protocol-semantics
plan: 02
subsystem: receipt-protocol
tags: [dsse, ed25519, receipts, compatibility, python]

requires:
  - phase: 57-protocol-semantics
    provides: TypeScript v1.4 profile and bounded legacy verification contract
provides:
  - Standard raw-byte DSSE PAE and v1.4-only issuance in Python
  - Profile-aware allow/reject historical verification parity
  - Immutable legacy-vector coverage as read-only verification evidence
  - Cross-language protocol literal and result-shape parity
affects: [58-conformance-and-client-migration, python-client, receipts, replay]

tech-stack:
  added: []
  patterns:
    - Verifier-private compatibility code retains exact validated transport text
    - Python serialized protocol keys remain camelCase while API results use snake_case

key-files:
  created: []
  modified:
    - clients/python/src/lattice_receipt/_core.py
    - clients/python/src/lattice_receipt/__init__.py
    - clients/python/tests/test_conformance.py
    - clients/python/tests/test_mint.py
    - clients/python/tests/test_replay.py

key-decisions:
  - "Python mint accepts only lattice-receipt/v1.4 with signed signatureProfile dsse-v1."
  - "Historical vector PAE construction remains test-local; production legacy PAE is private to verification."
  - "Python uses the same profile, policy, deprecation, and error literals as TypeScript."

patterns-established:
  - "Python compatibility is read-only and defaults to allow only at direct verification entrypoints."
  - "Standard verification always precedes any policy-bounded historical check."

requirements-completed: [SIGBR-01, SIGBR-02, SIGBR-03, SIGBR-04, SIGBR-05, SIGBR-06]

duration: 6min
completed: 2026-07-16
---

# Phase 57 Plan 02: Python Protocol Parity Summary

**Python now issues only byte-correct DSSE v1.4 receipts and reads historical evidence through the same observable, downgrade-resistant bridge as TypeScript**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-16T20:22:30Z
- **Completed:** 2026-07-16T20:28:08Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Changed public Python PAE construction and minting to sign raw canonical bytes with mandatory `lattice-receipt/v1.4` and `signatureProfile: "dsse-v1"`.
- Mirrored TypeScript's standard-first allow/reject bridge, typed verification profile, deprecation state, profile mismatch, and strict legacy rejection behavior.
- Preserved the committed v1.5 vector corpus unchanged as read-only historical evidence while all 41 Python tests and the full TypeScript gate pass together.

## Task Commits

The three tightly coupled tasks share one implementation commit because issuance and verification both modify `_core.py` and must preserve one valid protocol matrix:

1. **Task 1: Standardize Python PAE, types, and v1.4-only minting** - `d4347ff`
2. **Task 2: Mirror the bounded legacy verification bridge and convert vectors to read-only evidence** - `d4347ff`
3. **Task 3: Prove cross-language semantic parity without moving Phase 58 scope** - `d4347ff`

## Files Created/Modified

- `clients/python/src/lattice_receipt/_core.py` - Raw-byte PAE, corrected-only minting, and profile-aware standard-first verification.
- `clients/python/src/lattice_receipt/__init__.py` - Public policy and profile type aliases.
- `clients/python/tests/test_mint.py` - v1.4 issuance, PAE byte framing, round-trip, and rejection matrix.
- `clients/python/tests/test_conformance.py` - Historical bridge, strict policy, corrected no-fallback, and profile matrix coverage.
- `clients/python/tests/test_replay.py` - Corrected-profile mint fixtures while retaining default historical verification compatibility.

## Decisions Made

- Retained the exact validated envelope payload string only in decoded verifier state so legacy signatures are checked without transport re-encoding.
- Kept Python field names idiomatic for API results (`verification_profile`, `deprecated`, `legacy_policy`) while the signed body continues to use protocol-defined `signatureProfile`.
- Reused the existing `cryptography` dependency and introduced no new production or test dependency in Phase 57.

## Deviations from Plan

### Execution Consolidation

**1. [Rule 3 - Blocking] Committed overlapping Python protocol tasks together**
- **Found during:** Tasks 1-3
- **Issue:** Issuance and verifier changes overlap in `_core.py`; splitting the completed patch afterward would create misleading intermediate commits with an incomplete result/type matrix.
- **Fix:** Kept one isolated implementation commit covering only the five Plan 57-02 files and verified every task criterion against the final atomic protocol state.
- **Files modified:** The five planned Python source and test files only.
- **Verification:** TypeScript typecheck, 1,109 Vitest tests, 41 Python tests, source-literal audit, and forbidden-scope diff all passed.
- **Committed in:** `d4347ff`.

---

**Total deviations:** 1 execution-only consolidation
**Impact on plan:** No behavior or scope change; the single commit is isolated from all unrelated working-tree changes.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- TypeScript and Python now implement one stable protocol contract for Phase 58's normative schemas, standard vectors, independent oracle, CLI, and CI migration.
- Historical vectors remain unchanged and explicitly identify the compatibility behavior Phase 58 must preserve and label.

## Self-Check: PASSED

---
*Phase: 57-protocol-semantics*
*Completed: 2026-07-16*
