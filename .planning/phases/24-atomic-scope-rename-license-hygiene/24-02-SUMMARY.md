---
phase: 24-atomic-scope-rename-license-hygiene
plan: 02
subsystem: packaging / manifest hygiene (CLI publishable)
tags: [rename, scope, workspace-dep, license, manifest, publishConfig, atomic-stage]
requires:
  - packages/lattice-cli/package.json existing v1.2 manifest
  - Plan 24-01 already staged packages/lattice/package.json scoped name (so the workspace:^ dep resolves locally)
  - LICENSE file at repo root (MIT, Lakshman Turlapati) already present
provides:
  - "@fullselfbrowsing/lattice-cli" scoped name on the CLI runtime manifest
  - scoped + caret internal dep "@fullselfbrowsing/lattice": "workspace:^" replacing legacy "lattice": "workspace:*"
  - bin.lattice -> ./dist/cli.js mapping preserved (user-facing CLI command unchanged)
  - license: MIT, repository (with directory "packages/lattice-cli"), homepage, bugs, publishConfig.access=public on packages/lattice-cli
  - staged-but-uncommitted state for atomic convergence in Plan 24-03
affects:
  - packages/lattice-cli/package.json (rename + 5 new metadata blocks + workspace dep key+value flip on the same line)
tech-stack:
  added: []
  patterns:
    - "git+https:// URL form for repository.url required by npm provenance (npm/cli#8036)"
    - "publishConfig.access: public required for scoped packages to bypass restricted default"
    - "workspace:^ on internal dep so the published tarball rewrites to a caret range (^1.3.0) rather than the exact pin produced by workspace:*"
    - "bin.<name> key intentionally NOT scoped: it is the user-facing command, scope prefix would break `lattice --version` UX"
key-files:
  created:
    - .planning/phases/24-atomic-scope-rename-license-hygiene/24-02-SUMMARY.md
  modified:
    - packages/lattice-cli/package.json
