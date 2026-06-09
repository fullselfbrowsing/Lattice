# Lattice v1.3 Requirements — Public Release + Canary Validation + Model-Aware SDK + Multi-Agent Surface

**Milestone:** v1.3
**Goal:** Cut Lattice's first public npm release under `@full-self-browsing/*` with OIDC Trusted Publisher + provenance attestations; prove correctness end-to-end via a separately-repo'd canary consumer; add model-aware contract negotiation; and ship the first opt-in multi-agent crew surface.

**Phase numbering:** Continues from v1.2 (last phase 23). v1.3 spans **Phases 24-39**. Phases 24-32 cover publish + canary, Phase 33-38 cover the model-aware SDK surface, and Phase 39 covers the opt-in multi-agent crew surface. Phase 29 stable publish remains deferred until the implementation and canary phases complete.

**Source:** Initial scope locked in conversation 2026-06-03; expanded by Phases 33-39 on 2026-06-08; reconciled against code, git refs, and npm registry state on 2026-06-09.

---

## v1 Requirements

### Scope Rename (`RENAME-*`)

- [x] **RENAME-01**: `packages/lattice/package.json#name` updated from `lattice` to `@full-self-browsing/lattice` in a single atomic commit covering every stale-name surface (workspace dep, tsd paths, examples imports, pre-seeded CHANGELOG)
- [x] **RENAME-02**: `packages/lattice-cli/package.json#name` updated from `lattice-cli` to `@full-self-browsing/lattice-cli`; `bin: { lattice }` preserved so user-facing command is unchanged
- [x] **RENAME-03**: `packages/lattice-cli/package.json#dependencies` updated from `"lattice": "workspace:*"` to `"@full-self-browsing/lattice": "workspace:^"` (the `*` to `^` flip prevents CLI users being pinned to a single patch of the core)
- [x] **RENAME-04**: `packages/lattice/tsd` paths map updated to point at new scope; `pnpm test:types` passes for both packages
- [x] **RENAME-05**: `pnpm pack` tarball inspection gate confirms both tarballs carry the renamed surface end-to-end (name, deps, exports, types)

### Package Hygiene (`PKG-*`)

- [x] **PKG-01**: `"license": "MIT"` added to root, `packages/lattice`, and `packages/lattice-cli` `package.json`
- [x] **PKG-02**: `"repository"`, `"bugs"`, `"homepage"` metadata added to both publishable packages (required for npm provenance to render correctly)
- [x] **PKG-03**: `"publishConfig": { "access": "public" }` added to both publishable packages
- [x] **PKG-04**: Root `package.json#private: true` preserved; only publishable packages are flipped public (prevents `.planning/` and internal scripts from leaking)
- [x] **PKG-05**: `publint` and `arethetypeswrong/cli` (already wired via `pnpm -r lint:packages`) pass clean on both publishable packages under PR-time CI

### Release Docs + Hygiene (`DOC-*`)

- [x] **DOC-01**: `CONTRIBUTING.md` added at repo root with contribution flow, codeowner notes, and commit conventions
- [x] **DOC-02**: `SECURITY.md` added at repo root with CVE disclosure address, Ed25519 entropy-source assumptions, signing-key rotation guidance, receipt downgrade defense documentation
- [x] **DOC-03**: `CHANGELOG.md` auto-managed by changesets (already installed); seeded with v1.0 / v1.1 / v1.2 history retrospectively
- [x] **DOC-04**: Initial changeset created seeding v1.3.0 release notes
- [x] **DOC-05**: `README.md` updated with install instructions (`@full-self-browsing/lattice`), npm + provenance + license badges, and provenance verification example

### Receipt Crypto Defense (`CRYPTO-*`)

- [x] **CRYPTO-01**: `verifyReceipt` enforces minimum `schemaVersion >= 1.1` signed into the canonical bytes; new `VerifyResult` error kind `schema-version-too-low`; receipt-downgrade attack documented in `SECURITY.md` (Radicle 2026-03 precedent)

### PR-Time CI (`CI-*`)

- [x] **CI-01**: `.github/workflows/ci.yml` runs install (pnpm) + typecheck + test + `pnpm -r lint:packages` (publint + attw) on every PR and push to main
- [x] **CI-02**: All third-party actions in `ci.yml` pinned by 40-character commit SHA (TanStack May 2026 OIDC compromise mitigation)

