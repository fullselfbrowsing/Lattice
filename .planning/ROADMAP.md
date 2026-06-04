# Roadmap: Lattice

## Milestones

| Milestone | Status | Completed | Reference |
| --- | --- | --- | --- |
| v1.0 milestone | Shipped | 2026-04-22 | `.planning/milestones/v1.0-ROADMAP.md` |
| v1.1 Capability Receipts | Shipped | 2026-05-12 | `.planning/milestones/v1.1-ROADMAP.md` |
| v1.2 FSB Integration + Agent Capability | Shipped | 2026-05-31 | `.planning/milestones/v1.2-ROADMAP.md` · `.planning/milestones/v1.2-REQUIREMENTS.md` · `.planning/milestones/v1.2-MILESTONE-AUDIT.md` |
| v1.3 Public Release + Canary Validation | Active | — | `.planning/REQUIREMENTS.md` · `.planning/research/SUMMARY.md` |

## Phases

<details>
<summary><b>Shipped milestones (collapsed)</b></summary>

### v1.0 milestone (shipped 2026-04-22)

Phases 1 to 6. Package/API spine, artifact lifecycle, deterministic planning, sessions/context/packaging, tools/replay/observability, work-inbox showcase. See `.planning/milestones/v1.0-ROADMAP.md`.

### v1.1 Capability Receipts (shipped 2026-05-12)

Phases 7 to 13 (plus sub-phases 13.1 + 13.2). Contracts + pre-flight + cost accounting, tripwire invariants with terminal semantics, RFC 8785 JCS canonicalization + Ed25519 signed receipts with `kid` and `KeySet`, receipts inside the replay envelope, `lattice` CLI (`repro` / `verify` / `eval`), sidecar support that closes the replay round-trip, showcase enrichment exercising all 36 v1.1 REQ-IDs. See `.planning/milestones/v1.1-ROADMAP.md`.

### v1.2 FSB Integration + Agent Capability (shipped 2026-05-31)

Phases 14 to 22 (plus the Phase 23 milestone audit). Two tracks delivered in one milestone.

- **Track A (Phases 14 to 18):** public surface index + packaging readiness; receipt v1.1 schema extension + tripwire band pipeline + lifecycle events; step-transition tracing + checkpoint hook; five new provider adapters (Anthropic Messages, Gemini, xAI, OpenRouter, LM Studio) + INV-03 parity smoke across 7 logical providers; survivability adapter contract.
- **Track B (Phases 19 to 22):** delegation surface flip + `ai.runAgent(intent)` runtime entrypoint with uniform prompt-reencoded tool-use across 7 providers; pluggable `AgentHost` interface (scheduler / transport / storage seams) + recovery markers closing v1.1 TRACE-EXT-01; five agent infrastructure primitives (cost / transcript / goal-progress / action-history / permission); `examples/agent-loop` showcase + `evalAgentRun` regression-gate kernel.

46 / 46 REQ-IDs wired end-to-end. 733 / 733 workspace tests passing. One non-blocking limitation documented (V1.2-LIMITATION-1: native tool-use deferred). v1.2 branch merged to `main` via PR #1 (merge commit `5ca3e33`); tag `v1.2.0` cut and pushed. See `.planning/milestones/v1.2-ROADMAP.md` and `.planning/milestones/v1.2-MILESTONE-AUDIT.md`.

</details>

### v1.3 Public Release + Canary Validation (active)

**Goal:** Cut Lattice's first public npm release under `@fullselfbrowsing/*` with OIDC Trusted Publisher + provenance attestations, then prove correctness end-to-end via a separately-repo'd canary consumer that exercises the public API against real providers.

**Phase span:** 24 to 32 (9 phases, 54 REQ-IDs).
**Granularity:** coarse (per `.planning/config.json`).
**Coverage:** 54 / 54 REQ-IDs mapped (no orphans).

