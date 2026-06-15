# Phase 25: PR-Time CI Workflow - Context

**Gathered:** 2026-06-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Single `.github/workflows/ci.yml` runs on every PR against `main` and every push to `main`, executing the five locally-validated v1.3 quality gates (install, typecheck, test, test:types, lint:packages) plus three milestone-specific regression gates (tarball-leak inspection, source-import rename audit, cross-workflow OIDC/PR-target safety audit). The workflow has zero OIDC capability and zero secrets exposure: it is publish-adjacent infrastructure, not the publish pipeline. Every third-party action used in the workflow is pinned by 40-character commit SHA per CI-02 (TanStack supply-chain mitigation).

In scope: `.github/workflows/ci.yml`, root-level `permissions: contents: read`, concurrency block, single-job sequential pipeline, three auxiliary scripts under `scripts/` (`check-tarball-leak.mjs`, `verify-rename.mjs`, `check-workflow-safety.mjs`).

Out of scope: `.github/workflows/release.yml` (Phase 28), npm Trusted Publisher trust tuple registration (Phase 27), CONTRIBUTING.md + SECURITY.md content (Phase 26), branch-protection ruleset configuration on github.com (user-driven, not a code artifact), cross-OS / Node-version matrix (deferred to Phase 28 release.yml or a future scheduled nightly job), dependabot / Renovate config (out of milestone scope).

</domain>

<decisions>
## Implementation Decisions

### Matrix scope
- **D-01:** Ubuntu only at PR time. No matrix.
  - Rationale: ESM-only pure TypeScript with no native deps. v1.2 already validated cross-OS implicitly. PR-time feedback latency outranks cross-OS regression hunt.
  - Cross-OS regression coverage is reassigned to Phase 28 release.yml gating or a future scheduled job (deferred).
- **D-02:** Node 24 only at PR time.
  - Rationale: `engines.node = ">=24"` is the floor consumers contractually get. Adding Node 26 to PR-time CI would inflate runner minutes without reducing publish risk that ci.yml is responsible for.

### Required v1.3 quality gates (mandated by REQUIREMENTS CI-01)
- **D-03:** Single sequential job runs in order:
  1. `pnpm install --frozen-lockfile`
  2. `pnpm -r typecheck`
  3. `pnpm -r test`
  4. `pnpm -r test:types`
  5. `pnpm -r lint:packages` (publint + attw + check-cli-deps)
- The job name surfaces as a single required status check in branch protection.

### Additional regression gates (defense-in-depth beyond CI-01)
- **D-04:** Tarball-leak inspection gate.
  - After `lint:packages` passes, run `pnpm pack` on both publishable packages, extract `package.json` from each tarball, grep for any unscoped `"lattice"` reference in `dependencies`, `exports`, `types`, or `tsd.compilerOptions.paths`. Fails CI on any hit.
  - Implements PITFALLS RENAME-1 forever-guard. Same gate Phase 24 used to close its atomic rename.
  - Implementation: `scripts/check-tarball-leak.mjs` (Node script, no extra deps).
- **D-05:** Source-import rename audit gate (`scripts/verify-rename.mjs`).
  - Grep the workspace (excluding `dist/`, `node_modules/`, `*.tgz`) for any `from "lattice"`, `import("lattice"`, `require("lattice"`, `vi.doMock("lattice"`, `vi.doUnmock("lattice"`. Maintains an explicit allowlist for the legitimate unscoped `"lattice"` strings: `bin: { lattice }` mappings (CLI bin name preserved per RENAME-2) and the FORBIDDEN array inside `packages/lattice/scripts/check-cli-deps.mjs`.
  - Belt-and-suspenders to the tarball gate: tarball gate checks what ships, this gate checks what gets committed.
- **D-06:** Workflow-safety audit gate (`scripts/check-workflow-safety.mjs`).
  - Scans `.github/workflows/*.yml` for two failure conditions:
    1. ANY `pull_request_target:` trigger anywhere (PITFALLS OIDC-1 pwn-request pattern).
    2. `id-token: write` outside a job explicitly named `publish` in `release.yml` (defense against TanStack-style OIDC blast radius).
  - Runs in ci.yml so any future workflow drift fails before merge.

