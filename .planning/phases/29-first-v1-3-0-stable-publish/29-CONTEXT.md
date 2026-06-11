# Phase 29: First v1.3.0 Stable Publish - Context

**Gathered:** 2026-06-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 29 promotes the completed v1.3 surface from `1.3.0-rc.0` to the first stable public release: `@full-self-browsing/lattice@1.3.0` and `@full-self-browsing/lattice-cli@1.3.0` live on npm with provenance, and GitHub Release `v1.3.0` exists with release notes external consumers can pin.

The phase includes the final release-readiness checks, any release-doc/workflow adjustments needed for stable, the Changesets version-PR flow, the OIDC publish approval, and post-publish proof capture.

The phase does not build the canary repo. Phases 30 and 31 consume the stable npm packages after Phase 29; Phase 32 handles cross-repo dispatch and the v1.3 milestone audit.

</domain>

<decisions>
## Implementation Decisions

### Sequencing and Go/No-Go

- **D-01:** Resolve the roadmap sequencing conflict in favor of the detailed phase dependencies: Phase 29 publishes stable first, then Phases 30 and 31 validate stable from the public registry. Phase 32 remains after Phase 29, Phase 31, and Phase 39.
- **D-02:** Stable publish may proceed only after Phase 33-39 outputs are present in the release branch and the local release gates pass. Phase 30/31 are not pre-stable blockers because their stated success criteria install `@full-self-browsing/*@1.3.0` from npm.
- **D-03:** The `npm-publish` GitHub Environment approval remains a required human gate. The planner must not bypass it, relax it, or introduce an `NPM_TOKEN` fallback.
- **D-04:** Treat the Phase 28 handoff as mandatory: verify GitHub Actions is allowed to create and approve pull requests before relying on the `version-pr` job. If that repo setting is still disabled, the first Phase 29 task is a user handoff to enable it, then rerun the push-to-main `version-pr` path.

### Pre-Publish Release Gates

- **D-05:** Before opening/merging the stable version PR, run the full local release gate from the current release branch: `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm test:types`, `pnpm -r lint:packages`, `pnpm changeset status --verbose`, and `node scripts/refresh-model-registry.mjs --check`.
- **D-06:** `pnpm changeset status --verbose` is the source of truth for version math. It currently reports both packages will release as `1.3.0`; planning should preserve that path.
- **D-07:** Confirm registry state immediately before publish: npm should expose only `0.0.0-bootstrap.0` and `1.3.0-rc.0` for both packages, with no existing `1.3.0`. If `1.3.0` appears before this phase publishes it, stop and reclassify the phase as verification/recovery.
- **D-08:** Confirm the release workflow still has the Phase 28 security shape: no workflow-level `id-token: write`, `id-token: write` only on the `publish` job, `environment: npm-publish`, no `NODE_AUTH_TOKEN`, and SHA-pinned third-party actions.

### Release Notes and Public Docs

- **D-09:** Do a small stable-release docs refresh before the version PR if public docs are stale. At minimum, update README status/test counts and the v1.3 sections so they reflect Phases 35-39 and do not still say multi-agent crews are out of scope.
- **D-10:** Use the existing changesets as the canonical package changelog source. Do not hand-roll package `CHANGELOG.md` release sections if `changeset version` will generate them.
- **D-11:** The GitHub Release `v1.3.0` should use release notes sourced from the generated changelog/changesets, not only GitHub's generic commit-diff notes. If the existing `release.yml` cannot do this, Phase 29 should adjust the workflow before stable.
- **D-12:** Keep the README provenance section aligned with the stable outcome: after publish, examples should point at `@full-self-browsing/lattice@1.3.0` and explain how to inspect `.dist.attestations.provenance`.

### Publish Execution Path

- **D-13:** Use the normal Changesets flow: push/merge release-readiness changes to `main`, let `version-pr` open/update the Version Packages PR, merge that PR, and let the resulting `v1.3.0` tag trigger the `publish` job.
- **D-14:** Do not manually create a stable tag unless the Changesets flow fails in a way that is explicitly diagnosed and documented. Manual tag creation is a recovery action, not the default.
- **D-15:** The publish command remains `pnpm -r publish --access public --provenance --no-git-checks` inside GitHub Actions with OIDC. Local `npm publish` is out of scope for stable.

