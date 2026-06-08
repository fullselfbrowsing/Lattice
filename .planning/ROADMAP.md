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

### v1.3 Public Release + Canary Validation + Model-Aware SDK + Multi-Agent Surface (active)

**Goal:** Cut Lattice's first public npm release under `@full-self-browsing/*` with OIDC Trusted Publisher + provenance attestations; prove correctness end-to-end via a separately-repo'd canary consumer; upgrade the SDK from "provider abstraction" to "model-aware contract negotiator" (curated model capability registry seeded from OpenRouter covering 200+ models, opt-in output sanitizers + tool-call validators + prompt scaffolding, receipt v1.2 `modelClass` tag); and open a first-class opt-in multi-agent delegation surface (parent-child loops + summary-return + cache-prefix sharing + rate-limit-group coordination) so consumers can compose crews without rolling their own.

**Phase span:** 24 to 39 (16 phases, ~87 REQ-IDs).
**Granularity:** coarse (per `.planning/config.json`).
**Coverage:** 54 / 87 REQ-IDs mapped to-date (33 new IDs to be added under .planning/REQUIREMENTS.md for Phases 33-39).

**Reference docs driving the v1.3 extension:**
- `docs/fsb-integration-gaps.md` Row 60 (Delegation Blocker, drives Phase 39) and Row 83 (recovery markers, retroactively Covered in v1.2 — backlink update is Phase 39 scope).
- `/Users/lakshmanturlapati/Desktop/FSB/automation/lattice/MULTI-MODEL-OUTPUT-CONTRACT-RESEARCH.md` Improvements 1-7 (drives Phases 33-38; gpt-oss-120b case study at session_1780792387779).