### Release Workflow (`REL-*`)

- [x] **REL-01**: `.github/workflows/release.yml` split into TWO jobs with separate `permissions:` blocks — version-PR job (no `id-token`) and publish job (`id-token: write` only, scoped narrowly)
- [x] **REL-02**: `changesets/action@v1` drives version bumps via the PR pattern (not direct tag push)
- [x] **REL-03**: `pnpm publish` succeeds for both packages end-to-end under OIDC (no long-lived `NPM_TOKEN`)
- [x] **REL-04**: Provenance attestations auto-attached under OIDC and verifiable on npmjs.com (provenance badge displays)
- [x] **REL-05**: GitHub Release object created automatically per published version with auto-generated notes sourced from `CHANGELOG.md`
- [x] **REL-06**: `environment: npm-publish` manual approval gate active for first 3 publishes (review-after-3-publishes decision deferred)

### npm Org + OIDC Trusted Publisher (`ORG-*`)

- [x] **ORG-01**: `@full-self-browsing` npm organization claimed (organization tier, free for public packages); user-driven via FSB at execution time
- [x] **ORG-02**: Trusted Publisher binding configured on npmjs.com for `@full-self-browsing/lattice` and `@full-self-browsing/lattice-cli` — trust tuple `(repo: fullselfbrowsing/Lattice, workflow_filename: release.yml, environment: npm-publish)`
- [x] **ORG-03**: GitHub Environment `npm-publish` created in `fullselfbrowsing/Lattice` with required reviewers configured

### Publishing (`PUB-*`)

- [x] **PUB-01**: `@full-self-browsing/lattice@1.3.0-rc.0` and `@full-self-browsing/lattice-cli@1.3.0-rc.0` published end-to-end via OIDC + provenance — first publish IS the smoke test (rc.0 surface so v1.3.0 slot is preserved)
- [ ] **PUB-02**: `@full-self-browsing/lattice@1.3.0` stable published with verifiable provenance attestation
- [ ] **PUB-03**: `@full-self-browsing/lattice-cli@1.3.0` stable published with verifiable provenance attestation
- [ ] **PUB-04**: GitHub Release object `v1.3.0` created in `fullselfbrowsing/Lattice` with auto-generated notes

### Canary Repo Bootstrap (`CAN-*`)

- [ ] **CAN-01**: Public repo `fullselfbrowsing/lattice-canary` created with TypeScript scaffolding (tsconfig, vitest, tsx, package.json, README, LICENSE MIT)
- [ ] **CAN-02**: Canary uses `npm install` (NOT `pnpm install`) with exact-version pin on `@full-self-browsing/lattice` and `@full-self-browsing/lattice-cli` — validates lowest-common-denominator install path
- [ ] **CAN-03**: Resolve-path assertion runs as the FIRST test step: asserts resolved package path lives under `node_modules/@full-self-browsing/` and version matches the lockfile (defense against workspace-symlink leak)
- [ ] **CAN-04**: Canary CI workflow runs unit suite on every PR + push to canary's main

### Canary Layer 1 — Fake Providers (`UNIT-*`)

- [ ] **UNIT-01**: Every public export from `@full-self-browsing/lattice` imported and asserted at both type level (`tsd`) and runtime against the published tarball
- [ ] **UNIT-02**: Fake-provider exercises `createAI({ providers, capabilities }).run(...)`, `ai.plan(...)`, and `ai.runAgent(intent)` end-to-end producing the documented `RunSuccess` / `RunFailure` / agent result shapes
- [ ] **UNIT-03**: Hook pipeline exercised with all three priority bands (`SAFETY`, `OBSERVABILITY`, `EXTENSION`) including `budgetMs` race-with-log behavior and irreversible freeze
- [ ] **UNIT-04**: `createReceipt` + `verifyReceipt` round-trip with ephemeral Ed25519 KeySet succeeds end-to-end and rejects a deliberately-tampered receipt
- [ ] **UNIT-05**: `SurvivabilityAdapter` serialize → deserialize round-trip byte-equal under DSSE + JCS canonicalization with real Ed25519 signer
- [ ] **UNIT-06**: CLI subprocess test spawns the installed `lattice` bin via `npx @full-self-browsing/lattice-cli` and asserts `repro` / `verify` / `eval` exit codes against fixtures

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

