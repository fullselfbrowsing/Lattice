# Project Research Summary

**Project:** Lattice v1.3 — First Public npm Release + External Canary Validation
**Domain:** TypeScript SDK distribution (npm trusted-publishing pipeline + external consumer repo for cryptographic-primitive library)
**Researched:** 2026-06-03
**Confidence:** HIGH on publish pipeline / OIDC / scope rename; MEDIUM on canary cost-control specifics and crypto-shipping defenses

## Executive Summary

Lattice v1.3 is a distribution milestone, not a product milestone. Two publishable workspaces (`packages/lattice` and `packages/lattice-cli`) sit at version `0.0.0` with no `license` field, no `.github/workflows/`, and a contested unscoped `lattice` package name. Research converged on a single critical-path spine: scope rename to `@fullselfbrowsing/*` → PR-time CI scaffolding → first publish (likely via `v1.3.0-rc.N` tags to smoke-test OIDC without burning the `v1.3.0` slot) → npmjs.com Trusted Publisher attach → separate `lattice-canary` consumer repo → real-provider integration tests gated to nightly cron and manual dispatch. Everything else fans out around that spine.

The recommended approach is to lean on tooling already installed (changesets, publint, arethetypeswrong, tsd, tsdown) rather than introduce new build infrastructure, and to copy the canary pattern from `openai/openai-agents-js` (the closest comparable TypeScript-first SDK that ships cryptographic primitives and uses Verdaccio + Vitest for pre-publish smoke testing). The canary lives in a separate public repo, installs from the registry with **npm** (not pnpm) to validate the lowest-common-denominator install path, pins exact versions, and exercises receipts + hook bands + agent loop + CLI subprocess against the real published tarball.

The largest risk is supply-chain compromise of the first OIDC workflow. The TanStack May 2026 incident (42 packages, 84 malicious versions published via a misconfigured OIDC workflow) is the exact failure mode v1.3 must defend against, requiring job-scope `id-token: write`, no `pull_request_target`, action SHA pinning, and split version/publish jobs with separate permissions. The second-largest risk is real-provider cost runaway in the canary; three independent layers (per-run Lattice `CostTracker`, per-month workflow guard, per-key provider portal alerts) are non-negotiable. A third risk surfaced is a receipt-downgrade attack against `verifyReceipt` (currently accepts any `schemaVersion`); v1.3 must sign minimum version into the canonical bytes and reject downgrades.

## Key Findings

### Recommended Stack

No new dependencies are needed in the Lattice repo itself. Everything publish-related is already in the workspace: changesets 2.31.0, publint 0.3.18, @arethetypeswrong/cli 0.18.2, tsd 0.33.0, tsdown 0.21.9. The v1.3 work is workflow YAML, `package.json` field additions, and a separate canary repo, not `npm install` lines. See `STACK.md` for full version pins.

**Core technologies (already installed):**
- changesets@2.31.0 — version bumping + CHANGELOG generation, drives release-PR pattern
- publint@0.3.18 — catches `exports` / `files` / `main` packaging bugs only visible to external consumers
- @arethetypeswrong/cli@0.18.2 — catches dual-package hazard, types resolution issues
- tsd@0.33.0 — type-level assertion harness; needs `paths` map update after scope rename
- tsdown@0.21.9 — already produces ESM-only output with proper `dist/` layout

**New GitHub Action versions (verified for 2026):**
- actions/checkout@v5
- actions/setup-node@v4 (with `cache: 'pnpm'`)
- pnpm/action-setup@v4 (must run BEFORE setup-node)
- changesets/action@v1 (latest 1.9.0)
- Pin third-party actions by 40-char commit SHA (PITFALLS OIDC-1 mitigation)

**Canary repo dependencies (separate repo):**
- openai@^6.41.0
- @anthropic-ai/sdk@^0.100.0
- @google/genai@^2.7.0 (NOT `@google/generative-ai` which was deprecated 2025-11-30)
- @fullselfbrowsing/lattice + @fullselfbrowsing/lattice-cli installed from registry (exact-version pin)
- vitest, tsx, typescript

