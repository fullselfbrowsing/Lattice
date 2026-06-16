# Phase 25: PR-Time CI Workflow - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-05
**Phase:** 25-pr-time-ci-workflow
**Areas discussed:** OS / Node matrix scope, Extra regression gates beyond the 5 required, Caching strategy & blast radius, Job shape & concurrency

---

## OS / Node matrix scope

### OS scope

| Option | Description | Selected |
|--------|-------------|----------|
| Ubuntu only at PR-time (Recommended) | Fastest feedback, lowest cost. Cross-OS regressions caught later in release.yml or via a separate scheduled nightly job. Justified because there are no native deps and 733/733 tests already passed cross-OS in v1.2 work. | x |
| Ubuntu + macOS + Windows matrix | Catches path/CRLF/case-sensitivity issues at PR time. Higher cost (3x runner minutes) and slower feedback (~30s overhead per OS). Defensible for a publishable library that users will run on all three. | |
| Ubuntu + macOS only | Skip Windows at PR time (most v1.2 Lattice surface is server-side / dev-machine). Windows can be a release-only or scheduled-nightly gate. | |

**User's choice:** Ubuntu only at PR-time
**Notes:** Cross-OS coverage reassigned to Phase 28 release.yml or a future scheduled nightly job.

### Node matrix

| Option | Description | Selected |
|--------|-------------|----------|
| Node 24 only (Recommended) | Engines floor is the only Node version users contractually get. v1.3 doesn't ship to older floors. Adding 26 would expand CI cost without meaningfully reducing the publish risk we care about at PR time. | x |
| Node 24 + Node 26 (LTS-future hedge) | Catches future-Node regressions before the engines.node bump that v1.4 might want. Doubles test runner minutes. Useful only if v1.4 Node-bump is imminent. | |
| Node 24 + Node 'lts/*' | Validates against whatever GitHub marks as LTS at the time of run. More signal but more volatility — if GitHub's LTS pointer moves mid-cycle, CI breaks unexpectedly. | |

**User's choice:** Node 24 only
**Notes:** v1.4 Node-bump is not imminent; revisit when engines floor moves.

---

## Extra regression gates beyond the 5 required

### Tarball gate

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — add tarball-leak gate (Recommended) | Single job step: `pnpm pack` both publishable packages, tar -xOf the resulting tarballs, grep for the unscoped name in deps/exports/types/tsd paths. Fails CI on regression. ~10s of CI time. | x |
| No — publint+attw is enough | publint already covers most manifest sanity. Skip the explicit tarball grep — if a future change reintroduces an unscoped reference, attw or publint may flag it indirectly. | |

**User's choice:** Yes — add tarball-leak gate
**Notes:** Implemented as `scripts/check-tarball-leak.mjs`. Same logic Phase 24 used to close the atomic rename.

### PR-target ban

| Option | Description | Selected |
|--------|-------------|----------|
| Add a CI gate script (Recommended) | Tiny `scripts/check-no-pr-target.mjs` greps `.github/workflows/*.yml` for `pull_request_target:` and fails CI if found anywhere. Same script can also assert `id-token: write` only appears in publish jobs. | x |
| Skip — covered by policy in CONTRIBUTING.md (Phase 26) | Phase 26 owns CONTRIBUTING.md content. A written rule is easier than code but doesn't catch drift. Relies on reviewer discipline. | |
| Add CODEOWNERS for .github/workflows/ | Requires repo-owner review on any .github/workflows/ change. Procedural enforcement, no CI cost. Misses sub-tree workflow drift if reviewers approve without close reading. | |

**User's choice:** Add a CI gate script
**Notes:** Renamed in CONTEXT.md to `scripts/check-workflow-safety.mjs` to reflect that it also enforces the `id-token: write` rule.

### Rename gate

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — belt-and-suspenders with the tarball gate (Recommended) | Tarball gate catches what ships; this catches what gets committed. They're complementary. Cheap (one grep), and the cost of a future regression slipping is high (broken canary, broken docs). | x |
| No — redundant with tarball gate | Tarball inspection already catches the only published case that matters. Source-level grep would also flag intentional unscoped strings and require maintaining an allowlist. | |