- [ ] **Phase 24: Atomic Scope Rename + License Hygiene** — Rename both publishable packages to `@fullselfbrowsing/*` and add release-required manifest fields in a single atomic commit.
- [ ] **Phase 25: PR-Time CI Workflow** — Stand up `.github/workflows/ci.yml` (install + typecheck + test + publint + attw) with SHA-pinned actions; first green CI run validates the renamed surface.
- [ ] **Phase 26: Release Hygiene Docs + Receipt Downgrade Defense** — Author `CONTRIBUTING.md`, `SECURITY.md`, README provenance section, seed changeset; harden `verifyReceipt` with minimum `schemaVersion >= 1.1` enforcement.
- [ ] **Phase 27: npm Org + Trusted Publisher Setup** — User-driven via FSB on npmjs.com: claim `@fullselfbrowsing` scope, create `npm-publish` GitHub Environment, bind Trusted Publisher trust tuple `(repo, workflow_filename, environment)` for both packages.
- [ ] **Phase 28: Release Workflow + rc.0 OIDC Smoke** — Land split-job `release.yml` (version-PR job + publish job with separate `permissions:`); publish `@fullselfbrowsing/lattice@1.3.0-rc.0` + `@fullselfbrowsing/lattice-cli@1.3.0-rc.0` end-to-end via OIDC with verifiable provenance.
- [ ] **Phase 29: First v1.3.0 Stable Publish** — Promote rc.0 to stable; `@fullselfbrowsing/lattice@1.3.0` + `@fullselfbrowsing/lattice-cli@1.3.0` live on npmjs.com with provenance badge + auto-generated GitHub Release object.
- [ ] **Phase 30: Canary Bootstrap + Layer 1 Fake-Provider Suite** — Public repo `fullselfbrowsing/lattice-canary` scaffolded; `npm install` (not pnpm) with exact-version pin; resolve-path assertion + Layer 1 unit suite exercises every public export against the registry tarball with fake providers.
- [ ] **Phase 31: Canary Layer 2 Real-Provider Integration + Cost Ceiling** — Nightly cron + manual dispatch integration suite against OpenAI / Anthropic / Gemini cheapest competent models; three-layer cost ceiling (Lattice CostTracker per-run, workflow-level per-month, provider portal alerts).
- [ ] **Phase 32: Cross-Repo Wiring + v1.3 Milestone Audit** — `repository_dispatch` from Lattice `release.yml` to canary `refresh-lattice.yml` with `CANARY_DISPATCH_TOKEN`; canary auto-bumps + opens PR; v1.3 milestone audit confirms 54/54 REQ-IDs wired end-to-end.

## Phase Details

### Phase 24: Atomic Scope Rename + License Hygiene
**Goal**: Both publishable packages publish under the `@fullselfbrowsing` scope with every release-required manifest field present, landed atomically so no stale-name surface survives.
**Depends on**: Nothing (first v1.3 phase)
**Requirements**: RENAME-01, RENAME-02, RENAME-03, RENAME-04, RENAME-05, PKG-01, PKG-02, PKG-03, PKG-04, PKG-05
**Success Criteria** (what must be TRUE):
  1. `packages/lattice/package.json#name` reads `@fullselfbrowsing/lattice` and `packages/lattice-cli/package.json#name` reads `@fullselfbrowsing/lattice-cli`, with `bin: { lattice }` preserved on the CLI so the user-facing command is unchanged.
  2. `packages/lattice-cli/package.json#dependencies` reads `"@fullselfbrowsing/lattice": "workspace:^"` (the `*` to `^` flip is in the same commit as the rename).
  3. `pnpm pack` on both packages produces tarballs whose `package/package.json` references only `@fullselfbrowsing/*` names; a grep for the unscoped string `"lattice"` in dependency keys, exports, types, or tsd paths returns nothing.
  4. `pnpm install && pnpm -r test && pnpm -r test:types && pnpm -r lint:packages` (publint + attw) all pass clean on the renamed surface, with `license: "MIT"`, `repository`, `bugs`, `homepage`, and `publishConfig.access: "public"` present on both publishable packages and `private: true` preserved on root.
**Plans**: 3 plans
- [ ] 24-01-PLAN.md — Rename packages/lattice + add release metadata + root license (RENAME-01, PKG-01/02/03/04)
- [ ] 24-02-PLAN.md — Rename packages/lattice-cli + workspace:^ flip + add release metadata (RENAME-02/03, PKG-01/02/03)
- [ ] 24-03-PLAN.md — tsd paths + import rewrites + changeset + lockfile + atomic commit + tarball inspection (RENAME-04/05, PKG-05)