**Critical pre-publish flips:**
- `packages/lattice/package.json#name`: `lattice` → `@fullselfbrowsing/lattice`
- `packages/lattice-cli/package.json#name`: `lattice-cli` → `@fullselfbrowsing/lattice-cli`
- `packages/lattice-cli/package.json#dependencies`: `"lattice": "workspace:*"` → `"@fullselfbrowsing/lattice": "workspace:^"` (the `*` to `^` flip is non-obvious and pins published consumers to a single patch otherwise)
- Add `"license": "MIT"` to root + both publishable packages
- Add `"repository"`, `"bugs"`, `"homepage"` to both publishable packages (required for provenance to render)
- Keep root `package.json#private: true`; only publishable packages flip public

### Expected Features

**Must have (table stakes — every comparable library does this):**
- Scoped publishing under a claimed org (`@fullselfbrowsing/*`)
- MIT `license` field on every publishable `package.json`
- `repository` / `bugs` / `homepage` metadata (required for npm provenance display)
- CHANGELOG.md generated by changesets
- Provenance attestations enabled (free with OIDC; visible as npm badge)
- Tag-driven release workflow with changesets Version-PR pattern
- README badges (npm version, provenance, license, build status)
- GitHub Release object created automatically per published version

**Should have (competitive differentiators):**
- OIDC Trusted Publisher (preferred over long-lived `NPM_TOKEN`, signals supply-chain seriousness)
- Pre-publish Verdaccio dry-run (pattern from openai-agents-js; defer to v1.3.1 if time-boxed)
- `rc.N` prerelease channel for first publish to smoke-test OIDC without burning `v1.3.0`
- Manual approval gate via GitHub Environment (`npm-publish`) for first 3 publishes
- External canary consumer repo with two test layers (fake-provider unit + real-provider integration)
- Three-layer cost ceiling (Lattice `CostTracker` + workflow-level monthly + provider portal alerts)
- `repository_dispatch` cross-repo wiring so canary auto-bumps on Lattice publish (one fine-grained PAT acceptable)
- `it.skipIf(!process.env.PROVIDER_KEY)` graceful key-missing fallback for forked PRs

**Defer (v1.4+):**
- Native tool-use across providers via additive `ProviderAdapter` extension
- `lattice eval --agent` CLI subcommand
- Multi-scenario agent-loop showcase variants
- KMS adapter shapes for `ReceiptSigner`
- Lineage merkle root signed inside receipts
- `lattice receipt diff` subcommand
- OpenTelemetry exporter
- Streaming for Phase 17 provider adapters
- OpenRouter multi-model routing
- LM Studio latency-tail diagnostics
- Anthropic / Gemini multimodal request shaping
- Verdaccio pre-publish CI gate (defer to v1.3.1 if not in budget)

### Architecture Approach

Distribution architecture is additive over the existing monorepo, governed by a single dependency-direction chain: rename must land atomically before CI scaffolding because tests + publint validate the new names; CI must exist before the release workflow because the release workflow's filename is part of npm's trust tuple; the OIDC binding must be claimed before the first publish; the first publish must exist before the canary can install from the registry. Cross-repo wiring uses `repository_dispatch` from Lattice's release workflow to the canary's refresh workflow.

