# Changelog

## 1.5.0

### Minor Changes

* Add modular package entrypoints for provider, audit, context, artifact, routing, tools, storage, eval, agents, and core adoption paths.
* Add provider native tool and structured output execution parity for provider only consumers.
* Add external execution audit helpers that mint signed receipts, sidecars, replay envelopes, raw request hashes, raw response hashes, input hashes, and output hashes for external executors.
* Add standalone core preparation helpers for external runtimes that need artifact refs, storage refs, context packs, advisory routes, input hashes, warnings, and execution plans without provider execution.
* Add tools and MCP artifact helpers that convert tool results into replayable artifacts without importing the agent runtime.
* Add compatibility dogfood evidence for built package subpaths, Node 20 modular consumers, and GitFly style external consumer flows.

### Fixes

* Preserve external audit failure replay semantics. Failed verdicts keep sidecar and receipt evidence, while replay envelopes omit outputs and inspect as failed plans and failed attempts.
* Preserve custom storage reference hashes when standalone core runs prepare externally stored artifacts.
* Keep eval facade imports behind the public eval subpath boundary.

### Validation

* Runtime focused gate passed with 83 test files and 1086 tests.
* CLI showcase gate passed with 17 test files and 162 tests.
* Recursive workspace test gate passed across runtime and CLI packages.

## 1.4.0

### Minor Changes

- 3b152a1: Add a first-class LiteLLM gateway provider helper plus typed gateway policy metadata for OpenAI-compatible gateway delegation.
- 5f77ec5: Add OpenRouter fallback model arrays, resolved-model accounting, and richer OpenRouter capability catalog metadata.
- e68d1e5: Add a dependency-free OpenTelemetry run-event sink plus Langfuse and Phoenix OTLP configuration helpers.
- 25a36bc: Add native multimodal request shaping for Anthropic image inputs and Gemini image, audio, and video inputs, with provider packaging evidence in execution plans. Also expose direction-level realtime session and checkpoint types for future OpenAI Realtime and Gemini Live support without implementing production bidirectional transports.
- 6503486: Add v1.3 receipt provenance roots that commit to descriptor-only artifact lineage graphs, including runtime, streaming, and crew completion receipt issuance where lineage exists. Also expose a cloud-SDK-free remote receipt signer adapter shape so production KMS/HSM signers can receive the exact DSSE PAE bytes while preserving existing KeySet verification.
- 9278b77: Implement normalized provider streaming adapters for Anthropic, Gemini, and the OpenAI-compatible provider family, including OpenAI, xAI, OpenRouter, LM Studio, and LiteLLM-compatible gateways.
- 25ef841: Add the core streaming provider contract with optional `ProviderAdapter.executeStream?`, normalized provider stream chunk types, and `collectStream()` for assembling streams into the existing provider response and receipt flow.

## 1.3.0

### Minor Changes

- ca2bcb5: feat(capabilities): adapter quirk flags + capability negotiation API (Phase 34)

  Each of the 7 first-party provider adapters now ships:

  - A typed `quirks` field documenting known behavioral deviations from
    OpenAI-canonical shape (`AdapterQuirks` base + 7 per-adapter narrowed
    sub-interfaces: `AnthropicQuirks`, `OpenAIQuirks`, `OpenAICompatQuirks`,
    `GeminiQuirks`, `XaiQuirks`, `OpenRouterQuirks`, `LmStudioQuirks`).
  - A runtime `negotiateCapabilities(modelId): Promise<NegotiatedCapabilities>`
    method that queries the provider's `/models` endpoint where available
    and intersects the response with Phase 33's static `ModelCapabilityProfile`
    registry; falls back to registry-only synthesis when the endpoint is
    absent (OpenAI-compat, LM Studio) or transient errors occur.

  Public API additions (all re-exported from the package index per PKG-01/INDEX-01):

  - Types: `AdapterQuirks`, 7 narrowed quirks interfaces, `NegotiatedCapabilities`, `SanitizerKey`
  - Functions: top-level `negotiateCapabilities(adapter, modelId)` helper, `getRecommendedSanitizers`
  - Constants: `SANITIZER_BY_FAILURE_MODE`
  - Error class: `NegotiationAuthError` (thrown on 401/403 from /models)

  Reliability features:

  - Per-instance TTL cache (`modelsCacheTtlMs` factory option; default 5 min)
  - Single-flight inflight-request coalescing (concurrent calls share one fetch)
  - 2 retries with exponential backoff on transient errors (5xx, network, timeout)
  - Auth errors (401/403) throw the typed `NegotiationAuthError` -- they never silently fall back

  BREAKING CHANGE NOTE (exhaustive-switch consumers): The `RunEventKind` union
  gains a new literal `"capabilities.negotiation.fallback"`. Consumers writing
  exhaustive `switch` statements over `RunEventKind` must add the new case.
  Phase 17 set the precedent with the `recovery.*` events; v1.3 has no prior
  stable consumers (rc.0 is staged but not stable).

  The new event fires when an adapter's `negotiateCapabilities` falls back
  from the live `/models` endpoint to the Phase 33 registry due to transient
  failure. Auth errors do NOT fire this event (they throw `NegotiationAuthError`).

  Anchor case study verified end-to-end (session_1780792387779):
  `negotiateCapabilities(openrouterAdapter, "openai/gpt-oss-120b:free")` yields
  `result.recommendedSanitizers` including `"unwrapInternalEnvelope"` -- proving
  the live-fetch + Phase 33 registry-intersection + sanitizer-derivation pipeline.

  Phase 36 will register the actual sanitizer implementations under the
  `SanitizerKey` union shipped in this release.