- [x] **Phase 24: Atomic Scope Rename + License Hygiene** — Rename both publishable packages to `@full-self-browsing/*` and add release-required manifest fields in a single atomic commit. (completed 2026-06-04)
- [x] **Phase 25: PR-Time CI Workflow** — Stand up `.github/workflows/ci.yml` (install + typecheck + test + publint + attw) with SHA-pinned actions; first green CI run validates the renamed surface. (completed 2026-06-06)
- [x] **Phase 26: Release Hygiene Docs + Receipt Downgrade Defense** — Author `CONTRIBUTING.md`, `SECURITY.md`, README provenance section, seed changeset; harden `verifyReceipt` with minimum `schemaVersion >= 1.1` enforcement. (completed 2026-06-06)
- [x] **Phase 27: npm Org + Trusted Publisher Setup** — User-driven via FSB on npmjs.com: claim `@full-self-browsing` scope, create `npm-publish` GitHub Environment, bind Trusted Publisher trust tuple `(repo, workflow_filename, environment)` for both packages. (completed 2026-06-07)
- [x] **Phase 28: Release Workflow + rc.0 OIDC Smoke** — Land split-job `release.yml` (version-PR job + publish job with separate `permissions:`); publish `@full-self-browsing/lattice@1.3.0-rc.0` + `@full-self-browsing/lattice-cli@1.3.0-rc.0` end-to-end via OIDC with verifiable provenance. (completed 2026-06-08)
- [ ] **Phase 29: First v1.3.0 Stable Publish** *(deferred to end of milestone; depends on 30, 31, 33-39)* — Promote the full Phase 33-39 surface to stable; `@full-self-browsing/lattice@1.3.0` + `@full-self-browsing/lattice-cli@1.3.0` live on npmjs.com with provenance badge + auto-generated GitHub Release object.
- [ ] **Phase 30: Canary Bootstrap + Layer 1 Fake-Provider Suite** *(runs against rc.x while 33-39 land)* — Public repo `fullselfbrowsing/lattice-canary` scaffolded; `npm install` (not pnpm) with exact-version pin; resolve-path assertion + Layer 1 unit suite exercises every public export against the registry tarball with fake providers.
- [ ] **Phase 31: Canary Layer 2 Real-Provider Integration + Cost Ceiling** — Nightly cron + manual dispatch integration suite against OpenAI / Anthropic / Gemini cheapest competent models; three-layer cost ceiling (Lattice CostTracker per-run, workflow-level per-month, provider portal alerts).
- [ ] **Phase 33: Model Capability Registry (~200+ via OpenRouter feed)** — New `packages/lattice/src/capabilities/` module. Typed `ModelCapabilityProfile` (trainingClass / reasoningSurface / toolCallSurface / contextWindow / knownFailureModes / recommendedPromptStrategy) + alias mechanism. Build-time fetch + bake-in `openrouter.ai/api/v1/models` snapshot covering 200+ models across the 7 providers; supplemental static profiles for direct Anthropic / Gemini / xAI / LM Studio models not surfaced by OpenRouter. `getCapabilityProfile(id)` lookup. Refresh script + commit policy.
- [ ] **Phase 34: Adapter Quirk Flags + Capability Negotiation API** — Per-adapter `quirks` field exposing `{ supportsToolChoice, parallelToolCalls, structuredOutputs, responseFormat, streamingDiverges }` for each of the 7 real adapters. Each adapter ships a `negotiateCapabilities(): Promise<NegotiatedCapabilities>` method that hits the provider's `/models` endpoint where available and intersects with Phase 33's static registry.
- [ ] **Phase 35: Prompt Scaffolding Helpers** — New `packages/lattice/src/prompts/scaffolds.ts`. `getStructuredOutputContract(strategy, schema)` + `getToolUseContract(strategy, tools)` for 5 strategies: `frontier` / `mid_tier` / `open_weight` / `reasoning` / `local`. Snapshot tests per strategy; fragments version-pinned so prompt-caching keys stay byte-stable across patch releases.
- [ ] **Phase 36: Output Sanitizer Hook (opt-in)** — `sanitizeOutput` option on each of the 7 adapters; consumer composes one or more sanitizers per adapter. Built-ins ship: `stripReasoningTags()` (`<think>`, `<reasoning>`, `<scratchpad>`), `stripChatTemplateArtifacts()` (`<|im_start|>`, `[INST]`, `<<SYS>>`), `unwrapInternalEnvelope(schema)` (extract user-facing field when model emits internal envelope verbatim — closes the gpt-oss-120b case).
- [ ] **Phase 37: Tool-Call Validation Layer (opt-in)** — `validateToolCalls` adapter option backed by Zod; consumer passes tool registry; adapter runs schema validation per tool call returned by model. Typed `ToolCallValidationError` for hallucinated names / malformed arguments / extra fields. All 7 adapters wired with parity tests.
- [ ] **Phase 38: Receipt v1.2 Schema + modelClass Tag (gated breaking)** — Bump receipt schema literal-union to `"lattice-receipt/v1" \| "v1.1" \| "v1.2"`; add optional `modelClass` field on body sourced from Phase 33's registry. `verifyReceipt` extends CRYPTO-01 downgrade defense: explicit minimum `schemaVersion >= 1.1` continues to reject v1; v1.1 and v1.2 both verify cleanly. Adapters populate `modelClass` when the registry knows the model.
- [ ] **Phase 39: Multi-Agent Delegation Surface (full Row 60 close)** — Flip `AGENTS.md` policy: multi-agent is first-class **via opt-in `AgentHost` capability** (single-agent remains the zero-config default). New primitives: `defineAgent(spec)`, `runAgentCrew({ root, hosts, policy })`. Parent-child loops with structured summary-return (child completes → returns `{ summary, artifacts, receipts }` to parent). Cache-prefix sharing across crew members for Anthropic + OpenAI prompt caching. Rate-limit-group coordination (shared token bucket per provider key across the crew). Per-agent receipt minting with `parentReceiptCid` chain-link field. `examples/agent-crew/` showcase + tests. Also retroactively flips `docs/fsb-integration-gaps.md` Row 60 status from "Out of scope" to "Covered" and Row 83 from "Needs addition" to "Covered" with v1.2 commit backlinks.
- [ ] **Phase 32: Cross-Repo Wiring + v1.3 Milestone Audit** *(was last in original plan; now depends on Phase 29 + 39)* — `repository_dispatch` from Lattice `release.yml` to canary `refresh-lattice.yml` with `CANARY_DISPATCH_TOKEN`; canary auto-bumps + opens PR; v1.3 milestone audit confirms 87/87 REQ-IDs wired end-to-end including the Phase 33-39 surface.

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

- [x] 24-01-PLAN.md — Rename packages/lattice + add release metadata + root license (RENAME-01, PKG-01/02/03/04)
- [x] 24-02-PLAN.md — Rename packages/lattice-cli + workspace:^ flip + add release metadata (RENAME-02/03, PKG-01/02/03)
- [x] 24-03-PLAN.md — tsd paths + import rewrites + changeset + lockfile + atomic commit + tarball inspection (RENAME-04/05, PKG-05)