**Major components (new in v1.3):**
1. **Scope-renamed packages** — `@fullselfbrowsing/lattice` + `@fullselfbrowsing/lattice-cli`, atomic rename PR covering 5 stale-name surfaces (package `name`, `workspace:*` dep, tsd `paths` map, examples imports, pre-seeded CHANGELOG entries)
2. **`.github/workflows/ci.yml`** — PR-time: install + typecheck + test + lint:packages (publint + attw) across both packages; runs against renamed surface
3. **`.github/workflows/release.yml`** — Split into TWO jobs with separate permissions: version-PR job (no `id-token`) + publish job (`id-token: write` only, scoped narrowly). Tag-triggered or changesets-PR-merge-triggered. Calls `pnpm publish` for both packages with provenance auto-attached under OIDC.
4. **npmjs.com Trusted Publisher binding** — user-driven manual setup. Bind `(repo: fullselfbrowsing/Lattice, workflow_filename: release.yml, environment: npm-publish)` to scope `@fullselfbrowsing`. The trust tuple has three pieces and missing any one silently fails.
5. **GitHub Environment `npm-publish`** — manual approval gate for first 3 publishes, removable after confidence is high
6. **`fullselfbrowsing/lattice-canary` repo** — standalone TypeScript project, `npm install` (NOT pnpm), installs `@fullselfbrowsing/lattice@1.3.0` + `@fullselfbrowsing/lattice-cli@1.3.0` from registry with exact version pins
7. **Canary Layer 1 (`test/unit/`)** — fake providers, every public export imported + asserted, type-level `tsd` checks, runs on canary PR
8. **Canary Layer 2 (`test/integration/`)** — real providers (OpenAI + Anthropic + Gemini cheapest competent models: gpt-5-nano, claude-haiku-4, gemini-flash-lite), receipts round-trip, hook bands, agent loop with `evalAgentRun`, survivability serialize-deserialize, CLI subprocess via spawned `lattice` bin
9. **`SuiteCostTracker` singleton** — wraps Lattice's own `CostTracker`, reads `LATTICE_COST_CEILING_USD` env (default $2/run), fires structured JSON log + thrown error + vitest `bail: 1` when ceiling crossed. Guard fires AFTER current request completes (no in-flight wasted spend).
10. **Workflow-level monthly cost guard** — independent of Lattice runtime; tracks cumulative spend per month per provider via GitHub repo variable, hard-stops at `$100/month` envelope
11. **`refresh-lattice.yml` in canary** — listens for `lattice-published` `repository_dispatch` event, bumps deps, opens a PR. Requires one long-lived `CANARY_DISPATCH_TOKEN` (fine-grained PAT) — the only secret that can't be OIDC.
12. **`SECURITY.md` in Lattice repo** — documents receipt downgrade defense (minimum `schemaVersion` enforcement), Ed25519 entropy assumptions, CVE disclosure address, signing-key rotation guidance

**Phase dependency chain (forced by research, not preference):**
```
[1] Atomic scope rename
        ↓
[2] PR-time ci.yml (validates rename in CI for first time)
        ↓
[3] Release-hygiene metadata + SECURITY.md (license, repository, bugs, downgrade defense)
        ↓
[4] npm org claim + Trusted Publisher binding (user-driven via FSB)
        ↓
[5] release.yml with rc.0 throwaway publish (smoke-tests OIDC + provenance)
        ↓
[6] First v1.3.0 publish + GitHub Release object
        ↓
[7] Canary repo scaffolding (CAN parallelize with [5]/[6] scaffolding-only; integration deferred)
        ↓
[8] Canary Layer 1 (fake-provider unit tests against published tarball)
        ↓
[9] Canary Layer 2 (real-provider integration + 3-layer cost ceiling)
        ↓
[10] v1.3 audit + GitHub Release polish
```

### Critical Pitfalls

1. **OIDC supply-chain compromise (PITFALLS OIDC-1, HIGH severity).** TanStack May 2026 incident published 42 packages with 84 malicious versions via misconfigured workflow. Mitigation: job-scope `id-token: write` only on publish job (never workflow-level), no `pull_request_target` triggers, all third-party actions pinned by 40-char SHA, split version-PR and publish jobs with separate `permissions:` blocks, `environment: npm-publish` approval gate.

2. **Atomic scope rename across 5 stale-name surfaces (RENAME-1).** pnpm silently resolves workspace symlinks locally, hiding bugs that only surface in the published tarball. Surfaces: (a) `name` in both `package.json`, (b) `workspace:*` → `workspace:^` dep flip in lattice-cli, (c) `tsd.compilerOptions.paths` map, (d) every `examples/**` import, (e) pre-seeded CHANGELOG entries. Mitigation: single atomic PR with `pnpm pack` tarball-inspection gate + grep-based rename-verifier script.