### Model Capability Registry (`CAPS-*`)

- [x] **CAPS-01**: Typed `ModelCapabilityProfile` interface in `packages/lattice/src/capabilities/profile.ts` carrying 9 readonly fields (`id`, `adapter`, `originFamily`, `trainingClass`, `reasoningSurface`, `toolCallSurface`, `contextWindow`, `knownFailureModes`, `recommendedPromptStrategy`) plus 6 supporting closed string-literal unions (`TrainingClass`, `RecommendedPromptStrategy`, `KnownFailureMode`, `ReasoningSurface`, `ToolCallSurface`, `CapabilityAdapter`). All re-exported from `packages/lattice/src/index.ts` per PKG-01 / INDEX-01 v1.2 discipline. `trainingClass` and `recommendedPromptStrategy` are two distinct enums (research open question 2). tsd type-level tests prove exhaustive `KnownFailureMode` coverage at compile time via the `_exhaustive: never` switch pattern (D-12 / D-13).
- [x] **CAPS-02**: Strict lookup `getCapabilityProfile(canonicalKey: string): ModelCapabilityProfile | undefined` (D-09) and fuzzy lookup `findCapabilityProfile(id: string): ModelCapabilityProfile[]` (D-10) in `packages/lattice/src/capabilities/lookup.ts`. Suffix-strip helper `stripOpenRouterVariant(id)` strips `:free` and `:thinking` from OpenRouter-shaped ids (`vendor/model:variant`) only; other adapters pass through verbatim (D-11). `Map<string, ModelCapabilityProfile>` built lazily at first call. Adapter order for fuzzy lookup: anthropic, openai, gemini, xai, openai-compat, lm-studio, openrouter (direct adapters first, openrouter last per D-10).
- [x] **CAPS-03**: Build-time generator `scripts/refresh-model-registry.mjs` fetches `https://openrouter.ai/api/v1/models`, classifies each row via `scripts/capabilities/classifier.mjs` (hybrid: provider-prefix heuristic + ~20-entry family-substring overrides per D-01 / D-03), sorts by (adapter, id), emits `packages/lattice/src/capabilities/registry.generated.ts`. Skips `~`-prefixed `*-latest` aliases (Pitfall 3). Uses `top_provider.context_length ?? context_length` for contextWindow (Pitfall 2 / A1). `--check` mode regenerates and diffs against committed file; non-zero exit on bit-exact drift (D-17). OpenRouter fetch failure in `--check` mode skips with WARN and exits 0 (D-18). Zero external runtime dependencies (`node:` built-ins only). Vitest classifier tests against frozen fixture (D-16).
- [x] **CAPS-04**: `.github/workflows/registry-drift.yml` runs on `schedule: '0 6 * * 1'` (Monday 06:00 UTC) plus `workflow_dispatch` (D-19). Job-scoped `permissions: { contents: write, pull-requests: write }`. Steps: `actions/checkout` (SHA-pinned), `pnpm/action-setup`, `actions/setup-node`, `pnpm install --frozen-lockfile`, regenerate registry, `peter-evans/create-pull-request@v8.1.1` (SHA `5f6978faf089d4d20b00c7766989d076bb2fc7f1` per CI-02) with `branch: chore/refresh-model-registry` (fixed) + `delete-branch: true` (Pitfall 5). PR-time `ci.yml` does NOT call OpenRouter (D-19 network-free PR loop). Repo setting "Allow GitHub Actions to create and approve pull requests" required (documented as Phase 27 prerequisite handoff).
- [x] **CAPS-05**: Static supplemental profiles in `packages/lattice/src/capabilities/registry.static.ts` covering models OpenRouter does not surface: `anthropic:claude-opus-4`, `gemini:gemini-2.5-pro`, `xai:grok-4`, `lm-studio:<local-template>` (generic local-quantized template). Hand-edited sibling file (separate from generated). Lookup module merges generated + static at Map-build time. Registry covers >=200 distinct profiles at v1.3.0 cut (341 OpenRouter rows minus 8 `~`-aliases plus 4 static profiles -> ~337 distinct profiles, well above threshold).

### Adapter Quirk Flags + Capability Negotiation API (`QUIRK-*` / `NEG-*`)

