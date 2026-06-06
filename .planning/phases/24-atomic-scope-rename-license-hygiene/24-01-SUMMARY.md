---
phase: 24-atomic-scope-rename-license-hygiene
plan: 01
subsystem: packaging / manifest hygiene
tags: [rename, scope, license, manifest, publishConfig, atomic-stage]
requires:
  - LICENSE file at repo root (already present, MIT, Lakshman Turlapati)
  - packages/lattice/package.json existing v1.2 manifest
  - root package.json with private: true
provides:
  - "@fullselfbrowsing/lattice" scoped name on the core runtime manifest
  - license: MIT on root + packages/lattice
  - repository (with directory), homepage, bugs, publishConfig.access=public on packages/lattice
  - staged-but-uncommitted state for atomic convergence in Plan 24-03
affects:
  - packages/lattice/package.json (rename + 5 new metadata blocks)
  - package.json (single license field addition)
tech-stack:
  added: []
  patterns:
    - "git+https:// URL form for repository.url required by npm provenance (npm/cli#8036)"
    - "publishConfig.access: public required for scoped packages to bypass restricted default"
    - "root stays private: true with NO publishConfig to prevent .planning/, tools/, examples/, showcase/ leakage"
key-files:
  created:
    - .planning/phases/24-atomic-scope-rename-license-hygiene/24-01-SUMMARY.md
  modified:
    - packages/lattice/package.json
    - package.json
decisions:
  - Phase 24-01 stages but does NOT commit; the atomic commit lands in Plan 24-03
  - publishConfig.provenance is NOT added here; Phase 28 release workflow owns provenance toggle
  - No repository / bugs / homepage on root manifest; those are publishable-package-only
  - tsd compilerOptions.paths still references unscoped "lattice" key; Plan 24-03 rewrites that path key alongside the workspace import rewrites
requirements_addressed:
  - RENAME-01 (scoped name flip on lattice package)
  - PKG-01 (license root + lattice package)
  - PKG-02 (repository, bugs, homepage on lattice package)
  - PKG-03 (publishConfig.access=public on lattice package)
  - PKG-04 (root stays private with no publishConfig)
metrics:
  tasks_planned: 2
  tasks_completed: 2
  files_modified: 2
  files_created: 1
  commits_made: 0
  duration_minutes: <5
  completed_date: 2026-06-04
---

# Phase 24 Plan 01: Lattice Scope Rename + License Hygiene Summary

Renamed `packages/lattice` from `lattice` to `@fullselfbrowsing/lattice`, added the five release-required metadata blocks (license, repository, homepage, bugs, publishConfig), and added `license: "MIT"` to the workspace root while preserving `private: true` and adding no publishConfig. Both files staged but intentionally NOT committed because Phase 24 lands as a single atomic commit owned by Plan 24-03.

## What Shipped

### Task 1: packages/lattice/package.json (renamed + full metadata)

The manifest now reads (relevant header section):

```json
{
  "name": "@fullselfbrowsing/lattice",
  "version": "0.0.0",
  "description": "TypeScript-first capability runtime SDK for AI applications",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/fullselfbrowsing/Lattice.git",
    "directory": "packages/lattice"
  },
  "homepage": "https://github.com/fullselfbrowsing/Lattice",
  "bugs": {
    "url": "https://github.com/fullselfbrowsing/Lattice/issues"
  },
  "publishConfig": {
    "access": "public"
  },
  "type": "module",
  ...
}
```

Field-level changes applied exactly per CONTEXT and PITFALLS OIDC-3:

- `"name"`: `"lattice"` -> `"@fullselfbrowsing/lattice"`
- `"license"`: added as `"MIT"` (LICENSE file already exists at repo root; this only adds the manifest field)
- `"repository"`: added as object with `type: "git"`, `url: "git+https://github.com/fullselfbrowsing/Lattice.git"` (exact form required by npm provenance), and `directory: "packages/lattice"`
- `"homepage"`: added as `"https://github.com/fullselfbrowsing/Lattice"` (no trailing slash)
- `"bugs"`: added as `{ "url": "https://github.com/fullselfbrowsing/Lattice/issues" }`
- `"publishConfig"`: added as `{ "access": "public" }` (scoped packages default to restricted; this lifts to public)

All other fields preserved byte-identical: `version`, `description`, `type`, `sideEffects`, `engines`, `exports`, `types`, `files`, `scripts`, `tsd`, `dependencies`, `devDependencies`. The `tsd.compilerOptions.paths.lattice` key is intentionally left untouched here; Plan 24-03 rewrites that key together with the workspace import rewrites in the same atomic commit.