3. **Cost runaway in canary nightly (REAL-1).** Single-layer guards have failure modes: Lattice's `CostTracker` ceiling can be bypassed by a bug in usage normalization, workflow guards can drift from real spend, provider portal alerts have lag. Mitigation: three independent layers — Lattice `CostTracker` ($2/run hard ceiling, fires after current request completes), workflow-level monthly counter ($100/month envelope tracked in repo variable), provider portal alerts ($30-50/month per key). Each catches the others' bugs.

4. **Receipt downgrade attack (CRYPTO-1).** `verifyReceipt` currently accepts any `schemaVersion`. An attacker who controls a stored receipt can downgrade it to a weaker version. Mitigation: sign minimum `schemaVersion >= 1.1` into the canonical bytes, add new `VerifyResult` error kind `schema-version-too-low`, document in `SECURITY.md`. Cite Radicle 2026-03 disclosure as precedent.

5. **Canary workspace-symlink leak (CANARY-1).** If the canary uses `file:../lattice` or `pnpm link` for convenience, it tests workspace symlinks not the published tarball — defeating the entire canary's purpose. Mitigation: hard rule that canary installs from registry only with exact-version pin, runtime resolve-path assertion in canary CI as the FIRST test step (assert resolved path lives under `node_modules/@fullselfbrowsing/` with version matching the lockfile).

6. **First-publish-with-OIDC chicken-and-egg (FEATURES Open Q + ARCH first-publish-IS-smoke).** OIDC cannot be dry-run; the first publish IS the smoke test. Mitigations layered: (a) publish `v1.3.0-rc.0` first via OIDC to surface misconfig with a throwaway tag, (b) keep one-time classic NPM token in reserve for emergency fallback, (c) `environment: npm-publish` manual approval gate, (d) pre-create empty package shells via classic token if the OIDC-only first publish path fails (the "claim then trust" pattern from npm docs).

7. **Trusted Publisher tuple misconfig (OIDC-2).** Trust is keyed on `(repo, workflow_filename, environment)` — missing any one or having a typo silently degrades the publish (no provenance) or fails it (no token). The workflow filename in npm config must match `release.yml` exactly. Mitigation: configure binding before first publish, verify with a deliberate test in rc.0.

## Implications for Roadmap

Based on consensus across STACK + FEATURES + ARCHITECTURE + PITFALLS, the suggested phase structure is:

### Phase 24: Atomic Scope Rename + License Hygiene
**Rationale:** Hard dependency direction — nothing downstream can land first. Five stale-name surfaces must move atomically (PITFALLS RENAME-1).
**Delivers:** Both packages renamed to `@fullselfbrowsing/*`, `workspace:* → workspace:^` flip, `license: "MIT"` on all package.jsons, `repository`/`bugs`/`homepage` added (required for provenance display), tsd `paths` map updated, all examples + tests pass.
**Addresses:** Stack scope-rename critical-path block, Features "scope claim on npmjs.com" must-have
**Avoids:** RENAME-1 atomic-update failure, publint/attw regressions on first publish

### Phase 25: PR-Time CI Workflow Scaffold
**Rationale:** No `.github/workflows/` exists currently. CI must validate the renamed surface before the release workflow does anything irreversible. Pure additive change with no runtime risk.
**Delivers:** `.github/workflows/ci.yml` with install + typecheck + test + `pnpm -r lint:packages` (which runs publint + attw + tsd). Triggers on PR + push to main. Action SHAs pinned.
**Uses:** Stack-confirmed action versions (checkout@v5, setup-node@v4, pnpm/action-setup@v4)
**Implements:** Architecture component (2) PR-time CI
**Avoids:** OIDC-1 partial mitigation via action SHA pinning