### Phase 25: PR-Time CI Workflow

**Goal**: Every PR and push to main runs install + typecheck + test + publint + attw against the renamed surface via a SHA-pinned GitHub Actions workflow.
**Depends on**: Phase 24
**Requirements**: CI-01, CI-02
**Success Criteria** (what must be TRUE):

  1. A new PR against `main` triggers `.github/workflows/ci.yml`, runs `pnpm install --frozen-lockfile`, `pnpm -r typecheck`, `pnpm -r test`, `pnpm -r test:types`, and `pnpm -r lint:packages`, and reports green status before the merge button enables.
  2. Every third-party action used in `ci.yml` (actions/checkout, actions/setup-node, pnpm/action-setup, etc.) is pinned by a 40-character commit SHA — `grep -E "uses: .+@[0-9a-f]{40}"` matches every `uses:` line, with no `@v5` or `@main` tag references.

**Plans**: 2 plans

- [x] 25-01-PLAN.md — Three workspace-root Node 24 ESM gate scripts (check-tarball-leak.mjs, verify-rename.mjs, check-workflow-safety.mjs) implementing D-04/D-05/D-06 (CI-01)
- [x] 25-02-PLAN.md — .github/workflows/ci.yml with SHA-pinned actions, contents:read permissions, PR-only-cancel concurrency, and 11-step ci job consuming the Plan 01 scripts (CI-01, CI-02)

### Phase 26: Release Hygiene Docs + Receipt Downgrade Defense

**Goal**: Author the docs npm requires for a credible first publish and harden `verifyReceipt` against the receipt-downgrade attack, coupling the security writeup to the code change in one phase.
**Depends on**: Phase 24
**Requirements**: DOC-01, DOC-02, DOC-03, DOC-04, DOC-05, CRYPTO-01
**Success Criteria** (what must be TRUE):

  1. `CONTRIBUTING.md`, `SECURITY.md`, and `CHANGELOG.md` (per publishable package, retroactively seeded with v1.0 / v1.1 / v1.2 history under the new scoped names) exist at repo root or in their respective packages; `SECURITY.md` documents the CVE disclosure address, Ed25519 entropy assumptions, signing-key rotation guidance, and the receipt-downgrade defense citing Radicle 2026-03 precedent.
  2. A hand-crafted `CapabilityReceipt` with no `schemaVersion` field, or with `schemaVersion < 1.1`, signed by an otherwise-valid `KeySet`, is rejected by `verifyReceipt` with a new `VerifyResult` error kind `schema-version-too-low`; a passing unit test exercises both branches.
  3. An initial changeset seeding the v1.3.0 release notes exists under `.changeset/`, and `README.md` shows install instructions using `@fullselfbrowsing/lattice` plus npm version + provenance + license badge placeholders and a copy-pastable provenance verification example.

**Plans**: 4 plans

- [x] 26-01-PLAN.md — SECURITY.md + CONTRIBUTING.md at repo root (DOC-02, DOC-04)
- [x] 26-02-PLAN.md — Per-package CHANGELOG.md + .changeset/v1.3.0-initial.md enrichment (DOC-03, DOC-05)
- [x] 26-03-PLAN.md — README.md install + badges + Provenance Verification section (DOC-01, DOC-05)
- [x] 26-04-PLAN.md — Receipt-downgrade defense in verifyReceipt + unit tests (CRYPTO-01)

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

**Goal**: Promote the rc.0 surface — **plus the full Phase 33-39 surface (capability registry, quirks + negotiation, prompt scaffolds, output sanitizers, tool-call validation, receipt v1.2, multi-agent crew)** — to v1.3.0 stable; both packages are live on npmjs.com with provenance, and the GitHub Release object that external consumers will pin exists.
**Depends on**: Phase 28, **Phase 38** (receipt schema bump must land before stable), **Phase 39** (multi-agent surface)
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

