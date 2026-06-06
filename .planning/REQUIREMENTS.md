# Lattice v1.3 Requirements — Public Release + Canary Validation

**Milestone:** v1.3
**Goal:** Cut Lattice's first public npm release under `@fullselfbrowsing/*` with OIDC Trusted Publisher + provenance attestations, then prove correctness end-to-end via a separately-repo'd canary consumer that exercises the public API against real providers.

**Phase numbering:** Continues from v1.2 (last phase 23). v1.3 spans **Phases 24-32**.

**Source:** Scope locked in conversation 2026-06-03; cross-referenced against `.planning/research/SUMMARY.md` and per-dimension research (STACK / FEATURES / ARCHITECTURE / PITFALLS).

---

## v1 Requirements

### Scope Rename (`RENAME-*`)

- [ ] **RENAME-01**: `packages/lattice/package.json#name` updated from `lattice` to `@fullselfbrowsing/lattice` in a single atomic commit covering every stale-name surface (workspace dep, tsd paths, examples imports, pre-seeded CHANGELOG)
- [ ] **RENAME-02**: `packages/lattice-cli/package.json#name` updated from `lattice-cli` to `@fullselfbrowsing/lattice-cli`; `bin: { lattice }` preserved so user-facing command is unchanged
- [ ] **RENAME-03**: `packages/lattice-cli/package.json#dependencies` updated from `"lattice": "workspace:*"` to `"@fullselfbrowsing/lattice": "workspace:^"` (the `*` to `^` flip prevents CLI users being pinned to a single patch of the core)
- [ ] **RENAME-04**: `packages/lattice/tsd` paths map updated to point at new scope; `pnpm test:types` passes for both packages
- [ ] **RENAME-05**: `pnpm pack` tarball inspection gate confirms both tarballs carry the renamed surface end-to-end (name, deps, exports, types)

### Package Hygiene (`PKG-*`)

- [ ] **PKG-01**: `"license": "MIT"` added to root, `packages/lattice`, and `packages/lattice-cli` `package.json`
- [ ] **PKG-02**: `"repository"`, `"bugs"`, `"homepage"` metadata added to both publishable packages (required for npm provenance to render correctly)
- [ ] **PKG-03**: `"publishConfig": { "access": "public" }` added to both publishable packages
- [ ] **PKG-04**: Root `package.json#private: true` preserved; only publishable packages are flipped public (prevents `.planning/` and internal scripts from leaking)
- [ ] **PKG-05**: `publint` and `arethetypeswrong/cli` (already wired via `pnpm -r lint:packages`) pass clean on both publishable packages under PR-time CI

### Release Docs + Hygiene (`DOC-*`)

- [x] **DOC-01**: `CONTRIBUTING.md` added at repo root with contribution flow, codeowner notes, and commit conventions
- [x] **DOC-02**: `SECURITY.md` added at repo root with CVE disclosure address, Ed25519 entropy-source assumptions, signing-key rotation guidance, receipt downgrade defense documentation
- [x] **DOC-03**: `CHANGELOG.md` auto-managed by changesets (already installed); seeded with v1.0 / v1.1 / v1.2 history retrospectively
- [x] **DOC-04**: Initial changeset created seeding v1.3.0 release notes
- [x] **DOC-05**: `README.md` updated with install instructions (`@fullselfbrowsing/lattice`), npm + provenance + license badges, and provenance verification example

### Receipt Crypto Defense (`CRYPTO-*`)

- [x] **CRYPTO-01**: `verifyReceipt` enforces minimum `schemaVersion >= 1.1` signed into the canonical bytes; new `VerifyResult` error kind `schema-version-too-low`; receipt-downgrade attack documented in `SECURITY.md` (Radicle 2026-03 precedent)

### PR-Time CI (`CI-*`)

- [ ] **CI-01**: `.github/workflows/ci.yml` runs install (pnpm) + typecheck + test + `pnpm -r lint:packages` (publint + attw) on every PR and push to main
- [ ] **CI-02**: All third-party actions in `ci.yml` pinned by 40-character commit SHA (TanStack May 2026 OIDC compromise mitigation)

### Release Workflow (`REL-*`)