### Phase 26: Release Hygiene Metadata + SECURITY.md
**Rationale:** Required before first publish: provenance won't render without `repository`, scoped-public packages need explicit publish access config, and the receipt downgrade defense (CRYPTO-1) couples naturally to SECURITY.md authoring.
**Delivers:** Per-package `publishConfig.access: "public"`, `CONTRIBUTING.md`, `SECURITY.md` (with downgrade-attack section + CVE disclosure address + Ed25519 entropy notes), seed changeset for v1.3.0, README badges placeholder, `verifyReceipt` schema-version enforcement (new error kind `schema-version-too-low`).
**Addresses:** Features "MIT license field", "repository metadata", "SECURITY.md"
**Avoids:** CRYPTO-1 receipt downgrade attack

### Phase 27: npm Org + Trusted Publisher Setup (User-Driven via FSB)
**Rationale:** Manual npmjs.com UI work. Must precede first publish so the trust tuple `(repo, workflow_filename, environment)` exists when release.yml fires.
**Delivers:** `@fullselfbrowsing` scope claimed (organization tier, free for public packages), `npm-publish` GitHub Environment created with manual approval, Trusted Publisher binding configured on `@fullselfbrowsing/lattice` and `@fullselfbrowsing/lattice-cli` stubs (or via stub publish + bind), entropy verification of OIDC tuple by deliberate misconfig test on rc.0.
**Addresses:** Features "OIDC Trusted Publisher"
**Avoids:** OIDC-2 trust-tuple misconfig

### Phase 28: Release Workflow + rc.0 OIDC Smoke
**Rationale:** First publish IS the release.yml smoke test (Architecture). Use `v1.3.0-rc.0` to validate OIDC + provenance + GH Release auto-create without burning the v1.3.0 slot.
**Delivers:** `.github/workflows/release.yml` with split version-PR job + publish job, separate permissions blocks, OIDC token mint scoped to publish job, changesets/action@v1 driving version bumps, GH Release auto-creation, provenance attestations attached (verifiable on npmjs.com badge). rc.0 publish succeeds end-to-end with verifiable provenance.
**Uses:** Stack versions, OIDC-1 split-jobs mitigation
**Implements:** Architecture component (3)
**Avoids:** OIDC-1 supply-chain compromise, OIDC-2 tuple misconfig (via rc.0 catch)

### Phase 29: First v1.3.0 Stable Publish
**Rationale:** Once rc.0 is green, promote to v1.3.0. This is what external consumers will pin.
**Delivers:** `@fullselfbrowsing/lattice@1.3.0` + `@fullselfbrowsing/lattice-cli@1.3.0` published with provenance, GH Release object with auto-generated notes from CHANGELOG.md, README updated with install + verify-provenance instructions, npm package page polished.
**Addresses:** Features "first publish + Release object"

### Phase 30: Canary Repo Bootstrap + Layer 1 (Fake-Provider Unit Suite)
**Rationale:** Canary scaffolding can be drafted in parallel with Phase 28-29 (no registry dependency for repo setup itself), but the unit tests that install from the registry need at least rc.0 to exist. Layer 1 is fake-provider only, no API keys required, runs PR-time.
**Delivers:** New public repo `fullselfbrowsing/lattice-canary`, `package.json` with `npm install` (not pnpm), exact-version pin on `@fullselfbrowsing/lattice` + `@fullselfbrowsing/lattice-cli`, vitest + tsx + tsconfig scaffolding, `test/unit/` exercises every public export type+runtime against the published tarball with fake providers, resolve-path assertion as first test step (verifies install from registry, not symlink), canary CI on PR + push.
**Uses:** Stack-confirmed openai-agents-js scaffolding pattern
**Implements:** Architecture components (6), (7), (8)
**Avoids:** CANARY-1 workspace-symlink leak