### Phase 25: PR-Time CI Workflow
**Goal**: Every PR and push to main runs install + typecheck + test + publint + attw against the renamed surface via a SHA-pinned GitHub Actions workflow.
**Depends on**: Phase 24
**Requirements**: CI-01, CI-02
**Success Criteria** (what must be TRUE):
  1. A new PR against `main` triggers `.github/workflows/ci.yml`, runs `pnpm install --frozen-lockfile`, `pnpm -r typecheck`, `pnpm -r test`, `pnpm -r test:types`, and `pnpm -r lint:packages`, and reports green status before the merge button enables.
  2. Every third-party action used in `ci.yml` (actions/checkout, actions/setup-node, pnpm/action-setup, etc.) is pinned by a 40-character commit SHA — `grep -E "uses: .+@[0-9a-f]{40}"` matches every `uses:` line, with no `@v5` or `@main` tag references.
**Plans**: TBD

### Phase 26: Release Hygiene Docs + Receipt Downgrade Defense
**Goal**: Author the docs npm requires for a credible first publish and harden `verifyReceipt` against the receipt-downgrade attack, coupling the security writeup to the code change in one phase.
**Depends on**: Phase 24
**Requirements**: DOC-01, DOC-02, DOC-03, DOC-04, DOC-05, CRYPTO-01
**Success Criteria** (what must be TRUE):
  1. `CONTRIBUTING.md`, `SECURITY.md`, and `CHANGELOG.md` (per publishable package, retroactively seeded with v1.0 / v1.1 / v1.2 history under the new scoped names) exist at repo root or in their respective packages; `SECURITY.md` documents the CVE disclosure address, Ed25519 entropy assumptions, signing-key rotation guidance, and the receipt-downgrade defense citing Radicle 2026-03 precedent.
  2. A hand-crafted `CapabilityReceipt` with no `schemaVersion` field, or with `schemaVersion < 1.1`, signed by an otherwise-valid `KeySet`, is rejected by `verifyReceipt` with a new `VerifyResult` error kind `schema-version-too-low`; a passing unit test exercises both branches.
  3. An initial changeset seeding the v1.3.0 release notes exists under `.changeset/`, and `README.md` shows install instructions using `@fullselfbrowsing/lattice` plus npm version + provenance + license badge placeholders and a copy-pastable provenance verification example.
**Plans**: TBD

### Phase 27: npm Org + Trusted Publisher Setup
**Goal**: The npm trust tuple `(repo: fullselfbrowsing/Lattice, workflow_filename: release.yml, environment: npm-publish)` exists on npmjs.com for both `@fullselfbrowsing/lattice` and `@fullselfbrowsing/lattice-cli` before any publish is attempted.
**Depends on**: Phase 24, Phase 26
**Requirements**: ORG-01, ORG-02, ORG-03
**Success Criteria** (what must be TRUE):
  1. The `@fullselfbrowsing` npm organization shows as claimed under the user's npmjs.com account (organization tier, free for public packages), and `npm view @fullselfbrowsing/lattice` returns either a 404 (package not yet published) or a record owned by the claimed org.
  2. The `npm-publish` GitHub Environment exists in `fullselfbrowsing/Lattice` with required reviewers configured, and the npmjs.com Trusted Publisher form for each package shows the exact trust tuple `(fullselfbrowsing/Lattice, release.yml, npm-publish)` with "publish" action selected.
  3. A user-driven walkthrough script in the plan hands the baton to the user at the npm UI steps and verifies completion via FSB recon (npmjs.com page snapshot) before the phase closes.
**Plans**: TBD