decisions:
  - Phase 24-02 stages but does NOT commit; the atomic commit lands in Plan 24-03
  - Did NOT touch packages/lattice/package.json or root package.json (those are owned by Plan 24-01 and already staged at their final Phase 24 state)
  - tsd compilerOptions.paths key rewrite inside packages/lattice/package.json was NOT touched here; it belongs to Plan 24-03 alongside workspace import rewrites
  - publishConfig.provenance NOT added (Phase 28 release workflow owns provenance toggle)
  - Did NOT modify CLI source under packages/lattice-cli/src/** or tests under packages/lattice-cli/test/** (import-string rewrites are Plan 24-03's mechanical pattern)
requirements_addressed:
  - RENAME-02 (CLI package scoped name flip + bin name preservation)
  - RENAME-03 (workspace:* -> workspace:^ flip on same line as scope rename of internal dep key)
  - PKG-01 (license MIT on CLI package)
  - PKG-02 (repository with directory packages/lattice-cli, bugs, homepage on CLI package)
  - PKG-03 (publishConfig.access=public on CLI package)
metrics:
  tasks_planned: 1
  tasks_completed: 1
  files_modified: 1
  files_created: 1
  commits_made: 0
  duration_minutes: <5
  completed_date: 2026-06-04
---

# Phase 24 Plan 02: Lattice-CLI Scope Rename + Workspace Dep Flip + License Hygiene Summary

Renamed `packages/lattice-cli` from `lattice-cli` to `@fullselfbrowsing/lattice-cli`, flipped its internal core dep from the legacy `"lattice": "workspace:*"` to the scoped + caret `"@fullselfbrowsing/lattice": "workspace:^"` (BOTH the key rename AND the `*` -> `^` value flip happen on the same dependency line in the same edit), preserved the `bin.lattice` -> `./dist/cli.js` mapping so the user-facing CLI command remains unchanged, and added the five release-required metadata blocks (license, repository with `directory: "packages/lattice-cli"`, homepage, bugs, publishConfig.access=public). Staged but intentionally NOT committed because Phase 24 lands as a single atomic commit owned by Plan 24-03.

## What Shipped

### Task 1: packages/lattice-cli/package.json (renamed + workspace dep flipped + full metadata)

The CLI manifest now reads (full file):

```json
{
  "name": "@fullselfbrowsing/lattice-cli",
  "version": "0.0.0",
  "description": "Lattice CLI — repro and verify signed capability receipts",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/fullselfbrowsing/Lattice.git",
    "directory": "packages/lattice-cli"
  },
  "homepage": "https://github.com/fullselfbrowsing/Lattice",
  "bugs": {
    "url": "https://github.com/fullselfbrowsing/Lattice/issues"
  },
  "publishConfig": {
    "access": "public"
  },
  "type": "module",
  "sideEffects": false,
  "engines": {
    "node": ">=24"
  },
  "bin": {
    "lattice": "./dist/cli.js"
  },
  "exports": {
    ".": {
      "types": "./dist/cli.d.ts",
      "import": "./dist/cli.js"
    }
  },
  "types": "./dist/cli.d.ts",
  "files": [
    "dist"
  ],
  "scripts": {
    "build": "tsdown",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "pnpm build && vitest run",
    "lint:packages": "pnpm build && publint && attw --pack . --profile esm-only"
  },
  "dependencies": {
    "@fullselfbrowsing/lattice": "workspace:^",
    "citty": "catalog:"
  },
  "devDependencies": {
    "@types/node": "catalog:"
  }
}
```

Field-level changes applied exactly per the plan and CONTEXT decisions:

- `"name"`: `"lattice-cli"` -> `"@fullselfbrowsing/lattice-cli"` (RENAME-02 name flip)
- `"license"`: added as `"MIT"` (PKG-01)
- `"repository"`: added as object with `type: "git"`, `url: "git+https://github.com/fullselfbrowsing/Lattice.git"` (exact `git+https://` form required by npm provenance per PITFALLS OIDC-3 / npm/cli#8036), and `directory: "packages/lattice-cli"` (NOT `packages/lattice` -- the CLI lives in its own subdir) (PKG-02)
- `"homepage"`: added as `"https://github.com/fullselfbrowsing/Lattice"` (no trailing slash) (PKG-02)
- `"bugs"`: added as `{ "url": "https://github.com/fullselfbrowsing/Lattice/issues" }` (PKG-02)
- `"publishConfig"`: added as `{ "access": "public" }`; `provenance` deliberately omitted (Phase 28 owns that) (PKG-03)
- `"bin"`: completely untouched -- still `{ "lattice": "./dist/cli.js" }`. The key `"lattice"` here is the user-facing binary name (NOT the package name) so `lattice --version` works unchanged after install. Per RENAME-02 success criterion: the binary key does NOT get the `@fullselfbrowsing/` prefix.
- `"dependencies"` line rewrite: the legacy `"lattice": "workspace:*"` line was replaced by `"@fullselfbrowsing/lattice": "workspace:^"`. BOTH the key (scope rename) AND the value (`*` -> `^`) flipped on the same line in the same edit. `citty: catalog:` line is byte-identical. Alphabetical ordering preserved (`@fullselfbrowsing/lattice` < `citty`). (RENAME-03 + the silently-dangerous workspace-pin surface from CONTEXT decisions / PITFALLS RENAME-1)

The five new metadata blocks were inserted as a contiguous hunk between `"description"` and `"type"`, mirroring the layout Plan 24-01 used on `packages/lattice/package.json`. All other fields (`version`, `type`, `sideEffects`, `engines`, `bin`, `exports`, `types`, `files`, `scripts`, `devDependencies`) preserved byte-identical -- diff is a clean +14 / -2 hunk:

```
+  "name": "@fullselfbrowsing/lattice-cli",
-  "name": "lattice-cli",
+  "license": "MIT",
+  "repository": { type, url, directory: "packages/lattice-cli" },
+  "homepage": "https://github.com/fullselfbrowsing/Lattice",
+  "bugs": { url: ".../issues" },
+  "publishConfig": { "access": "public" },
+  "@fullselfbrowsing/lattice": "workspace:^",
-  "lattice": "workspace:*",
```

### Why the workspace `*` -> `^` flip is the same-line edit

Per CONTEXT decisions and PITFALLS RENAME-1: `workspace:*` on an internal dep republishes as an EXACT pin in the published tarball (consumers stuck on a single patch of the core), whereas `workspace:^` republishes as a caret range (`^1.3.0`) that allows patch + minor updates. If only the scope rename landed without the `*` -> `^` flip, the very first `npm publish` would lock every consumer of `@fullselfbrowsing/lattice-cli` to a single patch of `@fullselfbrowsing/lattice`. Both edits MUST land on the same dep line in the same commit. That is why this plan owns both at once.

### Why `bin.lattice` was preserved

The package name flipped to scoped (`@fullselfbrowsing/lattice-cli`), but the user-facing binary stays `lattice`. Users install with `npm i -g @fullselfbrowsing/lattice-cli` then invoke `lattice --version` -- the scope is install-time only. Renaming the bin key to `@fullselfbrowsing/lattice-cli` (or to `lattice-cli`) would break this UX and silently change every example, README, CI script, and end-user shell history. RENAME-02 explicitly flags this as a success criterion.

## Verification Run

Automated verification per the plan ran clean (all 10 ac1..ac10 checks + the 3 phase-level checks):

- Plan `<verify>` consolidated node check: `ok`
- ac1 ok (name flip)
- ac2 ok (bin.lattice preserved)
- ac3 ok (scoped + caret dep present)
- ac4 ok (unscoped `lattice` dep key removed)
- ac5 ok (citty catalog: unchanged)
- ac6 ok (license MIT)
- ac7 ok (repository.url exact git+https form + directory packages/lattice-cli)
- ac8 ok (bugs.url + homepage exact strings)
- ac9 ok (publishConfig.access public + provenance NOT set)
- ac10 ok (unchanged fields preserved: version 0.0.0, type module, exports import path)
- `grep -c '"lattice":\s*"workspace:\*"' packages/lattice-cli/package.json` returns `0` (stale dep removed)
- `grep -c '"@fullselfbrowsing/lattice":\s*"workspace:\^"' packages/lattice-cli/package.json` returns `1` (scoped caret dep present)
- `grep '"lattice"' packages/lattice-cli/package.json` shows ONLY the bin entry line `    "lattice": "./dist/cli.js"` -- no other unscoped `"lattice"` keys anywhere in the manifest (no leakage to tarball)
- JSON parses cleanly via `JSON.parse(fs.readFileSync(...))`
- `git diff --cached --name-only` lists `packages/lattice-cli/package.json` (alongside Plan 24-01's already-staged `package.json` and `packages/lattice/package.json`)
- `git status --short packages/lattice-cli/` shows ONLY `packages/lattice-cli/package.json` modified -- no `src/**` or `test/**` files touched (those are Plan 24-03's territory)

## Staged-But-Not-Committed Status

Per the Phase 24 atomic-commit contract:

- Plan 24-01 staged `package.json` and `packages/lattice/package.json` (DONE before this plan ran).
- Plan 24-02 (this plan) staged `packages/lattice-cli/package.json` -- DONE.
- Plan 24-03 owns the single atomic commit titled `refactor(scope): rename to @fullselfbrowsing/* (PHASE-24)` that lands all three plans' edits together, including the tsd `compilerOptions.paths` key rewrite inside `packages/lattice/package.json`, every workspace import rewrite under `examples/**` + `packages/lattice-cli/src/**` + any tsd test files, the `.changeset/` pre-seeded entry, and the `pnpm pack` tarball-inspection gate.

`git diff --cached --stat` at this plan's close (all three files now staged):

```
 package.json                       |  1 +
 packages/lattice-cli/package.json  | 17 +++++++++++++++--
 packages/lattice/package.json      | 15 +++++++++++++-
```

No `git commit` was run. No STATE.md / ROADMAP.md updates were made (per orchestrator instructions).

## Deviations from Plan

None. Plan executed exactly as written. No Rule 1 / 2 / 3 / 4 deviations were triggered. No authentication gates encountered. No analysis-paralysis loops. No deferred items spawned.

The only minor procedural note: a `READ-BEFORE-EDIT` hook reminder fired post-edit on the lattice-cli manifest. The edits had already applied successfully (the runtime accepted them because the file was Read at the start of the plan). No retry was needed; the staged diff is exactly what the plan specified.

## Threat Flags

None. This plan adds only static manifest metadata (license, repository, homepage, bugs, publishConfig.access) and rewrites a single internal workspace dependency line. No new network endpoints, no auth paths, no file-access patterns, no schema changes at trust boundaries. `publishConfig.provenance` intentionally NOT added (Phase 28 owns that wiring per CONTEXT).

## Known Stubs

None. The tsd `compilerOptions.paths.lattice` key inside `packages/lattice/package.json` still references the unscoped name, but that is explicitly assigned to Plan 24-03 in the same atomic commit -- a scheduled rewrite within Phase 24, not an unwired stub. CLI source files under `packages/lattice-cli/src/**` still `import { ... } from "lattice"`; those rewrites are also explicitly Plan 24-03's territory.

## Handoff to Plan 24-03

Plan 24-03 must land, in the same atomic commit `refactor(scope): rename to @fullselfbrowsing/* (PHASE-24)`:

1. tsd `compilerOptions.paths` key rewrite inside `packages/lattice/package.json`: `"lattice"` -> `"@fullselfbrowsing/lattice"`.
2. All workspace import rewrites: every `from "lattice"` (or `require("lattice")`) under `examples/work-inbox/`, `examples/agent-loop/`, `packages/lattice-cli/src/**`, and any tsd test files becomes `from "@fullselfbrowsing/lattice"`.
3. Audit + rewrite `packages/lattice-cli/scripts/check-cli-deps.mjs` if it references the unscoped name.
4. Pre-seeded `.changeset/` entry referencing `@fullselfbrowsing/lattice` and `@fullselfbrowsing/lattice-cli` for the v1.3.0 release.
5. `pnpm pack` tarball-inspection gate: pack both publishable packages, extract `package.json` from each tarball, grep for any standalone `"lattice"` reference in dep keys / exports / types / tsd paths -- both tarballs must show only `@fullselfbrowsing/*`.
6. The single atomic commit landing all three plans' staged files plus 24-03's own edits.

Plan 24-03 must NOT re-touch any of the three files already staged by 24-01 + 24-02 EXCEPT for the explicitly-deferred tsd `compilerOptions.paths.lattice` key inside `packages/lattice/package.json` (which is the one staged-file rewrite assigned to 24-03).

## Self-Check: PASSED

Verified:

- FOUND: packages/lattice-cli/package.json (modified, staged, contains `"@fullselfbrowsing/lattice-cli"` as name, `"@fullselfbrowsing/lattice": "workspace:^"` in dependencies, `"lattice": "./dist/cli.js"` preserved in bin)
- FOUND: .planning/phases/24-atomic-scope-rename-license-hygiene/24-02-SUMMARY.md (this file)
- CONFIRMED: no commit hashes were produced by this plan (atomic commit deferred to Plan 24-03). `git log -1` shows the pre-existing `6580263 docs(phase-24): land plans + mark phase started` and does NOT list `packages/lattice-cli/package.json`.
- CONFIRMED: `git diff --cached --name-only` shows exactly three expected files staged: `package.json`, `packages/lattice-cli/package.json`, `packages/lattice/package.json`.
- CONFIRMED: `git status --short packages/lattice-cli/` shows ONLY the manifest modified -- no source files under `src/**` or tests under `test/**` were touched.