- [ ] **REL-01**: `.github/workflows/release.yml` split into TWO jobs with separate `permissions:` blocks — version-PR job (no `id-token`) and publish job (`id-token: write` only, scoped narrowly)
- [ ] **REL-02**: `changesets/action@v1` drives version bumps via the PR pattern (not direct tag push)
- [ ] **REL-03**: `pnpm publish` succeeds for both packages end-to-end under OIDC (no long-lived `NPM_TOKEN`)
- [ ] **REL-04**: Provenance attestations auto-attached under OIDC and verifiable on npmjs.com (provenance badge displays)
- [ ] **REL-05**: GitHub Release object created automatically per published version with auto-generated notes sourced from `CHANGELOG.md`
- [ ] **REL-06**: `environment: npm-publish` manual approval gate active for first 3 publishes (review-after-3-publishes decision deferred)

### npm Org + OIDC Trusted Publisher (`ORG-*`)

- [ ] **ORG-01**: `@fullselfbrowsing` npm organization claimed (organization tier, free for public packages); user-driven via FSB at execution time
- [ ] **ORG-02**: Trusted Publisher binding configured on npmjs.com for `@fullselfbrowsing/lattice` and `@fullselfbrowsing/lattice-cli` — trust tuple `(repo: fullselfbrowsing/Lattice, workflow_filename: release.yml, environment: npm-publish)`
- [ ] **ORG-03**: GitHub Environment `npm-publish` created in `fullselfbrowsing/Lattice` with required reviewers configured

### Publishing (`PUB-*`)

- [ ] **PUB-01**: `@fullselfbrowsing/lattice@1.3.0-rc.0` and `@fullselfbrowsing/lattice-cli@1.3.0-rc.0` published end-to-end via OIDC + provenance — first publish IS the smoke test (rc.0 surface so v1.3.0 slot is preserved)
- [ ] **PUB-02**: `@fullselfbrowsing/lattice@1.3.0` stable published with verifiable provenance attestation
- [ ] **PUB-03**: `@fullselfbrowsing/lattice-cli@1.3.0` stable published with verifiable provenance attestation
- [ ] **PUB-04**: GitHub Release object `v1.3.0` created in `fullselfbrowsing/Lattice` with auto-generated notes

### Canary Repo Bootstrap (`CAN-*`)

- [ ] **CAN-01**: Public repo `fullselfbrowsing/lattice-canary` created with TypeScript scaffolding (tsconfig, vitest, tsx, package.json, README, LICENSE MIT)
- [ ] **CAN-02**: Canary uses `npm install` (NOT `pnpm install`) with exact-version pin on `@fullselfbrowsing/lattice` and `@fullselfbrowsing/lattice-cli` — validates lowest-common-denominator install path
- [ ] **CAN-03**: Resolve-path assertion runs as the FIRST test step: asserts resolved package path lives under `node_modules/@fullselfbrowsing/` and version matches the lockfile (defense against workspace-symlink leak)
- [ ] **CAN-04**: Canary CI workflow runs unit suite on every PR + push to canary's main

### Canary Layer 1 — Fake Providers (`UNIT-*`)

- [ ] **UNIT-01**: Every public export from `@fullselfbrowsing/lattice` imported and asserted at both type level (`tsd`) and runtime against the published tarball
- [ ] **UNIT-02**: Fake-provider exercises `createAI({ providers, capabilities }).run(...)`, `ai.plan(...)`, and `ai.runAgent(intent)` end-to-end producing the documented `RunSuccess` / `RunFailure` / agent result shapes
- [ ] **UNIT-03**: Hook pipeline exercised with all three priority bands (`SAFETY`, `OBSERVABILITY`, `EXTENSION`) including `budgetMs` race-with-log behavior and irreversible freeze
- [ ] **UNIT-04**: `createReceipt` + `verifyReceipt` round-trip with ephemeral Ed25519 KeySet succeeds end-to-end and rejects a deliberately-tampered receipt
- [ ] **UNIT-05**: `SurvivabilityAdapter` serialize → deserialize round-trip byte-equal under DSSE + JCS canonicalization with real Ed25519 signer
- [ ] **UNIT-06**: CLI subprocess test spawns the installed `lattice` bin via `npx @fullselfbrowsing/lattice-cli` and asserts `repro` / `verify` / `eval` exit codes against fixtures

### Canary Layer 2 — Real Providers (`INTEG-*`)

