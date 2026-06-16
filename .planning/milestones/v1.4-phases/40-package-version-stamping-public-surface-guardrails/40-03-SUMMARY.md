---
phase: 40-package-version-stamping-public-surface-guardrails
plan: 03
subsystem: ci
tags: [tarball-smoke, dependency-boundary, ci]
requires:
  - phase: 40-package-version-stamping-public-surface-guardrails
    provides: stamped runtime and CLI version surfaces plus public export inventory
provides:
  - packed runtime and CLI version-surface smoke script
  - core runtime dependency and built-dist boundary scan
  - CI and release workflow enforcement for both new package gates
affects: [release, ci, package-hygiene, public-api]
tech-stack:
  added: []
  patterns:
    - zero-dependency Node package hygiene scripts
    - local pnpm pack extraction smoke with installed dependency links
key-files:
  created:
    - scripts/check-package-version-surfaces.mjs
    - scripts/check-core-package-boundary.mjs
  modified:
    - package.json
    - .github/workflows/ci.yml
    - .github/workflows/release.yml
key-decisions:
  - "Packed artifact version checks import/run extracted dist files and compare to in-tarball manifests."
  - "Core runtime boundary checks fail on forbidden optional integration packages in manifest dependency blocks or built dist imports."
patterns-established:
  - "Release hygiene scripts print [script-name] OK/FAIL messages and exit nonzero on violations."
  - "CI and release workflows append new audits after existing package/tarball validation without replacing prior gates."
requirements-completed: [PKG-01, PKG-02, PKG-03]
duration: 5 min
completed: 2026-06-15
---

# Phase 40 Plan 03: Package Guardrail Gates Summary

**Packed-artifact version checks and core dependency boundary scans now run locally, in PR CI, and before npm publish.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-06-15T12:50:05Z
- **Completed:** 2026-06-15T12:54:40Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added `scripts/check-package-version-surfaces.mjs` to pack both publishable packages and verify packed runtime/CLI versions against packed manifests.
- Added `scripts/check-core-package-boundary.mjs` to block optional provider, OTel, realtime, KMS, CLI, and native media packages from the runtime manifest or built dist.
- Added root scripts `check:package-version` and `check:core-boundary`.
- Wired both new audits into PR CI and the npm release workflow before publish.
- Ran the full Phase 40 gate successfully.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add packed artifact version-surface smoke** - `5f8362d` (test)
2. **Task 2: Add core runtime optional-dependency boundary scan** - `4134430` (test)
3. **Task 3: Wire new package gates into CI, release, and final full suite** - `ad9e7ae` (ci)
4. **Review fix: Catch forbidden subpath imports** - `c7ab52e` (fix)

## Files Created/Modified

- `scripts/check-package-version-surfaces.mjs` - Packs/extracts runtime and CLI tarballs, then checks `latticeVersion` and CLI help banner versions.
- `scripts/check-core-package-boundary.mjs` - Scans runtime manifest dependency blocks and built dist import references for forbidden optional integration packages.
- `package.json` - Adds root `check:package-version` and `check:core-boundary` scripts.
- `.github/workflows/ci.yml` - Runs both new audits after tarball stale-name auditing.
- `.github/workflows/release.yml` - Runs both new audits after package lint/tarball validation and before npm publish.

## Decisions Made

- Linked each extracted package's local `node_modules` during the packed-version smoke, matching a real installed package where runtime dependencies are available while still importing/running the tarball's own `dist` files.
- Kept the core boundary script as a deliberately hard-coded forbidden list so new always-on runtime dependencies require an intentional review diff.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Linked installed dependencies for extracted tarball import smoke**
- **Found during:** Task 1 (packed artifact version-surface smoke)
- **Issue:** Importing a raw extracted runtime tarball failed because tarballs do not include `node_modules`, while a real installed package has its declared dependencies available.
- **Fix:** Symlinked each package's local `node_modules` into the extracted package before importing/running its packed `dist` files.
- **Files modified:** `scripts/check-package-version-surfaces.mjs`
- **Verification:** `pnpm -r build && node scripts/check-package-version-surfaces.mjs` passed.
- **Committed in:** `5f8362d`

**2. [Rule 2 - Missing Critical] Extended forbidden import scan to package subpaths**
- **Found during:** Code review gate
- **Issue:** The first boundary regex matched exact package specifiers like `openai` but not subpath imports like `openai/resources`.
- **Fix:** Updated `importPattern()` to match the forbidden package root and any slash-delimited subpath.
- **Files modified:** `scripts/check-core-package-boundary.mjs`
- **Verification:** `pnpm --filter @full-self-browsing/lattice build && node scripts/check-core-package-boundary.mjs`, followed by the full Phase 40 gate, passed.
- **Committed in:** `c7ab52e`

---

**Total deviations:** 2 auto-fixed (1 blocking local-pack smoke issue, 1 missing critical boundary-scan gap)
**Impact on plan:** The smoke still validates the packed files and packed manifests; the dependency link only supplies the install-time dependencies a real consumer would have. The boundary scan now covers exact package imports and forbidden subpath imports.

## Issues Encountered

None beyond the auto-fixed local tarball dependency availability issue.

## User Setup Required

None - no external service configuration required.

## Self-Check: PASSED

Final full gate passed after the code-review hardening fix:

- `pnpm -r build`
- `pnpm -r typecheck`
- `pnpm -r test`
- `pnpm -r test:types`
- `pnpm -r lint:packages`
- `node scripts/check-tarball-leak.mjs`
- `node scripts/verify-rename.mjs`
- `node scripts/check-package-version-surfaces.mjs`
- `node scripts/check-core-package-boundary.mjs`

## Next Phase Readiness

Phase 40 guardrails are in place for v1.4 public exports and optional integration work. Phase 41 can add gateway delegation without weakening package identity or core dependency boundaries.

---
*Phase: 40-package-version-stamping-public-surface-guardrails*
*Completed: 2026-06-15*