- 29474a1: feat(agent): add the opt-in multi-agent crew surface (Phase 39)

  Lattice now exposes a first-class, opt-in crew API built on the existing
  single-agent runtime:

  - `defineAgent` declares literal parent/child `AgentSpec` trees.
  - `runAgentCrew` and `createAI(...).runAgentCrew(...)` execute a crew with
    schema-validated child summary return envelopes.
  - `CrewPolicy` shares `BudgetInvariant` caps across the crew and bounds total
    iterations, per-agent iterations, delegation depth, and v1.3 serial
    child execution.
  - `createRateLimitGroup` and `withRateLimit` coordinate provider-key RPM/TPM
    buckets through the `AgentTransport` seam.
  - `receiptCid` derives receipt CIDs so per-agent receipts can chain back to
    the crew root through `parentReceiptCid`.

  The surface is explicit and does not change existing `ai.runAgent` behavior.

- a1e5f04: Add Model Capability Registry (`packages/lattice/src/capabilities/`).

  Phase 33 ships a typed, build-time-baked registry of model capability profiles so consumers can query model-class behavior (training lineage, reasoning surface, tool-call shape, known failure modes, recommended prompt strategy) before constructing a request.

  ### Public surface

  - `ModelCapabilityProfile` type with 9 readonly fields covering id, adapter, originFamily, trainingClass, reasoningSurface, toolCallSurface, contextWindow, knownFailureModes, recommendedPromptStrategy
  - 6 supporting closed string-literal unions: `CapabilityAdapter`, `TrainingClass`, `RecommendedPromptStrategy`, `KnownFailureMode`, `ReasoningSurface`, `ToolCallSurface`
  - `getCapabilityProfile(canonicalKey)` strict lookup
  - `findCapabilityProfile(id)` fuzzy lookup with OpenRouter variant-suffix stripping and direct-first adapter ordering
  - `stripOpenRouterVariant(id)` pure helper for `vendor/model:variant` normalization (reused by Phases 34 + 36 consumers)
  - `ALL_KNOWN_FAILURE_MODES` and `ALL_TRAINING_CLASSES` const arrays for exhaustive iteration

  ### Data

  - 200+ profiles total in the merged registry: live OpenRouter snapshot (333 entries after filtering tilde-prefixed `*-latest` aliases) plus 4 hand-edited supplemental profiles for `anthropic:claude-opus-4`, `gemini:gemini-2.5-pro`, `xai:grok-4`, and an `lm-studio:local-template` generic local-quantized profile.
  - Snapshot can be refreshed by running `node scripts/refresh-model-registry.mjs`; a weekly drift workflow (Phase 33 Plan 05) will open an auto-PR against the OpenRouter feed.

  ### Anchor case study

  Closes the structural gap surfaced by session_1780792387779 (gpt-oss-120b emitting `{"summary": "Greeted the user."}` as the user-visible reply for the task "hi"). The registry now flags `openrouter:openai/gpt-oss-120b` and its `:free` variant with `trainingClass: "open_weight_instruct"` and `knownFailureModes` including `"internal_envelope_leak"` so downstream Phase 36 (output sanitizers) and Phase 38 (receipt v1.2 `modelClass` field) can dispatch correctly.

  ### CAPS-\* requirements covered

  - CAPS-01 typed `ModelCapabilityProfile` + 6 closed unions
  - CAPS-02 `getCapabilityProfile` + `findCapabilityProfile` + `stripOpenRouterVariant` lookup surface
  - CAPS-03 `scripts/refresh-model-registry.mjs` build-time generator with `--check` mode
  - CAPS-05 registry covers >=200 distinct profiles at v1.3.0 cut (337 profiles total)