**Goal**: Wire `repository_dispatch` so a Lattice publish auto-opens a refresh PR on the canary, document the one acceptable long-lived secret in `SECURITY.md`, and produce the v1.3 milestone audit confirming all 87 REQ-IDs (including the Phase 33-39 model-aware + multi-agent surface) are wired end-to-end.
**Depends on**: Phase 29 (stable shipped), Phase 31 (canary integration green), Phase 39 (multi-agent surface in audit scope)
**Requirements**: DISPATCH-01, DISPATCH-02, DISPATCH-03
**Success Criteria** (what must be TRUE):

  1. Cutting a `v1.3.1` patch publish on Lattice fires a `repository_dispatch` event of type `lattice-published` with payload `{ tag, lattice_version, cli_version, commit }` at `fullselfbrowsing/lattice-canary`, and the canary's `refresh-lattice.yml` opens a PR bumping both pinned deps to the new exact versions with auto-merge enabled (gated on the Layer 1 unit suite passing — never auto-merges on red).
  2. `CANARY_DISPATCH_TOKEN` is documented in `SECURITY.md` as the one acceptable long-lived secret in the v1.3 system, scoped as a fine-grained PAT to `fullselfbrowsing/lattice-canary` only with `contents: write` + `pull-requests: write` (no other repos, no admin scope).
  3. A v1.3 milestone audit document confirms every REQ-ID has at least one observable behavior in either the Lattice repo or the canary repo, with 54/54 mapped and no orphans; the audit links the rc.0 + v1.3.0 + v1.3.1 publishes and the corresponding canary nightly runs.

**Plans**: TBD

### Phase 33: Model Capability Registry (~200+ via OpenRouter feed)

**Goal**: Lattice ships a typed, build-time-baked registry of 200+ model capability profiles so consumers can query model-class behavior (training lineage, reasoning surface, tool-call shape, known failure modes, recommended prompt strategy) before constructing a request — closing the structural gap surfaced by the gpt-oss-120b case study.
**Depends on**: Phase 28 (no functional dep; sequencing only — registry lives on rc.0 surface)
**Requirements**: CAPS-01, CAPS-02, CAPS-03, CAPS-04, CAPS-05
**Success Criteria** (what must be TRUE):

  1. `packages/lattice/src/capabilities/` exposes a typed `ModelCapabilityProfile` (readonly `id`, `provider`, `trainingClass`, `reasoningSurface`, `toolCallSurface`, `contextWindow`, `knownFailureModes`, `recommendedPromptStrategy`) plus a `getCapabilityProfile(id: string): ModelCapabilityProfile | undefined` lookup; alias support resolves canonical and provider-prefixed forms (e.g., `openai/gpt-oss-120b:free` and `openai/gpt-oss-120b` map to the same profile).
  2. A repo-scoped build-time script `scripts/refresh-model-registry.mjs` fetches `openrouter.ai/api/v1/models`, transforms each entry into a `ModelCapabilityProfile` using a curated training-class classifier, and commits the resulting `packages/lattice/src/capabilities/registry.generated.ts` to the repo; CI re-runs the script and fails if the snapshot drifts (forcing intentional refresh PRs).
  3. Static supplemental profiles cover models that OpenRouter does not surface (direct Anthropic `claude-opus-4`, direct Gemini `gemini-2.5-pro`, direct xAI `grok-4`, LM Studio local model template); total registry covers at least 200 distinct profiles at v1.3.0 cut.

**Plans**: 5 plans

- [ ] 33-01-PLAN.md — Author CAPS-01..05 REQ-IDs + ModelCapabilityProfile types + 6 closed unions + tsd type tests (CAPS-01)
- [ ] 33-02-PLAN.md — Lookup module: getCapabilityProfile + findCapabilityProfile + stripOpenRouterVariant + bootstrap registry placeholders + vitest suite (CAPS-02)
- [ ] 33-03-PLAN.md — scripts/capabilities/classifier.mjs (hybrid prefix + family overrides) + scripts/refresh-model-registry.mjs (fetch + transform + write + --check) + golden fixture + classifier tests (CAPS-03)
- [ ] 33-04-PLAN.md — Run generator against live OpenRouter to populate registry.generated.ts + 4 static profiles in registry.static.ts + integration test suite + Plan 02 lookup test update + changeset entry (CAPS-05, CAPS-02 verification)
- [ ] 33-05-PLAN.md — .github/workflows/registry-drift.yml weekly cron + workflow_dispatch + peter-evans/create-pull-request@v8.1.1 SHA-pinned auto-PR (CAPS-04)

### Phase 34: Adapter Quirk Flags + Capability Negotiation API