- [x] **QUIRK-01**: `AdapterQuirks` base interface in `packages/lattice/src/providers/quirks.ts` exposing 5 universal readonly booleans: `supportsToolChoice`, `parallelToolCalls`, `structuredOutputs`, `responseFormatHonored`, `streamingDiverges`; 7 per-adapter narrowed sub-interfaces (`AnthropicQuirks`, `OpenAIQuirks`, `OpenAICompatQuirks`, `GeminiQuirks`, `XaiQuirks`, `OpenRouterQuirks`, `LmStudioQuirks`) each extending `AdapterQuirks` with provider-specific flags (D-03). `quirks?: AdapterQuirks` added as OPTIONAL field to `ProviderAdapter` (D-01 non-breaking for v1.2 consumer adapters). All 8 types re-exported from `packages/lattice/src/index.ts` per PKG-01 / INDEX-01 discipline. tsd type-level tests (`test-d/quirks-negotiation.test-d.ts`) assert the 5 base booleans, `AnthropicQuirks extends AdapterQuirks` via `expectAssignable`, and backward-compatibility of existing 4-field consumer adapter literals. `SanitizerKey` closed union (`"stripReasoningTags" | "stripChatTemplateArtifacts" | "unwrapInternalEnvelope"`) + `SANITIZER_BY_FAILURE_MODE: Record<KnownFailureMode, SanitizerKey | null>` + `getRecommendedSanitizers` helper in `packages/lattice/src/capabilities/sanitizer-recommendations.ts` (D-13/D-14/D-15/D-16) re-exported from index.
- [x] **QUIRK-02**: Each of the 7 first-party adapter factories (`createOpenAIProvider`, `createOpenAICompatibleProvider`, `createAnthropicProvider`, `createGeminiProvider`, `createXaiProvider`, `createOpenRouterProvider`, `createLmStudioProvider`) returns an adapter object whose `quirks` block is populated with values matching real provider behavior per Phase 34 RESEARCH §Q6 / per-adapter quirks vocabulary; per-adapter quirk-fixture vitest tests assert each value.
- [x] **QUIRK-03**: Per-adapter `quirks` narrowing accessible via discriminant check on `adapter.id`; tsd type-level test (`test-d/quirks-negotiation.test-d.ts`) asserts that `if (adapter.id === "anthropic")` narrows `adapter.quirks` to `AnthropicQuirks` and exposes `promptCachingSupported` / `extendedThinkingSupported` / `toolUseInputSchemaStrict` (consumer MUST cast via `adapter.quirks as AnthropicQuirks` or use typed factory return per D-03 discriminant-narrowing contract).
- [x] **NEG-01**: `negotiateCapabilities?(modelId: string): Promise<NegotiatedCapabilities>` OPTIONAL method on `ProviderAdapter` (D-02). Top-level helper `negotiateCapabilities(adapter, modelId)` in `packages/lattice/src/capabilities/negotiate.ts` delegates to `adapter.negotiateCapabilities` when present; otherwise synthesizes from Phase 33 registry via `getCapabilityProfile("${adapter.id}:${modelId}")` with `source: "registry"` (D-04). All 7 first-party adapters with `/models` endpoints (Anthropic, OpenAI, Gemini, OpenRouter) implement; 3 without (xAI sparse, OpenAI-compat, LM Studio) fall back per D-04. Per-instance TTL cache (`modelsCacheTtlMs` factory option, default 300000ms, 0 disables, Infinity = process-lifetime per D-08); single-flight inflight-coalescing via `Map<modelId, Promise<T>>` with `.finally` cleanup (Pitfall 4 mandatory). `NegotiatedCapabilities` interface: `modelId`, `contextWindow`, `supports: { nativeToolCalling, structuredOutputs, parallelToolCalls, extendedThinking, streaming }`, `knownFailureModes`, `recommendedSanitizers`, `source: "live" | "registry-fallback" | "registry"`. `NegotiationAuthError extends Error` with `adapter: CapabilityAdapter`, `modelId: string`, `httpStatus: 401 | 403`, `kind = "negotiation-auth-failed" as const`. All public types and helpers re-exported from `packages/lattice/src/index.ts`.
- [x] **NEG-02**: Fetch-failure policy: transient errors (5xx, network, timeout) fall back to Phase 33 registry with `source: "registry-fallback"` (D-09); auth errors (401/403) throw `NegotiationAuthError extends Error` carrying `adapter: CapabilityAdapter`, `modelId: string`, `httpStatus: 401 | 403` (D-10). Retry policy: 2 retries with exponential backoff [0ms, 200ms, 1000ms] = 3 total attempts before fallback (D-11); `modelsRetryCount` factory option (default 2, 0 disables). New `RunEventKind` literal `"capabilities.negotiation.fallback"` (D-12) added to `packages/lattice/src/tracing/tracing.ts` as the last union member with JSDoc comment. Anchor case study (`session_1780792387779`): `negotiateCapabilities(openrouterAdapter, "openai/gpt-oss-120b:free")` resolves with `recommendedSanitizers.includes("unwrapInternalEnvelope")` AND `knownFailureModes.includes("internal_envelope_leak")`.