- 6ce8af3: Add Phase 36 opt-in output sanitizers for first-party provider adapters.

  Each of the 7 real adapter factories now accepts a `sanitizeOutput` option.
  Consumers can pass one sanitizer function or an ordered sanitizer array; string
  `rawOutputs` are transformed after provider text extraction and before the
  adapter returns, while `rawResponse` stays as the original provider body.

  The package root now exports the built-in sanitizer factories:

  - `stripReasoningTags()`
  - `stripChatTemplateArtifacts()`
  - `unwrapInternalEnvelope(schemaOrPath)`

  The root also exports `SanitizerFn`, `SanitizerContext`, and
  `SanitizeOutputOption` for custom sanitizer composition.

  The OpenRouter/internal-envelope reproduction from `session_1780792387779`
  is covered: `sanitizeOutput: unwrapInternalEnvelope({ field: "summary" })`
  turns the gpt-oss-120b-style provider text `{"summary":"Greeted the user."}`
  into the consumer-visible output `Greeted the user.`.

- 5e38c31: Add Phase 35 prompt scaffolding helpers for model-class-aware prompt assembly.

  The public package root now exports `getStructuredOutputContract`,
  `getToolUseContract`, `PROMPT_SCAFFOLD_VERSION`, and `PROMPT_STRATEGIES`.
  The helpers consume Phase 33's `RecommendedPromptStrategy` values and render
  deterministic `lattice.prompt-scaffold/v1` fragments with canonical JSON
  payloads for structured-output schemas and tool descriptors.

  The `open_weight` strategy includes explicit guard text for the
  session_1780792387779 failure mode, where gpt-oss-120b returned
  `{"summary":"Greeted the user."}` as the final answer to "hi" instead of the
  natural-language reply.

- cfc0372: Capability Receipts now mint as `lattice-receipt/v1.2`.

  The v1.2 receipt body adds optional `modelClass`, typed as the public
  `TrainingClass` union from the model capability registry. Runtime terminal
  receipts from `ai.run` derive `modelClass` through the Phase 33 strict
  `providerId:modelId` registry lookup when the selected model is known, and omit
  the field for unknown, fake, or synthetic receipt routes.

  `verifyReceipt` continues to accept signed `lattice-receipt/v1.1` receipts while
  preserving the CRYPTO-01 downgrade defense that rejects absent-version and
  `lattice-receipt/v1` receipt bodies.

  Provider adapter APIs are unchanged: `ProviderRunResponse` did not gain a
  `modelClass` field.

- f0be51f: Add Phase 37 opt-in returned tool-call validation for first-party provider adapters.

  Each of the 7 real adapter factories now accepts `validateToolCalls`, which validates prompt-reencoded returned `tool_calls` envelopes against a caller-supplied tool registry before exposing normalized `ProviderRunResponse.toolCalls`.

  Public additions:

  - `ToolCallValidationError`
  - `ToolCallValidationFailureReason`
  - `ValidateToolCallsOption`
  - `ValidatedToolCall`

  The feature validates returned tool-call envelopes and does not claim native provider tool APIs/tool execution support.

All notable changes to `@full-self-browsing/lattice` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- v1.3.0 prepares the first public npm release under the `@full-self-browsing` scope. See `.changeset/v1.3.0-initial.md` for the full release notes.

## [1.2.0] - 2026-05-31

FSB Integration plus Agent Capability. Nine phases, 25 plans, 46 REQ-IDs WIRED end-to-end. Test posture 589 of 589 lattice tests passing, strict tsc clean.

### Added

- `ai.runAgent(intent)` runtime entrypoint with a uniform prompt-reencoded tool-use protocol across all seven provider adapters (Anthropic Messages, Gemini `generateContent`, xAI, OpenRouter, LM Studio, OpenAI, OpenAI-compatible).
- `AgentHost` interface with three optional seams (scheduler, transport, storage) plus `createNoopAgentHost` as the Node-test reference implementation.
- Five agent infrastructure primitives: budget-aware cost tracker (ok / warning / exceeded thresholds), transcript store with tailed reads and first-user-turn preservation, goal-progress tracker (progressing / stalled / regressed), action-history dedup (consecutive-identical and ping-pong patterns), permission context (per-tool, per-iteration, per-resource gating with a SAFETY-band hook helper).
- `SurvivabilityAdapter<TState>` contract describing what mid-flow context eviction means for any runtime. `SerializedSnapshot` JSON round-trips byte-equal and survives DSSE plus JCS round-trip with real Ed25519 when the payload embeds a v1.1 `ReceiptEnvelope`. `createNoopSurvivabilityAdapter` ships as the reference implementation.
- `createCheckpointHook` factory minting exactly one v1.1 receipt per invocation. Signer failure degrades to `metadata.mintError` without throwing upstream.
- `examples/agent-loop` showcase exercising every Track B surface end-to-end against a fake provider and a fake tool registry with real Ed25519 signing. Produces three per-iteration receipts that verify cleanly under the ephemeral KeySet.
- `evalAgentRun` regression-gate kernel covering iterations-to-goal and total-cost gates (11 cases).