### Caching strategy
- **D-07:** Use `actions/setup-node`'s built-in `cache: 'pnpm'` for the pnpm content-addressed store only.
  - No `node_modules` cache, no vitest cache, no build cache.
  - Cache key strategy: default (hash of `pnpm-lock.yaml` only). No `restore-keys` fallback to avoid stale-cache risk.
  - Rationale: install dominates wall-clock; vitest cache occasionally produces stale-snapshot failures; node_modules cache can mask "forgot to add dep" bugs. publish job (Phase 28) will use NO caches at all per PITFALLS — ci.yml has more latitude because no OIDC token is involved.

### Job shape
- **D-08:** Single sequential job named `ci` running on `ubuntu-latest`.
  - Wall-clock budget: install ~30s + gates ~60s + overhead ~10s ≈ 90s total.
  - One required status check in branch protection (simpler to maintain than fanned-out parallel gates).
  - Split-job parallel fan-out rejected: doubles CI minutes for a ~40s wall-clock win at this test count (~733 tests, ~3s of `pnpm -r test`).

### Concurrency
- **D-09:** Concurrency block scoped to PR refs only.
  - `concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: ${{ github.event_name == 'pull_request' }} }`
  - Cancels in-progress runs on new commits to the same PR ref.
  - Push to `main` is non-cancellable so a rapid double-push to `main` cannot orphan a green status check.

### Security posture
- **D-10:** Explicit `permissions: contents: read` at the workflow root.
  - No `id-token`, no `packages`, no `pull-requests`, no `actions`. Forces every future job to opt in explicitly.
  - Hardest guard against the TanStack blast-radius pattern.
- **D-11:** Hard ban on `pull_request_target` trigger in ci.yml (and any other workflow). Enforced by the workflow-safety audit gate (D-06).
- **D-12:** All third-party actions pinned by 40-char commit SHA per CI-02. No `@v5`, no `@main`, no floating tags.
  - Pinning policy applies to actions/checkout, actions/setup-node, pnpm/action-setup, and any future action additions.

### Action selection
- **D-13:** Use `pnpm/action-setup` for pnpm installation (it reads `packageManager` field), then `actions/setup-node@<sha>` with `cache: 'pnpm'` for Node and the store cache.
  - Rationale: standard pnpm workspace pattern. Both actions are well-maintained and SHA-pinnable.

