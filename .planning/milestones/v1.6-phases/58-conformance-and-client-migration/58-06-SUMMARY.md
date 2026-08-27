---
phase: 58-conformance-and-client-migration
plan: 06
subsystem: conformance-ci
tags: [github-actions, dsse, interoperability, release-gates, migration]

# Dependency graph
requires:
  - phase: 58-conformance-and-client-migration
    provides: immutable/exact corpora, reciprocal clients, independent oracle, CLI bridge, and packed consumer
provides:
  - Named release-blocking CI gates for every Phase 58 drift class
  - Public v1.4 migration and exit contracts aligned with shipped runtime and CLI literals
  - Complete green repository, cross-language, oracle, replay, CLI, and package-consumer closure matrix
affects: [59-authoritative-runtime-state, release-ci, protocol-consumers, downstream-migration]

# Tech tracking
tech-stack:
  added: []
  patterns: [named drift gates, nonmutating evidence checks, explicit cross-mint scripts, full closure matrix]

key-files:
  created: []
  modified: [.github/workflows/conformance.yml, conformance/verify-ts/package.json, spec/SPEC.md, spec/MIGRATION-v1.4.md, spec/CHANGELOG.md]

key-decisions:
  - "Conformance remains one least-privilege Node 24/Python 3.13 job; ordered named steps provide drift attribution without a broader runtime matrix."
  - "Python product conformance and the exact securesystemslib oracle run as separate CI steps, while the complete local suite still proves them together."
  - "Reciprocal minting and exact aggregate coverage have dedicated non-watch package scripts used directly by CI."

patterns-established:
  - "Release gate taxonomy: legacy bytes, exact inventory, generator, non-mutation, each language, oracle, reciprocal mint, build, and packed consumer fail separately."
  - "Closure evidence records focused counts and repository-wide counts so phase verification can distinguish coverage from duplication."

requirements-completed: [CONF16-01, CONF16-02, CONF16-03, CONF16-04, CONF16-05, CONF16-06]

# Metrics
duration: 9min
completed: 2026-07-16
---

# Phase 58 Plan 06: Release-Blocking Conformance Closure Summary

**Named CI drift gates, exact public migration contracts, and a fully green source-to-tarball interoperability matrix**

## Performance

- **Duration:** 9 min
- **Started:** 2026-07-16T22:19:00Z
- **Completed:** 2026-07-16T22:28:09Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Expanded conformance CI path triggers across protocol, generator, Python, replay materialization, CLI, packing scripts, package manifests, workspace metadata, and the lockfile.
- Replaced coarse checks with ordered named gates for frozen legacy bytes, exact aggregate coverage, generator type/tests/non-mutation, TypeScript, Python, independent oracle, reciprocal minting, builds, and clean packed consumers.
- Added explicit non-watch `test:manifest` and `test:cross-mint` scripts and wired CI to those stable command names.
- Reconciled the normative spec note, v1.4 changelog, and migration guide with exact version/profile/policy/error/CLI literals and actual verify/repro exit classes.
- Ran the complete repository and interoperability matrix with no Phase 58 regression, evidence mutation, production oracle dependency, legacy issuer, or obsolete flat corpus path.

## Task Commits

1. **Task 1: Expand conformance CI into explicit release-blocking gates** - `d3e3b0d` (ci)
2. **Task 2: Reconcile public docs, scripts, and dependency metadata** - `43d338b` (docs)
3. **Task 3: Run the complete repository and interoperability closure matrix** - verification-only; no source changes required

## Files Created/Modified

- `.github/workflows/conformance.yml` - Complete path filters and ordered named conformance/package gates.
- `conformance/verify-ts/package.json` - Explicit non-watch manifest and reciprocal cross-mint scripts.
- `spec/SPEC.md` - Non-normative CLI mapping tied to verifier-owned profile/deprecation results.
- `spec/MIGRATION-v1.4.md` - Exact strict-mode errors, success fields, and verify/repro exit table.
- `spec/CHANGELOG.md` - Exact standard/legacy profiles, allow/reject policies, CLI flag, output fields, and exit classes.

## Decisions Made

- Kept one CI job because ordered step names already isolate every drift class and avoid duplicating setup cost; the Phase 62 Node/provider matrix remains out of scope.
- Used the focused TypeScript manifest test for exact recursive set equality in addition to GNU `sha256sum` byte checks.
- Kept `check:generated` read-only and followed it with a targeted `git diff --exit-code` over the standard corpus, both manifests, and normative fixture.
- Documented strict legacy rejection as exit 1 in `verify` but exit 2 in `repro`, where it is a verify-first replay prerequisite failure.

## Validation Evidence

- `sha256sum --check conformance/vectors/legacy/MANIFEST.sha256` from the legacy directory: 12/12 historical files pass.
- `pnpm --filter @lattice-conformance/verify-ts test:manifest`: 4/4 exact manifest tests pass.
- Generator typecheck passes; generator suite passes 28/28; `check:generated` reports an exact temporary-generation match and leaves evidence diff-clean.
- TypeScript conformance typecheck passes; default suite is 41 passed and 2 intended opt-in skips.
- Python client suite is 59/59; focused independent oracle is 8/8 with installed `securesystemslib` exactly `1.4.0`.
- Enabled `LATTICE_RUN_CROSS_MINT=1` run executes 2/2 reciprocal tests with no skip.
- Focused materializer suite is 9/9; focused CLI verify/repro suite is 34/34.
- `pnpm -r typecheck` passes all four scripted workspaces.
- `pnpm -r test`: generator 28, runtime 1112, TypeScript conformance 41 with 2 opt-in skips, CLI 169.
- `pnpm -r build` passes both publishable package builds.
- `pnpm -r test:types` passes 1313 runtime tests with zero type errors; `tsd` exits 0.
- `node scripts/check-protocol-package-consumer.mjs` passes clean runtime and CLI tarball installation and bridge behavior.
- Aggregate `MANIFEST.sha256` validates all 28 entries; `pnpm install --frozen-lockfile` confirms deterministic workspace metadata.

## Source Audits

- Generator source contains no production receipt-package or runtime import.
- Non-Markdown `securesystemslib` references occur only in `clients/python/pyproject.toml` and `test_dsse_oracle.py`; runtime package manifests contain none.
- TypeScript `createReceipt` and Python `mint` both use standard PAE and require v1.4/`dsse-v1`; neither contains a legacy signing branch.
- No active source, workflow, harness, or public doc references `conformance/vectors/positive` or `conformance/vectors/negative`.
- Generated corpus, manifests, and normative fixture remain diff-clean after the full matrix.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - all gates use repository dependencies and self-cleaning temporary consumers.

## Next Phase Readiness

- Phase 58 is complete with all six requirements enforced locally and in named CI steps.
- Phase 59 can proceed to authoritative runtime-state semantics without unresolved protocol, client, CLI, or release-gate drift.
- No blockers remain.

## Self-Check: PASSED

- Task commits `d3e3b0d` and `43d338b` exist; Task 3 required no code change.
- Every Task 3 command and every source audit exits with the expected status.
- All five modified files are committed and diff-clean.
- Frozen legacy and generated standard evidence remain unchanged.
- The user journal-row stash remains present and untouched pending this plan's metadata commit.

---
*Phase: 58-conformance-and-client-migration*
*Completed: 2026-07-16*