### Changed

- `CapabilityReceiptBody.version` widens to `"lattice-receipt/v1" | "lattice-receipt/v1.1"` with auto-bump in `createReceipt` when any step-marker field is populated.
- `createHookPipeline` now ships SAFETY, OBSERVABILITY, and EXTENSION priority bands with per-handler `budgetMs` race-with-log, frozen contexts, irreversible freeze, and a `matcher` regex filter.
- `RunEventKind` gains `step.transition`, `recovery.start`, `recovery.complete`, and `recovery.failed` as additive literals, closing the v1.1 audit carryforward TRACE-EXT-01.
- Delegation policy in `AGENTS.md` flipped from "multi-agent crews: Out of Scope" to "agent execution: First-class, runtime-agnostic" for the single-agent surface.

### Security

- Multi-agent crews remain explicitly out of scope. SAFETY-band hooks can deny or abort an iteration before provider invocation.
- V1.2-LIMITATION-1 documented and deferred to v1.4. Native tool-use across providers is not exposed in v1.2 because admitting native `tools[]` cleanly requires an additive extension to the `ProviderAdapter` interface. The prompt-reencoded protocol preserves INV-03 seven-provider parity in the meantime.

## [1.1.0] - 2026-05-12

Capability Receipts. Nine phases, 24 plans, 21 tasks.

### Added

- WebCrypto Ed25519 signer with an in-memory factory, plus DSSE v1.0 envelope encoder and decoder, plus a `@noble/ed25519@3.1.0` parity oracle (dev-only) defending against silent Node WebCrypto regressions.
- `CapabilityReceipt` schema with RFC 8785 JCS canonicalization via `canonicalize@3.0.0`, signed `kid` field, and a `KeySet` rotation lifecycle covering `current`, `next`, and `retired` states.
- Pure `verifyReceipt` returning a typed `VerifyResult` discriminated union with six error kinds, never throwing across the verification boundary.
- Receipts threaded inside the replay envelope via `materializeReplayEnvelope`, closing the replay round-trip.
- `lattice` CLI shipped from `packages/lattice-cli` with `repro`, `verify`, and `eval` subcommands plus a disk-backed judge cache. See the sibling CHANGELOG for full CLI history.
- Tripwire invariants with terminal semantics (`mustCite`, `fieldFromTable`, `noPII`, `matches`) and a pure `evaluateTripwires` kernel.
- Sidecar primitives (`loadSidecar`, `applySidecar`, `walkReceiptsWithSidecars`) pairing each receipt with its `{ task, outputs, policy, contract }` quadruple for replay reconstruction.
- Four work-inbox showcase scenarios (success, tripwire, no-contract-match, qualityFloor contract) emitting signed Ed25519 receipts plus content-addressed input artifacts under `.lattice/`.

### Changed

- `usage.costUsd` serialized as an I-JSON string inside receipts, not a number, preserving exact decimal semantics across JCS canonicalization.
- Redact-then-sign ordering enforced structurally with a `redactions[]` manifest and a signed `redactionPolicyId`.

## [1.0.0] - 2026-04-22

Foundation. Six phases, 11 plans, 16 tasks.

### Added

- ESM-first pnpm workspace package with strict TypeScript 6, tsdown build output, Vitest smoke coverage, and package declaration checks.
- Provider-neutral runtime, config, policy, artifact, and session contracts.
- Typed `ai.run({ task, artifacts, outputs, policy, session })` with Standard Schema and Zod output inference.
- Provider-neutral artifact lifecycle covering text, JSON, file, image, audio, document, URL, tool-result, and derived records, with payload-free refs, SHA-256 fingerprints, and descriptor-only lineage.
- Memory and local-filesystem development artifact stores with metadata-only refs, payload reloads, and inspectable fixtures.
- `ai.plan(...)` deterministic dry-run with capability-catalog routing, budget and privacy filters, fallback chains, and fake providers.
- Memory sessions, context packs, progressive overrides, narrow OpenAI / OpenAI-compatible / AI SDK adapter factories.
- Standard Schema local tools, MCP-like tool imports, replay envelopes, offline and live replay, and default redaction.
- `examples/work-inbox` multimodal showcase using the public package entrypoint with route, context, and packaging inspection plus structured action output.
