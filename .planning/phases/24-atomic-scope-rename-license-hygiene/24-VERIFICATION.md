---
phase: 24-atomic-scope-rename-license-hygiene
verified: 2026-06-04T17:00:00Z
status: passed
score: 18/18 must-haves verified
overrides_applied: 0
---

# Phase 24: Atomic Scope Rename + License Hygiene Verification Report

**Phase Goal:** Both publishable packages publish under the `@fullselfbrowsing` scope with every release-required manifest field present, landed atomically so no stale-name surface survives.
**Verified:** 2026-06-04T17:00:00Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                                                                            | Status     | Evidence                                                                                                                                |
| -- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | packages/lattice/package.json#name reads exactly @fullselfbrowsing/lattice                                                                       | VERIFIED   | node check: `name: @fullselfbrowsing/lattice`                                                                                           |
| 2  | packages/lattice/package.json has license, repository (with directory), bugs, homepage, publishConfig.access=public                              | VERIFIED   | All five fields present with exact values; directory=packages/lattice                                                                   |
| 3  | Root package.json has private: true preserved AND license: MIT added                                                                             | VERIFIED   | `private: true, license: MIT, publishConfig: undefined`                                                                                 |
| 4  | Root package.json has NO accidental publishConfig                                                                                                | VERIFIED   | `publishConfig: undefined` (root cannot publish)                                                                                        |
| 5  | packages/lattice-cli/package.json#name reads exactly @fullselfbrowsing/lattice-cli                                                                | VERIFIED   | node check: `name: @fullselfbrowsing/lattice-cli`                                                                                       |
| 6  | packages/lattice-cli/package.json#bin still maps lattice -> ./dist/cli.js (user-facing command preserved)                                         | VERIFIED   | `bin.lattice: ./dist/cli.js`                                                                                                            |
| 7  | packages/lattice-cli dependencies has @fullselfbrowsing/lattice: workspace:^ (BOTH scope rename AND * -> ^ flip on same line)                     | VERIFIED   | dep keys = `[@fullselfbrowsing/lattice, citty]`; value=workspace:^                                                                      |
| 8  | packages/lattice-cli/package.json has license, repository (with directory packages/lattice-cli), bugs, homepage, publishConfig.access=public     | VERIFIED   | All five fields present; directory=packages/lattice-cli                                                                                 |
| 9  | No leftover unscoped "lattice" string in the dependencies map of lattice-cli/package.json                                                        | VERIFIED   | Only `"lattice"` literal in CLI package.json is the bin entry (grep count = 1)                                                          |
| 10 | repository.url exact form `git+https://github.com/fullselfbrowsing/Lattice.git` (OIDC-3/PROV-1 requirement)                                       | VERIFIED   | Both packages have exact form including `git+https://` prefix and `.git` suffix                                                         |
| 11 | tsd.compilerOptions.paths key in packages/lattice/package.json is `@fullselfbrowsing/lattice` (NOT bare `lattice`)                                | VERIFIED   | `tsd.paths keys: ['@fullselfbrowsing/lattice']` only; bare `lattice` key absent                                                         |
| 12 | Every import string in packages/lattice-cli/src, packages/lattice-cli/test, and packages/lattice/test-d that previously read 'lattice' now scoped | VERIFIED   | Workspace-wide grep for `(from\|import(\|doMock(\|doUnmock() "lattice"` excluding dist/node_modules returns 0 hits                      |
| 13 | examples/agent-loop/package.json depends on `@fullselfbrowsing/lattice: workspace:^` (scoped + caret flip on same line)                           | VERIFIED   | Cat shows `"@fullselfbrowsing/lattice": "workspace:^"` and no unscoped key                                                              |
| 14 | `.changeset/v1.3.0-initial.md` exists, references both scoped packages with minor bump                                                           | VERIFIED   | File present; frontmatter lists both `@fullselfbrowsing/lattice` and `@fullselfbrowsing/lattice-cli` with `minor` bumps                  |
| 15 | All Phase 24 changes landed atomically in a single commit `refactor(scope): rename to @fullselfbrowsing/* (PHASE-24)`                            | VERIFIED   | `git log` shows commit `a267048` with exact subject                                                                                     |
| 16 | 733/733 tests pass (589 lattice + 144 lattice-cli)                                                                                               | VERIFIED   | `pnpm -r test` output: `Tests 589 passed (589)` + `Tests 144 passed (144)` = 733                                                        |
| 17 | pnpm pack tarball inspection clean: zero stale unscoped `"lattice"` in dep keys/exports/types/tsd paths; bin.lattice preserved; no leakage       | VERIFIED   | Tarballs contain only dist/, package.json, LICENSE -- no .planning/ or test files; tarball pkg.json metadata clean; bin preserved        |
| 18 | No stale `pnpm --filter lattice` or `pnpm --filter lattice-cli` invocations remain anywhere (follow-up commit 1ee3d2d closed WR-01 gap)          | VERIFIED   | Workspace-wide grep returns 0 hits; commit `1ee3d2d fix(phase-24): scope pnpm --filter args missed by atomic rename` already landed     |