### Prompt Scaffolding Helpers (`SCAFF-*`)

- [x] **SCAFF-01**: `packages/lattice/src/prompts/scaffolds.ts` exports `getStructuredOutputContract(strategy, schema): string` and `getToolUseContract(strategy, tools): string`, using Phase 33's `RecommendedPromptStrategy` union (`"frontier" | "mid_tier" | "open_weight" | "reasoning" | "local"`) as the strategy parameter rather than defining a parallel prompt-strategy type.
- [x] **SCAFF-02**: Both scaffold helpers return deterministic, version-pinned prompt fragments. Returned strings include a stable scaffold version marker and canonical serialization of schema/tool inputs so semantically identical object-key ordering produces byte-identical fragments suitable for prompt-cache keys and snapshot tests.
- [x] **SCAFF-03**: The `open_weight` strategy explicitly distinguishes meta-instruction from literal output instruction. Structured-output and tool-use fragments include example-driven positive/negative framing that tells open-weight instruct models to follow the schema/tool contract without emitting the contract, internal envelope, or tool descriptor verbatim as the user-visible answer.
- [x] **SCAFF-04**: Regression coverage includes per-strategy byte snapshots or exact-string assertions for both helpers, fake provider stubs modeling strategy behavior, and an anchor test for `session_1780792387779` / `openai/gpt-oss-120b` proving the open-weight scaffold prevents the internal-envelope leak that previously emitted `{"summary": "Greeted the user."}` as the reply.

### Output Sanitizer Hook (`SANITIZE-*`)

- [x] **SANITIZE-01**: Each of the 7 real first-party provider adapter factories (`createOpenAIProvider`, `createOpenAICompatibleProvider`, `createAnthropicProvider`, `createGeminiProvider`, `createXaiProvider`, `createOpenRouterProvider`, `createLmStudioProvider`) accepts optional `sanitizeOutput?: SanitizerFn | readonly SanitizerFn[]`. When absent, adapter behavior is unchanged. When present, string-valued `rawOutputs` are piped through the sanitizer(s) in order after provider response text extraction and before the adapter returns `ProviderRunResponse`; non-string outputs are preserved.
- [x] **SANITIZE-02**: Built-in sanitizer factories ship in `packages/lattice/src/sanitizers/` and root exports: `stripReasoningTags()`, `stripChatTemplateArtifacts()`, and `unwrapInternalEnvelope(schemaOrPath)`. Minimal public types include `SanitizerFn`, `SanitizerContext`, and `SanitizeOutputOption`; sanitizer context exposes provider id, optional model id, and output name only.
- [x] **SANITIZE-03**: `unwrapInternalEnvelope(...)` supports explicit dotted path usage and the anchor object form `unwrapInternalEnvelope({ field: "summary" })`; invalid JSON, missing fields, non-object JSON, and non-string extracted values no-op. The `session_1780792387779` shape `{"summary":"Greeted the user."}` round-trips through OpenRouter with visible output `Greeted the user.`.
- [x] **SANITIZE-04**: Regression coverage includes direct built-in tests, no-op tests, custom sanitizer composition-order tests, custom sanitizer exception propagation, all-seven adapter wiring parity, `rawResponse` preservation, root public-surface smoke coverage, package type tests, and a changeset documenting the opt-in sanitizer API.

### Tool-Call Validation Layer (`VALID-*`)

