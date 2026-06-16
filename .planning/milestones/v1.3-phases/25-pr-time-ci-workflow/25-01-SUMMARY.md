---
phase: 25-pr-time-ci-workflow
plan: 01
subsystem: infra
tags: [ci, scripts, rename, tarball, workflow-safety, oidc, node24, esm]

# Dependency graph
requires:
  - phase: 24-atomic-scope-rename-license-hygiene
    provides: clean post-rename tree under @fullselfbrowsing/* that the gate scripts validate
provides:
  - scripts/check-tarball-leak.mjs (D-04 tarball-leak audit gate)
  - scripts/verify-rename.mjs (D-05 source-import rename audit gate)
  - scripts/check-workflow-safety.mjs (D-06 workflow OIDC and pull_request_target audit gate)
affects: [25-02-pr-time-ci-workflow, 28-release-workflow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Node 24 ESM single-file gate scripts under scripts/ at workspace root
    - Zero external npm dependencies; node: built-ins plus pnpm + tar binaries only
    - Single-line greppable OK / FAIL output for CI log auditability
    - Hard-coded publishable package set in check-tarball-leak.mjs (no dynamic discovery)
    - Hard-coded allowlist in verify-rename.mjs (lattice-cli bin, check-cli-deps.mjs, self)
    - String-level YAML scanning in check-workflow-safety.mjs (no YAML parser dep)

key-files:
  created:
    - scripts/check-tarball-leak.mjs
    - scripts/verify-rename.mjs
    - scripts/check-workflow-safety.mjs
  modified: []

key-decisions:
  - "Scripts live under scripts/ at workspace root (not inside any package) because they are workspace-wide CI artifacts, not publishable code"
  - "Zero external npm deps enforced: gate scripts must boot in a fresh clone before pnpm install if needed"
  - "verify-rename.mjs allowlist includes the script itself (its JSDoc documents the anti-patterns it scans for)"
  - "check-workflow-safety.mjs treats absent .github/workflows/ as vacuous pass (Plan 02 will create the directory)"

patterns-established:
  - "Gate scripts: shebang + JSDoc + node: imports only + single-line greppable output + try/finally tmpdir cleanup"
  - "Tarball inspection: pnpm pack into mkdtemp, tar -xOf to stdout, JSON.parse, scan dependency keys + exports + types + tsd paths"
  - "Workspace walk: async generator with SKIP_NAMES directory prune + SCANNED_EXTENSIONS file filter + ALLOWLIST_FILES repo-relative escape hatch"
  - "Workflow YAML scan: anchored trimmed-line regexes for pull_request_target and id-token: write, backward walk for enclosing job key"

requirements-completed: [CI-01]

# Metrics
duration: 25min
completed: 2026-06-05
---

# Phase 25 Plan 01: CI Gate Scripts Summary

**Three Node 24 ESM gate scripts staged under scripts/ at workspace root: tarball-leak audit (D-04), source-import rename audit (D-05), and workflow OIDC / pull_request_target audit (D-06). All three pass on the current clean tree with single-line greppable OK output and zero external npm dependencies.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-06-06T04:30:00Z
- **Completed:** 2026-06-06T04:55:21Z
- **Tasks:** 3
- **Files modified:** 3 created, 0 modified

## Accomplishments

- scripts/check-tarball-leak.mjs created. Runs pnpm pack on both publishable packages (@fullselfbrowsing/lattice and @fullselfbrowsing/lattice-cli), extracts package.json from each tarball into an OS tmpdir, and scans dependencies / devDependencies / peerDependencies / optionalDependencies / exports / types / tsd.compilerOptions.paths for any unscoped bare lattice reference. Tmpdir cleanup runs in try/finally on both success and failure paths.
- scripts/verify-rename.mjs created. Walks the workspace (skipping node_modules, dist, .git, .changeset, .planning, coverage) and matches five anti-pattern regexes: from "lattice", import("lattice"), require("lattice"), vi.doMock("lattice"), vi.doUnmock("lattice"). Allowlist covers packages/lattice-cli/package.json (bin mapping per RENAME-2), packages/lattice/scripts/check-cli-deps.mjs, and the script itself (whose JSDoc documents the patterns).
- scripts/check-workflow-safety.mjs created. Scans .github/workflows/*.yml for two failure modes: any pull_request_target trigger (D-11, PITFALLS OIDC-1), and any id-token: write declaration outside a job named publish in release.yml (D-10, TanStack May 2026 blast-radius defense). Vacuously passes when .github/workflows/ does not exist.
- All three scripts pass on the current clean tree, each exits 0 with a single-line OK message, each uses only node: built-in imports, and none contain emojis.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create scripts/check-tarball-leak.mjs (D-04)** - `0f508a2` (feat)
2. **Task 2: Create scripts/verify-rename.mjs (D-05)** - `514ff1f` (feat)
3. **Task 3: Create scripts/check-workflow-safety.mjs (D-06)** - `96b9e1c` (feat)

## Files Created/Modified

- `scripts/check-tarball-leak.mjs` (168 lines) - D-04 tarball-leak audit gate; pnpm pack into tmpdir, tar -xOf, scan manifest fields for bare lattice references.
- `scripts/verify-rename.mjs` (148 lines including the self-allowlist comment) - D-05 source-import rename audit gate; workspace walk with skip-set + allowlist + five anti-pattern regexes.
- `scripts/check-workflow-safety.mjs` (146 lines) - D-06 workflow OIDC and pull_request_target audit gate; string-level YAML scan with backward job-key walk for the release.yml publish-scope check.

## Verification Output

All three gate scripts run cleanly on the current tree:

```
[check-tarball-leak] OK - inspected 2 tarballs (@fullselfbrowsing/lattice@..., @fullselfbrowsing/lattice-cli@...)
[verify-rename] OK - scanned 168 files, no stale unscoped lattice imports found
[check-workflow-safety] OK - no .github/workflows/ directory yet, nothing to audit
```

Exit codes: 0 / 0 / 0.

Acceptance check sample (every script):

- First line is `#!/usr/bin/env node`.
- All imports are `node:` prefixed (grep -c "from \"node:" returns 3-5 per script).
- No external npm imports beyond commented documentation strings.
- No emoji characters present (LC_ALL=C grep -P over the U+1F300-1FAFF and U+2600-27BF ranges returns no matches).
- Required tokens present per acceptance criteria: "pnpm pack" + "@fullselfbrowsing" in check-tarball-leak; "packages/lattice-cli/package.json" + "packages/lattice/scripts/check-cli-deps.mjs" + "node_modules" + ".planning" in verify-rename; "pull_request_target" + "id-token" + "release.yml" + "publish" + "OIDC-1" in check-workflow-safety.

## Decisions Made

- **Self-allowlist in verify-rename.mjs (deviation from plan, Rule 3 blocking fix).** The script's JSDoc header documents the five anti-pattern shapes verbatim. On first run the script flagged its own JSDoc comments as five offenders. Added `scripts/verify-rename.mjs` to ALLOWLIST_FILES with an explanatory comment. This does not weaken the gate (the script's own source is the highest-friction file to change without review) and the rest of the allowlist remains intact.
- **Hard-coded publishable package set in check-tarball-leak.mjs.** Per threat T-25-01 in the plan threat model, dynamic discovery via pnpm-workspace.yaml globs could be bypassed by adding a new package directory. Hard-coding makes adding a publishable package a deliberate edit to this script.
- **String-level YAML scan in check-workflow-safety.mjs.** Adding a YAML parser would violate the no-external-deps constraint. The failure-mode patterns (`pull_request_target:` at trimmed line start, `id-token: write` exact-match) are textually unambiguous in any sane workflow file. False positives are acceptable: they nudge a reviewer to use different wording.
- **Vacuous pass for missing .github/workflows/ directory.** Plan 25-02 creates the directory; gating on its existence in Plan 25-01 would block the plan ordering.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added scripts/verify-rename.mjs to its own allowlist**
- **Found during:** Task 2 (Create scripts/verify-rename.mjs)
- **Issue:** Initial run of verify-rename.mjs reported five FAIL lines: the script's own JSDoc header documents the five anti-pattern regexes verbatim (lines `*   - from "lattice"`, `*   - import("lattice")`, etc.), which the regexes themselves matched against.
- **Fix:** Added `"scripts/verify-rename.mjs"` to the ALLOWLIST_FILES set with an inline comment explaining that the script's JSDoc cites the patterns it scans for. This is a documentation-driven self-match, not a real regression.
- **Files modified:** scripts/verify-rename.mjs (committed in the same task commit, not as a separate fix)
- **Verification:** Re-ran `node scripts/verify-rename.mjs` -> exit 0, single-line OK, scanned 167 (then 168 after check-workflow-safety.mjs landed) files.
- **Committed in:** 514ff1f (Task 2 commit, fix included before the commit was made)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Single self-allowlist entry. No scope creep, no weakening of the gate. The script's own source is the most-reviewed file in the gate set; adding it to the allowlist is safer than introducing a no-grep marker comment hack.

## Issues Encountered

- None beyond the documented self-match deviation above. pnpm pack ran cleanly on both publishable packages on first invocation. The workspace walk completed in under a second across 167-168 scanned files.

## User Setup Required

None - no external service configuration required. These are local Node scripts; they run on any developer machine and any GitHub-hosted ubuntu-latest runner.

## CI-01 Closure Status

CI-01 (the PR-time CI workflow requirement) is partially closed by this plan: the three defense-in-depth gate scripts are now staged at the workspace root and proven green against the current tree. **Plan 25-02 closes CI-01 fully** by wiring these scripts into `.github/workflows/ci.yml` alongside the five v1.3 quality gates (install, typecheck, test, test:types, lint:packages).

## Next Phase Readiness

- Plan 25-02 can author ci.yml with `node scripts/check-tarball-leak.mjs`, `node scripts/verify-rename.mjs`, and `node scripts/check-workflow-safety.mjs` steps that resolve immediately on the first workflow run.
- Phase 28 (release.yml) will inherit the check-workflow-safety.mjs gate as-is: the script's Check B already encodes the publish-job-in-release.yml allowance, so when release.yml lands with a `publish` job carrying `id-token: write`, the gate will recognize and accept it.
- No blockers for Plan 25-02. All three scripts are green on the current main.

## Self-Check: PASSED

Verified post-write:
- `scripts/check-tarball-leak.mjs` exists at workspace root. FOUND.
- `scripts/verify-rename.mjs` exists at workspace root. FOUND.
- `scripts/check-workflow-safety.mjs` exists at workspace root. FOUND.
- Commit `0f508a2` (Task 1) present in `git log --oneline -10`. FOUND.
- Commit `514ff1f` (Task 2) present in `git log --oneline -10`. FOUND.
- Commit `96b9e1c` (Task 3) present in `git log --oneline -10`. FOUND.
- All three scripts re-run together exit 0 with single-line OK output.

---
*Phase: 25-pr-time-ci-workflow*
*Completed: 2026-06-05*
