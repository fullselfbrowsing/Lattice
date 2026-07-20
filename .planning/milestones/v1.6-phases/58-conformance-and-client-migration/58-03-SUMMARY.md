---
phase: 58-conformance-and-client-migration
plan: 03
subsystem: conformance
tags: [manifest, reproducibility, dsse, fixtures, supply-chain]

# Dependency graph
requires:
  - phase: 58-conformance-and-client-migration
    provides: standalone v1.4 generator, standard vectors, and frozen legacy corpus
provides:
  - Exact recursive aggregate manifest over current and legacy evidence
  - Nonmutating temporary regeneration and byte-drift gate
  - Byte-identical normative fixture bound to the designated standard vector
affects: [58-04, 58-06, conformance-ci, protocol-documentation]

# Tech tracking
tech-stack:
  added: []
  patterns: [exact-set manifests, symlink rejection, temporary regeneration, single-source fixtures]

key-files:
  created: [conformance/generate/src/check-generated.ts, conformance/vectors/MANIFEST.sha256]
  modified: [conformance/generate/src/manifest.ts, conformance/generate/src/main.test.ts, spec/generate-vector0.ts, spec/vector0-fixture.json]

key-decisions:
  - "The root manifest covers every JSON in both corpus profiles plus the immutable nested legacy manifest, and verifies set equality before hashes."
  - "Generated-artifact checks operate in a temporary root and compare exact names and bytes without rewriting committed evidence."
  - "The spec fixture is the designated standard vector itself; the spec entrypoint only regenerates, validates, and synchronizes that source artifact."

patterns-established:
  - "Exact evidence boundary: noncanonical paths, duplicates, extras, omissions, byte changes, and symlinks fail closed."
  - "One fixture identity: public worked examples are copied byte-for-byte from independently generated conformance evidence."

requirements-completed: [CONF16-01, CONF16-02, CONF16-06]

# Metrics
duration: 8min
completed: 2026-07-16
---

# Phase 58 Plan 03: Exact Evidence and Normative Fixture Summary

**Exact 28-file integrity coverage, nonmutating regeneration, and one byte-identical v1.4 worked fixture**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-16T21:38:00Z
- **Completed:** 2026-07-16T21:45:48Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Replaced the obsolete flat manifest writer with recursive, sorted, POSIX-normalized exact-set verification across legacy and standard corpus trees.
- Added explicit rejection tests for missing, extra, duplicate, changed, symlinked, and escaping evidence paths.
- Added `check:generated`, which regenerates standard vectors in a temporary directory, compares exact names and bytes, recomputes the aggregate manifest, and removes the temporary tree.
- Preserved the nested legacy manifest as read-only evidence while including its bytes in the aggregate manifest.
- Made `spec/vector0-fixture.json` byte-identical to the designated v1.4 Unicode/redaction vector and reduced its generator to a thin standalone-generator check/sync entrypoint.

## Task Commits

Each task was committed atomically:

1. **Task 1: Enforce exact aggregate manifests and non-mutating regeneration** - `73857f3` (feat)
2. **Task 2: Bind the normative fixture to the designated standard vector** - `baa4259` (feat)

## Files Created/Modified

- `conformance/generate/src/manifest.ts` - Recursive exact-set enumeration, parsing, hashing, and nested/root verification.
- `conformance/generate/src/check-generated.ts` - Clean temporary regeneration and byte comparison.
- `conformance/generate/src/main.test.ts` - Adversarial manifest and determinism coverage.
- `conformance/generate/package.json` - Explicit aggregate generation and read-only drift-check scripts.
- `conformance/vectors/MANIFEST.sha256` - Aggregate hashes for 27 JSON vectors plus the legacy manifest.
- `spec/generate-vector0.ts` - Thin designated-vector regeneration, validation, check, and sync entrypoint.
- `spec/vector0-fixture.json` - Byte-identical designated v1.4 standard vector.

## Decisions Made

- Aggregate verification checks the actual recursive file set in both directions before checking hashes, so a valid subset cannot pass.
- Any symlink anywhere below a corpus profile is rejected, even if it resolves within the corpus.
- Normal fixture verification is read-only; synchronization requires the explicit `--write` flag.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

- The workspace does not install a Prettier binary, so the optional targeted formatting check could not run. Required TypeScript, behavioral, manifest, byte-comparison, and clean-diff gates all passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 58-04 can consume a reproducible corpus whose expected results and bytes are protected by exact manifests.
- CI closure in Plan 58-06 can use `check:generated` without permitting checkout mutation.
- No blockers remain.

## Self-Check: PASSED

- Both task commits are present in Git history.
- The aggregate manifest contains exactly 28 entries and both manifests pass `sha256sum --check`.
- Generator typecheck and all 28 tests pass.
- `check:generated` leaves generator, corpus, manifest, and fixture paths unchanged.
- The public fixture and designated standard vector pass byte-for-byte comparison.

---
*Phase: 58-conformance-and-client-migration*
*Completed: 2026-07-16*
