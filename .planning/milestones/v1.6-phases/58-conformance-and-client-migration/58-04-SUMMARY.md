---
phase: 58-conformance-and-client-migration
plan: 04
subsystem: conformance
tags: [typescript, python, dsse, securesystemslib, interoperability]

# Dependency graph
requires:
  - phase: 58-conformance-and-client-migration
    provides: exact labeled corpora, aggregate manifests, and v1.4 normative fixture
provides:
  - Profile-aware TypeScript and Python consumers with exact typed outcomes
  - Reciprocal Python-to-TypeScript and TypeScript-to-Python mint verification
  - Exact test-only securesystemslib 1.4.0 PAE and signature oracle
affects: [58-05, 58-06, conformance-ci, client-release]

# Tech tracking
tech-stack:
  added: [securesystemslib==1.4.0 test extra]
  patterns: [profile-specific fixtures, reciprocal subprocess contracts, independent cryptographic oracle]

key-files:
  created: [clients/python/tests/test_dsse_oracle.py]
  modified: [conformance/verify-ts/src/positive.test.ts, conformance/verify-ts/src/negative.test.ts, conformance/verify-ts/src/cross_mint_parity.test.ts, clients/python/src/lattice_receipt/__main__.py, clients/python/tests/test_conformance.py]

key-decisions:
  - "Legacy and standard corpora are loaded through separate explicit fixtures in both languages; no flat-path fallback remains."
  - "Cross-language proof requires canonical bytes, PAE, signature, CID, profile, deprecation, version, and signed profile rather than a boolean verdict."
  - "securesystemslib is authoritative only for upstream PAE and Ed25519 signature behavior, never Lattice transport, schema, key-state, kid, or bridge policy."

patterns-established:
  - "Reciprocal interop: each language mints bytes that the other language verifies through its public API."
  - "Oracle isolation: a pinned third implementation consumes only standard positives from a dedicated test module."

requirements-completed: [CONF16-02, CONF16-03, CONF16-04, CONF16-06]

# Metrics
duration: 15min
completed: 2026-07-16
---

# Phase 58 Plan 04: Cross-Language and Oracle Summary

**Profile-separated TypeScript/Python conformance, reciprocal v1.4 minting, and an exact independent DSSE oracle**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-16T21:46:00Z
- **Completed:** 2026-07-16T22:00:59Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Rebuilt TypeScript conformance around explicit legacy and standard loaders with exact profile, deprecation, PAE, CID, and error-kind assertions.
- Added TypeScript read-side enforcement for exact aggregate coverage, frozen nested-manifest bytes, duplicate rejection, and retired flat-path absence.
- Split Python fixtures by profile and mirrored exact manifests, positive semantics, strict bridge rejection, and every labeled negative outcome.
- Added a stable `verify-json` public-verifier driver and extended `mint-json` with CID output for bidirectional machine-readable interoperability.
- Proved Python-minted standard bytes in TypeScript and TypeScript `createReceipt` bytes in Python with canonical, PAE, signature, CID, version, profile, and deprecation parity.
- Pinned `securesystemslib==1.4.0` in test extras only and independently verified upstream hello-world framing, every standard positive, and one-byte mutations.

## Task Commits

Each task was committed atomically:

1. **Task 1: Make the TypeScript harness profile-aware and exact** - `3e28c68` (test)
2. **Task 2: Mirror the corpora in Python and prove reciprocal mint/verify** - `1244e01` (test)
3. **Task 3: Pin and enforce the independent securesystemslib oracle** - `7c5e206` (test)

## Files Created/Modified

- `conformance/verify-ts/src/manifest.test.ts` - Exact read-side aggregate and frozen legacy manifest enforcement.
- `conformance/verify-ts/src/positive.test.ts` - Profile-aware positive PAE, signature, CID, and verdict assertions.
- `conformance/verify-ts/src/negative.test.ts` - Exact typed failure assertions for both profile trees.
- `conformance/verify-ts/src/cross_mint_parity.test.ts` - Two-direction public mint/verify subprocess proof.
- `clients/python/src/lattice_receipt/__main__.py` - Stable `mint-json` and `verify-json` drivers.
- `clients/python/tests/conftest.py` - Four explicit profile/outcome fixture loaders.
- `clients/python/tests/test_conformance.py` - Exact Python consumer and manifest coverage.
- `clients/python/tests/{test_mint,test_replay}.py` - Existing tests migrated to the standard fixture loader.
- `clients/python/tests/test_dsse_oracle.py` - Isolated upstream PAE/signature oracle.
- `clients/python/pyproject.toml` - Exact test-only oracle dependency.

## Decisions Made

- Standard negative vectors run with strict legacy policy; the v1.4 historical-PAE vector is also checked under allow policy to prove fallback is impossible.
- `verify-json` returns exit 2 only for malformed driver input; protocol verification failures remain exit-0 typed JSON results.
- The oracle reconstructs transport from committed standard fields and deep-copies it because upstream parsing mutates signature dictionaries.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Advanced the cross-mint type and fixture path during Task 1**
- **Found during:** Task 1 package typecheck
- **Issue:** The pending cross-mint file imported the deleted `ConformanceVector` type and referenced a retired flat corpus path, preventing a buildable profile-aware harness snapshot.
- **Fix:** Updated its type and designated standard path in Task 1; Task 2 then replaced its one-way behavior completely.
- **Files modified:** `conformance/verify-ts/src/cross_mint_parity.test.ts`
- **Verification:** Package typecheck and default test suite passed before and after the reciprocal rewrite.
- **Committed in:** `3e28c68`

**2. [Rule 3 - Blocking] Migrated existing mint and replay tests to the standard loader**
- **Found during:** Task 2 fixture split
- **Issue:** Removing ambiguous flat loaders would leave the existing Python mint and replay suites importing a nonexistent helper.
- **Fix:** Pointed both suites at `standard_positive_vectors` and removed now-redundant synthetic v1.4 field mutation.
- **Files modified:** `clients/python/tests/test_mint.py`, `clients/python/tests/test_replay.py`
- **Verification:** Complete Python suite passed with 59 tests.
- **Committed in:** `1244e01`

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both changes were required to preserve complete package gates after replacing the obsolete flat fixture contract; no production scope expanded.

## Issues Encountered

- Two local Vitest invocations intermittently slept before discovery. Both processes were terminated, no worker remained, and serial reruns with `CI=1` completed in under one second with 41 default and 43 reciprocal tests. No test or product code change was required.

## User Setup Required

None - the exact oracle is installed by the existing Python test extra.

## Next Phase Readiness

- Plan 58-05 can expose the already-proven profile/deprecation bridge through replay and CLI surfaces.
- Plan 58-06 can wire distinct named TS, Python, reciprocal, and oracle steps into CI.
- No blockers remain.

## Self-Check: PASSED

- Task commits `3e28c68`, `1244e01`, and `7c5e206` exist.
- TypeScript typecheck passes; default conformance is 41 passed/2 opt-in skipped; reciprocal mode is 43 passed.
- Python suite passes 59 tests, including 8 independent oracle tests.
- `securesystemslib` appears only in the exact test extra and oracle module.
- Relevant TypeScript and Python paths are committed and diff-clean.

---
*Phase: 58-conformance-and-client-migration*
*Completed: 2026-07-16*