- [x] **VALID-01**: Each of the 7 real first-party provider adapter factories (`createOpenAIProvider`, `createOpenAICompatibleProvider`, `createAnthropicProvider`, `createGeminiProvider`, `createXaiProvider`, `createOpenRouterProvider`, `createLmStudioProvider`) accepts optional `validateToolCalls?: ValidateToolCallsOption` using `ToolDefinition[]`; absent option leaves behavior unchanged, while present option parses returned tool-call envelopes, validates against the registry, and returns normalized `ProviderRunResponse.toolCalls` while preserving `rawOutputs` / `rawResponse`.
- [x] **VALID-02**: Public validation surface exports `ToolCallValidationError`, `ToolCallValidationFailureReason`, `ValidateToolCallsOption`, `ValidatedToolCall`, and a shared validation helper. The error distinguishes `unknown_tool`, `invalid_args`, and `extra_fields` and carries `toolName`, `attemptedArgs`, `validationIssues`, and `requestId`.
- [x] **VALID-03**: Regression coverage includes shared validator tests for throw/drop/callback, extra-field reject/allow, callback-mode config error, OpenAI-compatible family wiring, Anthropic/Gemini wiring, agent runtime preference for `response.toolCalls`, all-seven adapter parity, public-surface smoke coverage, package type tests, and a changeset documenting the opt-in returned-tool-call validator.

---

## Total Requirements

**75 authored REQ-IDs** across **18 categories** are mapped in this file. **49 / 75** are complete as of the 2026-06-09 Phase 37 execution pass. The roadmap still plans **87 total v1.3 REQ-IDs**; the remaining **12 planned REQ-IDs** for Phases 38-39 must be authored before the milestone audit can claim 87/87 coverage.

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
| CAPS | 5 | Phase 33 |
| QUIRK / NEG | 5 | Phase 34 |
| SCAFF | 4 | Phase 35 |
| SANITIZE | 4 | Phase 36 |
| VALID | 3 | Phase 37 |

Planned but not yet authored:

| Category | Planned count | Phase target |
|---|---:|---|
| RECEIPT12 | 4 | Phase 38 |
| DELEG | 8 | Phase 39 |

---

## Future Requirements (deferred to v1.4+)

Carried over from v1.2 close-out. Out of scope for v1.3 unless explicitly pulled into Phases 36-39.

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

- **Hosted or platform-managed crew orchestration** — Phase 39 scopes an embeddable opt-in crew API only. Hosted control planes, queueing services, billing, and fleet management remain out of scope.
- **Hosted control plane** — v1.3 ships the runtime SDK on npm; hosted infrastructure is not in scope.
- **Graph DSL** — Lattice's design principle is to feel smaller than orchestration frameworks; graph builders are out of scope.
- **Building 100 custom provider adapters** — 7 adapters shipped in v1.2 cover the parity contract; new providers wait for consumer ask.
- **Frontend hook library at the core** — UI bindings may exist as siblings, but the core bet is the runtime.
- **Opaque AI-selected routing** — routing stays deterministic and inspectable.
- **Long-lived `NPM_TOKEN`** — OIDC Trusted Publisher is the only sanctioned auth path; classic tokens reserved for emergency fallback only.
- **PR-time real-provider tests** — flake + cost concerns; nightly + manual dispatch only.
- **Unscoped `lattice` name claim** — `@full-self-browsing` scope is the identity; deferred unscoped-redirect stub is v1.4+.
- **Auto-merge of canary refresh PR without unit-suite gate** — canary PR only auto-merges if Layer 1 passes; never auto-merges on red.

---

## Traceability

Each authored REQ-ID maps to exactly one phase. Phases 38-39 still need detailed REQ-ID authoring before execution.