**Goal**: Each of the 7 real provider adapters discloses its known deviations from OpenAI-canonical shape via a typed `quirks` field, and exposes a runtime `negotiateCapabilities()` method that intersects provider-reported truth with the static registry from Phase 33.
**Depends on**: Phase 33
**Requirements**: QUIRK-01, QUIRK-02, QUIRK-03, NEG-01, NEG-02
**Success Criteria** (what must be TRUE):

  1. `ProviderAdapter` gains a readonly `quirks: AdapterQuirks` field carrying booleans for `supportsToolChoice`, `parallelToolCalls`, `structuredOutputs`, `responseFormatHonored`, `streamingDiverges`, and a documented set of provider-specific flag names; each of the 7 real adapters (OpenAI, OpenAI-compat, Anthropic, Gemini, xAI, OpenRouter, LM Studio) populates the quirks block with values that match real provider behavior, asserted by per-adapter quirk-fixture tests.
  2. Each adapter ships `negotiateCapabilities(modelId): Promise<NegotiatedCapabilities>` that, when the provider's `/models` endpoint exists (Anthropic, OpenAI, Gemini, OpenRouter), queries it and intersects the response with Phase 33's `getCapabilityProfile()`; for providers without a `/models` endpoint (LM Studio local, custom OpenAI-compat) it falls back to the static profile with `source: "registry"`.
  3. The negotiated result exposes `{ modelId, contextWindow, supports: { nativeToolCalling, structuredOutputs, parallelToolCalls, extendedThinking, streaming }, knownFailureModes, recommendedSanitizers, source }` and is consumed by a vitest scenario that picks `openai/gpt-oss-120b:free` from OpenRouter and asserts `knownFailureModes` includes `internal_envelope_leak` and `recommendedSanitizers` includes `unwrapInternalEnvelope`.

**Plans**: TBD

### Phase 35: Prompt Scaffolding Helpers

**Goal**: Lattice ships a small `prompts/scaffolds.ts` module of strategy-tuned prompt fragments so consumers can compose model-class-aware system prompts without redoing the prompt engineering per model family.
**Depends on**: Phase 33 (uses `recommendedPromptStrategy`)
**Requirements**: SCAFF-01, SCAFF-02, SCAFF-03, SCAFF-04
**Success Criteria** (what must be TRUE):

  1. `packages/lattice/src/prompts/scaffolds.ts` exports `getStructuredOutputContract(strategy, schema): string` and `getToolUseContract(strategy, tools): string`, where `strategy` is the literal union `"frontier" | "mid_tier" | "open_weight" | "reasoning" | "local"`; each strategy returns a deterministic, version-pinned prompt fragment whose byte-identity is asserted by snapshot tests so prompt-caching keys stay stable across Lattice patch releases.
  2. The `open_weight` strategy explicitly distinguishes meta-instruction from literal-instruction (the gpt-oss-120b root cause), providing example-driven prose framing that an open-weight model can follow without emitting the envelope schema verbatim.
  3. Each scaffold ships with a per-strategy regression test that pipes the returned fragment through a fake provider stub modeling the corresponding model class (frontier-stub passes meta-instruction through; open-weight-stub historically emits envelope-as-output) and asserts the fake stub no longer emits the envelope leak when the open-weight scaffold is used.

**Plans**: TBD

### Phase 36: Output Sanitizer Hook (opt-in)

**Goal**: Each of the 7 real adapters accepts an opt-in `sanitizeOutput` option, and Lattice ships three default sanitizer implementations covering the most-observed output-shape leaks; the gpt-oss-120b envelope leak round-trips cleanly through the sanitizer pipeline.
**Depends on**: Phase 33 (sanitizer recommendation sourced from registry)
**Requirements**: SANITIZE-01, SANITIZE-02, SANITIZE-03, SANITIZE-04
**Success Criteria** (what must be TRUE):

  1. Each of the 7 real `ProviderAdapter` factories accepts an optional `sanitizeOutput?: SanitizerFn | readonly SanitizerFn[]` option; when present, the adapter pipes the model's final response text through the sanitizer(s) in order before returning. Default behavior (option absent) is unchanged — zero impact on existing v1.2 consumers (FSB integration assertion).
  2. Three default sanitizer implementations ship in `packages/lattice/src/sanitizers/`: `stripReasoningTags()` removes `<think>...</think>`, `<reasoning>...</reasoning>`, `<scratchpad>...</scratchpad>` and DeepSeek/Qwen QwQ tag families; `stripChatTemplateArtifacts()` removes leaked Llama/Mistral chat-template tokens; `unwrapInternalEnvelope(schemaOrPath)` accepts either a Zod schema or a dotted path and, when the model's response is a single JSON object matching that shape, extracts the designated user-facing field.
  3. A reproduction test loads the gpt-oss-120b transcript shape from `session_1780792387779` (`{"summary": "Greeted the user."}`), composes the OpenRouter adapter with `sanitizeOutput: unwrapInternalEnvelope({ field: "summary" })`, and asserts the consumer-visible output is the natural-language text only (not the JSON envelope).

