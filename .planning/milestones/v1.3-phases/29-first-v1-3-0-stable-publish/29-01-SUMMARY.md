---
phase: 29-first-v1-3-0-stable-publish
plan: 01
subsystem: release-readiness
tags: [docs, github-actions, changesets, provenance]

requires:
  - phase: 39-multi-agent-delegation-surface-full-row-60-close-row-83-upda
    provides: completed Phase 33-39 stable surface and crew changeset context
provides:
  - README stable v1.3 status and completed Phase 33-39 surface copy
  - Changelog-derived GitHub Release body extraction script
  - Release workflow wiring for `body_path: .release-notes.md`
affects: [phase-29, release-workflow, public-readme, github-release]

tech-stack:
  added: []
  patterns:
    - Release notes are generated from `packages/lattice/CHANGELOG.md` using a deterministic Node built-in script.
    - Release workflow comments avoid static npm token names so token-absence greps remain strict.

key-files:
  created:
    - scripts/extract-release-notes.mjs
  modified:
    - README.md
    - .github/workflows/release.yml

key-decisions:
  - "Kept README stable-release copy future-safe: it names the v1.3.0 target while saying post-publish proof is verified after Phase 29."
  - "Used `packages/lattice/CHANGELOG.md` as the GitHub Release body source because the runtime package carries the canonical release notes."

patterns-established:
  - "Tag release notes are extracted into `.release-notes.md` before `softprops/action-gh-release` runs."
  - "Release workflow safety checks can grep for token variable names with zero false positives from comments."

requirements-completed: [PUB-04]

duration: 5 min
completed: 2026-06-11
---

# Phase 29 Plan 01: Release Surface Readiness Summary

**README stable-release positioning and changelog-derived GitHub Release notes are ready for the v1.3.0 publish path**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-11T17:02:23Z
- **Completed:** 2026-06-11T17:07:14Z
- **Tasks:** 2 completed
- **Files modified:** 3

## Accomplishments

- Refreshed `README.md` from rc.0/model-track-in-progress language to the stable v1.3 surface: Phases 24-28, 33-38, and the Phase 39 opt-in crew API are documented as complete.
- Added Phase 35-39 rows to the v1.3 table, including `defineAgent`, `runAgentCrew`, `createRateLimitGroup`, and `parentReceiptCid`.
- Removed Phase 35-39 from the upcoming-work table so only stable publish and canary/audit follow-up remain.
- Added `scripts/extract-release-notes.mjs`, which extracts a versioned package changelog section and writes a GitHub Release body with npm package links.
- Updated `.github/workflows/release.yml` so tag publishes extract `.release-notes.md` and pass it to `softprops/action-gh-release` via `body_path`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Refresh README stable-release status** - `a0d0175` (docs)
2. **Task 2: Add changelog-derived GitHub Release notes** - `1204997` (chore)

## Files Created/Modified

- `README.md` - Stable v1.3 public status, completed Phase 33-39 table, updated test posture, and post-Phase-29 provenance verification command.
- `scripts/extract-release-notes.mjs` - Deterministic changelog-section extractor for GitHub Release body generation.
- `.github/workflows/release.yml` - Extracts `.release-notes.md` after npm publish and uses it as the GitHub Release body.

## Decisions Made

- Kept the README from claiming the stable npm postflight proof already exists; it now states that `@1.3.0` provenance is verified after Phase 29.
- Removed static npm token variable names from workflow comments so the plan's token-absence gate is literal and strict.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first executor dispatch failed before making changes with `Unsupported service_tier: flex`. The plan was executed inline under the execute-plan fallback path.
- The first Task 2 verification found existing workflow comments containing static npm token variable names. Reworded comments only; permissions and publish behavior were unchanged.

## User Setup Required

None - no external service configuration required for this plan.

## Verification

- `bash -c 'rg "version-1\\.3\\.0" README.md && rg "Phases 33 to 39" README.md && rg "runAgentCrew|createRateLimitGroup|parentReceiptCid" README.md && ! rg -i "multi-agent crews remain out of scope|Phase 35 \\| Prompt scaffolding helpers|Phase 39 \\| Multi-agent delegation surface \\(currently Out of Scope" README.md'` - passed.
- `node scripts/check-workflow-safety.mjs` - passed: audited 3 workflow files with no out-of-scope `id-token: write`.
- `node scripts/extract-release-notes.mjs 1.2.0 /tmp/lattice-release-notes-test.md` - passed and wrote `# @full-self-browsing/lattice v1.2.0` plus package links.
- `pnpm changeset status --verbose` - passed and reports both `@full-self-browsing/lattice 1.3.0` and `@full-self-browsing/lattice-cli 1.3.0` as minor bumps.
- `! rg "generate_release_notes: true" .github/workflows/release.yml` - passed.
- `! rg "NODE_AUTH_TOKEN|NPM_TOKEN" .github/workflows/release.yml` - passed.

## Next Phase Readiness

Wave 2 can run release preflight and Version Packages PR readiness. The stable npm slot is still open for both packages based on preflight npm queries during execute-phase orchestration: only `0.0.0-bootstrap.0` and `1.3.0-rc.0` are present.

## Self-Check: PASSED

- Key created file exists: `scripts/extract-release-notes.mjs`.
- Task commits exist: `a0d0175` and `1204997`.
- Acceptance criteria and plan-level verification passed.

---
*Phase: 29-first-v1-3-0-stable-publish*
*Completed: 2026-06-11*