### Phase 28: Release Workflow + rc.0 OIDC Smoke
**Goal**: Land `.github/workflows/release.yml` with split version-PR and publish jobs (each with their own `permissions:` block) and prove the OIDC + provenance + GitHub Release pipeline end-to-end by publishing `@fullselfbrowsing/lattice@1.3.0-rc.0` and `@fullselfbrowsing/lattice-cli@1.3.0-rc.0` — the first publish IS the smoke test.
**Depends on**: Phase 25, Phase 27
**Requirements**: REL-01, REL-02, REL-03, REL-04, REL-05, REL-06, PUB-01
**Success Criteria** (what must be TRUE):
  1. A `v1.3.0-rc.0` tag pushed to main triggers `.github/workflows/release.yml`; the version-PR job has no `id-token` permission and the publish job has `id-token: write` only, scoped narrowly with `environment: npm-publish` manual approval gate active.
  2. `pnpm publish` succeeds end-to-end under OIDC (no `NODE_AUTH_TOKEN` is exported in the workflow), and `npm view @fullselfbrowsing/lattice@1.3.0-rc.0` plus `npm view @fullselfbrowsing/lattice-cli@1.3.0-rc.0` both show a verifiable provenance badge linked to the exact commit SHA via Sigstore.
  3. A GitHub Release object `v1.3.0-rc.0` is created automatically on `fullselfbrowsing/Lattice` with notes sourced from `CHANGELOG.md`, and `changesets/action@v1` drove the version bump via the PR-merge pattern (not direct tag push by a human).
**Plans**: TBD

### Phase 29: First v1.3.0 Stable Publish
**Goal**: Promote the rc.0 surface to v1.3.0 stable; both packages are live on npmjs.com with provenance, and the GitHub Release object that external consumers will pin exists.
**Depends on**: Phase 28
**Requirements**: PUB-02, PUB-03, PUB-04
**Success Criteria** (what must be TRUE):
  1. `npm view @fullselfbrowsing/lattice@1.3.0` and `npm view @fullselfbrowsing/lattice-cli@1.3.0` both resolve, display the provenance badge, and ship the tarballs assembled by `tsdown` with the renamed exports surface.
  2. A GitHub Release object `v1.3.0` exists in `fullselfbrowsing/Lattice` with auto-generated notes sourced from `CHANGELOG.md`, and the release page links the npm pages for both packages.
  3. The `npm-publish` environment approval gate was exercised again for v1.3.0 (counts toward the "first 3 publishes" review window), with no manual fallback to a classic `NPM_TOKEN` at any point.
**Plans**: TBD

### Phase 30: Canary Bootstrap + Layer 1 Fake-Provider Suite
**Goal**: A standalone public consumer repo `fullselfbrowsing/lattice-canary` installs both packages from the npm registry (not the workspace) and exercises every public export type-level + runtime against the published tarballs with fake providers.
**Depends on**: Phase 29
**Requirements**: CAN-01, CAN-02, CAN-03, CAN-04, UNIT-01, UNIT-02, UNIT-03, UNIT-04, UNIT-05, UNIT-06
**Success Criteria** (what must be TRUE):
  1. Running `npm install && npm test` in the freshly-cloned `lattice-canary` repo against `@fullselfbrowsing/lattice@1.3.0` and `@fullselfbrowsing/lattice-cli@1.3.0` from the public registry passes all Layer 1 unit tests, with the resolve-path assertion as the FIRST test step confirming installation under `node_modules/@fullselfbrowsing/` (not a workspace symlink and not a `file:` link).
  2. The Layer 1 suite covers every public export from `@fullselfbrowsing/lattice` at both `tsd` type level and runtime, exercises `createAI({ providers, capabilities }).run(...)` + `ai.plan(...)` + `ai.runAgent(intent)` against fake providers, runs the hook pipeline through all three priority bands (SAFETY / OBSERVABILITY / EXTENSION) including `budgetMs` race-with-log and irreversible freeze, round-trips `createReceipt` + `verifyReceipt` with an ephemeral Ed25519 KeySet (passing valid + rejecting tampered), and round-trips `SurvivabilityAdapter` serialize → deserialize byte-equal under DSSE + JCS canonicalization.
  3. A CLI subprocess test spawns the installed `lattice` bin via `npx @fullselfbrowsing/lattice-cli` and asserts `repro` / `verify` / `eval` exit codes against fixtures, and the canary's PR + push CI workflow is green on the canary repo's main branch.
