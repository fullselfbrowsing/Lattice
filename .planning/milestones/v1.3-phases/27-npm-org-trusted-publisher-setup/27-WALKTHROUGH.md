# Phase 27 Walkthrough: npm Org + Trusted Publisher Setup

**Owner:** Lakshman Turlapati (`@parzival1213` on npmjs.com, `@LakshmanTurlapati` on github.com)
**Outcome:** Both publishable packages reachable from a GitHub Actions OIDC publish workflow, with required-reviewer approval gating every release.
**Estimated time:** 25 minutes.

## Status snapshot (as of phase start)

- npm organization `full-self-browsing` claimed by `parzival1213` (organization tier, free for public packages, 0 packages currently).
- npm scope in code is `@full-self-browsing` (locked in commit `66804bc`).
- GitHub repo `github.com/fullselfbrowsing/Lattice` exists, public, MIT license.
- Phase 24-26 work is on branch `gsd/v1.3-prepublish-pipeline`, draft PR #2 open against `main`.
- `.github/workflows/ci.yml` runs on the PR (Phase 25 deliverable).
- `release.yml` does not exist yet; it is Phase 28's deliverable.

## Walkthrough

The steps run in the order shown. Each step is gated on the previous one completing.

### Step 1: Merge the prepublish pipeline into main

The Trusted Publisher trust tuple references `release.yml` on `main`. Phase 28 will land `release.yml`. Both phases need a clean `main` to rebase against.

1. Wait for CI to go green on PR #2 (Phase 25's ci.yml validates Phase 24/26 deliverables).
2. Mark the PR ready for review, self-approve, squash and merge.
3. Pull `main` locally.

### Step 2: Create the `npm-publish` GitHub Environment

The Trusted Publisher trust tuple includes `environment: npm-publish`. The environment must exist in `github.com/fullselfbrowsing/Lattice` before any OIDC publish attempt.

1. Visit `https://github.com/fullselfbrowsing/Lattice/settings/environments`.
2. Click `New environment`. Name it exactly `npm-publish` (lowercase, hyphenated).
3. Under `Deployment protection rules`, enable `Required reviewers` and add `LakshmanTurlapati` as the sole required reviewer.
4. Leave `Wait timer` at 0.
5. Leave `Deployment branches and tags` at the default (`No restriction`). The publish workflow is gated by tag push in Phase 28; an environment-level branch restriction here would double-gate without adding security.
6. Save.

Visual check: `https://github.com/fullselfbrowsing/Lattice/settings/environments/npm-publish` loads and shows `LakshmanTurlapati` under required reviewers.

### Step 3: Bootstrap publish each package once with a classic token

npmjs.com's Trusted Publisher form lives under `/package/<name>/access`. That page is reachable only after the package exists on the registry. The first publish of each package therefore uses a one-shot classic npm token. After both packages exist on the registry, every subsequent publish uses OIDC.

**3a. Create a granular access token for the first publish.**

1. Visit `https://www.npmjs.com/settings/parzival1213/tokens`.
2. Click `Generate New Token` and pick `Granular Access Token`.
3. Name the token `bootstrap-2026-06-06` (or any name that includes the date so it is easy to identify later).
4. Set Expiration to 7 days.
5. Under Permissions, pick `Read and write`.
6. Under Packages and scopes, select `Only select packages and scopes` and add:
   - `@full-self-browsing/lattice`
   - `@full-self-browsing/lattice-cli`
7. Generate the token. Copy it. You will paste it once into a shell session and then revoke it after this step.

**3b. Publish `@full-self-browsing/lattice@0.0.0-bootstrap.0` locally.**

```sh
cd packages/lattice
NPM_TOKEN_TMP="paste-token-here"
echo "//registry.npmjs.org/:_authToken=$NPM_TOKEN_TMP" > ~/.npmrc.bootstrap
NPM_CONFIG_USERCONFIG=~/.npmrc.bootstrap npm publish --tag bootstrap --provenance=false
```

Verify with `npm view @full-self-browsing/lattice version` — it should print `0.0.0-bootstrap.0`. The `--tag bootstrap` ensures the published version does not become the `latest` dist-tag, so Phase 28's `1.3.0-rc.0` publish still publishes to a clean `latest`.

**3c. Publish `@full-self-browsing/lattice-cli@0.0.0-bootstrap.0` locally.**