### Failure Handling

- **D-16:** No force-republish, no unpublish/retry, and no classic npm token fallback. If the publish job fails, stop and inspect which external side effects happened before any rerun.
- **D-17:** If no npm `1.3.0` package was created, it is acceptable to rerun the failed workflow after diagnosing the cause and preserving the run ID/log link.
- **D-18:** If exactly one package publishes as `1.3.0` and the other does not, stop and create a recovery plan. Preferred recovery is an OIDC-gated targeted publish of the missing package only, with proof that the already-published package is not overwritten. If that cannot be made safe, bump both packages to `1.3.1` and document the partial `1.3.0` state.
- **D-19:** If Sigstore/Rekor/provenance attachment is unavailable, do not silently publish without provenance. A stable package without provenance fails Phase 29.

### Proof Capture

- **D-20:** Phase 29 is complete only when the summary records concrete proof for both packages: `npm view <pkg>@1.3.0 --json` showing version, shasum, signatures, and attestations; `dist-tags.latest` pointing at `1.3.0`; and GitHub Release `v1.3.0` with its URL.
- **D-21:** Capture the GitHub Actions run ID for the successful publish job and note that the environment approval gate was exercised.
- **D-22:** Include a tarball sanity check after publish: inspect the registry tarballs or `npm pack <pkg>@1.3.0` output for package names, exports, types, and CLI bin shape.

### the agent's Discretion

The planner may decide exact task boundaries, whether to split docs refresh from workflow adjustment, and the exact verification command ordering. Keep tasks small enough that an irreversible publish does not happen before all local and external preflight checks are green.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Definition and Release Requirements

- `.planning/ROADMAP.md` - Phase 29 goal, success criteria, phase ordering notes, and release risk notes.
- `.planning/REQUIREMENTS.md` - `PUB-02`, `PUB-03`, and `PUB-04`; release/canary traceability rows.
- `.planning/STATE.md` - Current stopped-at marker, v1.3 progress, pending release concerns, and current registry state.
- `.planning/PROJECT.md` - v1.3 distribution, OIDC/provenance decisions, and stable-publish milestone posture.

### Prior Release Phases

- `.planning/phases/24-atomic-scope-rename-license-hygiene/24-CONTEXT.md` - scoped package names, `workspace:^`, publish metadata, and tarball inspection gates.
- `.planning/phases/26-release-hygiene-docs-receipt-downgrade-defense/26-CONTEXT.md` - README/provenance docs and security posture.
- `.planning/phases/27-npm-org-trusted-publisher-setup/27-CONTEXT.md` - npm org, trusted publisher tuple, `npm-publish` environment, and no-token release path.
- `.planning/phases/28-release-workflow-rc0-oidc-smoke/28-SUMMARY.md` - rc.0 proof, release workflow shape, and required GitHub Actions PR-permission handoff.

### Completed v1.3 Surface Included in Stable

- `.planning/phases/33-model-capability-registry-200-via-openrouter-feed/33-CONTEXT.md` - registry surface and OpenRouter snapshot constraints.
- `.planning/phases/34-adapter-quirk-flags-capability-negotiation-api/34-CONTEXT.md` - adapter quirk and negotiation public surface.
- `.planning/phases/35-prompt-scaffolding-helpers/35-CONTEXT.md` - prompt scaffold public surface and byte-stability constraints.
- `.planning/phases/36-output-sanitizer-hook-opt-in/36-CONTEXT.md` - sanitizer public surface and opt-in adapter behavior.
- `.planning/phases/37-tool-call-validation-layer-opt-in/37-CONTEXT.md` - tool-call validation public surface and opt-in behavior.
- `.planning/phases/38-receipt-v1-2-schema-modelclass-tag/38-CONTEXT.md` - receipt v1.2 `modelClass` and downgrade defense compatibility.
- `.planning/phases/39-multi-agent-delegation-surface-full-row-60-close-row-83-upda/39-CONTEXT.md` - opt-in multi-agent crew surface, rate-limit group, and receipt chaining.
- `.planning/phases/39-multi-agent-delegation-surface-full-row-60-close-row-83-upda/39-08-SUMMARY.md` - final Phase 39 verification gate and package type-surface closure.

