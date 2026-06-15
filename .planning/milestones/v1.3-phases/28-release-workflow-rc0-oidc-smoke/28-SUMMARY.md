# Phase 28 - Release Workflow + rc.0 OIDC Smoke - SUMMARY

Status: COMPLETE (2026-06-08)

## What landed

Two-job `.github/workflows/release.yml` (REL-01..REL-06, PUB-01) and the first
end-to-end OIDC publish of both packages. The first publish IS the smoke test.

## Outputs

- `@full-self-browsing/lattice@1.3.0-rc.0` on npm, Sigstore-signed, attestations
  present (shasum aff54b5ccf82789c031728dbdd5a795ae70148f0)
- `@full-self-browsing/lattice-cli@1.3.0-rc.0` on npm, Sigstore-signed,
  attestations present (shasum 79152beb28f3237e21f3e6e0b2e7908ce6000890)
- GitHub Release object `v1.3.0-rc.0` auto-created on `fullselfbrowsing/Lattice`
- `.github/workflows/release.yml` with:
  - `version-pr` job: `contents:write + pull-requests:write`, no id-token
  - `publish` job: `id-token:write` only, `environment: npm-publish` gated
- `.changeset/config.json` with lattice + lattice-cli as a fixed release pair
- `scripts/check-workflow-safety.mjs` job-key resolver now skips structural
  YAML keys (permissions/env/with/etc.) so job-level `permissions:` blocks
  no longer trip false positives

## Verification (live)

```
$ curl -s https://registry.npmjs.org/@full-self-browsing/lattice/1.3.0-rc.0 \
  | jq '.dist | {shasum, signatures, attestations: (.attestations != null)}'
{
  "shasum": "aff54b5ccf82789c031728dbdd5a795ae70148f0",
  "signatures": [...],
  "attestations": true
}
```

Same for `@full-self-browsing/lattice-cli@1.3.0-rc.0`.

GitHub Actions run 27108308762:
- version-pr: skipped (tag push, not main push - expected)
- publish: success (12 steps, OIDC token minted, pnpm publish --provenance ran
  end-to-end, GitHub Release object created)

Zero NODE_AUTH_TOKEN exported anywhere in the workflow. Trust tuple from
Phase 27 did its job.

## Known follow-up (Phase 29 prerequisite)

The first push-to-main release run failed because GitHub Actions cannot create
PRs by default. To unblock the changesets/action Version Packages PR flow for
Phase 29 (the stable v1.3.0 release), enable:

  Repo Settings → Actions → General → Workflow permissions:
  [x] Allow GitHub Actions to create and approve pull requests

Without this, the version-pr job will keep failing with HttpError 403 on PR
creation. It does NOT block the publish job (which is what shipped rc.0), so
this is a Phase 29 prerequisite, not a Phase 28 blocker.

## Hand-off to Phase 29

Phase 29 promotes rc.0 → 1.3.0 stable. The mechanism is identical: a new
changeset, push to main triggers version-pr, merge the resulting PR, tag pushed
by changesets/action, publish job runs in environment npm-publish.
