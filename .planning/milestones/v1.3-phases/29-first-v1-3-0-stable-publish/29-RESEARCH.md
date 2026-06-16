# Phase 29: First v1.3.0 Stable Publish - Research

## RESEARCH COMPLETE

**Date:** 2026-06-11
**Mode:** Inline fallback. The `gsd-phase-researcher` agent failed with `Unsupported service_tier: flex`, so research was completed in the orchestrator using local repo evidence and official npm/GitHub/Changesets documentation.

## Phase Summary

Phase 29 is not a feature implementation phase. It is an irreversible release-operations phase that promotes the current `1.3.0-rc.0` packages to stable `1.3.0` through the existing Changesets + GitHub Actions + npm Trusted Publisher path.

The planner should optimize for:

- Preflight proof before any external side effect.
- A small set of release-doc/workflow edits before the version PR.
- Explicit human handoffs for GitHub repository settings and the `npm-publish` environment approval gate.
- Post-publish proof capture that later canary and audit phases can trust.
- Safe failure handling if only part of the release lands.

## Local Findings

### Current Package and Registry State

- `packages/lattice/package.json` and `packages/lattice-cli/package.json` are both currently `1.3.0-rc.0`.
- `pnpm changeset status --verbose` reports the pending release would bump:
  - `@full-self-browsing/lattice` to `1.3.0`
  - `@full-self-browsing/lattice-cli` to `1.3.0`
- Both packages currently exist on npm with only:
  - `0.0.0-bootstrap.0`
  - `1.3.0-rc.0`
- Both package `latest` dist-tags currently point at `1.3.0-rc.0`.
- GitHub currently has release `v1.3.0-rc.0`; no `v1.3.0` release was observed during research.

### Existing Release Workflow

`.github/workflows/release.yml` already has the right high-level shape:

- `version-pr` runs on pushes to `main`, uses `changesets/action`, and has `contents: write` plus `pull-requests: write`.
- `publish` runs only for `refs/tags/v*`, uses `environment: npm-publish`, and has `contents: write` plus `id-token: write`.
- Root permissions are `contents: read`.
- The publish command is `pnpm -r publish --access public --provenance --no-git-checks`.
- No `NODE_AUTH_TOKEN` is present in the publish job.
- Third-party actions are SHA-pinned.

The workflow still has one Phase 28 handoff risk: the repository setting allowing GitHub Actions to create and approve pull requests must be enabled, or the `version-pr` job cannot create/update the Changesets PR.

### Existing CI and Audit Scripts

`.github/workflows/ci.yml` already runs:

- install
- build
- typecheck
- tests
- type tests
- package lint
- tarball leak audit
- scoped import audit
- workflow OIDC/PR-target audit

Useful local scripts:

- `scripts/check-workflow-safety.mjs` verifies no `pull_request_target` trigger and restricts `id-token: write` to the `publish` job in `release.yml`.
- `scripts/check-tarball-leak.mjs` packs both publishable packages and inspects in-tarball `package.json` for stale unscoped `lattice` surfaces.
- `scripts/verify-rename.mjs` scans source imports for stale bare `lattice` imports.
- `scripts/refresh-model-registry.mjs --check` should be run before stable so the baked registry cannot drift silently at the v1.3.0 cut.

### Stale Public Docs

README is stale relative to Phases 35-39:

- It still describes the model-aware SDK track as only Phases 33-34 in some sections.
- It still lists Phase 35-39 work under "coming".
- It has stale test posture counts.
- It still contains historical language saying multi-agent crews are out of scope in at least one section.

Phase 29 should include a docs refresh before the stable version PR. The refresh should be targeted, not a broad rewrite.

### Release Notes Source

`.changeset/v1.3.0-*.md` already contains release-note bodies for Phases 33-39. `changesets/action` with `version: pnpm changeset version` will update package versions and changelogs from those changesets. The planner should preserve Changesets as the package changelog source.

