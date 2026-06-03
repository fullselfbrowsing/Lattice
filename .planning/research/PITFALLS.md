# Pitfalls Research — v1.3 Public Release + Canary Validation

**Domain:** First public npm release of a TypeScript-first, ESM-only, strict-TS pnpm monorepo that ships cryptographic primitives, plus an external canary consumer with real-provider nightly integration
**Researched:** 2026-06-03
**Confidence:** HIGH for OIDC / provenance / changesets / canary patterns (multiple official + incident sources). MEDIUM for crypto-shipping pitfalls (extrapolated from documented Ed25519 misuse lists and Radicle replay disclosure; no direct Lattice precedent yet).

---

## Reading Guide

Pitfalls are grouped by the eight v1.3 work-streams from the milestone question, then a consolidated "looks safe but isn't" checklist + phase-mapping table at the end.

| Code | Stream |
|------|--------|
| RENAME | Scope rename `lattice` -> `@fullselfbrowsing/lattice` |
| OIDC | OIDC Trusted Publisher first-time setup |
| PROV | npm provenance attestations |
| CHGSET | Tag-driven changesets release workflow |
| CANARY | External public canary consumer repo |
| REAL | Real-provider nightly tests |
| COST | Cost ceiling guards via Lattice's own CostTracker |
| CRYPTO | Shipping Ed25519 / DSSE / JCS primitives publicly |

Each pitfall lists: failure mode, root cause, prevention, warning sign, phase mapping.

---

## Critical Pitfalls

### RENAME-1: workspace:* dep in `lattice-cli/package.json` not updated to the new scoped name

**What goes wrong:**
`packages/lattice-cli/package.json` currently declares `"lattice": "workspace:*"`. After the scope rename, only the *consumer-facing name* in `packages/lattice/package.json` changes to `@fullselfbrowsing/lattice`. The CLI's declaration still says `"lattice"`. pnpm cannot resolve `lattice` from the workspace any more (the workspace no longer publishes a package called `lattice`), so the CLI either (a) links to a phantom registry copy of unscoped `lattice` (if anyone ever publishes that name), or (b) fails to install with `ERR_PNPM_NO_MATCHING_VERSION`. On publish, the dep rewrite from `workspace:*` to a concrete version produces `"lattice": "1.3.0"` in the tarball — which means external consumers `npm install`ing `@fullselfbrowsing/lattice-cli` pull a completely different (or non-existent) package called `lattice` from the registry.