### Phase 31: Canary Layer 2 (Real-Provider Integration + 3-Layer Cost Ceiling)
**Rationale:** Real-provider tests cannot run on PR (cost + flake). Gated to nightly cron + manual dispatch with `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` as canary repo secrets. Three-layer cost ceiling protects against runaway.
**Delivers:** `test/integration/` covering receipts round-trip with ephemeral Ed25519, hook bands with all 3 priority bands (SAFETY/OBSERVABILITY/EXTENSION), agent loop with `evalAgentRun` regression-gate, survivability serialize-deserialize round-trip, CLI subprocess via spawned `lattice` bin, all against cheapest competent models (gpt-5-nano, claude-haiku-4, gemini-flash-lite). `SuiteCostTracker` singleton with `LATTICE_COST_CEILING_USD` env (default $2/run), workflow-level monthly guard ($100 envelope tracked in repo variable), provider portal alerts noted in canary README. Nightly cron at 06:00 UTC + workflow_dispatch trigger with cost-ceiling override input. `it.skipIf(!process.env.PROVIDER_KEY)` graceful skip for forked PRs.
**Uses:** Lattice's own `CostTracker` (eats own dogfood)
**Implements:** Architecture components (9), (10), (11)
**Avoids:** REAL-1 cost runaway across all three layers

### Phase 32: v1.3 Milestone Audit + Cross-Repo Wiring Polish
**Rationale:** Verifies coverage end-to-end and wires the `repository_dispatch` automation between Lattice and canary.
**Delivers:** `repository_dispatch` event fired from Lattice release.yml to canary on each publish, `refresh-lattice.yml` in canary auto-bumps deps + opens PR, `CANARY_DISPATCH_TOKEN` configured as fine-grained PAT (the one acceptable long-lived secret), milestone audit + `v1.3-MILESTONE-INTEGRATION.md` document covering all REQ-IDs end-to-end, final v1.3.0 → v1.3.1 patch demonstrating the wiring works.
**Implements:** Architecture component (cross-repo data flow via `repository_dispatch`)

### Phase Ordering Rationale

- **Phase 24 first** because the scope rename touches every downstream artifact (CI, publint output, examples) and must be atomic
- **Phase 25 before Phase 26-28** because CI must validate the renamed surface before any release workflow runs (publint catches packaging bugs only at lint time)
- **Phase 26 before Phase 27** because metadata (`repository`, `license`) is required for provenance to render and for scoped-public publish to succeed
- **Phase 27 (manual UI work) before Phase 28** because the OIDC trust tuple must exist when release.yml fires
- **Phase 28 (rc.0) before Phase 29 (v1.3.0)** to smoke-test OIDC without burning the stable tag
- **Phase 30 (canary unit) before Phase 31 (canary integration)** because real-provider tests presume the unit tests already exercised the public surface
- **Phase 32 last** because cross-repo wiring is iteration-1 polish; the canary works without it (manual dep bumps); polish makes it self-healing

### Research Flags

Phases likely needing deeper planning research:
- **Phase 27 (npm Trusted Publisher setup):** Verify at execution time whether 2026 OIDC-only first-publish path works, vs. requiring a one-time classic-token publish to claim the package name. The two paths have meaningfully different operational steps. Live verification beats research speculation.
- **Phase 31 (Cost ceiling tuning):** $2/run / $100/month are research-derived baselines; calibrate after first nightly run measures actual usage. Plan should expect iteration in the first 2 weeks.

Phases with standard patterns (skip deeper research):
- **Phase 24 (scope rename):** Mechanical refactor, well-defined surfaces
- **Phase 25 (CI workflow):** Standard Actions YAML, verified versions
- **Phase 30 (canary unit suite):** Standard vitest pattern

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All actions + dep versions verified against official sources; no new Lattice deps needed |
| Features | MEDIUM-HIGH | Publish polish + provenance + OIDC UX verified against npm/GitHub docs; cost-control numbers extrapolated from comparable projects |
| Architecture | HIGH | Phase ordering derived from inspected file inventory + dependency direction; OIDC trust boundary verified |
| Pitfalls | HIGH on npm/OIDC/changesets/canary; MEDIUM on crypto-shipping defenses | TanStack postmortem + Sigstore docs + Radicle disclosure for primary findings; Lattice-specific crypto extrapolation from Mysten ed25519-unsafe-libs |