**Plans**: TBD

### Phase 37: Tool-Call Validation Layer (opt-in)

**Goal**: Each of the 7 real adapters accepts an opt-in `validateToolCalls` option that runs Zod-based schema validation on every tool call the model returns; consumers can choose to surface, retry, or drop validation failures.
**Depends on**: none (independent surface; benefits from Phase 33 but does not require it)
**Requirements**: VALID-01, VALID-02, VALID-03
**Success Criteria** (what must be TRUE):

  1. Each `ProviderAdapter` factory accepts an optional `validateToolCalls?: { tools: ToolDefinition[]; onFailure?: "throw" | "drop" | "callback" }` option; default behavior (absent) is unchanged. When present, the adapter validates each returned tool call against the corresponding tool's input schema (Zod) and either throws a typed `ToolCallValidationError`, drops the malformed call from the returned list, or invokes the consumer's callback per the option.
  2. `ToolCallValidationError` carries `toolName`, `attemptedArgs`, `validationIssues` (Zod's typed issue list), and `requestId` (correlation with the receipt). Validation distinguishes three failure modes: `unknown_tool` (name not in registry → hallucination), `invalid_args` (schema mismatch), and `extra_fields` (consumer can choose to allow or reject).
  3. A scenario test exercises a fake provider that returns `{ name: "search_database", arguments: { quer: "..." } }` (typo in `query`); with `validateToolCalls.onFailure: "throw"` the adapter throws `ToolCallValidationError` with `validationIssues[0].path = ["query"]`; with `"drop"` the tool call is omitted from the result; with `"callback"` the callback fires with the typed error and the adapter proceeds.

**Plans**: TBD

### Phase 38: Receipt v1.2 Schema + modelClass Tag (gated breaking)

**Goal**: Bump the Capability Receipt schema to `lattice-receipt/v1.2` adding an optional `modelClass` field populated from Phase 33's registry; verifier accepts v1.1 and v1.2 cleanly while the CRYPTO-01 downgrade defense still rejects v1.
**Depends on**: Phase 33 (modelClass source)
**Requirements**: RECEIPT12-01, RECEIPT12-02, RECEIPT12-03, RECEIPT12-04
**Success Criteria** (what must be TRUE):

  1. `packages/lattice/src/receipts/types.ts` widens the version literal-union to `"lattice-receipt/v1" | "lattice-receipt/v1.1" | "lattice-receipt/v1.2"`; the `CapabilityReceiptBody` gains an optional `modelClass?: ModelCapabilityProfile["trainingClass"]` field that, when present on a v1.2 receipt, must match the registry's classification for the receipt's model id.
  2. `verifyReceipt` continues to reject v1 receipts via the CRYPTO-01 minimum-schema-version gate, accepts both v1.1 and v1.2 cleanly under their respective JCS-canonical signature checks, and round-trips byte-equal through DSSE serialization for both versions.
  3. Every adapter that has a registry-known model populates `modelClass` on the receipt body before signing; adapters with unknown models or `createFakeProvider` leave the field undefined; per-adapter receipt-shape tests assert the field is populated correctly when the registry has the model and absent otherwise.

**Plans**: TBD

### Phase 39: Multi-Agent Delegation Surface (full Row 60 close + Row 83 update)

**Goal**: Open Lattice's multi-agent surface as a first-class opt-in capability — parent-child delegation loops with structured summary-return, prompt-cache-prefix sharing across crew members, and rate-limit-group coordination — so consumers can compose crews against Lattice primitives rather than rolling them in the consumer layer. AGENTS.md policy flips from "multi-agent: Out of Scope" to "multi-agent: First-class via opt-in `AgentHost` capability." `docs/fsb-integration-gaps.md` Row 60 status flips to "Covered"; Row 83 status flips to "Covered" with v1.2 Phase 20 backlink that was missed at the time.
**Depends on**: none (orthogonal to 33-38; can land in parallel)
**Requirements**: DELEG-01, DELEG-02, DELEG-03, DELEG-04, DELEG-05, DELEG-06, DELEG-07, DELEG-08
**Success Criteria** (what must be TRUE):

  1. `AGENTS.md` Multi-Agent Policy section flips to "First-class via opt-in `AgentHost` capability"; `packages/lattice/src/runtime/create-ai.ts` exposes `runAgentCrew({ root: AgentSpec, hosts: { childHost: AgentHost }, policy: CrewPolicy })`, and `defineAgent(spec): AgentSpec` ships as a sibling of `defineTool` carrying `{ id, intent, tools, childAgents, summaryReturnSchema }`.
  2. Parent-child loops execute under the policy: a parent agent dispatches a child by name; child runs its own bounded loop; child returns `{ summary: string, artifacts: ArtifactRef[], receipts: ReceiptCid[] }` matching `summaryReturnSchema`; parent receives the summary as a tool result and continues. Cache-prefix sharing across crew members is verifiable on Anthropic + OpenAI providers (shared system prompt across child invocations hits the prompt-cache).
  3. Rate-limit-group coordination shares a typed token bucket per provider-key across the crew (so a Claude-using parent and Claude-using children share quota rather than racing); receipts chain via a new `parentReceiptCid?: string` field on `CapabilityReceiptBody` (Receipt v1.2's `modelClass` ships alongside in Phase 38); `examples/agent-crew/` showcases a parent-summarizer + 3 child-researchers crew with real Ed25519 signing of every per-agent receipt; `evalAgentRun`-style regression test asserts crew completes within iteration + cost budget against a fake provider.

**Plans**: TBD

## Risks

- **Phase 27 / Phase 28 manual-step boundary.** npmjs.com Trusted Publisher claim + binding cannot be fully automated; the plan must hand the baton to the user explicitly (FSB walks them through the npmjs.com UI), verify completion via FSB recon, and only then proceed to Phase 28's first publish. Skipping the manual verification means Phase 28's first publish surfaces the trust-tuple typo as a 403, after versions have been bumped (OIDC-4).
- **Phase 28 is highest-risk.** The first publish IS the release.yml smoke test — OIDC + provenance + GH Release auto-create cannot be dry-run against npm. Mitigation is layered: rc.0 prerelease tag absorbs failure (preserves the v1.3.0 stable slot), `environment: npm-publish` manual approval gate is active, split version-PR and publish jobs use separate `permissions:` blocks (no `id-token: write` at workflow scope — TanStack 2026 blast-radius mitigation), and every third-party action is SHA-pinned. Any non-publish job carrying `id-token: write` is a TanStack-class risk.
- **Phase 31 real-money implications.** Real-provider tests bill real dollars. Three-layer cost guards are non-negotiable: per-run `LATTICE_COST_CEILING_USD` (default $2) enforced via Lattice's own `CostTracker`, workflow-level $100/month envelope via GitHub repo variable, provider portal alerts at $30-50/month per key. Each layer catches the others' bugs. Recovery cost from a CostTracker bug + no outer guard is "spend until the bank says stop."
- **Cross-repo `CANARY_DISPATCH_TOKEN` is a deliberate long-lived secret.** OIDC does not yet span cross-repo dispatch, so a fine-grained PAT is unavoidable. Phase 32 must document boundaries in `SECURITY.md`: PAT scoped to canary repo only, `contents: write` + `pull-requests: write` only, owner-rotatable, NOT reusable elsewhere.
- **Receipt downgrade defense (CRYPTO-01) is a breaking semantic change.** Acceptable in 1.3.0 because there are no public consumers yet; would be a major-version event later. The phase must call this out in `CHANGELOG.md` and `SECURITY.md` as the defining behavior for v1.3+.
- **Five stale-name rename surfaces (RENAME-01) must move atomically.** `pnpm pack` tarball-inspection gate runs in the same commit as the rename. The publish-time `workspace:* → workspace:^` flip is the most easily-missed surface and propagates silently into the tarball if not caught (would publish a manifest referencing the unscoped `lattice` package on the registry).
- **Sigstore Rekor outage during Phase 28 / 29 publish.** Rekor has occasional 5xx windows. Workflow must not auto-retry; retries get a new patch version, not a force-republish of the same tag. Status-page pre-check in `release.yml` is conservative insurance.
- **Phase 33 OpenRouter registry drift.** OpenRouter adds and silently retires models. The build-time refresh script must commit a stable snapshot; CI should fail when the script's output diverges from the committed snapshot so refresh PRs are intentional. Without the gate, a Lattice rebuild during an OpenRouter catalog refresh would silently change v1.3.0 surface.
- **Phase 35 prompt-cache key stability.** Anthropic + OpenAI prompt caching depends on the system prompt being byte-identical across requests. Scaffold fragments must be version-pinned constants, not template-generated, so a Lattice patch bump never invalidates a consumer's accumulated cache.
- **Phase 38 receipt schema v1.2 is a second downgrade defense touch.** CRYPTO-01 (Phase 26) hardened verifyReceipt against v1 receipts. Phase 38 widens to v1.2 — the change must not regress the v1 rejection; cascading test must include "v1 receipt with `modelClass` field present" (forged downgrade attempt) and reject it.
- **Phase 39 multi-agent policy flip is a public-contract change.** Once `AGENTS.md` advertises multi-agent as first-class, consumers will pin to it. The opt-in design (single-agent default; multi-agent only when `runAgentCrew` is called) protects existing consumers from surprise but commits Lattice to ongoing multi-agent maintenance from v1.3 onward.
- **Phase 39 rate-limit-group coordination ties to provider quotas Lattice doesn't own.** A token bucket sized incorrectly produces either underutilization (annoying) or 429 cascades (visible to the user). The bucket sizing policy must be configurable per provider key, with a conservative default and an explicit "I know what I'm doing" override path.

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
| CAPS | 5 | Phase 33 |
| QUIRK | 3 | Phase 34 |
| NEG | 2 | Phase 34 |
| SCAFF | 4 | Phase 35 |
| SANITIZE | 4 | Phase 36 |
| VALID | 3 | Phase 37 |
| RECEIPT12 | 4 | Phase 38 |
| DELEG | 8 | Phase 39 |
| **Total** | **87** | **16 phases** |

54 / 87 v1.3 REQ-IDs currently in `.planning/REQUIREMENTS.md`. The 33 new REQ-IDs (CAPS, QUIRK, NEG, SCAFF, SANITIZE, VALID, RECEIPT12, DELEG) will be authored in `.planning/REQUIREMENTS.md` as part of Phase 33's discuss-phase artifact (or earlier, if a single requirements-expansion phase is preferred). No orphans expected.

## Progress

| Milestone | Phases | Status | Completed |
| --- | --- | --- | --- |
| v1.0 | 1 to 6 | Shipped | 2026-04-22 |
| v1.1 | 7 to 13.2 | Shipped | 2026-05-12 |
| v1.2 | 14 to 23 | Shipped | 2026-05-31 |
| v1.3 | 24 to 39 | Active | — |

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 24. Atomic Scope Rename + License Hygiene | 3/3 | Complete    | 2026-06-04 |
| 25. PR-Time CI Workflow | 2/2 | Complete    | 2026-06-06 |
| 26. Release Hygiene Docs + Receipt Downgrade Defense | 4/4 | Complete    | 2026-06-06 |
| 27. npm Org + Trusted Publisher Setup | 0/0 | Complete    | 2026-06-07 |
| 28. Release Workflow + rc.0 OIDC Smoke | 0/0 | Complete    | 2026-06-08 |
| 29. First v1.3.0 Stable Publish | 0/0 | Not started | - |
| 30. Canary Bootstrap + Layer 1 Fake-Provider Suite | 0/0 | Not started | - |
| 31. Canary Layer 2 Real-Provider Integration + Cost Ceiling | 0/0 | Not started | - |
| 32. Cross-Repo Wiring + v1.3 Milestone Audit | 0/0 | Not started | - |
| 33. Model Capability Registry (~200+ via OpenRouter feed) | 0/5 | Not started | - |
| 34. Adapter Quirk Flags + Capability Negotiation API | 0/0 | Not started | - |
| 35. Prompt Scaffolding Helpers | 0/0 | Not started | - |
| 36. Output Sanitizer Hook (opt-in) | 0/0 | Not started | - |
| 37. Tool-Call Validation Layer (opt-in) | 0/0 | Not started | - |
| 38. Receipt v1.2 Schema + modelClass Tag | 0/0 | Not started | - |
| 39. Multi-Agent Delegation Surface (full Row 60 close) | 0/0 | Not started | - |