The new metadata blocks were inserted between `description` and `type` so they sit clustered at the top of the manifest near other identity fields, which keeps the diff visually compact (single contiguous +13 hunk).

### Task 2: root package.json (license added, private preserved)

Exactly one field added:

```json
{
  "name": "lattice-workspace",
  "private": true,
  "license": "MIT",
  "type": "module",
  ...
}
```

No `publishConfig`, `repository`, `homepage`, or `bugs` were added to the root. `private: true` is preserved unchanged so `.planning/`, `tools/`, `examples/`, and `showcase/` cannot leak into any published tarball. `packageManager`, `engines`, `scripts`, and `devDependencies` are byte-identical.

## Verification Run

Automated verification per the plan ran clean:

- Task 1 `<verify>` node check: `lattice pkg ok`
- Task 2 `<verify>` node check: `root pkg ok`
- All 9 Task 1 acceptance criteria: `ac1..ac9 ok`
- All 5 Task 2 acceptance criteria: `root_ac1..root_ac5 ok`
- Phase-level: both files parse as valid JSON; `git diff --cached --name-only` lists exactly `package.json` and `packages/lattice/package.json`; `grep -c '"@fullselfbrowsing/lattice"' packages/lattice/package.json` returns `1`; no other workspace files modified; `git log -1` confirms these two files are NOT in the most recent commit (which is `6580263 docs(phase-24): land plans + mark phase started`).

## Staged-But-Not-Committed Status

Per the Phase 24 atomic-commit contract:

- Plan 24-01 stages `package.json` and `packages/lattice/package.json` via `git add` -- DONE.
- Plan 24-02 will stage `packages/lattice-cli/package.json` plus license additions.
- Plan 24-03 owns the single atomic commit titled `refactor(scope): rename to @fullselfbrowsing/* (PHASE-24)` that lands all three plans' edits together, including the tsd path key rename and every workspace import rewrite.

`git diff --cached --stat` at plan close:

```
 package.json                  |  1 +
 packages/lattice/package.json | 15 ++++++++++++++-
 2 files changed, 15 insertions(+), 1 deletion(-)
```

No `git commit` was run. No STATE.md / ROADMAP.md updates were made (the orchestrator owns those after the wave converges).

## Deviations from Plan

None. Plan executed exactly as written. No Rule 1 / 2 / 3 / 4 deviations were triggered. No authentication gates encountered. No analysis-paralysis loops. No deferred items spawned.

## Threat Flags

None. This plan adds only static manifest metadata (license, repository, homepage, bugs, publishConfig.access). No new network endpoints, no auth paths, no file-access patterns, no schema changes at trust boundaries. `publishConfig.provenance` was intentionally NOT added (Phase 28 owns that wiring per CONTEXT).

## Known Stubs

None. The `tsd.compilerOptions.paths.lattice` key still references the unscoped name, but this is explicitly assigned to Plan 24-03 in the same atomic commit -- it is a scheduled rewrite within Phase 24, not an unwired stub.

## Handoff to Plan 24-02 / 24-03

- Plan 24-02 should NOT re-touch `packages/lattice/package.json` or root `package.json`; both are already staged with final Phase 24 content for those two files.
- Plan 24-03 owns: tsd `compilerOptions.paths` key rewrite (`"lattice"` -> `"@fullselfbrowsing/lattice"` in the same packages/lattice/package.json), all workspace import rewrites under `examples/**`, `packages/lattice-cli/src/**`, any test files, the `workspace:* -> workspace:^` dep flip in lattice-cli (paired with 24-02's rename), the `.changeset/` pre-seeded entry, the `pnpm pack` tarball-inspection gate, and the single atomic `refactor(scope): rename to @fullselfbrowsing/* (PHASE-24)` commit.

## Self-Check: PASSED

Verified:

- FOUND: packages/lattice/package.json (modified, staged, contains `"@fullselfbrowsing/lattice"`)
- FOUND: package.json (modified, staged, contains `"license": "MIT"` while `"private": true` preserved)
- FOUND: .planning/phases/24-atomic-scope-rename-license-hygiene/24-01-SUMMARY.md (this file)
- CONFIRMED: no commit hashes were produced by this plan (atomic commit deferred to Plan 24-03). `git log -1` shows the pre-existing `6580263 docs(phase-24): land plans + mark phase started` and does NOT list `package.json` or `packages/lattice/package.json`.
- CONFIRMED: `git diff --cached --name-only` shows exactly the two expected files staged.