**Overall confidence:** HIGH

### Gaps to Address

- **OIDC-only first-publish viability (Phase 27):** Live verification at execution time. If OIDC-only fails, fall back to one-time classic token + immediate rotation.
- **Cost ceiling calibration (Phase 31):** $2/run / $100/month are sensible baselines; expect tuning after week-1 nightly data.
- **`environment: npm-publish` manual gate longevity (Phase 28-29):** Keep for first 3 publishes, then decide based on confidence. Not blocking.
- **Receipt downgrade defense breaking-change profile (Phase 26):** Changing `verifyReceipt` semantics in 1.3.0 is acceptable (first public release; no consumers yet) but document in CHANGELOG + SECURITY.md as the defining behavior.
- **Cross-repo `CANARY_DISPATCH_TOKEN` scope (Phase 32):** Fine-grained PAT scoped to canary repo only with `contents: write` + `pull-requests: write`. No other repos.

## Sources

### Primary (HIGH confidence)
- [Trusted publishing for npm packages (npm Docs)](https://docs.npmjs.com/trusted-publishers/)
- [Generating provenance statements (npm Docs)](https://docs.npmjs.com/generating-provenance-statements/)
- [GitHub Changelog — npm trusted publishing GA](https://github.blog/changelog/2025-07-31-npm-trusted-publishing-with-oidc-is-generally-available/)
- [GitHub Blog — Introducing npm package provenance](https://github.blog/security/supply-chain-security/introducing-npm-package-provenance/)
- [TanStack npm supply-chain compromise postmortem](https://tanstack.com/blog/npm-supply-chain-compromise-postmortem)
- [changesets/action GitHub](https://github.com/changesets/action)
- [actions/setup-node](https://github.com/actions/setup-node) + [pnpm/action-setup](https://github.com/pnpm/action-setup)
- [philna.sh — Things you need to do for npm trusted publishing](https://philna.sh/blog/2026/01/28/trusted-publishing-npm/)
- [npm/cli #8036 — provenance vs repository.url](https://github.com/npm/cli/issues/8036)

### Secondary (MEDIUM confidence)
- [openai/openai-agents-js (closest comparable library)](https://github.com/openai/openai-agents-js) — Verdaccio pre-publish dry-run pattern
- [vercel/ai monorepo release tooling](https://github.com/vercel/ai) — changesets in production
- [Mastra release management with Changesets](https://deepwiki.com/mastra-ai/mastra/12.4-dependency-management-with-renovate)
- [Endor Labs analysis of TanStack OIDC compromise](https://www.endorlabs.com/learn/how-a-misconfigured-ci-workflow-became-an-npm-supply-chain-compromise)
- [Mini Shai-Hulud Strikes Again (Wiz Blog)](https://www.wiz.io/blog/mini-shai-hulud-strikes-again-tanstack-more-npm-packages-compromised)
- [openai npm](https://www.npmjs.com/package/openai) + [@anthropic-ai/sdk npm](https://www.npmjs.com/package/@anthropic-ai/sdk) + [@google/genai npm](https://www.npmjs.com/package/@google/genai)

### Tertiary (LOW confidence — needs live verification)
- [Radicle disclosure of replay attack vulnerability (2026-03-30)](https://radicle.xyz/2026/03/30/disclosure-of-vulnerability-in-signed-references) — used as precedent for CRYPTO-1; Lattice-specific extrapolation
- [MystenLabs ed25519-unsafe-libs](https://github.com/MystenLabs/ed25519-unsafe-libs) — Ed25519 entropy-source assumptions
- 2026 LLM pricing snapshots from cloudzero.com / cloudidr.com / finout.io — cost ceiling baselines

---
*Research completed: 2026-06-03*
*Ready for roadmap: yes*