**Why it happens:**
The rename is a search-replace on the `name` field, but the *dependency* field of the sibling package is a separate identifier that must change in lockstep. Workspace:* rewriting at publish time silently propagates the stale name into the published tarball — there is no error, just a wrong manifest. Reference: pnpm rewrites `workspace:` deps to the corresponding workspace version at publish time, so the rewrite happens on a stale name with no warning ([pnpm Workspaces docs](https://pnpm.io/workspaces)).

**Warning sign (pre-publish):**
- `pnpm pack` the CLI tarball and run `tar -xOf <tarball> package/package.json | jq .dependencies` — any unscoped name in the deps map after rename is a smoking gun.
- `attw --pack` from a clean directory (not the workspace) — resolution failures for the dep surface here too.

**Prevention:**
- Phase plan must include an *atomic* rename step: rename both packages' `name`, the inter-package `dependencies` block, the `tsd.compilerOptions.paths` map, the root `pnpm-workspace.yaml` if it pins, and every `examples/` import in the same commit. Add a `scripts/verify-rename.mjs` gate that greps for `"lattice"` (un-scoped, exact-token) anywhere outside (a) the CLI bin name in `bin: { lattice: ... }`, and (b) historical CHANGELOG entries.
- Land the rename behind one PR, with a CI job that runs `pnpm pack --pack-destination /tmp/pack && tar -xOf /tmp/pack/*.tgz package/package.json | grep -q '"@fullselfbrowsing/lattice"'` for both tarballs.

**Phase to address:** v1.3 Phase 23 (Scope rename + manifest hygiene) — first phase, before any CI work.

---

### RENAME-2: CLI bin name `lattice` collides with the conceptual package name and confuses everyone

**What goes wrong:**
The user-facing binary stays `lattice` (per milestone constraint). The package name is `@fullselfbrowsing/lattice-cli`. README copy that says "install `lattice`" is now ambiguous (does the user `npm install -g lattice`? `npm install -g @fullselfbrowsing/lattice-cli`?). Worse, an unscoped `lattice` package on npm may exist or be squatted *after* v1.3 publishes — and any consumer following the old docs `npm install -g lattice` could install an attacker's package.

**Why it happens:**
Bin name and package name are independent. CLI ecosystem convention is "they match," and humans reading docs assume they do. Lattice intentionally keeps the *bin* name short while scoping the *package* — a sensible choice that creates a documentation trap.

**Warning sign (pre-publish):**
- Recon: `npm view lattice` — if the name is taken by someone else, every "install lattice" instruction in the docs is now a supply-chain liability. (Per PROJECT.md, the unscoped `lattice` name is contested — this is already a confirmed risk.)
- `grep -rn "npm install.*lattice" --include="*.md"` returning any line without `@fullselfbrowsing/` prefix.

**Prevention:**
- Documentation invariant: every install instruction MUST use `@fullselfbrowsing/lattice-cli` (the package) even though the bin is `lattice`. Add a markdownlint or grep-based CI rule.
- Consider claiming the unscoped `lattice` name *as a stub* (publish a tiny 1.0.0 that does `console.error('This package moved to @fullselfbrowsing/lattice-cli'); process.exit(1)`) only if recon shows it is available. If contested, drop the idea — don't fight a name fight on launch day.
- README install example: `npm install -g @fullselfbrowsing/lattice-cli && lattice --version` — show that the *bin* is what runs, the *package* is what installs.

**Phase to address:** v1.3 Phase 23 (rename) for the manifest, v1.3 Phase 30 (README + CONTRIBUTING + SECURITY content) for docs.

---

### RENAME-3: `tsd.compilerOptions.paths` still maps `lattice` -> `./dist/index.d.ts`, type tests pass against stale name

**What goes wrong:**
`packages/lattice/package.json` has `tsd.compilerOptions.paths: { "lattice": ["./dist/index.d.ts"] }`. Type tests under `test-d/` (or wherever tsd reads) `import type {...} from 'lattice'`. After rename, the runtime package is `@fullselfbrowsing/lattice`, but tsd is told to resolve `lattice` to the local dts. So tsd *passes* against `import 'lattice'` — but the published package no longer exports under that name. Worse: a consumer who runs `attw --pack` will see the export-condition tree as correct, and the only thing failing is *integration* by name.

**Why it happens:**
`tsd.paths` is a TS resolver alias, not a name binding. It's easy to forget that the alias and the published name must move together because tsd quietly succeeds either way.

**Warning sign (pre-publish):**
- Type test file imports that still say `from 'lattice'` after the rename PR.
- `grep -rn "from 'lattice'" packages/lattice packages/lattice-cli` returning anything other than CHANGELOG history.

**Prevention:**
- Rename PR must update `tsd.compilerOptions.paths` -> `{ "@fullselfbrowsing/lattice": ["./dist/index.d.ts"] }` AND every `from 'lattice'` in test-d, examples, and any internal docs.
- Add `scripts/verify-rename.mjs` (mentioned in RENAME-1) to fail CI on any un-scoped `'lattice'` import string.

**Phase to address:** v1.3 Phase 23 (rename) — included in atomic rename gate.

---

### RENAME-4: `examples/work-inbox` and `examples/agent-loop` keep `import { ai } from 'lattice'`

**What goes wrong:**
Examples are the highest-traffic documentation surface. If they `import 'lattice'` instead of `@fullselfbrowsing/lattice`, every copy-paste reader writes broken code. Worse, in the workspace these examples resolve via the workspace symlink, so `node examples/work-inbox/index.mjs` keeps working locally — the bug is invisible until a user tries it from a clean checkout against the published tarball. This is the *exact* canary-consumer scenario this milestone exists to catch, but examples need to be fixed before the canary is built.

**Why it happens:**
pnpm workspaces silently symlink workspace packages so internal imports keep resolving even when the published name diverges. Renaming the package doesn't rename the symlink target (pnpm has known issues with symlink updates on rename; see [pnpm issue #10081](https://github.com/pnpm/pnpm/issues/10081)).

**Warning sign (pre-publish):**
- Same grep as RENAME-3, scoped to `examples/`.
- Run `node examples/work-inbox/index.mjs` after `rm -rf node_modules && pnpm install` — if it still works against an un-renamed import string, pnpm's workspace alias is masking the problem.

**Prevention:**
- Atomic rename PR updates every example import.
- Add a "publish dry-run" job: `pnpm pack` both packages into `/tmp/pack`, then in a *separate* sibling directory run `npm init -y && npm install /tmp/pack/*.tgz && node -e "import('@fullselfbrowsing/lattice').then(m => console.log(Object.keys(m)))"`. If this fails, the published tarball is wrong regardless of what the workspace says.

**Phase to address:** v1.3 Phase 23 (rename) atomic step.

---

### RENAME-5: CHANGELOG.md history pre-rename is unreachable to readers searching for `@fullselfbrowsing/lattice`

**What goes wrong:**
Changesets writes `CHANGELOG.md` per package, keyed by the *current* package name. If v1.3.0 is the first changeset entry, the v1.0.0 / v1.1.0 / v1.2.0 history (which exists in commits and tags but not in changesets) is lost to anyone browsing the published package page. Readers landing on the npm page see "1.3.0 — initial public release" and assume Lattice is brand new — defeating the credibility the v1.0-v1.2 work bought.

**Why it happens:**
Lattice has shipped three internal milestones without changesets generating user-facing CHANGELOG entries (changesets was installed but never executed on a public-facing publish). The first changeset *creates* the CHANGELOG file; nothing back-fills history.

**Warning sign (pre-publish):**
- `ls packages/lattice/CHANGELOG.md` — if empty / nonexistent before v1.3 changeset, the published package's "Versions" tab will show only 1.3.0.

**Prevention:**
- Before the first changeset, hand-author `packages/lattice/CHANGELOG.md` and `packages/lattice-cli/CHANGELOG.md` with the v1.0/v1.1/v1.2 history (summarized from PROJECT.md "Shipped Milestones"), under the *new* package name. Mark these entries as "pre-public" so readers understand the version line.
- Add a header note: "Versions prior to 1.3.0 were not published to npm; this section reflects internal release history."
- Changesets will append v1.3.0 on top; the file remains continuous from a reader's perspective.

**Phase to address:** v1.3 Phase 30 (release-hygiene docs).

---

### OIDC-1: workflow-level `permissions: id-token: write` grants OIDC mint to every job (TanStack blast radius)

**What goes wrong:**
A workflow that declares `permissions: id-token: write` at the top scope lets *any* job in that workflow (including third-party actions, restored caches, or fork-PR-triggered jobs in the `pull_request_target` pattern) mint an OIDC token and exchange it for an npm publish session. The TanStack postmortem (2026-05-11) documents exactly this: attackers achieved publish without ever stealing an npm token, by hijacking the runner mid-workflow and using the legitimate OIDC identity. 42 packages, 84 malicious versions, 12.7M weekly downloads of one affected package.

**Why it happens:**
Workflow-level permissions are convenient. Most starter templates show them at the top. The blast radius — every job gets the keys — is invisible until a malicious step runs in any job. Combined with `pull_request_target` "Pwn Request" pattern or GHA cache poisoning across fork boundaries, the OIDC token becomes a publish credential for the attacker.

**Warning sign (pre-publish):**
- `grep -A2 "^permissions:" .github/workflows/*.yml` — any `id-token: write` not directly under a single `publish:` job is the symptom.
- Any workflow file using `pull_request_target` AND containing `id-token: write` AND running checkout of PR HEAD is critical-severity by itself.

**Prevention:**
- `permissions: id-token: write` ONLY on the dedicated `publish:` job in `release.yml`. No PR-triggered workflow has it. The `ci.yml` workflow runs *zero* OIDC-capable jobs.
- The `publish:` job runs on a fresh runner, no restored caches, no third-party actions other than `actions/checkout@<pinned-sha>`, `actions/setup-node@<pinned-sha>`, `pnpm/action-setup@<pinned-sha>`, and `changesets/action@<pinned-sha>` — all pinned by commit SHA, never by tag (which can be re-pointed).
- Never use `pull_request_target` in this repo. If you ever need it, gate by `if: github.event.pull_request.head.repo.full_name == github.repository` (no forks).
- Add a CI-time gate: a self-check script that fails if any non-publish job in any workflow has `id-token: write`.

**Phase to address:** v1.3 Phase 26 (release workflow scaffolding). This is the single highest-severity pitfall in the milestone.

**Real incident:** [TanStack postmortem](https://tanstack.com/blog/npm-supply-chain-compromise-postmortem), [Mini Shai-Hulud Wiz writeup](https://www.wiz.io/blog/mini-shai-hulud-strikes-again-tanstack-more-npm-packages-compromised), [Endor Labs analysis](https://www.endorlabs.com/learn/how-a-misconfigured-ci-workflow-became-an-npm-supply-chain-compromise).

---

### OIDC-2: `NODE_AUTH_TOKEN` env var set to empty string disables OIDC fallback silently

**What goes wrong:**
The npm CLI uses OIDC only when `NODE_AUTH_TOKEN` is *completely unset*. If the env var exists but is empty (e.g. from a stale `setup-node` action with an unset `NPM_TOKEN` secret), npm tries to authenticate with the empty token, gets "Access token expired or revoked", and falls back to nothing — the publish fails with a misleading error. Per [philna.sh trusted publishing writeup](https://philna.sh/blog/2026/01/28/trusted-publishing-npm/): "An empty string is still a value—npm will attempt to use it rather than falling back to OIDC."

**Why it happens:**
GHA `setup-node` accepts an `auth-token` input and exports `NODE_AUTH_TOKEN` even when the input expression resolves to empty (e.g. `${{ secrets.NPM_TOKEN }}` when the secret doesn't exist).

**Warning sign (pre-publish):**
- Publish job error "Access token expired or revoked" while no `NPM_TOKEN` secret should be in play.
- `env:` block of the publish job containing `NODE_AUTH_TOKEN` at all.

**Prevention:**
- Publish job MUST NOT export `NODE_AUTH_TOKEN` and MUST NOT pass `auth-token` to setup-node. The only auth surface is OIDC.
- Use npm CLI 11.5.1+ and Node 22.14+ (we're already on Node 24 — fine). Pin npm version explicitly: `corepack prepare npm@latest-11 --activate` in the publish job, then check `npm --version` in a step.
- Run a dry-publish gate: `npm publish --dry-run --provenance` from the publish job before the real publish — surfaces auth misconfig with the same code path.

**Phase to address:** v1.3 Phase 26 (release workflow).

---

### OIDC-3: `repository.url` in package.json does not match the GitHub URL exactly (case + protocol)

**What goes wrong:**
npm provenance verification compares the `repository.url` field in the published `package.json` against the OIDC `Source Repository URI` extension on the Sigstore certificate. Any difference — case, `git+` prefix, `.git` suffix, trailing slash — causes `422 Unprocessable Entity` at publish time, AFTER changesets has already bumped versions and committed. Concrete example from [npm/cli#8036](https://github.com/npm/cli/issues/8036): "frontenddev-org" vs "FrontEndDev-org" was enough to break provenance.

**Why it happens:**
Package authors write `repository.url` by hand or copy from old templates. GitHub URLs are case-insensitive in the browser but case-sensitive in the Source Repository URI claim. OIDC verification is strict.

**Warning sign (pre-publish):**
- `npm publish --dry-run --provenance` failing with 422.
- `git remote -v` showing different case than `package.json#repository.url`.

**Prevention:**
- Set `repository.url` to exactly `https://github.com/fullselfbrowsing/lattice.git` (no `git+`, no trailing slash) and verify the org/repo casing matches `git remote get-url origin` case-exactly. Add `directory` sub-field for each scoped package: `"repository": { "type": "git", "url": "https://github.com/fullselfbrowsing/lattice.git", "directory": "packages/lattice" }`.
- Add a CI gate (in `ci.yml`): `node -e "const p=require('./packages/lattice/package.json'); if (p.repository.url !== 'https://github.com/fullselfbrowsing/lattice.git') process.exit(1)"` — fails fast on drift.

**Phase to address:** v1.3 Phase 24 (release-hygiene metadata) + v1.3 Phase 26 (release workflow includes dry-run gate).

---

### OIDC-4: First-time Trusted Publisher config on npmjs.com locks to the wrong workflow filename

**What goes wrong:**
The first-time npmjs.com Trusted Publisher form asks for: GitHub org, repository, workflow filename, environment (optional). After May 20, 2026, it also requires explicit selection of allowed actions (publish, etc.) per [npm docs](https://docs.npmjs.com/trusted-publishers/). If the filename is `release.yml` in the form but the workflow file ships as `publish.yml`, OIDC exchange fails with 403 — and the first publish attempt is the moment you discover it, AFTER versions are bumped and tagged.

**Why it happens:**
The form requires the filename including extension, with exact case. Easy to typo or get out of sync with rename refactors.

**Warning sign (pre-publish):**
- First publish 403 with "trusted publisher configuration not found."
- Mismatch between `.github/workflows/release.yml` (filename) and the value entered on npmjs.com.

**Prevention:**
- Lock the workflow filename in the rename PR (`release.yml`) and document it in CONTRIBUTING.md as "do not rename — it is referenced in npm Trusted Publisher config."
- Do a *test publish* of a deliberately-empty version (e.g. a `@fullselfbrowsing/lattice@1.3.0-rc.0` prerelease via `npm publish --tag rc`) before the real v1.3.0 publish, to surface 403s on a throwaway tag.
- Configure with the post-May-2026 explicit action list: "publish" only. Do not check "manage" or "admin" if presented.

**Phase to address:** v1.3 Phase 25 (npm org + Trusted Publisher claim — user-driven by FSB during execution) followed by Phase 27 (dry-run / rc publish gate).

---

### PROV-1: Provenance enabled but registry URL in publishConfig points to a mirror

**What goes wrong:**
`publishConfig.registry` set to anything other than `https://registry.npmjs.org` (e.g. a corporate mirror or `https://npm.pkg.github.com`) means provenance attestations either fail outright (Sigstore Rekor entries reference the wrong registry) or — worse — the publish succeeds without provenance silently. The package ships unsigned even though the workflow claims `--provenance`.

**Why it happens:**
`publishConfig.registry` is sometimes added to scoped packages "to make publish target explicit." If copied from a private-package template, it points to GH Packages. Provenance is wired to npmjs.org specifically.

**Warning sign (pre-publish):**
- `npm view @fullselfbrowsing/lattice` post-publish missing the "Provenance" badge.
- Any `publishConfig.registry` value other than `https://registry.npmjs.org`.

**Prevention:**
- `publishConfig` must be exactly: `{ "access": "public", "registry": "https://registry.npmjs.org", "provenance": true }` on both publishable packages.
- Add a CI gate: `node -e "const p=require('./packages/lattice/package.json'); if (p.publishConfig.registry !== 'https://registry.npmjs.org' || p.publishConfig.provenance !== true) process.exit(1)"`.
- After publish, query `https://registry.npmjs.org/@fullselfbrowsing/lattice/1.3.0` and assert the response includes `dist.attestations` — a separate post-publish job in `release.yml` after the publish step.

**Phase to address:** v1.3 Phase 24 (metadata) + Phase 26 (release workflow post-publish verification).

---

### PROV-2: Sigstore Rekor outage during release causes provenance failure; build re-runs duplicate versions

**What goes wrong:**
Sigstore Rekor has had documented outages. When Rekor returns 5xx, `npm publish --provenance` fails AFTER the tarball is uploaded but BEFORE the version is marked published. Reruns of the workflow then either (a) succeed and attach provenance, leaving an orphan unsigned tarball reference, or (b) hit "version already exists" and the team escalates to `npm unpublish` (which has its own 72-hour window) or `--force` with surprising results.

**Why it happens:**
Sigstore is a free public-good service. It has occasional outages. The npm CLI's failure mode straddles the tarball-upload/version-publish boundary.

**Warning sign (pre-publish):**
- Sigstore status page reporting incidents at release time.
- `npm publish` failing with "rekor" or "fulcio" in the error message.

**Prevention:**
- The release workflow must be re-runnable on the same tag. Use changesets' default of bumping to a new version on every release PR, so a failed publish at v1.3.0 means the next attempt is v1.3.1 (not a retry of v1.3.0 with `--force`). This is the conservative posture.
- If a retry of the same version is truly necessary, the workflow MUST require manual approval (`environment: production` with required reviewers) before any second publish attempt. No automatic retry of provenance failures.
- Status-page pre-check: a step early in the workflow that hits `https://status.sigstore.dev/api/v2/summary.json` and fails fast if Sigstore is degraded. Conservative; saves the team from racing the outage.

**Phase to address:** v1.3 Phase 26 (release workflow).

---

### CHGSET-1: Multiple tags pushed in one git push silently does not trigger `on.push.tags`

**What goes wrong:**
Per [community findings](https://medium.com/@anandkumar.code/how-a-monorepo-pnpm-and-changesets-transformed-my-multi-package-workflow-7c1771bba898): "If you push >3 tags at once, workflows will not trigger. Unfortunately, this is a relatively common scenario in a monorepo." A monorepo release that bumps both `@fullselfbrowsing/lattice@1.3.0` and `@fullselfbrowsing/lattice-cli@1.3.0` creates two tags. If a CHANGELOG fix produces a third tag in the same push, `on.push.tags` may not fire at all — and the release silently does not happen.

**Why it happens:**
GitHub's `on.push.tags` event is best-effort; pushes with many refs can race or be dropped. Documented but easily forgotten.

**Warning sign (pre-publish):**
- Tag pushed, no workflow run appears in Actions tab within 60 seconds.

**Prevention:**
- Use changesets-action's "Version Packages" PR flow: merging the PR triggers `on.push` to `main`, and the action publishes from there. The tag is created *by the publish step*, not the trigger. This avoids `on.push.tags` entirely.
- If tag-driven is required (per milestone: "tag-driven release workflow"), push tags one-at-a-time with `git push origin v1.3.0 && git push origin <next>`. Document in CONTRIBUTING.md.
- Add a `workflow_dispatch` trigger to `release.yml` so a stuck release can be manually re-fired.

**Phase to address:** v1.3 Phase 26 (release workflow design).

**Decision flag for roadmap:** the milestone says "tag-driven release workflow (changesets)." Clarify with the operator: tag-driven *as the visible artifact*, but driven internally by the changesets Version-PR pattern (which produces tags as a side-effect)? Or genuinely tag-on-push triggered? The former is more reliable; the latter matches a literal reading.

---

### CHGSET-2: Changesets bot opens a "Version Packages" PR that loops because branch protection blocks the bot

**What goes wrong:**
Changesets action pushes a `changeset-release/main` branch and opens a PR with version bumps + CHANGELOG. If `main` has branch protection requiring signed commits, required reviews, or status checks, the bot's PR cannot be merged automatically and — worse — the bot may keep force-pushing to its own branch on every run, generating noise. If the bot's GH token lacks `contents: write` + `pull-requests: write`, the PR is never opened at all.

**Why it happens:**
Default branch protection rules are tightened post-launch. The changesets action runs under the default `GITHUB_TOKEN` which has limited scope, and protections compound.

**Warning sign (pre-publish):**
- Changesets action logs show "permission denied" or "could not create PR."
- The `changeset-release/main` branch keeps getting force-pushed but no PR opens.

**Prevention:**
- `release.yml` job-level `permissions: { contents: write, pull-requests: write, id-token: write }` (with `id-token: write` ONLY on the publish job, not the version-PR job — split into two jobs).
- Branch protection: allow the changesets bot (and only it) to push to `changeset-release/*` and merge PRs from that branch via GH ruleset bypass. Document the rule.
- The version-PR job and the publish job MUST be separate jobs with separate permissions. The version-PR job has no `id-token: write`.

**Phase to address:** v1.3 Phase 26 (release workflow).

---

### CHGSET-3: A changeset file is missing for a PR that should bump versions, so v1.3.0 ships incomplete

**What goes wrong:**
A contributor merges a feature without `pnpm changeset`. The next release ships without that feature in the CHANGELOG, and consumers think it doesn't exist — they file issues that already-fixed. For Lattice's first public release this is especially damaging because user expectations are calibrated by the CHANGELOG.

**Why it happens:**
The most common changesets contributor mistake (per [changesets docs](https://github.com/changesets/changesets)).

**Warning sign (pre-publish):**
- PRs merged after the `.changeset/` directory was created with no `.changeset/*.md` files added.

**Prevention:**
- Add `changesets/action`'s "check for changeset" mode as a required PR check in `ci.yml`. PRs without a changeset must declare `--empty` explicitly.
- README badge or CONTRIBUTING.md section: "Every PR that touches `packages/lattice/src/**` or `packages/lattice-cli/src/**` must include a changeset. Run `pnpm changeset` to add one."

**Phase to address:** v1.3 Phase 26 (CI).

---

### CANARY-1: Canary repo accidentally uses workspace symlink instead of registry tarball

**What goes wrong:**
The canary repo (`fullselfbrowsing/lattice-canary`) is supposed to install `@fullselfbrowsing/lattice` from npm — that is the whole point of having a separate repo per Decision row 9 of PROJECT.md. If the canary's `package.json` lists `"@fullselfbrowsing/lattice": "workspace:*"` (e.g. because the author tested locally via `pnpm link --global`), or if a contributor adds the canary as a workspace package of the Lattice monorepo, it silently uses local source. Packaging bugs (exports map wrong, files-array missing files, ESM-import surprises) are invisible — exactly the bugs the canary exists to catch.

**Why it happens:**
pnpm workspaces silently link any package whose name matches a workspace package. `pnpm link --global` from the Lattice repo causes resolution to go through the link even from the canary repo. ESM-only packages can develop subtle ESM/CJS boundary issues that only show up when installed from a real tarball.

**Warning sign (pre-publish):**
- `ls -la node_modules/@fullselfbrowsing/lattice` in the canary repo showing a symlink instead of a normal directory.
- `pnpm why @fullselfbrowsing/lattice` showing `(local)` or `link:`.

**Prevention:**
- Canary `package.json` MUST pin to a concrete published version: `"@fullselfbrowsing/lattice": "1.3.0"` — no `^`, no `~`, no `workspace:*`, no `link:`.
- Canary CI uses `npm install` (not `pnpm install`) — explicitly different package manager from the source repo, removes any chance of workspace linking. Document this choice in canary README ("we use npm here because we *want* the registry resolution path").
- First step of canary CI: `node -e "const r=require('module').createRequire(import.meta.url); const path=r.resolve('@fullselfbrowsing/lattice'); if (!path.includes('node_modules')) { console.error('canary is linked to local source: ' + path); process.exit(1); }"`.
- Lattice monorepo's `pnpm-workspace.yaml` MUST NOT include `lattice-canary` even if it lives in a sibling directory.

**Phase to address:** v1.3 Phase 28 (canary repo bootstrap).

---

### CANARY-2: Stale version pin in canary masks regressions because canary never updates

**What goes wrong:**
Canary pins `@fullselfbrowsing/lattice@1.3.0` exactly. v1.3.1 ships with a regression. Canary CI keeps passing because it still uses 1.3.0. The regression reaches consumers before anyone notices.

**Why it happens:**
The same pin that prevents CANARY-1 (workspace leak) creates a bump-discipline burden. Without an automated bump process, the canary becomes a museum.

**Warning sign (pre-publish, ongoing):**
- Canary `package.json` last-modified > 7 days after last Lattice release.
- Canary `npm outdated` showing `@fullselfbrowsing/lattice` behind current.

**Prevention:**
- Renovate / dependabot configured in the canary repo to bump `@fullselfbrowsing/lattice*` immediately on every release.
- Lattice release workflow has a *post-publish* step that opens a PR in `fullselfbrowsing/lattice-canary` to bump pinned versions (using a separate GH App or PAT scoped only to that repo). This couples the release loop end-to-end.
- Canary nightly CI does *one* run against `latest` (resolved at install time) in addition to runs against the pinned version, so a missing bump shows up as a delta within 24 hours.

**Phase to address:** v1.3 Phase 28 (canary bootstrap) + Phase 29 (nightly schedule design).

---

### CANARY-3: Peer-dep trap — canary doesn't declare the same Node 24 / TS 6 expectation, drifts silently

**What goes wrong:**
Lattice declares `engines.node: >=24`. Canary CI runs on Node 22 (because the canary repo author copy-pasted a Node 22 setup-node action). The canary "passes" against a Node version the actual library does not support, hiding both real bugs and engine-violation bugs.

**Why it happens:**
Node version drift between repos is the most common kind of integration test invalidation. setup-node defaults to Node 22 today; the operator may not notice.

**Warning sign (pre-publish):**
- Canary CI runs on a Node version different from `packages/lattice/package.json#engines.node` floor.
- Canary `package.json#engines.node` missing or different from Lattice's.

**Prevention:**
- Canary CI uses `actions/setup-node@<sha>` with `node-version-file: '.nvmrc'`, and the canary repo's `.nvmrc` is `24` (mirrors Lattice).
- Canary matrix tests Node 24 AND Node-latest (so future LTS bumps surface immediately).
- Canary `package.json#engines.node` mirrors Lattice's. Add a CI step in the canary that diffs the two strings (fetch Lattice's published `package.json` from the registry and compare).

**Phase to address:** v1.3 Phase 28 (canary).

---

### CANARY-4: ESM-only import surprises — canary uses `require()` somewhere, fails at runtime not type-check

**What goes wrong:**
Lattice is `"type": "module"` ESM-only. A canary test author writes `const { ai } = require('@fullselfbrowsing/lattice')` in a `.cjs` setup file, or a CJS test helper transitively does. `attw --profile esm-only` is fine; `tsc` is fine (under `module: NodeNext`); but the test fails at runtime with "ERR_REQUIRE_ESM" — and the failure mode looks like a Lattice bug, not a canary misconfig.

**Why it happens:**
ESM-only packages collide with the long tail of CJS test runners, mock loaders, and config-loader libraries (e.g. `lilconfig`, `cosmiconfig` historical versions). The canary author may not have hit this before.

**Warning sign (pre-publish):**
- ERR_REQUIRE_ESM in canary CI logs.
- Canary has `.cjs` files or `"type": "commonjs"` anywhere.

**Prevention:**
- Canary `package.json` is `"type": "module"`. No `.cjs` files anywhere.
- Canary uses vitest (already known-good with Lattice's setup) — not jest with default config (which has ESM rough edges).
- Document in canary README: "This package validates Lattice's ESM-only contract. It is intentionally ESM-only."
- `attw --pack` of the Lattice tarball runs INSIDE the canary CI too, not just inside the Lattice CI. Different cache, different node_modules layout, different result.

**Phase to address:** v1.3 Phase 28 (canary).

---

### REAL-1: Nightly cron burns through provider budget by running on a holiday-shifted schedule

**What goes wrong:**
A `cron: "0 2 * * *"` runs every day at 02:00 UTC. Multiplied by three providers (OpenAI + Anthropic + Gemini) and N test scenarios, this is N*3 paid API calls per day. If the matrix is also configured to run on PRs to the canary repo, the cost multiplies by every PR. If a flaky test causes a retry storm, daily cost can spike 5-10x without anyone noticing for a week. This is the "forgotten background job" pattern documented in OpenAI cost runaway writeups — a cron eval job left enabled after benchmarking that runs nightly forever ([Grafient: OpenAI removed hard budget limits](https://grafient.ai/blog/openai-removed-hard-budget-limits)).

**Why it happens:**
Cron jobs are fire-and-forget. Real-provider tests are the most expensive kind of test. Lattice removed its own hard limit (CostTracker) — but if CostTracker itself has a bug, there is no second line of defense unless the platform layer also gates.

**Warning sign (early detection):**
- Daily provider billing dashboard >2x baseline.
- Workflow logs showing test re-runs >3 per night.
- CostTracker emitting `budget-exceeded` events that the workflow does not surface as failure.

**Prevention (quantitative):**
- **Per-run cost ceiling: $5 USD** enforced by Lattice CostTracker as a hard stop (abort signal propagated to the next provider call). The ceiling is set in canary config, signed-receipt-auditable.
- **Per-month cost ceiling: $100 USD** enforced by an outer wrapper (GH Actions step that queries provider billing API at workflow start; aborts if month-to-date >$100). Independent of CostTracker so a CostTracker bug cannot defeat it.
- **Per-provider key budget alerts** at the provider portal: OpenAI Hard limit equivalent via budget API where supported; Anthropic billing alert at $50 / month / key; Gemini billing alert at $30 / month / key. Different thresholds catch a single-provider runaway.
- **Workflow-level concurrency:** `concurrency: { group: lattice-nightly, cancel-in-progress: true }` so two nightlies cannot stack.
- **No retries on real-provider job failure.** Failure pages a human; the human decides whether to re-run. Auto-retry on a 429 cascade is the classic cost-runaway pattern.
- **Cron at off-peak only:** one run per 24h at 04:00 UTC. No PR triggers ever. `workflow_dispatch` for manual runs requires `environment: nightly-real-provider` with reviewer approval.
- **Test scenarios capped:** ~10 scenarios * 3 providers = 30 paid calls per nightly. At ~$0.05/call average, ~$1.50/night, ~$45/month per provider. $100/mo ceiling is 2x headroom.

**Phase to address:** v1.3 Phase 29 (nightly canary CI design) — the cost-ceiling design is the long pole.

---

### REAL-2: Rate-limit cascade — one provider 429s, fallback hammers the next, all three trip simultaneously

**What goes wrong:**
A nightly run hits OpenAI 429 (TPM exceeded). The test re-routes to Anthropic via Lattice's fallback chain. Anthropic also 429s (because nightly load aligns with other teams' crons). Test re-routes to Gemini. Gemini 429s. The test then retries the whole chain with exponential backoff. Backoff exhausts the workflow timeout (default 6h) without producing a useful failure, and the cost meter ran the whole time.

**Why it happens:**
Anthropic / OpenAI / Gemini all use spend-based rate-limit tiers with dynamic adjustment; static backoff strategies break under burst traffic ([devtk.ai AI API rate limits 2026](https://devtk.ai/en/blog/ai-api-rate-limits-comparison-2026/)). Fallback chains amplify the problem instead of containing it.

**Warning sign (early detection):**
- Workflow run-time >30 minutes for a single nightly.
- Logs showing 429 from multiple providers in the same run.

**Prevention:**
- Nightly tests use **fixed provider per scenario**, not the fallback chain. Each scenario asserts: "this scenario MUST run on provider X." If X 429s, the test FAILS (it does not cascade). Fallback chain is itself a separate scenario tested explicitly with fake providers.
- Per-scenario timeout: 60 seconds. After 60s the scenario fails and moves on; no global retry.
- Workflow timeout: 15 minutes (not the default 6h). Hard stop is cheaper than diagnosing a cascade.
- Concurrency limit per provider: at most one nightly per provider runs at a time across the entire org (use a shared workflow concurrency group).

**Phase to address:** v1.3 Phase 29 (nightly design).

---

### REAL-3: Model drift surfaces as test flake; team begins to ignore real-provider failures

**What goes wrong:**
Tests assert that `gpt-4o` returns a structured JSON with specific fields. OpenAI ships an update; the model occasionally adds a new field or paraphrases an output. Test fails ~3% of nights. Team marks it "flaky" and disables. Two weeks later a real regression in Lattice's prompt-encoding ships unnoticed.

**Why it happens:**
Real-provider responses are nondeterministic. Naive exact-match assertions catch model drift as false positives, eroding trust in the suite.

**Warning sign (early detection):**
- Same test failing 2-5 times per month with different error messages.
- CODEOWNERS or PR template suggesting "marking as flaky" as a remediation path.

**Prevention:**
- Tests assert *structural* properties (Zod schema parse succeeds; cost <$0.10; receipt verifies cryptographically; tripwire bands fire as expected) — never exact string equality. Lattice's own contract / tripwire surface is the assertion vocabulary.
- Tests pin model versions explicitly (`gpt-4o-2024-08-06` not `gpt-4o`). When the pinned version is deprecated by the provider, the test FAILS LOUDLY (provider deprecation is a known event class — see [OpenAI Deprecations](https://developers.openai.com/api/docs/deprecations)) — and a human bumps the pin intentionally.
- Track flake rate per scenario. A scenario that has flaked twice in 30 days is automatically opened as a GH issue with the "investigate" label, not silently disabled.

**Phase to address:** v1.3 Phase 29 (nightly design + assertion patterns).

---

### REAL-4: Provider API key rotation breaks nightly silently; canary green for weeks despite zero coverage

**What goes wrong:**
Provider key is rotated (compliance policy, breach response, or expiration). The new key is added as a GH Actions secret with a different name (typo, or "new" suffix). Workflow still references the old secret name — which resolves to empty. Provider returns 401. Workflow fails. Team mutes the alert ("we'll fix it tomorrow"). Two weeks later the canary is silently providing zero real-provider coverage.

**Why it happens:**
GH Actions secrets are mutable but their references are stringly-typed. Empty-secret-as-empty-string is the same trap as OIDC-2.

**Warning sign (early detection):**
- Workflow exit code 1 with 401 in logs > 3 consecutive runs.
- GH Actions secret `OPENAI_API_KEY_NEW` existing while workflow references `OPENAI_API_KEY`.

**Prevention:**
- Workflow first step asserts each provider key is non-empty: `for k in OPENAI_API_KEY ANTHROPIC_API_KEY GEMINI_API_KEY; do test -n "${!k}" || { echo "Missing $k"; exit 1; }; done`. Fail fast.
- Failure paging: 3 consecutive nightly failures escalates via repository-dispatch to a paging channel (Slack webhook, email). No mute-as-fix.
- Quarterly "key rotation drill" — rotate one key, expect workflow to fail within 24h, fix within 4h. Documented runbook.

**Phase to address:** v1.3 Phase 29 (nightly + failure paging).

---

### REAL-5: Partial-provider availability — Gemini is down regionally, test fails everywhere

**What goes wrong:**
Gemini has a regional outage. GitHub-hosted runners route from random regions. Some nights the test passes; some nights it fails. Statistical noise hides whether Lattice's adapter has a bug.

**Why it happens:**
Provider availability is regional. CI runners are not.

**Prevention:**
- Status-page pre-check (same pattern as PROV-2): early step queries each provider's status page. If degraded, skip the scenario with a soft-fail (workflow status: `neutral`, not `failure`).
- Maintain a 7-day rolling-window pass-rate per scenario. Below 90% triggers investigation. Above 99% is healthy. 90-99% means "the provider had an outage."

**Phase to address:** v1.3 Phase 29.

---

### COST-1: CostTracker checks budget BEFORE provider call but provider call completes anyway, in-flight leakage

**What goes wrong:**
CostTracker checks `usedUsd < budgetUsd` before issuing a provider call. The check passes. The call goes out. The call returns 30 seconds later with usage that pushes `usedUsd` past `budgetUsd`. The NEXT call is correctly blocked, but the *current* call already burned money. If 5 calls are in-flight concurrently when budget is near-exhausted, 5 over-budget calls land — none individually blocked.

**Why it happens:**
Budget gating in a pre-flight kernel only knows projected cost (from contract pricing) or observed cost (from completed receipts). In-flight calls are neither projected nor observed.

**Warning sign:**
- Actual nightly cost > budget ceiling.
- Receipts showing `costUsd` cumulative > `contract.budget.maxUsd`.

**Prevention:**
- CostTracker tracks `reservedUsd` (sum of projected cost of in-flight calls) in addition to `usedUsd`. Budget check is `usedUsd + reservedUsd + projectedCallCost <= budgetUsd`. On call completion, `reservedUsd -=projected; usedUsd += actual`.
- For nightly canary: serialize scenarios (no concurrency). Cost-ceiling enforcement is easier when only one call is ever in flight. Concurrency is a v1.4 problem.
- Hard outer ceiling at the workflow level (REAL-1) is the second line of defense — if CostTracker has a bug, workflow timeout + workflow-level budget guard saves the day.

**Phase to address:** v1.3 Phase 29 (cost ceiling implementation).

---

### COST-2: AbortSignal not propagated to fetch — provider call continues after CostTracker says "stop"

**What goes wrong:**
CostTracker decides budget exhausted, calls `controller.abort()`. Lattice's provider adapter does not forward `signal` to the underlying `fetch()`. The HTTP call completes; the user is billed; the receipt records the cost AFTER abort.

**Why it happens:**
AbortSignal threading is easy to miss when a provider adapter has many fetch sites (streaming, retries, fallbacks). Each fetch call must explicitly pass `{ signal }`.

**Warning sign:**
- Receipts with `kind: 'success'` and `costUsd > 0` that arrive after an abort event was logged.
- Unit tests for abort behavior pass but real-provider integration shows cost-after-abort.

**Prevention:**
- Adapter test pattern: mock fetch to record `signal.aborted` AT THE MOMENT of the fetch call. Abort the signal, then assert no further fetch calls happen.
- Real-provider test: deliberately set `contract.budget.maxUsd: 0.001` (below one call's cost), run, assert receipt is `kind: 'failure'` with `reason: 'budget-exhausted'` BEFORE any HTTP call lands.
- Code review checklist: every `fetch(` site in `packages/lattice/src/providers/*` must pass `signal`. Enforce with a custom ESLint rule or a grep gate (`grep -n "fetch(" packages/lattice/src/providers/ | grep -v "signal"` must return empty).

**Phase to address:** v1.3 Phase 29 (cost ceiling) — touches Lattice runtime, not just the canary.

---

### COST-3: Timing window — concurrent CostTracker reads/writes lose budget updates

**What goes wrong:**
Two providers complete simultaneously. Each handler does `tracker.usedUsd += this.cost`. Without synchronization, one update is lost. Budget shows `$X` when truly `$X + Y`. Either the budget overruns silently or — if `usedUsd` overshoots `budgetUsd` from the lost update — a future call is blocked when it shouldn't be.

**Why it happens:**
JavaScript single-threaded execution makes this less common than in threaded languages, but `await` boundaries between read and write are exactly the same race window.

**Prevention:**
- CostTracker updates use a single synchronous critical section: read+write in one tick, no `await` between them.
- For v1.3 canary: serialize provider calls (one at a time), removing the race entirely. Concurrency is v1.4.
- Property test: 100 concurrent fake provider calls each declaring $0.01 cost; assert `tracker.usedUsd` equals `$1.00` exactly, not $0.99 or $1.01.

**Phase to address:** v1.3 Phase 29.

---

### CRYPTO-1: Receipt downgrade — old (v1.0) receipt format presented to v1.3 verifier, signature valid, semantics weakened

**What goes wrong:**
v1.2 introduced receipt schema v1.1 with step-marker fields. v1.3 will be the first version published publicly. A future attacker (or naive verifier) can present a v1.0-shape receipt signed by a still-valid key. The signature is cryptographically valid (Ed25519 over the canonical bytes). The receipt lacks the v1.1 step-markers — so SAFETY-band tripwire context is absent — yet `verifyReceipt` returns `{ ok: true }`. The downstream caller acts on weaker semantics than v1.3 implies. This is the canonical "downgrade attack" from [Radicle disclosure 2026](https://radicle.xyz/2026/03/30/disclosure-of-vulnerability-in-signed-references) translated to Lattice's domain.

**Why it happens:**
Schema evolution + lenient verification + the JCS canonical form being well-defined for any subset of fields = a valid signature on a weaker shape.

**Warning sign (pre-publish):**
- `verifyReceipt` returns `{ ok: true }` for any receipt without a `schemaVersion` field, or with `schemaVersion < "1.1"`.
- No public documentation of which schema versions are accepted.

**Prevention:**
- `verifyReceipt` MUST require a minimum `schemaVersion` field in the canonical receipt. Default minimum for v1.3: `1.1`. Older versions return `VerifyResult` kind `schema-version-too-old` (new error kind).
- `schemaVersion` is part of the canonical bytes (signed-over), so an attacker cannot tamper without invalidating the signature.
- SECURITY.md documents the policy: "Lattice v1.3 accepts receipts with schemaVersion >= 1.1. Earlier receipts are rejected by default. To re-verify legacy receipts, pin to Lattice v1.2."

**Phase to address:** v1.3 Phase 24 (SECURITY.md content) + a new small phase (call it 24.5) for verifier hardening + a regression test in the canary that asserts downgrade rejection.

**This is the highest-severity crypto pitfall.** Cite Radicle disclosure as the precedent in SECURITY.md.

---

### CRYPTO-2: Examples and README show key generation patterns that look secure but reuse one key across runs

**What goes wrong:**
The `examples/work-inbox` showcase generates an ephemeral Ed25519 keypair per run (good). But the README's quick-start snippet might show `const key = crypto.subtle.generateKey(...)` outside an async function, or show a hard-coded base64 secret "for demo purposes." Copy-paste into a user's prod code = stable per-deployment secret in source.

**Why it happens:**
Demo simplicity pressure: real key management (KMS adapter shapes are deferred to v1.4 per PROJECT.md) is verbose; one-line demos are tempting.

**Warning sign (pre-publish):**
- Any `secret`, `private`, `kid`, or `key` literal in README / docs / examples with a value longer than 8 chars.
- Examples that don't generate a fresh key per run.

**Prevention:**
- README crypto section uses a clear disclaimer: "For production, use a KMS-backed signer (see SECURITY.md). The examples below generate ephemeral keys for demonstration."
- A CI grep gate: any base64-looking string of length >= 32 in `README.md` / `docs/**` / `examples/**` fails CI. Whitelist via comment annotation if intentional.
- SECURITY.md includes a "Key Management" section listing: ephemeral (demo only), file-backed (single-developer), KMS-backed (production, v1.4-deferred — until then, document the interface to roll your own).

**Phase to address:** v1.3 Phase 30 (release-hygiene docs) + Phase 24 (SECURITY.md).

---

### CRYPTO-3: Entropy source assumption — Node 24 WebCrypto Ed25519 KeyGen on environments that don't have it

**What goes wrong:**
Lattice uses Node 24 WebCrypto Ed25519 for signing. A canary or downstream consumer pinned to Node 24 still hits an unexpected entropy or platform difference (e.g. Alpine container, WSL, Firecracker microVM with shallow `/dev/urandom`). KeyGen succeeds but is biased; or `subtle.generateKey({ name: 'Ed25519' })` throws on a runtime where it isn't actually implemented.

**Why it happens:**
WebCrypto Ed25519 support is recent; library code typically assumes "if Node >= 24, it works." Edge runtimes lag.

**Warning sign (pre-publish):**
- `subtle.generateKey` throws `NotSupportedError` on any tested runtime.
- Receipts generated in CI cannot be verified on a different runtime.

**Prevention:**
- Lattice already has `@noble/ed25519@3.1.0` as a parity oracle dev-dependency. Promote it to an *optional runtime fallback* gated by a feature detection at module load: `if (!await canEd25519(crypto.subtle)) { /* use noble */ }`. Document the fallback behavior.
- Canary tests on Node 24 AND on a minimal Alpine container (`node:24-alpine`) — different entropy provider, different libc.
- SECURITY.md documents the entropy assumption: "Lattice's signing requires a CSPRNG. On supported runtimes (Node >=24, modern browsers) this is satisfied by WebCrypto."

**Phase to address:** v1.3 Phase 28 (canary tests cross-runtime) + Phase 24 (SECURITY.md).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip `publint` / `attw` because "build passes" | Faster CI | Tarball ships broken exports map; first-day GH issue storm | Never for a publishable package |
| Run real-provider tests on every PR for "faster feedback" | Catches bugs sooner | Burns budget; rate-limit cascades; flake noise | Never; nightly + manual only (already locked in milestone) |
| Reuse `NPM_TOKEN` from another team / personal account for the first publish | Skip Trusted Publisher setup | Token theft = supply-chain compromise; no provenance | Never for a public publish |
| Pin canary to `^1.3.0` instead of exact `1.3.0` | Auto-pulls patches | Workspace symlink can sneak in via overrides; harder to bisect | Never; pin exactly + bot bumps |
| One workflow file for both PR-CI and release | Less YAML | OIDC blast radius (OIDC-1) | Never; split into `ci.yml` and `release.yml` |
| Hand-author CHANGELOG instead of changesets | Easy v1.3.0 entry | Drift; merge conflicts; no enforcement | One-time only: pre-public history seed (RENAME-5) |
| Skip `repository.directory` sub-field per package | Simpler manifest | Provenance verification fragile if monorepo path matters; bug reports point to wrong file | Never for monorepos |
| Use the Lattice CostTracker as the *only* budget guard | One source of truth | Bug in CostTracker = no second line; runaway possible | Never; layer workflow-level guard on top |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| GitHub Actions OIDC | `permissions: id-token: write` at workflow scope | Scope to a single `publish:` job only |
| npm Trusted Publisher | Workflow filename typo on npmjs.com form | Lock filename in CONTRIBUTING.md; do a `rc.0` publish first |
| Sigstore Rekor | Treat 5xx as transient, auto-retry | Manual approval gate; conservative version-bump on retry |
| pnpm workspaces | Canary added to workspace yml accidentally | Canary in a different repo with `npm install` |
| Renovate | Default config bumps Lattice via `^` | Pin exact; use Renovate `rangeStrategy: replace` for `@fullselfbrowsing/*` |
| GitHub `on.push.tags` | Push multiple tags at once | Push one tag at a time; add `workflow_dispatch` fallback |
| `actions/setup-node` | `auth-token: ${{ secrets.MISSING }}` exports empty `NODE_AUTH_TOKEN` | Don't pass `auth-token` at all in OIDC publish job |
| Provider key rotation | Add new secret, forget to update workflow reference | First workflow step asserts non-empty for each key |
| Provider model deprecation | Pin to `gpt-4o` (alias) | Pin to dated revision `gpt-4o-2024-08-06`; expect explicit deprecation failure |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Fallback chain in nightly tests | 20+ min workflow runs, multi-provider 429s | Fixed provider per scenario; test fallback with fake providers only | Day 1 if a provider has a TPM blip |
| Concurrent provider calls in canary | Budget overshoot from in-flight leakage (COST-1) | Serialize scenarios in canary CI | At 3+ concurrent calls near budget |
| `npm install` cache poisoning in publish job | Stale tarball or attacker-injected dep | No restored caches in publish job; fresh runner | TanStack-pattern attack |
| Provenance verification on every publish call | Slow CI | Cache verification result post-publish; only verify on dist-tag promotion | At >10 publishes/week |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Workflow-scope `id-token: write` | OIDC token mintable from any job; TanStack-level blast radius | Job-scope only on publish |
| Third-party actions pinned by tag, not SHA | Tag re-pointed by attacker = arbitrary code on publish runner | All actions pinned by 40-char commit SHA |
| `pull_request_target` with checkout of PR HEAD | Pwn Request pattern; runs fork code with org permissions | Don't use `pull_request_target` in this repo |
| Hard-coded demo key in README | Users copy-paste into prod | Disclaimer + CI grep gate (CRYPTO-2) |
| Verifier accepts any schema version | Downgrade attack (CRYPTO-1) | Minimum schema version enforced and signed-over |
| Empty `NODE_AUTH_TOKEN` falls through silently | Misleading auth failure; obscures OIDC misconfig | Don't export the env at all in OIDC publish |
| `repository.url` mismatch | Provenance 422; or worse, silently publishes unsigned | CI gate on exact-string match (OIDC-3) |
| Ed25519 library with separate pubkey/privkey input | Private-key extraction via double-public-key oracle ([Mysten unsafe-libs list](https://github.com/MystenLabs/ed25519-unsafe-libs)) | Node WebCrypto only (no separate-pubkey APIs); `@noble/ed25519` v3 as fallback |

## "Looks Done But Isn't" Checklist

- [ ] **Scope rename:** Often missing `workspace:*` dep update in `lattice-cli/package.json` — verify via `pnpm pack` + `tar -xOf` (RENAME-1)
- [ ] **Scope rename:** Often missing `tsd.paths` update — verify via `grep "lattice" packages/lattice/package.json | grep -v "@fullselfbrowsing"` returns empty (RENAME-3)
- [ ] **Scope rename:** Often missing `examples/` import updates — verify by `rm -rf node_modules && pnpm install && node examples/work-inbox/index.mjs` from clean state (RENAME-4)
- [ ] **OIDC config:** Often missing job-scope permissions — verify `grep -A3 "id-token: write" .github/workflows/*.yml` shows it only on publish job (OIDC-1)
- [ ] **OIDC config:** Often missing the rc.0 dry-run publish before v1.3.0 — verify a `@fullselfbrowsing/lattice@1.3.0-rc.0` exists on npm before bumping to 1.3.0 (OIDC-4)
- [ ] **Provenance:** Often missing post-publish verification — verify `npm view @fullselfbrowsing/lattice@1.3.0` shows "Provenance" badge AND `dist.attestations` (PROV-1)
- [ ] **Provenance:** Often missing exact-match `repository.url` — verify exact string match via CI gate (OIDC-3)
- [ ] **Changesets:** Often missing pre-public CHANGELOG seed — verify file contains v1.0/v1.1/v1.2 headers before first release PR opens (RENAME-5)
- [ ] **Changesets:** Often missing `changesets/action` "require changeset" PR check — verify the check runs on every PR (CHGSET-3)
- [ ] **Canary:** Often missing the "no symlink" runtime assertion — verify `require.resolve('@fullselfbrowsing/lattice')` path contains `node_modules` in canary CI (CANARY-1)
- [ ] **Canary:** Often missing the Node version pinning to match Lattice — verify `.nvmrc` exists and matches Lattice (CANARY-3)
- [ ] **Canary:** Often missing the cross-runtime test — verify Alpine container test exists (CRYPTO-3)
- [ ] **Cost ceiling:** Often missing the *outer* workflow-level guard — verify a non-CostTracker step caps month-to-date spend independently (REAL-1)
- [ ] **Cost ceiling:** Often missing AbortSignal propagation through every fetch — verify grep-gate on `packages/lattice/src/providers/` (COST-2)
- [ ] **Crypto:** Often missing minimum `schemaVersion` check — verify `verifyReceipt` rejects a hand-crafted v1.0 receipt (CRYPTO-1)
- [ ] **Crypto:** Often missing demo-key disclaimer in README — verify SECURITY.md links from README crypto section (CRYPTO-2)

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| RENAME-1 (workspace dep stale) | LOW | Catch in `pnpm pack` gate before publish; fix manifest; re-pack |
| OIDC-1 (token blast radius) compromise post-publish | HIGH | Treat as TanStack-class: rotate npm Trusted Publisher config, deprecate all versions published in the window, publish hotfix from a clean fork, file npm Trust & Safety report |
| OIDC-4 (Trusted Publisher form typo) | MEDIUM | Bump version to e.g. 1.3.1, fix form, re-publish; the 1.3.0 attempt is unrecoverable |
| PROV-2 (Rekor outage mid-publish) | MEDIUM | Treat the failed version as poisoned; bump to next patch; communicate via release notes |
| CHGSET-1 (multi-tag drop) | LOW | `workflow_dispatch` re-fire of release.yml on the dropped tag |
| CANARY-1 (workspace symlink leak) | LOW | Audit canary `pnpm why` output; rebuild canary node_modules; add the runtime-resolve gate |
| REAL-1 (cost runaway) | MEDIUM-HIGH | Disable nightly cron immediately; audit billing; identify root cause (which scenario blew budget); reduce scenario count; re-enable with stricter ceiling |
| REAL-4 (key rotation silence) | MEDIUM | Workflow alert escalation; rotate key + update secret; reverify with manual workflow_dispatch |
| COST-1 (in-flight leakage) | LOW-MEDIUM | Serialize scenarios in canary CI immediately; track issue for `reservedUsd` impl in Lattice runtime; bump CostTracker test coverage |
| CRYPTO-1 (downgrade accepted) | HIGH | Issue security advisory (GHSA); ship `verifyReceipt` patch in 1.3.x rejecting old schema; communicate via SECURITY.md |
| CRYPTO-2 (demo key in README copied to prod) | HIGH (downstream) | Cannot recover others' deployments; publish security advisory; add CI gate prevention going forward |

## Pitfall-to-Phase Mapping

Phase numbers are placeholders for the v1.3 roadmap to assign; the mapping reflects which work-stream should *prevent* each pitfall.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| RENAME-1 workspace:* stale | Phase 23 (atomic scope rename) | `pnpm pack` tarball inspection in CI |
| RENAME-2 bin vs package confusion | Phase 23 + Phase 30 (docs) | Markdownlint / grep rule on install instructions |
| RENAME-3 tsd paths stale | Phase 23 | grep gate; tsd run from clean checkout |
| RENAME-4 examples imports stale | Phase 23 | clean-checkout example run; tarball install dry-run |
| RENAME-5 CHANGELOG history loss | Phase 30 | Pre-seed CHANGELOG before first changeset run |
| OIDC-1 token blast radius | Phase 26 (release workflow) | Self-check: no non-publish job has `id-token: write` |
| OIDC-2 NODE_AUTH_TOKEN empty | Phase 26 | `npm publish --dry-run --provenance` in CI |
| OIDC-3 repository.url mismatch | Phase 24 (metadata) + Phase 26 | CI gate on exact string |
| OIDC-4 Trusted Publisher form typo | Phase 25 (npm org setup) + Phase 27 (rc.0 publish) | rc.0 prerelease publish first |
| PROV-1 wrong publishConfig.registry | Phase 24 | CI gate on exact `publishConfig` shape |
| PROV-2 Rekor outage | Phase 26 | Status-page pre-check; manual approval on retry |
| CHGSET-1 multi-tag drop | Phase 26 | Use Version-PR pattern; `workflow_dispatch` fallback |
| CHGSET-2 bot PR loop | Phase 26 | Permissions split between version-PR and publish jobs |
| CHGSET-3 missing changeset | Phase 26 (CI) | `changesets/action` check as required PR gate |
| CANARY-1 workspace symlink leak | Phase 28 (canary bootstrap) | Runtime resolve gate in canary CI |
| CANARY-2 stale pin | Phase 28 + Phase 29 | Renovate bot; weekly `latest` resolve check |
| CANARY-3 Node version drift | Phase 28 | `.nvmrc` mirroring + engine string diff |
| CANARY-4 ESM-only surprise | Phase 28 | `attw --pack` inside canary CI |
| REAL-1 cost runaway | Phase 29 (nightly) | Layered guard: CostTracker + workflow-level + per-key billing alert |
| REAL-2 rate-limit cascade | Phase 29 | Fixed provider per scenario; 60s per-scenario timeout |
| REAL-3 model drift flake | Phase 29 | Structural assertions; dated model pins |
| REAL-4 key rotation silence | Phase 29 | Non-empty assertion at workflow start; pager on 3-fail |
| REAL-5 partial provider availability | Phase 29 | Status-page pre-check; rolling pass-rate tracking |
| COST-1 in-flight leakage | Phase 29 (cost ceiling impl) | Serialize canary scenarios; `reservedUsd` tracking |
| COST-2 AbortSignal not propagated | Phase 29 | grep-gate on fetch sites; budget=0 integration test |
| COST-3 budget update race | Phase 29 | Property test (100 concurrent fakes); serialize canary |
| CRYPTO-1 receipt downgrade | Phase 24 (SECURITY.md) + verifier hardening | Hand-crafted v1.0 receipt rejection test |
| CRYPTO-2 demo key in README | Phase 24 + Phase 30 | CI grep gate on secret-shaped strings in docs |
| CRYPTO-3 entropy assumption | Phase 28 (cross-runtime canary) + Phase 24 | Alpine container test; SECURITY.md note |

## Sources

- [TanStack npm supply-chain compromise postmortem (TanStack Blog, 2026-05-11)](https://tanstack.com/blog/npm-supply-chain-compromise-postmortem)
- [Mini Shai-Hulud strikes again: TanStack + more npm Packages Compromised (Wiz Blog, 2026)](https://www.wiz.io/blog/mini-shai-hulud-strikes-again-tanstack-more-npm-packages-compromised)
- [How a Misconfigured CI Workflow Became an npm Supply-Chain Compromise (Endor Labs, 2026)](https://www.endorlabs.com/learn/how-a-misconfigured-ci-workflow-became-an-npm-supply-chain-compromise)
- [Trusted publishing for npm packages — official docs](https://docs.npmjs.com/trusted-publishers/)
- [Things you need to do for npm trusted publishing to work (philna.sh, 2026-01-28)](https://philna.sh/blog/2026/01/28/trusted-publishing-npm/)
- [Generating provenance statements — npm Docs](https://docs.npmjs.com/generating-provenance-statements/)
- [npm provenance details (GitHub: npm/provenance)](https://github.com/npm/provenance)
- [`npm publish --provenance` conflicts with `repository.url` (npm/cli #8036)](https://github.com/npm/cli/issues/8036)
- [Changesets official docs (GitHub: changesets/changesets)](https://github.com/changesets/changesets)
- [How a Monorepo, pnpm, and Changesets Transformed My Multi-Package Workflow (Anand Kumar, Medium)](https://medium.com/@anandkumar.code/how-a-monorepo-pnpm-and-changesets-transformed-my-multi-package-workflow-7c1771bba898)
- [Using Changesets with pnpm (pnpm docs)](https://pnpm.io/using-changesets)
- [pnpm Workspaces docs](https://pnpm.io/workspaces)
- [pnpm Workspaces: renaming or moving packages leaves dangling symlinks (pnpm #10081)](https://github.com/pnpm/pnpm/issues/10081)
- [Rules — publint](https://publint.dev/rules)
- [arethetypeswrong/cli (npm)](https://www.npmjs.com/package/@arethetypeswrong/cli)
- [Disclosure of Replay Attack Vulnerability in Signed References (Radicle, 2026-03-30)](https://radicle.xyz/2026/03/30/disclosure-of-vulnerability-in-signed-references)
- [List of unsafe ed25519 signature libs (MystenLabs)](https://github.com/MystenLabs/ed25519-unsafe-libs)
- [Double Public Key Signing Function Oracle Attack on EdDSA (arXiv:2308.15009)](https://arxiv.org/pdf/2308.15009)
- [OpenAI Removed Hard Budget Limits — Here's What to Do (Grafient)](https://grafient.ai/blog/openai-removed-hard-budget-limits)
- [AI API Rate Limits 2026: OpenAI, Anthropic, Gemini RPM, TPM & 429 Fixes (devtk.ai)](https://devtk.ai/en/blog/ai-api-rate-limits-comparison-2026/)
- [OpenAI Deprecations](https://developers.openai.com/api/docs/deprecations)
- [How to Stop Your OpenAI API Bill from Spiraling Out of Control (dev.to)](https://dev.to/ali-raza-arain/how-to-stop-your-openai-api-bill-from-spiraling-out-of-control-222m)

---
*Pitfalls research for: v1.3 First public npm release + canary consumer of Lattice (capability-runtime SDK shipping cryptographic primitives)*
*Researched: 2026-06-03*