| REQ-ID | Phase | Plan | Status |
|---|---|---|---|
| RENAME-01 | Phase 24 | 24-01 | complete |
| RENAME-02 | Phase 24 | 24-02 | complete |
| RENAME-03 | Phase 24 | 24-02 | complete |
| RENAME-04 | Phase 24 | 24-03 | complete |
| RENAME-05 | Phase 24 | 24-03 | complete |
| PKG-01 | Phase 24 | 24-01 / 24-02 | complete |
| PKG-02 | Phase 24 | 24-01 / 24-02 | complete |
| PKG-03 | Phase 24 | 24-01 / 24-02 | complete |
| PKG-04 | Phase 24 | 24-01 | complete |
| PKG-05 | Phase 24 | 24-03 | complete |
| CI-01 | Phase 25 | 25-01 / 25-02 | complete |
| CI-02 | Phase 25 | 25-02 | complete |
| DOC-01 | Phase 26 | 26-01 | complete |
| DOC-02 | Phase 26 | 26-01 | complete |
| DOC-03 | Phase 26 | 26-02 | complete |
| DOC-04 | Phase 26 | 26-02 | complete |
| DOC-05 | Phase 26 | 26-03 | complete |
| CRYPTO-01 | Phase 26 | 26-04 | complete |
| ORG-01 | Phase 27 | external handoff | complete |
| ORG-02 | Phase 27 | external handoff | complete |
| ORG-03 | Phase 27 | external handoff | complete |
| REL-01 | Phase 28 | release.yml | complete |
| REL-02 | Phase 28 | release.yml | complete |
| REL-03 | Phase 28 | release.yml / npm rc.0 | complete |
| REL-04 | Phase 28 | npm rc.0 provenance | complete |
| REL-05 | Phase 28 | GitHub release v1.3.0-rc.0 | complete |
| REL-06 | Phase 28 | npm-publish environment | complete |
| PUB-01 | Phase 28 | npm rc.0 | complete |
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
| CAPS-01 | Phase 33 | 33-01 | complete |
| CAPS-02 | Phase 33 | 33-02 | complete |
| CAPS-03 | Phase 33 | 33-03 | complete |
| CAPS-04 | Phase 33 | 33-05 | complete |
| CAPS-05 | Phase 33 | 33-04 | complete |
| QUIRK-01 | Phase 34 | 34-01 | complete |
| QUIRK-02 | Phase 34 | 34-02 / 34-03 / 34-04 / 34-05 | complete |
| QUIRK-03 | Phase 34 | 34-01 | complete |
| NEG-01 | Phase 34 | 34-01 | complete |
| NEG-02 | Phase 34 | 34-02 / 34-03 / 34-04 | complete |
| SCAFF-01 | Phase 35 | 35-01 / 35-02 | complete |
| SCAFF-02 | Phase 35 | 35-01 / 35-02 | complete |
| SCAFF-03 | Phase 35 | 35-01 / 35-02 | complete |
| SCAFF-04 | Phase 35 | 35-02 | complete |
| SANITIZE-01 | Phase 36 | 36-02 / 36-03 | complete |
| SANITIZE-02 | Phase 36 | 36-01 | complete |
| SANITIZE-03 | Phase 36 | 36-01 / 36-02 / 36-03 | complete |
| SANITIZE-04 | Phase 36 | 36-01 / 36-02 / 36-03 | complete |
| VALID-01 | Phase 37 | 37-02 / 37-03 | complete |
| VALID-02 | Phase 37 | 37-01 | complete |
| VALID-03 | Phase 37 | 37-01 / 37-02 / 37-03 | complete |

**Coverage:** 75 / 87 planned v1.3 REQ-IDs authored. 49 / 75 authored REQ-IDs complete. 12 planned REQ-IDs remain to be authored for Phases 38-39. No authored orphans. No duplicates.

---

*Created: 2026-06-03 — Milestone v1.3 (Public Release + Canary Validation) opened*
*Traceability filled: 2026-06-03 — by gsd-roadmapper during v1.3 roadmap creation*
*Phase 34 REQ-IDs (QUIRK-01..03 + NEG-01..02) added: 2026-06-08 — Plan 34-01*
*Planning state reconciled: 2026-06-09 — code/git/npm audit confirmed 38 authored REQ-IDs complete and stable 1.3.0 not published*
*Phase 35 REQ-IDs (SCAFF-01..04) added: 2026-06-09 — plan-phase prerequisite*
*Phase 35 REQ-IDs (SCAFF-01..04) completed: 2026-06-09 — prompt scaffold helpers executed and verified*
*Phase 36 REQ-IDs (SANITIZE-01..04) added: 2026-06-09 — plan-phase prerequisite*
*Phase 36 REQ-IDs (SANITIZE-01..04) completed: 2026-06-09 — output sanitizer hook executed and verified*
*Phase 37 REQ-IDs (VALID-01..03) added: 2026-06-09 — plan-phase prerequisite*
*Phase 37 REQ-IDs (VALID-01..03) completed: 2026-06-09 — tool-call validation layer executed and verified*
