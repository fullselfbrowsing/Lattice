---
phase: 26-release-hygiene-docs-receipt-downgrade-defense
plan: 03
subsystem: docs
tags: [readme, release-hygiene, badges, install, provenance, doc-01, doc-05]
dependency_graph:
  requires:
    - "Phase 24 atomic scope rename (@fullselfbrowsing/lattice, @fullselfbrowsing/lattice-cli)"
    - "Phase 25 PR-time CI workflow (verify-rename.mjs gate)"
  provides:
    - "README.md install copy using scoped package names"
    - "README.md release-hygiene badges (npm version, provenance placeholder, license MIT)"
    - "README.md Provenance Verification section with copy-pastable npm view example"
  affects:
    - "README.md (only)"
tech_stack:
  added: []
  patterns:
    - "shields.io static badge URLs"
    - "keepachangelog-adjacent doc voice"
key_files:
  created: []
  modified:
    - README.md
decisions:
  - "D-12: three release-hygiene badges placed on a single line above the H1, npm version badge is the only clickable badge"
  - "D-11: install block carries both runtime and CLI scoped commands plus a blockquote noting the CLI bin name remains lattice (RENAME-2 from PITFALLS)"
  - "D-13: provenance verification documented via stock tooling (npm view --json | jq), Phase 28 OIDC publish referenced as activation milestone"
  - "Removed the existing Install via tag pin subsection so the install copy speaks to the upcoming scoped publish and does not contradict the new badges"
metrics:
  duration_minutes: 4
  completed_date: 2026-06-06
  tasks_completed: 3
  files_modified: 1
requirements: [DOC-01, DOC-05]
---

# Phase 26 Plan 03: Release Hygiene README Deltas Summary

Public landing page now advertises the scoped npm install path, three release-hygiene badges above the H1, and a Provenance Verification section so external reviewers can verify the OIDC attestation with stock tooling once Phase 28 publishes.

## Objective Recap

Update `README.md` with three surgical additions for DOC-01 and DOC-05 without disturbing the rest of the 657-line file: (1) three new badges on a single line above the H1, (2) install block rewritten to use the scoped runtime and CLI packages plus an inline note that the CLI bin name stays `lattice`, (3) a new Provenance Verification section showing `npm view @fullselfbrowsing/lattice --json | jq .dist`.

## Tasks Executed

### Task 1: Insert three release-hygiene badges above the H1 (commit eb81262)

Added one new line at the very top of `README.md`, above the existing `<div align="center">` opening tag, holding all three badges separated by single spaces:

- npm version badge wrapped in a link to the package page on npmjs.com
- npm provenance placeholder (static success badge, will be replaced by the live provenance badge once Phase 28 lands)
- license MIT badge

The existing centered branding badges (TypeScript, Node, ESM, Standard Schema, Version, License, Stars, Forks, Issues, Last Commit) remain untouched inside the centered div. Verification: `head -10 README.md` returns the badge line on line 1 plus the existing centered div opening on line 3.

### Task 2: Rewrite install block to use scoped package names (commit e5c999f)

Replaced the existing `### Install via tag pin` subsection inside `## Quick Start` with a new `### Install` subsection. The old tag-pin guidance was incompatible with the new badges (it told consumers to use git submodules instead of npm) and would have been wrong the moment Phase 28 publishes the scoped packages.

New install block contains:

- Runtime install fenced block (`pnpm add @fullselfbrowsing/lattice` and `npm install @fullselfbrowsing/lattice`)
- CLI install fenced block (`pnpm add -g @fullselfbrowsing/lattice-cli` followed by `lattice --version`)
- A blockquote noting the CLI package name (`@fullselfbrowsing/lattice-cli`) and bin name (`lattice`) diverge intentionally per RENAME-2 from PITFALLS

Verification: `grep` matches all four required strings (`pnpm add @fullselfbrowsing/lattice`, `pnpm add -g @fullselfbrowsing/lattice-cli`, `lattice --version`, `bin name`).

### Task 3: Add Provenance Verification section (commit 1e3861f)

Inserted a new `## Provenance Verification` H2 section between the existing `## Capability Receipts` section and `## Agent Capability`. Section is 12 lines, well inside the 10 to 25 line bound from the plan.

Section contains:

- One paragraph framing OIDC Trusted Publisher and provenance attestations
- One fenced bash block with the copy-pastable `npm view @fullselfbrowsing/lattice --json | jq .dist` example plus an inline comment pointing at `.dist.attestations.provenance`
- One paragraph noting Phase 28 as the activation milestone and pointing at `SECURITY.md` for the full supply-chain posture

Verification: all three `grep` checks pass (`## Provenance Verification`, `npm view @fullselfbrowsing/lattice --json | jq`, `SECURITY.md`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Doc Consistency] Removed the existing Install via tag pin subsection**

- **Found during:** Task 2
- **Issue:** Plan Task 2 said to replace the install block, but the README had an `### Install via tag pin` subsection telling consumers to use git submodules because `@fullselfbrowsing/lattice@1.2.0` was deferred. With the new npm version badge at the top of the README (Task 1) and the upcoming Phase 28 publish, leaving the tag-pin copy in place would have produced two contradictory install paths on the same page.
- **Fix:** Replaced the `### Install via tag pin` subsection (header plus its paragraph plus the fenced submodule block) with the new `### Install` subsection from Task 2. The `### Use from this repository` subsection above it (clone + build + test) was preserved because it is the contributor workflow, not a consumer install path.
- **Files modified:** README.md
- **Commit:** e5c999f

No Rule 1, Rule 2, or Rule 4 deviations.

## Authentication Gates

None.

## Verification Results

All four success criteria from the plan verify clean:

| Check                                                                | Result |
| -------------------------------------------------------------------- | ------ |
| `head -10 README.md` contains npm version badge                      | PASS   |
| `head -10 README.md` contains provenance-attested-success badge      | PASS   |
| `head -10 README.md` contains license-MIT-blue badge                 | PASS   |
| `grep "pnpm add @fullselfbrowsing/lattice" README.md`                | PASS   |
| `grep "pnpm add -g @fullselfbrowsing/lattice-cli" README.md`         | PASS   |
| `grep "lattice --version" README.md`                                 | PASS   |
| `grep "bin name" README.md`                                          | PASS   |
| `grep "## Provenance Verification" README.md`                        | PASS   |
| `grep "npm view @fullselfbrowsing/lattice --json | jq" README.md`    | PASS   |
| `grep "SECURITY.md" README.md`                                       | PASS   |

Additional checks:

- No emojis introduced in the diff (python regex scan over added lines returned 0 matches).
- No em-dashes or en-dashes introduced in the diff (`grep -E '—|–'` on added lines returned empty).
- `node scripts/verify-rename.mjs` exits clean: 168 files scanned, no stale unscoped `lattice` imports found.

## Commits

| Task | Commit  | Message                                                          |
| ---- | ------- | ---------------------------------------------------------------- |
| 1    | eb81262 | docs(26-03): add npm version, provenance, license badges above H1 |
| 2    | e5c999f | docs(26-03): rewrite install block to use scoped package names    |
| 3    | 1e3861f | docs(26-03): add Provenance Verification section to README        |

## Self-Check: PASSED

- README.md exists and contains the new badge line at the top: FOUND
- README.md contains the scoped install block: FOUND
- README.md contains the Provenance Verification section: FOUND
- Commit eb81262: FOUND
- Commit e5c999f: FOUND
- Commit 1e3861f: FOUND
