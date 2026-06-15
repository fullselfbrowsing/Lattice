---
status: partial
phase: 25-pr-time-ci-workflow
source: [25-VERIFICATION.md]
started: 2026-06-06T05:00:00Z
updated: 2026-06-06T05:00:00Z
---

## Current Test

[awaiting first PR push to github.com/fullselfbrowsing/Lattice]

## Tests

### 1. First PR triggers the ci workflow and reports green status
expected: A new PR against `main` triggers `.github/workflows/ci.yml`, runs the 11 steps (checkout, pnpm setup, node setup, install --frozen-lockfile, typecheck, test, test:types, lint:packages, tarball audit, rename audit, workflow-safety audit), and reports a green `ci` status check before the merge button enables. Wall-clock target: roughly 90s end-to-end on ubuntu-latest.
result: [pending]
local validation: Full step sequence ran clean locally (dry-run completed 2026-06-06):
  install --frozen-lockfile (~0.5s on warm cache), typecheck (both packages Done),
  733/733 tests pass, test:types 664 types clean, publint + attw clean,
  3 audit scripts exit 0. Workflow YAML self-audited via check-workflow-safety.mjs.

### 2. Concurrency cancels in-progress PR runs but queues push-to-main runs
expected: Push a second commit to the same PR ref. The first in-progress workflow run gets `cancelled` status. Push two commits to `main` in quick succession; the second run does NOT cancel the first (concurrency is gated on `${{ github.event_name == 'pull_request' }}`).
result: [pending]
local validation: Concurrency block syntax verified in ci.yml line 12. Cannot exercise without two simultaneous GitHub runs.

### 3. Branch protection ruleset requires `ci` as a required check
expected: On github.com, the `main` branch protection rule lists `ci` (matching the job name in ci.yml) as a required status check. The merge button for any PR remains disabled until that check reports green.
result: [pending]
manual action required: On github.com/fullselfbrowsing/Lattice -> Settings -> Branches -> branch protection rule for `main`, add `ci` to "Require status checks to pass before merging".

## Summary

total: 3
passed: 0
issues: 0
pending: 3
skipped: 0
blocked: 0

## Gaps

None blocking goal achievement. All 10 code-side must-haves pass; the 3 items above are observable only on a live GitHub Actions runner + repo-settings configuration, neither of which is automatable from a local CLI.

Resolve all 3 by:
1. Pushing the branch to github.com/fullselfbrowsing/Lattice.
2. Opening a draft PR against `main`.
3. Confirming the `ci` check reports green within 2-3 minutes.
4. Push a fixup commit; confirm the in-progress run cancels.
5. Configure branch protection on github.com to require `ci`.