### Release Code and Docs

- `.github/workflows/release.yml` - Changesets version PR job and OIDC publish job.
- `.github/workflows/ci.yml` - PR-time gate that must be green before stable.
- `.github/workflows/registry-drift.yml` - model registry drift guard; Phase 29 should run the local `--check` equivalent.
- `.changeset/config.json` - fixed package release pair and Changesets configuration.
- `.changeset/v1.3.0-*.md` - pending release-note inputs for stable.
- `packages/lattice/package.json` - runtime package metadata, version, exports, files, and release scripts.
- `packages/lattice-cli/package.json` - CLI package metadata, version, `bin`, workspace dependency, and release scripts.
- `packages/lattice/CHANGELOG.md` and `packages/lattice-cli/CHANGELOG.md` - generated stable release sections after `changeset version`.
- `README.md` - public release status, install instructions, provenance verification, test posture, and v1.3 surface description.
- `SECURITY.md` - supply-chain policy, no-token publish posture, and provenance verification language.
- `scripts/check-workflow-safety.mjs` - workflow safety audit for `id-token: write`.
- `scripts/verify-rename.mjs` and `scripts/check-tarball-leak.mjs` - scoped-name and tarball leak gates.
- `scripts/refresh-model-registry.mjs` - registry drift check required before stable.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `.github/workflows/release.yml` already has the split `version-pr`/`publish` job shape, SHA-pinned third-party actions, `environment: npm-publish`, and OIDC provenance publish command.
- `.changeset/config.json` fixes `@full-self-browsing/lattice` and `@full-self-browsing/lattice-cli` as a release pair.
- Pending `.changeset/v1.3.0-*.md` files already cover Phases 33-39. `pnpm changeset status --verbose` currently reports both packages will bump to `1.3.0`.
- Package manifests are still at `1.3.0-rc.0`, which is the expected pre-version-PR state.
- `scripts/check-workflow-safety.mjs`, `scripts/verify-rename.mjs`, `scripts/check-tarball-leak.mjs`, and `scripts/refresh-model-registry.mjs` are existing release-readiness gates.

### Established Patterns

- Release work is committed through GSD docs and conventional commits, with Changesets driving package versions.
- Public type-surface additions are guarded by `tsd`, `publint`, and `@arethetypeswrong/cli`.
- External release actions are manually gated through the GitHub Environment; planning must account for user handoffs instead of pretending npm/GitHub UI state is in-repo.
- The project prefers explicit, inspectable proof in summaries for external events.

### Integration Points

- `version-pr` requires GitHub repo setting "Allow GitHub Actions to create and approve pull requests"; Phase 28 identified this as the main Phase 29 prerequisite.
- Stable publish consumes `main` plus the Changesets-generated version PR. It should not publish from the current workspace branch directly.
- Post-publish verification connects npm registry metadata, GitHub release metadata, and workflow run logs.
- Phases 30 and 31 use the public registry package versions produced by this phase.

</code_context>

<specifics>
## Specific Ideas

- The current live registry state checked on 2026-06-11 shows both packages have versions `0.0.0-bootstrap.0` and `1.3.0-rc.0`, with `latest` currently on `1.3.0-rc.0`.
- GitHub currently shows release `v1.3.0-rc.0`; no `v1.3.0` release was observed during discussion.
- README is visibly stale for stable: it still describes the model-aware track as only Phases 33-34 and contains older test counts. Phase 29 should refresh that before stable.
- The existing release workflow comment says GitHub Release notes default to generated diff and may move to changesets-extracted notes after rc.0. Phase 29 should make that move if feasible.

</specifics>

<deferred>
## Deferred Ideas

- Build the public `fullselfbrowsing/lattice-canary` repository and Layer 1 fake-provider suite - Phase 30.
- Add real-provider nightly/manual canary integration with cost ceilings - Phase 31.
- Add repository_dispatch from Lattice to canary and complete the v1.3 milestone audit - Phase 32.

</deferred>

---

*Phase: 29-first-v1-3-0-stable-publish*
*Context gathered: 2026-06-11*