```sh
cd ../lattice-cli
NPM_CONFIG_USERCONFIG=~/.npmrc.bootstrap npm publish --tag bootstrap --provenance=false
```

Verify with `npm view @full-self-browsing/lattice-cli version` — should print `0.0.0-bootstrap.0`.

**3d. Revoke the classic token immediately.**

1. Visit `https://www.npmjs.com/settings/parzival1213/tokens`.
2. Click the trash icon next to `bootstrap-2026-06-06`. Confirm deletion.
3. Delete the temporary npmrc file: `rm ~/.npmrc.bootstrap`.

The classic token's lifetime should be under 15 minutes from creation to deletion. Even if it leaks, the window is small and the token is scoped to two packages.

### Step 4: Configure the npm Trusted Publisher trust tuple

Both packages now exist on the registry. Their admin pages are reachable.

**4a. Configure `@full-self-browsing/lattice`.**

1. Visit `https://www.npmjs.com/package/@full-self-browsing/lattice/access`.
2. Scroll to the `Trusted Publisher` section.
3. Under `Select your publisher`, click `GitHub Actions`.
4. Fill in:
   - Repository owner: `fullselfbrowsing`
   - Repository name: `Lattice`
   - Workflow filename: `release.yml`
   - Environment name: `npm-publish`
5. Save.

Visual check: the Trusted Publisher section refreshes and lists exactly:
`Publisher: GitHub Actions  ·  Repository: fullselfbrowsing/Lattice  ·  Workflow: release.yml  ·  Environment: npm-publish  ·  Action: publish`.

**4b. Configure `@full-self-browsing/lattice-cli`.**

Repeat 4a with the URL `https://www.npmjs.com/package/@full-self-browsing/lattice-cli/access`. Same values for owner, repo, workflow filename, environment.

### Step 5: Verify

Run the FSB recon from your local checkout:

```sh
node .planning/phases/27-npm-org-trusted-publisher-setup/27-RECON.mjs
```

The script visits npmjs.com and github.com via the FSB MCP and asserts:
1. `npm-publish` GitHub Environment exists with `LakshmanTurlapati` as a required reviewer.
2. `@full-self-browsing/lattice` Trusted Publisher entry matches the tuple in Step 4a.
3. `@full-self-browsing/lattice-cli` Trusted Publisher entry matches the tuple in Step 4b.

A green run prints `OK 3/3 checks passed`. A red run prints which check failed and a link to the page that needs attention.

## Rollback

If anything goes wrong before Phase 28:

- Delete the Trusted Publisher entries from each package's access page.
- Delete the `npm-publish` GitHub Environment.
- Unpublish the bootstrap versions within the 72-hour window: `npm unpublish @full-self-browsing/lattice@0.0.0-bootstrap.0` and the same for `lattice-cli`. After 72 hours, the version stays in the registry as a tombstone but can no longer be reinstalled.
- The 7-day classic token (if not yet revoked) expires automatically.

## Notes

- The bootstrap version `0.0.0-bootstrap.0` is intentional. It does not become the `latest` dist-tag because `--tag bootstrap` is used. Consumers running `npm install @full-self-browsing/lattice` get the eventual `1.3.0` after Phase 28, not the bootstrap version.
- Required reviewer on the GitHub Environment means every release.yml publish job pauses for human approval. Phase 28 publishes `1.3.0-rc.0` first; once OIDC plumbing is verified end-to-end, the required reviewer remains for `1.3.0` GA but can be relaxed for patch releases if desired.
- The Trusted Publisher trust tuple references the GitHub org name `fullselfbrowsing` (no hyphen). The npm scope `@full-self-browsing` (hyphenated) is independent. Both are intentional.
- Phase 28's release.yml MUST declare `environment: npm-publish` on its `publish:` job. The workflow-safety audit script (`scripts/check-workflow-safety.mjs`) will also verify that `id-token: write` appears only inside a job named `publish` in `release.yml`.

## Artifacts referenced

- `.planning/phases/27-npm-org-trusted-publisher-setup/27-CONTEXT.md` (locked decisions)
- `.planning/phases/27-npm-org-trusted-publisher-setup/27-RECON.mjs` (verification script)
- `https://docs.npmjs.com/trusted-publishers` (npm official docs)
- `SECURITY.md` (project security posture)