**Score:** 18/18 truths verified

### Required Artifacts

| Artifact                                              | Expected                                                          | Status   | Details                                                                                                                                  |
| ----------------------------------------------------- | ----------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/lattice/package.json`                       | Scoped name + license + repository + bugs + homepage + publishConfig + scoped tsd paths key | VERIFIED | All required fields present and exact-form; tsd paths key updated; substantive 65 lines                                          |
| `packages/lattice-cli/package.json`                   | Scoped name + scoped workspace:^ dep + bin preserved + license + repository + bugs + homepage + publishConfig | VERIFIED | All fields present; dep flipped; bin preserved; substantive 49 lines                                                  |
| `package.json` (root)                                 | private: true preserved + license: MIT added; NO publishConfig    | VERIFIED | Confirmed via node parse                                                                                                                |
| `.changeset/v1.3.0-initial.md`                        | Pre-seeded changeset with scoped pkg minor bumps + body line      | VERIFIED | Exact content present                                                                                                                   |
| `examples/agent-loop/package.json`                    | Scoped + workspace:^ dep                                          | VERIFIED | Confirmed                                                                                                                               |
| `packages/lattice/test-d/package-types.test-d.ts`     | Type-import closures use scoped name                              | VERIFIED | Sweep confirms zero unscoped `from "lattice"`                                                                                           |
| `pnpm-lock.yaml`                                      | Regenerated to reference scoped workspace pkgs                    | VERIFIED | Lockfile validates -- typecheck/tests/lint:packages all green against it                                                                |

### Key Link Verification

| From                                                           | To                                                       | Via                                                                              | Status | Details                                                                                                        |
| -------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| packages/lattice/package.json#repository.url                   | github.com/fullselfbrowsing/Lattice                      | `git+https://github.com/fullselfbrowsing/Lattice.git` exact form (npm/cli#8036)  | WIRED  | Exact string match for both publishable packages                                                               |
| packages/lattice/package.json#publishConfig.access             | scoped public publish on npm                             | scoped pkgs default restricted; `access: public` required                        | WIRED  | Verified `public` on both publishable packages                                                                 |
| packages/lattice-cli#dependencies.@fullselfbrowsing/lattice    | packages/lattice#name                                    | pnpm workspace resolves scoped name to local workspace member                    | WIRED  | Tarball republishes as `^0.0.0` caret range -- workspace:^ semantics correct, no exact-pin leakage             |
| packages/lattice-cli#bin.lattice                               | ./dist/cli.js                                            | bin name preserved so `lattice --version` keeps working (RENAME-02)              | WIRED  | Tarball inspection confirms `cli.bin.lattice === "./dist/cli.js"`                                              |
| packages/lattice-cli/src/**/*.ts                               | @fullselfbrowsing/lattice workspace package              | `import { ... } from "@fullselfbrowsing/lattice"`                                | WIRED  | Sweep across src + test + test-d returns 0 unscoped specifiers                                                 |
| packages/lattice/package.json#tsd.compilerOptions.paths        | ./dist/index.d.ts                                        | tsd type-resolver alias keyed on scoped name                                     | WIRED  | `test:types` passes 664/664; tsd key matches test-d import                                                     |
| single atomic commit                                            | all Phase 24 file groups                                 | one git commit covering manifests + imports + tsd + changeset + lockfile         | WIRED  | Commit `a267048` exact subject match; body lists all 10 REQ-IDs                                                |

### Data-Flow Trace (Level 4)

Not applicable. This is a pure packaging/manifest hygiene phase -- no dynamic data rendering. Tarball-inspection gate (RENAME-05) is the equivalent end-to-end flow verification and is covered above (key links + truth 17).

### Behavioral Spot-Checks

| Behavior                                            | Command                                       | Result                                                       | Status |
| --------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------ | ------ |
| All workspace tests pass                            | `pnpm -r test`                                | `Test Files 51 passed + 13 passed`; Tests 589 + 144 = 733/733 | PASS   |
| Typecheck across workspace                          | `pnpm -r typecheck`                           | Both packages exit 0, no errors                              | PASS   |
| Type tests + tsd                                    | `pnpm -r test:types`                          | 664/664 type tests pass, Type Errors no errors               | PASS   |
| publint + attw (PKG-05)                             | `pnpm -r lint:packages`                       | All good! on both packages; attw ESM/bundler green           | PASS   |
| Tarball pack succeeds                               | `pnpm pack` on each publishable pkg           | Both tarballs produced under expected scoped names           | PASS   |
| Tarball contents leak-clean                         | `tar -tzf` grep for planning/test/spec        | NO LEAKAGE -- only dist/, package.json, LICENSE              | PASS   |
| Tarball pkg.json metadata clean (RENAME-05)         | Node-script grep against extracted pkg.json   | No unscoped `lattice` in deps/exports/types/tsd; bin preserved; workspace:^ -> ^0.0.0 | PASS |