The current `release.yml` uses `softprops/action-gh-release` with `generate_release_notes: true`. GitHub-generated release notes are useful but generic. Phase 29 context says the GitHub Release should be sourced from generated changelog/changesets, so the planner should add a small release-note extraction step before `action-gh-release` and pass it through the action body/body_path input if supported by the pinned version.

## Official Documentation Findings

### npm Trusted Publishing and Provenance

Official npm docs say trusted publishing uses OIDC between npm and CI/CD providers and avoids long-lived npm tokens. npm supports GitHub Actions on GitHub-hosted runners. The trusted publisher entry for GitHub Actions is keyed by organization/user, repository, workflow filename, and optional environment name.

For this repo, the configured tuple should remain:

- GitHub org/user: `fullselfbrowsing`
- repository: `Lattice`
- workflow filename: `release.yml`
- environment: `npm-publish`

npm docs also say trusted publishing automatically generates provenance for GitHub Actions/GitLab CI when publishing public packages from public repos. The current explicit `--provenance` flag is still acceptable and matches npm's GitHub Actions provenance docs.

Sources:

- https://docs.npmjs.com/trusted-publishers/
- https://docs.npmjs.com/generating-provenance-statements/

### npm Provenance Verification

npm docs identify two relevant proof paths:

- npmjs.com package page provenance details should show build environment, workflow run, source commit, build file, and transparency log.
- `npm audit signatures` verifies registry signatures and provenance attestations after installing dependencies.

For this phase, the plan should capture both machine-readable registry proof and a consumer-style verification. The most useful combination is:

- `npm view @full-self-browsing/lattice@1.3.0 --json`
- `npm view @full-self-browsing/lattice-cli@1.3.0 --json`
- `npm view <pkg> dist-tags --json`
- a temp consumer install followed by `npm audit signatures`

Source:

- https://docs.npmjs.com/viewing-package-provenance/

### GitHub Actions PR Creation Setting

GitHub docs confirm repository settings can allow or prevent workflows from creating/approving pull requests, and the setting lives under Settings -> Actions -> General -> Workflow permissions. New personal repositories default to preventing workflows from creating/approving PRs; org repos inherit org settings.

Phase 28 already observed a 403 from this setting. The Phase 29 plan needs an explicit user handoff or CLI/API check before relying on `version-pr`.

Source:

- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository

### Changesets Action

The official `changesets/action` README says the `version` input updates versions, changelogs, and deletes consumed changesets. It also says the action creates a pull request when there are new changesets on the configured base branch; merging that PR is the normal release path.

The current workflow correctly uses `version: pnpm changeset version` with no `publish` input in `version-pr`. Publishing is handled by the separate tag-triggered `publish` job.

Source:

- https://github.com/changesets/action

### GitHub Release Notes

GitHub generated release notes include merged pull requests, contributors, and a link to the full changelog. That is useful but does not by itself guarantee changelog-derived package release notes are visible in the GitHub Release body. Phase 29 should prefer a changelog-derived release body, optionally followed by GitHub-generated notes if the action supports both.

Source:

- https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes

## Planning Implications

### Recommended Plan Split

Use four plans:

1. **Release readiness docs/workflow hardening**
   - Refresh README stable status and v1.3 surface.
   - Add release-note extraction from package changelog to `release.yml`.
   - Run workflow safety checks.

2. **Preflight and version PR handoff**
   - Run full local gates.
   - Verify npm/GitHub pre-state.
   - Confirm GitHub Actions PR creation permission.
   - Trigger/observe Changesets Version Packages PR.

3. **Stable publish execution**
   - Merge the Version Packages PR.
   - Approve `npm-publish` environment gate.
   - Observe tag-triggered publish workflow.
   - Do not perform local npm publish.

4. **Post-publish proof and state closure**
   - Capture npm package JSON proof.
   - Verify dist-tags.
   - Verify GitHub Release URL/body.
   - Pack/install/audit stable packages.
   - Update GSD roadmap/requirements/state/summary for PUB-02..04.

### Blocking User Handoffs

The planner should mark these tasks as non-autonomous:

