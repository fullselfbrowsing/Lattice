# Phase 29-03 Summary: Stable Publish Gate

## Outcome

Plan 29-03 reached the irreversible publish side effect and safely classified the follow-up failure.

- Version Packages PR: https://github.com/fullselfbrowsing/Lattice/pull/8
- PR title: `chore(release): Version Packages`
- Merge method: GitHub merge commit
- Merge commit: `069c9aea4b5875393c96ad7e6ffeec4afbe70f34`
- Checks before merge: PR #8 `ci` passed on attempt 2
- Stable tag: `v1.3.0`
- Tag target: `069c9aea4b5875393c96ad7e6ffeec4afbe70f34`
- Release workflow run: https://github.com/fullselfbrowsing/Lattice/actions/runs/27376721154
- Environment gate: `npm-publish`
- Deployment approval: approved by `LakshmanTurlapati` through GitHub Actions pending deployments API

## Publish Classification

The tag-triggered publish run failed after the npm publish step:

- `Publish to npm with provenance`: success
- `Extract changelog release notes`: failed
- `Create GitHub Release`: skipped

Failure cause:

```text
Release notes for version 1.3.0 were not found in packages/lattice/CHANGELOG.md
```

Root cause: Changesets generated the stable changelog heading as `## 1.3.0`; `scripts/extract-release-notes.mjs` only accepted bracketed headings like `## [1.3.0]`.

Npm side-effect classification:

- `@full-self-browsing/lattice@1.3.0`: published
- `@full-self-browsing/lattice-cli@1.3.0`: published
- Both registry entries expose signatures and SLSA provenance attestations
- GitHub Release was initially missing and was repaired in Plan 29-04

Important recovery decision: do not rerun the publish workflow. The irreversible npm publish already succeeded for both packages.

## Verification Commands

Commands used during Plan 29-03:

```bash
gh pr view 8 --repo fullselfbrowsing/Lattice --json state,mergedAt,mergeCommit,url,title
git fetch --tags origin
git rev-list -n 1 v1.3.0
gh api repos/fullselfbrowsing/Lattice/actions/runs/27376721154/pending_deployments
gh api -X POST repos/fullselfbrowsing/Lattice/actions/runs/27376721154/pending_deployments \
  -f state=approved \
  -f comment='Approve v1.3.0 npm publish' \
  -F 'environment_ids[]=16324902833'
gh run watch 27376721154 --repo fullselfbrowsing/Lattice --interval 10 --exit-status
npm view @full-self-browsing/lattice versions --json
npm view @full-self-browsing/lattice-cli versions --json
npm view @full-self-browsing/lattice@1.3.0 dist --json
npm view @full-self-browsing/lattice-cli@1.3.0 dist --json
```