**Plans**: TBD

### Phase 31: Canary Layer 2 Real-Provider Integration + Cost Ceiling
**Goal**: A nightly cron + manual-dispatch integration suite in the canary exercises the full v1.2 surface against real OpenAI + Anthropic + Gemini APIs under a non-negotiable three-layer cost ceiling that eats Lattice's own dogfood.
**Depends on**: Phase 30
**Requirements**: INTEG-01, INTEG-02, INTEG-03, INTEG-04, INTEG-05, INTEG-06, COST-01, COST-02, COST-03, COST-04
**Success Criteria** (what must be TRUE):
  1. A manual `workflow_dispatch` of `lattice-canary` integration.yml with valid `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` secrets exercises `gpt-5-nano`, `claude-haiku-4`, and `gemini-flash-lite` end-to-end through `ai.run` and `ai.runAgent`, produces verifiable Ed25519 receipts for each, and is NEVER reachable from `pull_request` or `push` triggers (visible in the workflow YAML's `on:` block).
  2. A test deliberately setting `LATTICE_COST_CEILING_USD=0.001` causes the `SuiteCostTracker` singleton (wrapping Lattice's own `CostTracker`) to fire AFTER the in-flight request completes, emit a structured `canary.cost-ceiling.exceeded` JSON log line, throw a typed `COST_CEILING_EXCEEDED` error, set vitest `bail: 1` so the suite halts deterministically, and leaves no further requests dispatched.
  3. Real-provider scenarios run serialized (one at a time), exercise the full v1.2 surface (receipts round-trip, hook bands, agent loop with `evalAgentRun` regression-gate, survivability eviction-resume, CLI subprocess), gracefully skip via `it.skipIf(!process.env.PROVIDER_KEY)` when a key is missing for forked PRs or partial provider availability, and accumulate spend against a workflow-level monthly counter (GitHub repo variable) hard-stopping at `$100.00` per provider per calendar month.
**Plans**: TBD

### Phase 32: Cross-Repo Wiring + v1.3 Milestone Audit
**Goal**: Wire `repository_dispatch` so a Lattice publish auto-opens a refresh PR on the canary, document the one acceptable long-lived secret in `SECURITY.md`, and produce the v1.3 milestone audit confirming all 54 REQ-IDs are wired end-to-end.
**Depends on**: Phase 31
**Requirements**: DISPATCH-01, DISPATCH-02, DISPATCH-03
**Success Criteria** (what must be TRUE):
  1. Cutting a `v1.3.1` patch publish on Lattice fires a `repository_dispatch` event of type `lattice-published` with payload `{ tag, lattice_version, cli_version, commit }` at `fullselfbrowsing/lattice-canary`, and the canary's `refresh-lattice.yml` opens a PR bumping both pinned deps to the new exact versions with auto-merge enabled (gated on the Layer 1 unit suite passing — never auto-merges on red).
  2. `CANARY_DISPATCH_TOKEN` is documented in `SECURITY.md` as the one acceptable long-lived secret in the v1.3 system, scoped as a fine-grained PAT to `fullselfbrowsing/lattice-canary` only with `contents: write` + `pull-requests: write` (no other repos, no admin scope).
  3. A v1.3 milestone audit document confirms every REQ-ID has at least one observable behavior in either the Lattice repo or the canary repo, with 54/54 mapped and no orphans; the audit links the rc.0 + v1.3.0 + v1.3.1 publishes and the corresponding canary nightly runs.
**Plans**: TBD

## Risks

- **Phase 27 / Phase 28 manual-step boundary.** npmjs.com Trusted Publisher claim + binding cannot be fully automated; the plan must hand the baton to the user explicitly (FSB walks them through the npmjs.com UI), verify completion via FSB recon, and only then proceed to Phase 28's first publish. Skipping the manual verification means Phase 28's first publish surfaces the trust-tuple typo as a 403, after versions have been bumped (OIDC-4).
- **Phase 28 is highest-risk.** The first publish IS the release.yml smoke test — OIDC + provenance + GH Release auto-create cannot be dry-run against npm. Mitigation is layered: rc.0 prerelease tag absorbs failure (preserves the v1.3.0 stable slot), `environment: npm-publish` manual approval gate is active, split version-PR and publish jobs use separate `permissions:` blocks (no `id-token: write` at workflow scope — TanStack 2026 blast-radius mitigation), and every third-party action is SHA-pinned. Any non-publish job carrying `id-token: write` is a TanStack-class risk.
- **Phase 31 real-money implications.** Real-provider tests bill real dollars. Three-layer cost guards are non-negotiable: per-run `LATTICE_COST_CEILING_USD` (default $2) enforced via Lattice's own `CostTracker`, workflow-level $100/month envelope via GitHub repo variable, provider portal alerts at $30-50/month per key. Each layer catches the others' bugs. Recovery cost from a CostTracker bug + no outer guard is "spend until the bank says stop."
- **Cross-repo `CANARY_DISPATCH_TOKEN` is a deliberate long-lived secret.** OIDC does not yet span cross-repo dispatch, so a fine-grained PAT is unavoidable. Phase 32 must document boundaries in `SECURITY.md`: PAT scoped to canary repo only, `contents: write` + `pull-requests: write` only, owner-rotatable, NOT reusable elsewhere.
- **Receipt downgrade defense (CRYPTO-01) is a breaking semantic change.** Acceptable in 1.3.0 because there are no public consumers yet; would be a major-version event later. The phase must call this out in `CHANGELOG.md` and `SECURITY.md` as the defining behavior for v1.3+.
- **Five stale-name rename surfaces (RENAME-01) must move atomically.** `pnpm pack` tarball-inspection gate runs in the same commit as the rename. The publish-time `workspace:* → workspace:^` flip is the most easily-missed surface and propagates silently into the tarball if not caught (would publish a manifest referencing the unscoped `lattice` package on the registry).
- **Sigstore Rekor outage during Phase 28 / 29 publish.** Rekor has occasional 5xx windows. Workflow must not auto-retry; retries get a new patch version, not a force-republish of the same tag. Status-page pre-check in `release.yml` is conservative insurance.

## Coverage

| Category | Count | Phase |
|---|---:|---|
| RENAME | 5 | Phase 24 |
| PKG | 5 | Phase 24 |
| CI | 2 | Phase 25 |
| DOC | 5 | Phase 26 |
| CRYPTO | 1 | Phase 26 |
| ORG | 3 | Phase 27 |
| REL | 6 | Phase 28 |
| PUB-01 (rc.0) | 1 | Phase 28 |
| PUB-02..04 (stable) | 3 | Phase 29 |
| CAN | 4 | Phase 30 |
| UNIT | 6 | Phase 30 |
| INTEG | 6 | Phase 31 |
| COST | 4 | Phase 31 |
| DISPATCH | 3 | Phase 32 |
| **Total** | **54** | **9 phases** |

54 / 54 v1.3 REQ-IDs mapped. No orphans. No duplicates.

## Progress

| Milestone | Phases | Status | Completed |
| --- | --- | --- | --- |
| v1.0 | 1 to 6 | Shipped | 2026-04-22 |
| v1.1 | 7 to 13.2 | Shipped | 2026-05-12 |
| v1.2 | 14 to 23 | Shipped | 2026-05-31 |
| v1.3 | 24 to 32 | Active | — |

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 24. Atomic Scope Rename + License Hygiene | 0/0 | Not started | - |
| 25. PR-Time CI Workflow | 0/0 | Not started | - |
| 26. Release Hygiene Docs + Receipt Downgrade Defense | 0/0 | Not started | - |
| 27. npm Org + Trusted Publisher Setup | 0/0 | Not started | - |
| 28. Release Workflow + rc.0 OIDC Smoke | 0/0 | Not started | - |
| 29. First v1.3.0 Stable Publish | 0/0 | Not started | - |
| 30. Canary Bootstrap + Layer 1 Fake-Provider Suite | 0/0 | Not started | - |
| 31. Canary Layer 2 Real-Provider Integration + Cost Ceiling | 0/0 | Not started | - |
| 32. Cross-Repo Wiring + v1.3 Milestone Audit | 0/0 | Not started | - |