### Claude's Discretion
- Exact 40-char commit SHA values for each pinned action (researcher will pull these from the actions' release pages at planning time; CONTEXT does not lock specific shas because they ratchet over time).
- Exact `name:` strings for each step in the job (cosmetic — must be reviewable in the Actions UI log).
- Whether to upload any failure artifacts (test logs, lint output). Default: none; failures are surface in the job log itself.
- Specific working-directory tweaks if pnpm/action-setup or setup-node need them on Ubuntu runners.

### Folded Todos
None — phase-25 todo match returned zero candidates.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements & milestone goal
- `.planning/ROADMAP.md` (v1.3 Phase 25 section) — phase goal + the two success criteria phrased as observable truths.
- `.planning/REQUIREMENTS.md` (CI-01, CI-02 entries) — the only two requirements this phase closes.
- `.planning/PROJECT.md` (Current Milestone section) — milestone framing and the "Real-provider tests gated to manual dispatch + nightly cron, never PR-time" non-negotiable.

### Threat model & known pitfalls
- `.planning/research/PITFALLS.md` — full pitfalls catalog. Specifically:
  - **OIDC-1** (workflow-level `id-token: write` blast radius) — drives D-10, D-11, D-06.
  - **OIDC-2** (`NODE_AUTH_TOKEN` empty string disables OIDC fallback silently) — informs CI hardening; ci.yml has no NODE_AUTH_TOKEN at all.
  - **OIDC-3 / PROV-1** (repository.url exact form requirement) — already validated in Phase 24; ci.yml may add a drift guard as a Claude-discretion stretch goal.
  - **RENAME-1** (`scripts/verify-rename.mjs` recommendation) — drives D-05.
  - **RENAME-2** (`bin: { lattice }` vs scoped package name) — drives the allowlist inside D-05.
  - **RENAME-3** (tsd paths key) — drives D-04 (tarball gate covers tsd paths).
  - Cache-poisoning table at the end of OIDC-1 section — informs D-07's conservative caching posture.

### Phase 24 outputs (lock the rename surface this CI workflow protects)
- `.planning/phases/24-atomic-scope-rename-license-hygiene/24-CONTEXT.md` — locked tooling decisions (ESM-only, tsdown, exactOptionalPropertyTypes, pnpm catalog), atomic-commit shape, tarball inspection methodology.
- `.planning/phases/24-atomic-scope-rename-license-hygiene/24-VERIFICATION.md` — the 18 observable truths this CI workflow must keep true on every PR.
- `.planning/phases/24-atomic-scope-rename-license-hygiene/24-REVIEW.md` — Phase 24 code review findings; WR-01 (`pnpm --filter lattice` misses) demonstrates exactly why the source-import audit gate (D-05) is required.

### External supply-chain incidents referenced in PITFALLS
- TanStack postmortem (May 2026) — the OIDC blast-radius incident that drives D-10, D-11, D-06.

### Workspace tooling reference
- `package.json` (root) — workspace scripts (`typecheck`, `test`, `test:types`, `lint:packages`) that ci.yml invokes; `packageManager: pnpm@10.33.1` and `engines.node: ">=24"`.
- `packages/lattice/package.json` — `tsd.compilerOptions.paths`, `publishConfig.access: public`, exports map (one of the surfaces tarball-leak gate validates).
- `packages/lattice-cli/package.json` — scoped name, `workspace:^` dep on `@fullselfbrowsing/lattice`, `bin: { lattice }` (this last one is the legitimate unscoped string that the verify-rename allowlist must cover).
- `pnpm-workspace.yaml` — `catalog:` specifiers, workspace globs.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Local verification commands are already wired (`pnpm -r typecheck`, `pnpm -r test`, `pnpm -r test:types`, `pnpm -r lint:packages`). ci.yml just invokes them — no script rewriting needed.
- `packages/lattice/scripts/check-cli-deps.mjs` is an existing precedent for a Node-only CI gate script — same authoring pattern (Node 24 ESM, `fs/promises`, no external deps) can be reused for the three new `scripts/` gate scripts.
- Phase 24's tarball-inspection logic (run during 24-03 verification, not committed as a script) is the reference implementation for `scripts/check-tarball-leak.mjs`.

### Established Patterns
- ESM-only across all workspace code, including scripts (`"type": "module"`).
- `node --experimental-vm-modules` is NOT used; rely on stable ESM only.
- All Node scripts use `import { ... } from "node:fs/promises"` style (Node 24 built-ins).
- `pnpm install --frozen-lockfile` is the canonical install command across all v1.3 work (not `pnpm install` without the flag).
- Verification scripts exit 0 on success, non-zero with a single-line error on failure (greppable from CI logs).

### Integration Points
- `.github/workflows/` directory does NOT exist yet in the repo — ci.yml will be the first file in it.
- The workflow-safety audit gate (D-06) reads `.github/workflows/*.yml` — once `release.yml` lands in Phase 28, this gate will also begin validating it (no script changes expected, just additional files in the scanned glob).
- Branch protection ruleset on github.com (configured via the GitHub UI or via gh API) will require `ci` (the job name) as a required check; configuring branch protection itself is user-driven and out of scope of this phase's code artifact.

</code_context>

<specifics>
## Specific Ideas

- Workflow name: `ci`. Job name: `ci`. Both surface as `ci / ci` in the GitHub Actions UI but the required-check string is simply `ci`.
- Step naming convention: use imperative present-tense (`Install dependencies`, `Type-check workspace`, `Run unit tests`, `Validate package types (tsd)`, `Lint packages (publint + attw)`, `Audit tarballs for stale names`, `Audit source imports for stale rename`, `Audit workflows for OIDC/PR-target drift`). Reads cleanly in the Actions UI log.
- The three audit scripts live under `scripts/` (workspace root), not inside any package. They are workspace-wide CI artifacts, not publishable code.
- The verify-rename script's allowlist is hard-coded inline (small, stable list); no JSON config file needed.

</specifics>

<deferred>
## Deferred Ideas

- Cross-OS matrix (Ubuntu + macOS + Windows) — possibly added to Phase 28 release.yml or a future scheduled nightly job in a later milestone.
- Node-version matrix (24 + 26 or 24 + lts/*) — defer until v1.4 considers raising the engines floor.
- Coverage upload (codecov / coveralls) — out of milestone scope; v1.3 is publish-first.
- Failure artifact uploads (test logs, lint output) — failures are surfaced in the job log; explicit artifact upload deferred until concrete need arises.
- Dependabot / Renovate config — out of milestone scope.
- A drift guard on `repository.url` exact form (PROV-1 / OIDC-3) — covered by publint + Phase 24 verification; a CI-level drift guard can be added later if a regression ever surfaces.

</deferred>

---

*Phase: 25-pr-time-ci-workflow*
*Context gathered: 2026-06-05*