- [ ] **INTEG-01**: OpenAI integration test using `gpt-5-nano` (cheapest competent model) hits real API end-to-end and produces a verifiable receipt
- [ ] **INTEG-02**: Anthropic integration test using `claude-haiku-4` (cheapest competent model) hits real API end-to-end and produces a verifiable receipt
- [ ] **INTEG-03**: Gemini integration test using `gemini-flash-lite` (cheapest competent model) hits real API end-to-end and produces a verifiable receipt
- [ ] **INTEG-04**: Real-provider tests gated to nightly cron (06:00 UTC) + manual `workflow_dispatch` with cost-ceiling override input; NEVER triggered on PR or push
- [ ] **INTEG-05**: `it.skipIf(!process.env.PROVIDER_KEY)` graceful skip when an expected key is missing (forked PRs, partial provider availability)
- [ ] **INTEG-06**: Real-provider tests exercise the full v1.2 surface: receipts round-trip, hook bands, agent loop with `evalAgentRun` regression gate, survivability eviction-resume, CLI subprocess

### Cost Ceiling (`COST-*`)

- [ ] **COST-01**: `SuiteCostTracker` singleton wraps Lattice's own `CostTracker` (eats own dogfood); reads `LATTICE_COST_CEILING_USD` env var; default ceiling `$2.00` per run
- [ ] **COST-02**: Workflow-level monthly cost counter tracked in canary GitHub repo variable; hard-stop at `$100.00` per provider per calendar month envelope
- [ ] **COST-03**: Cost ceiling guard fires AFTER the current in-flight request completes — no prepaid spend wasted; subsequent requests abort cleanly with structured error
- [ ] **COST-04**: Cost-ceiling violation emits structured JSON log AND throws a typed error AND sets `vitest --bail 1` so the suite halts deterministically

### Cross-Repo Wiring (`DISPATCH-*`)

- [ ] **DISPATCH-01**: Lattice `release.yml` final step fires `lattice-published` `repository_dispatch` event with payload `{ tag, lattice_version, cli_version, commit }` to `fullselfbrowsing/lattice-canary`
- [ ] **DISPATCH-02**: Canary `refresh-lattice.yml` listens for `lattice-published` event, bumps both deps to the new exact versions, opens a PR with auto-merge enabled (subject to canary unit suite passing)
- [ ] **DISPATCH-03**: `CANARY_DISPATCH_TOKEN` configured as fine-grained PAT scoped to `fullselfbrowsing/lattice-canary` only with `contents: write` + `pull-requests: write`; documented in `SECURITY.md` as the one acceptable long-lived secret

---

## Total Requirements

**54 REQ-IDs** across **13 categories** mapped to **Phases 24-32** (9 phases).

| Category | Count | Phase target |
|---|---:|---|
| RENAME | 5 | Phase 24 |
| PKG | 5 | Phase 24 |
| DOC | 5 | Phase 26 |
| CRYPTO | 1 | Phase 26 |
| CI | 2 | Phase 25 |
| REL | 6 | Phase 28 |
| ORG | 3 | Phase 27 |
| PUB | 4 | Phase 28 / 29 |
| CAN | 4 | Phase 30 |
| UNIT | 6 | Phase 30 |
| INTEG | 6 | Phase 31 |
| COST | 4 | Phase 31 |
| DISPATCH | 3 | Phase 32 |

---

## Future Requirements (deferred to v1.4)

Carried over from v1.2 close-out. Out of scope for v1.3 to keep the first public release narrow.

- Native tool-use across providers via an additive `ProviderAdapter` extension that preserves the INV-03 7-provider parity contract
- `lattice eval --agent` CLI subcommand wrapping the existing `evalAgentRun` kernel
- Multi-scenario agent-loop showcase (tripwire / stall / budget-exceeded variants)
- KMS adapter shapes for `ReceiptSigner`
- Lineage merkle root signed inside receipts
- `lattice receipt diff` subcommand
- OpenTelemetry exporter for `RunEventKind`
- Streaming for the 5 new Phase 17 provider adapters (Anthropic / Gemini / xAI / OpenRouter / LM Studio)
- OpenRouter multi-model routing / fallback array
- LM Studio latency-tail diagnostics module
- Anthropic / Gemini multimodal request shaping
- Verdaccio pre-publish CI gate (defer to v1.3.1 if not in v1.3 budget)

---

## Out of Scope

