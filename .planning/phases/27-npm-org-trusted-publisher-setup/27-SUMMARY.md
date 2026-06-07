# Phase 27 - npm Trusted Publisher Bootstrap - SUMMARY

Status: COMPLETE (2026-06-07)

## What landed

Manual bootstrap of npm Trusted Publisher trust tuples for the lattice runtime
and CLI packages, enabling Phase 28's OIDC-authenticated release workflow to
publish without long-lived secrets.

## Outputs

- `@full-self-browsing/lattice@0.0.0-bootstrap.0` published to npm (placeholder)
- `@full-self-browsing/lattice-cli@0.0.0-bootstrap.0` published to npm (placeholder)
- Trust tuple `(fullselfbrowsing/Lattice, release.yml, npm-publish)` registered
  against both package access pages
- GitHub Environment `npm-publish` configured in `fullselfbrowsing/Lattice` with
  `LakshmanTurlapati` as required reviewer
- All bootstrap tokens revoked
- npm account 2FA enabled (security key, auth-and-writes mode)

## Verification

`node 27-RECON.mjs` reports 3/3 checks pass:
- GitHub Environment `npm-publish` has required reviewer
- `@full-self-browsing/lattice` published with `bootstrap` dist-tag
- `@full-self-browsing/lattice-cli` published with `bootstrap` dist-tag

Trust tuple shape verified visually on each package access page per
27-WALKTHROUGH.md Step 4.

## Hand-off to Phase 28

Phase 28 lands `.github/workflows/release.yml`. The workflow runs in environment
`npm-publish` and authenticates to npm via OIDC. Phase 28's first publish bumps
both package versions to `1.3.0-rc.0` (the milestone goal smoke test).

The `bootstrap` dist-tag on both packages can stay; the `latest` tag will track
the rc release once Phase 28 ships.