**User's choice:** Yes
**Notes:** Allowlist covers `bin: { lattice }` and the FORBIDDEN array in check-cli-deps.mjs.

### Permissions

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit `permissions: contents: read` at root (Recommended) | Forces every job to start from zero. Any future job needing more must explicitly opt in. Single best defense against the TanStack blast-radius attack. | x |
| Skip root permissions block, set per job | More granular but easier to miss when adding a new job. Each new job inherits the workflow default unless explicit. | |

**User's choice:** Explicit `permissions: contents: read` at root

---

## Caching strategy & blast radius

### Cache scope

| Option | Description | Selected |
|--------|-------------|----------|
| pnpm store cache only via setup-node (Recommended) | actions/setup-node has built-in `cache: 'pnpm'` support that caches the pnpm content-addressed store keyed by lockfile hash. Safe, well-tested, fastest install path. | x |
| Aggressive: pnpm store + node_modules + vitest cache | Fastest possible CI but multiple cache keys to manage. node_modules cache can mask 'forgot to add dep' bugs. vitest cache occasionally causes weird stale-snapshot failures. | |
| No caches — freshest possible CI | Slowest (~30s extra `pnpm install`). Most signal-pure. Same posture as publish job. Defensible if CI time isn't a bottleneck. | |

**User's choice:** pnpm store cache only via setup-node

### Cache key

| Option | Description | Selected |
|--------|-------------|----------|
| Hash of pnpm-lock.yaml only (Recommended) | Default for setup-node's pnpm cache. Cache invalidates exactly when deps change. Maximum hit rate, no stale risk. | x |
| Hash of lockfile + Node version + OS | More strict than needed when matrix is fixed to Ubuntu+Node24. Extra typing for no signal benefit. | |
| Restore-keys fallback to last partial hit | If the lockfile hash misses, fall back to the most recent prefix match (faster warmup on dep bumps). Slightly higher stale-cache risk. | |

**User's choice:** Hash of pnpm-lock.yaml only

---

## Job shape & concurrency

### Job shape

| Option | Description | Selected |
|--------|-------------|----------|
| Single sequential job (Recommended) | One runner: install → typecheck → test → test:types → lint:packages → tarball-leak → verify-rename → workflow-audit. ~90s total. Single status check to require in branch protection. Simplest mental model. | x |
| Split into parallel jobs after shared install | Reuse install step via job outputs / actions/cache hand-off. Total wall-clock ~50s but doubles CI minutes. More status checks in branch protection. | |
| Install + (matrix of gates) parallel fan-out | Matrix strategy with one cell per gate. Cleanest job logs per gate. Highest CI cost. Best for very large monorepos; overkill at 733 tests. | |

**User's choice:** Single sequential job

### Concurrency

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — cancel-in-progress on PR (Recommended) | `concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }` on PR refs. Saves CI minutes when devs push fixups. Keep main branch runs non-cancellable. | x |
| Yes — cancel on every ref including main | Simpler concurrency block. Risk: a rapid double-push to main could orphan a green-on-main check, hiding regressions for the next release. | |
| No cancellation — every run completes | Maximum signal at every commit. CI bill grows linearly with fixup commits. | |

**User's choice:** Yes — cancel-in-progress on PR refs only
**Notes:** Cancellation conditioned on `github.event_name == 'pull_request'` so main is non-cancellable.

---

## Claude's Discretion

- Exact 40-char commit SHA values for each pinned action (resolved at planning/research time from each action's release page).
- Exact `name:` strings for each step in the job (cosmetic, must read cleanly in the Actions UI log).
- Whether to upload any failure artifacts (test logs, lint output). Default: none.
- Specific working-directory tweaks if pnpm/action-setup or setup-node need them on Ubuntu runners.

## Deferred Ideas

- Cross-OS matrix (Ubuntu + macOS + Windows) — Phase 28 release.yml or future scheduled nightly job.
- Node-version matrix (24 + 26 or lts/*) — defer until v1.4 considers raising engines floor.
- Coverage upload (codecov / coveralls).
- Failure artifact uploads.
- Dependabot / Renovate config.
- repository.url drift guard (PROV-1 / OIDC-3) at CI level.