- **Multi-agent crews / parent-child loop frameworks** — v1.2 opened single-agent execution only; multi-agent stays out of scope.
- **Hosted control plane** — v1.3 ships the runtime SDK on npm; hosted infrastructure is not in scope.
- **Graph DSL** — Lattice's design principle is to feel smaller than orchestration frameworks; graph builders are out of scope.
- **Building 100 custom provider adapters** — 7 adapters shipped in v1.2 cover the parity contract; new providers wait for consumer ask.
- **Frontend hook library at the core** — UI bindings may exist as siblings, but the core bet is the runtime.
- **Opaque AI-selected routing** — routing stays deterministic and inspectable.
- **Long-lived `NPM_TOKEN`** — OIDC Trusted Publisher is the only sanctioned auth path; classic tokens reserved for emergency fallback only.
- **PR-time real-provider tests** — flake + cost concerns; nightly + manual dispatch only.
- **Unscoped `lattice` name claim** — `@fullselfbrowsing` scope is the identity; deferred unscoped-redirect stub is v1.4+.
- **Auto-merge of canary refresh PR without unit-suite gate** — canary PR only auto-merges if Layer 1 passes; never auto-merges on red.

---

## Traceability

Each REQ-ID maps to exactly one phase. Plan placeholders (`TBD`) will be filled by `/gsd-plan-phase` for each phase.

| REQ-ID | Phase | Plan | Status |
|---|---|---|---|
| RENAME-01 | Phase 24 | TBD | pending |
| RENAME-02 | Phase 24 | TBD | pending |
| RENAME-03 | Phase 24 | TBD | pending |
| RENAME-04 | Phase 24 | TBD | pending |
| RENAME-05 | Phase 24 | TBD | pending |
| PKG-01 | Phase 24 | TBD | pending |
| PKG-02 | Phase 24 | TBD | pending |
| PKG-03 | Phase 24 | TBD | pending |
| PKG-04 | Phase 24 | TBD | pending |
| PKG-05 | Phase 24 | TBD | pending |
| CI-01 | Phase 25 | TBD | pending |
| CI-02 | Phase 25 | TBD | pending |
| DOC-01 | Phase 26 | TBD | pending |
| DOC-02 | Phase 26 | TBD | pending |
| DOC-03 | Phase 26 | TBD | pending |
| DOC-04 | Phase 26 | TBD | pending |
| DOC-05 | Phase 26 | TBD | pending |
| CRYPTO-01 | Phase 26 | TBD | pending |
| ORG-01 | Phase 27 | TBD | pending |
| ORG-02 | Phase 27 | TBD | pending |
| ORG-03 | Phase 27 | TBD | pending |
| REL-01 | Phase 28 | TBD | pending |
| REL-02 | Phase 28 | TBD | pending |
| REL-03 | Phase 28 | TBD | pending |
| REL-04 | Phase 28 | TBD | pending |
| REL-05 | Phase 28 | TBD | pending |
| REL-06 | Phase 28 | TBD | pending |
| PUB-01 | Phase 28 | TBD | pending |
| PUB-02 | Phase 29 | TBD | pending |
| PUB-03 | Phase 29 | TBD | pending |
| PUB-04 | Phase 29 | TBD | pending |
| CAN-01 | Phase 30 | TBD | pending |
| CAN-02 | Phase 30 | TBD | pending |
| CAN-03 | Phase 30 | TBD | pending |
| CAN-04 | Phase 30 | TBD | pending |
| UNIT-01 | Phase 30 | TBD | pending |
| UNIT-02 | Phase 30 | TBD | pending |
| UNIT-03 | Phase 30 | TBD | pending |
| UNIT-04 | Phase 30 | TBD | pending |
| UNIT-05 | Phase 30 | TBD | pending |
| UNIT-06 | Phase 30 | TBD | pending |
| INTEG-01 | Phase 31 | TBD | pending |
| INTEG-02 | Phase 31 | TBD | pending |
| INTEG-03 | Phase 31 | TBD | pending |
| INTEG-04 | Phase 31 | TBD | pending |
| INTEG-05 | Phase 31 | TBD | pending |
| INTEG-06 | Phase 31 | TBD | pending |
| COST-01 | Phase 31 | TBD | pending |
| COST-02 | Phase 31 | TBD | pending |
| COST-03 | Phase 31 | TBD | pending |
| COST-04 | Phase 31 | TBD | pending |
| DISPATCH-01 | Phase 32 | TBD | pending |
| DISPATCH-02 | Phase 32 | TBD | pending |
| DISPATCH-03 | Phase 32 | TBD | pending |

**Coverage:** 54 / 54 v1.3 REQ-IDs mapped. No orphans. No duplicates.

---

*Created: 2026-06-03 — Milestone v1.3 (Public Release + Canary Validation) opened*
*Traceability filled: 2026-06-03 — by gsd-roadmapper during v1.3 roadmap creation*
