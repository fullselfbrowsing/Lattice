# Phase 24: Atomic Scope Rename + License Hygiene - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning
**Mode:** Auto-generated (smart_discuss infrastructure detection — pure refactor + manifest fields, no user-facing behavior)

<domain>
## Phase Boundary

Both publishable packages publish under the `@fullselfbrowsing` scope with every release-required manifest field present, landed atomically so no stale-name surface survives. Scope rename + license/metadata hygiene is one indivisible commit gate; downstream phases (CI, release workflow, publish) cannot land safely if any of the 5 stale-name surfaces leak.

In scope: `packages/lattice/package.json`, `packages/lattice-cli/package.json`, `packages/lattice/tsd` paths map, every workspace import that references the unscoped `lattice` name, `.changeset/` pre-seeded entry referencing the new scope, root `package.json` `private: true` preservation, `pnpm pack` tarball-inspection gate.

Out of scope: CI workflow file (Phase 25), release workflow (Phase 28), publish step (Phase 28/29), CHANGELOG content (Phase 26 retroactive seeding).

</domain>

<decisions>
## Implementation Decisions

### Atomic commit shape
- Single commit titled `refactor(scope): rename to @fullselfbrowsing/* (PHASE-24)`.
- All 5 stale-name surfaces moved in the same commit: package `name` fields (both packages), `workspace:* → workspace:^` dep flip in lattice-cli, tsd `compilerOptions.paths` map in lattice package, every import path in `examples/**` and tests that references the unscoped name, and a pre-seeded `.changeset/` entry referencing the new scope.
- Same commit adds `"license": "MIT"`, `"repository"`, `"bugs"`, `"homepage"`, `"publishConfig": { "access": "public" }` to both publishable packages.

### Workspace dep flip
- `"lattice": "workspace:*"` → `"@fullselfbrowsing/lattice": "workspace:^"`
- The `*` to `^` flip is non-obvious but critical. `workspace:*` pins the exact version in the published tarball, locking lattice-cli users to one patch release of the core. `workspace:^` republishes as a caret range allowing patch updates.

### License field placement
- `"license": "MIT"` added to root, `packages/lattice`, AND `packages/lattice-cli`.
- LICENSE file already exists at repo root — no file changes, just manifest fields.

### Metadata URLs
- `repository.url` = `git+https://github.com/fullselfbrowsing/Lattice.git` (provenance attestation requires this exact form per npm/cli #8036)
- `repository.directory` set per package (`packages/lattice` and `packages/lattice-cli` respectively)
- `homepage` = `https://github.com/fullselfbrowsing/Lattice` (no trailing slash)
- `bugs.url` = `https://github.com/fullselfbrowsing/Lattice/issues`

### Root workspace stays private
- Root `package.json#private: true` preserved unchanged.
- Only `packages/lattice` and `packages/lattice-cli` flip to `publishConfig.access: "public"`. This prevents `.planning/`, `tools/`, `examples/`, and `showcase/` from leaking.

### Tarball inspection gate
- After the rename commit, run `pnpm pack` in each publishable package, extract `package.json` from the resulting tarball, and grep for unscoped `"lattice"` references in dependency keys, exports, types, or tsd paths.
- Both tarballs must show only `@fullselfbrowsing/*` names. Any leak fails the phase.

### Claude's Discretion
All implementation choices not enumerated above are at Claude's discretion. Pure infrastructure phase. Use ROADMAP phase goal, success criteria, and existing codebase conventions (tsdown, ESM-only, exactOptionalPropertyTypes) to guide decisions.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/lattice/package.json` (line 2: `"name": "lattice"`; line 3: `"version": "0.0.0"`) — workspace surface, ready for rename
- `packages/lattice-cli/package.json` (depends on `"lattice": "workspace:*"`) — CLI surface with workspace dep
- Root `package.json` (`"private": true`, uses pnpm catalog: specifiers) — workspace manifest, no rename needed
- `packages/lattice/tsd` block — `tsd.compilerOptions.paths.lattice` must update to `paths["@fullselfbrowsing/lattice"]`
- `LICENSE` file at repo root — MIT, Lakshman Turlapati, no changes required

### Established Patterns
- ESM-only across both packages (`"type": "module"`, `tsdown` build with shebang detection for the CLI bin)
- Strict TypeScript 6 with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`
- pnpm workspace with `catalog:` specifiers in `pnpm-workspace.yaml`
- `pnpm -r test`, `pnpm -r test:types`, `pnpm -r lint:packages` (the last runs publint + attw + cli-deps-check) all green at v1.2 close-out
- Changesets ALREADY installed (`@changesets/cli@2.31.0`); no setup needed, just usage
- 733/733 workspace tests passing post-v1.2 close

### Integration Points
- Every import site of `'lattice'` in workspace (`examples/work-inbox/`, `examples/agent-loop/`, `packages/lattice-cli/src/**`) must rewrite to `'@fullselfbrowsing/lattice'`
- tsd test entries (`packages/lattice/test/**/*.tsd.ts` if any) reference the bare `lattice` specifier — rewrite needed
- `packages/lattice-cli/scripts/check-cli-deps.mjs` may reference the unscoped name — needs audit

</code_context>

<specifics>
## Specific Ideas

- The `workspace:* → workspace:^` flip MUST land in the same commit as the name change. Splitting them risks publishing a tarball that references the wrong scope.
- `pnpm pack` tarball inspection is the failsafe — grep the extracted `package.json` for any standalone `"lattice"` reference. This is the only reliable detector before publish.
- Provenance generation requires `repository.url` in a specific form (`git+https://...` not `https://...`); verified against npm/cli #8036 in research/PITFALLS.md.

</specifics>

<deferred>
## Deferred Ideas

- Unscoped `lattice` redirect stub published to grab the name (deferred to v1.4 per Out of Scope).
- Pre-seeded CHANGELOG history retroactively reformatted for v1.0/v1.1/v1.2 — Phase 26 owns that authoring; this phase just adds the changeset entry stub for v1.3.0.
- README badges + provenance verification example — Phase 26 owns the README rewrite.

</deferred>