- Enable or confirm GitHub Actions can create/approve PRs in repository settings.
- Review and merge the Changesets Version Packages PR.
- Approve the `npm-publish` GitHub Environment deployment gate.

### Release Notes Implementation Target

Preferred workflow approach:

- After build/lint and before `action-gh-release`, add a step that extracts the `## [1.3.0]` section from `packages/lattice/CHANGELOG.md` after Changesets versioning has landed on the tag.
- Write it to a temporary markdown file such as `.release-notes-v1.3.0.md`.
- Pass that file to `softprops/action-gh-release` through `body_path`, preserving `tag_name` and `name`.
- Keep `generate_release_notes: true` only if the action supports combining it with body content predictably; otherwise use the changelog body only.

The executor must verify the pinned `softprops/action-gh-release` version supports the chosen input before editing.

### Failure Recovery Tree

The plan should encode this exact decision tree:

- If version PR creation fails with 403: stop, enable GitHub setting, rerun push or workflow.
- If preflight local checks fail: fix before any release PR merge.
- If publish workflow fails before npm accepts either package: diagnose, preserve run URL, rerun after fix.
- If one package publishes and the other does not: stop; do not rerun the same full publish blindly. Create a recovery plan for either targeted OIDC publish of the missing package or bump both to `1.3.1`.
- If packages publish without provenance/attestations: Phase 29 fails; do not mark complete.
- If GitHub Release creation fails after npm publish succeeds: create or repair GitHub Release `v1.3.0` with changelog-derived notes and preserve evidence.

## Validation Architecture

### Automated Gates

Plan verification should require these automated commands before any release side effect:

- `pnpm install --frozen-lockfile`
- `pnpm build`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:types`
- `pnpm -r lint:packages`
- `node scripts/check-tarball-leak.mjs`
- `node scripts/verify-rename.mjs`
- `node scripts/check-workflow-safety.mjs`
- `node scripts/refresh-model-registry.mjs --check`
- `pnpm changeset status --verbose`

Post-publish verification should require:

- `npm view @full-self-browsing/lattice@1.3.0 --json`
- `npm view @full-self-browsing/lattice-cli@1.3.0 --json`
- `npm view @full-self-browsing/lattice dist-tags --json`
- `npm view @full-self-browsing/lattice-cli dist-tags --json`
- `gh release view v1.3.0 --repo fullselfbrowsing/Lattice --json tagName,name,url,body,isLatest,isPrerelease`
- `npm pack @full-self-browsing/lattice@1.3.0 --pack-destination <tmp>`
- `npm pack @full-self-browsing/lattice-cli@1.3.0 --pack-destination <tmp>`
- temp npm consumer install plus `npm audit signatures`

### Manual Gates

- GitHub repository setting for Actions PR creation.
- Version Packages PR review/merge.
- GitHub Environment `npm-publish` approval.
- npm provenance UI spot-check for both packages if command-line attestation shape is ambiguous.

### Sampling Strategy

Because this phase has irreversible external side effects, validation is stage-based rather than after every file edit:

- After docs/workflow edits: run workflow safety and targeted grep checks.
- Before Version Packages PR: run the full local release gate.
- Before environment approval: verify tag and workflow run point at the expected version PR merge commit.
- After publish: capture release dossier evidence in the plan summary.

## Threat Model Inputs for Plans

Plans must include supply-chain threat models. Minimum threats:

- T-29-01: OIDC blast radius widens if `id-token: write` escapes the publish job.
- T-29-02: Long-lived npm token fallback bypasses Trusted Publisher and provenance posture.
- T-29-03: Partial publish leaves only one fixed-package member at `1.3.0`.
- T-29-04: Stable tag or GitHub Release points at a commit that does not contain the generated package versions/changelogs.
- T-29-05: Registry drift changes the model capability snapshot at stable cut.
- T-29-06: GitHub-generated release notes omit package changelog content consumers need.
- T-29-07: Provenance/signature verification is skipped or inferred only from workflow success.

## Open Questions for Planner

None requiring user input. Use the conservative defaults in `29-CONTEXT.md`.