### Requirements Coverage

| Requirement | Source Plan          | Description                                                                                              | Status    | Evidence                                                                                                  |
| ----------- | -------------------- | -------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------- |
| RENAME-01   | 24-01                | lattice pkg name flip in atomic commit covering all stale-name surfaces                                  | SATISFIED | name=@fullselfbrowsing/lattice; tsd paths key + imports + changeset all in atomic commit a267048          |
| RENAME-02   | 24-02                | lattice-cli pkg name flip; bin.lattice preserved                                                         | SATISFIED | name=@fullselfbrowsing/lattice-cli; bin.lattice=./dist/cli.js (verified in tarball)                       |
| RENAME-03   | 24-02                | workspace:* -> workspace:^ + scope rename on same dep line                                               | SATISFIED | dep = `@fullselfbrowsing/lattice: workspace:^`; tarball republish = `^0.0.0` caret (no exact-pin leakage) |
| RENAME-04   | 24-03                | tsd paths map updated + test:types passes for both packages                                              | SATISFIED | tsd.paths key = `@fullselfbrowsing/lattice`; test:types 664/664 pass                                      |
| RENAME-05   | 24-03                | pnpm pack tarball inspection confirms both tarballs carry renamed surface end-to-end                     | SATISFIED | Re-ran tarball inspection during this verification: name/deps/exports/types/tsd all clean of stale lattice |
| PKG-01      | 24-01, 24-02         | license: MIT on root + both publishable pkgs                                                             | SATISFIED | All three manifests have license: MIT                                                                     |
| PKG-02      | 24-01, 24-02         | repository (with directory), bugs, homepage on both publishable pkgs (provenance render requirement)     | SATISFIED | All three metadata blocks present with exact forms and correct per-pkg directory values                   |
| PKG-03      | 24-01, 24-02         | publishConfig.access:public on both publishable pkgs                                                     | SATISFIED | Both have publishConfig.access=public; provenance correctly NOT added (Phase 28 owns)                     |
| PKG-04      | 24-01                | root stays private: true; no publishConfig at root                                                       | SATISFIED | root: private=true, publishConfig=undefined                                                               |
| PKG-05      | 24-03                | publint + attw clean on both publishable pkgs                                                            | SATISFIED | `pnpm -r lint:packages` passes; publint "All good!"; attw 100% green under esm-only profile               |

All 10 REQ-IDs claimed by plans are accounted for. REQUIREMENTS.md maps exactly RENAME-01..05 + PKG-01..05 to Phase 24; no orphans.

### Anti-Patterns Found

None.

- Scanned all Phase-24-modified files for TODO/FIXME/PLACEHOLDER/coming-soon/stub patterns -- no hits.
- Empty implementations / `return null` / `return {}` / `return []` not applicable (manifest + import-string changes only).
- Hardcoded empty data not applicable.
- One known intentional pattern preserved: `"lattice"` literal in `packages/lattice-cli/package.json` -- this is the `bin.lattice` user-facing command name, intentionally preserved per RENAME-02. Verified to be the ONLY unscoped `"lattice"` literal remaining (grep count = 1).

### Human Verification Required

None. All goal-supporting truths are verifiable programmatically (manifest field reads, grep sweeps, test/typecheck/lint/pack gates). No visual UX, real-time behavior, or external service surface is in scope.

### Gaps Summary

No gaps. All 18 observable truths verified against the on-disk codebase state at HEAD. The phase shipped via four commits (`bbcb4ac` user-approved type-widening prep, `a267048` atomic rename, `1ee3d2d` follow-up scope of seven missed `pnpm --filter` sites flagged by code review WR-01, `1ca5d7a` plan summaries + review docs). The atomic-commit contract (single commit `refactor(scope): rename to @fullselfbrowsing/* (PHASE-24)` covering all rename surfaces) was satisfied by `a267048`; the WR-01 follow-up commit was a code-review-caught hygiene fix on stale `pnpm --filter` invocations (build scripts and docstrings) that do not appear in any Phase 24 plan must_haves but were correctly closed before this verification.

The phase goal is achieved: both publishable packages publish under the `@fullselfbrowsing` scope with every release-required manifest field present (license MIT, repository with directory, bugs, homepage, publishConfig.access=public), the workspace dep flipped to `workspace:^` republishes correctly as a caret range, the user-facing CLI binary name `lattice` is preserved end-to-end (tarball-verified), and no stale unscoped name surface survives in source / tests / type-tests / tsd paths / workspace scripts / docstrings.

Verification gate matrix (typecheck + test + test:types + lint:packages + pnpm pack + tarball inspection) ran clean during this verification, confirming the post-rename surface is internally consistent and publish-ready for Phase 28's release workflow to consume.

---

_Verified: 2026-06-04T17:00:00Z_
_Verifier: Claude (gsd-verifier)_
