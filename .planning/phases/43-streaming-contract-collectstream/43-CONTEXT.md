# Phase 43: Streaming Contract + collectStream - Context

**Gathered:** 2026-06-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 43 defines the core streaming contract and tested collection bridge without implementing provider-specific streaming adapters. In scope: additive optional `ProviderAdapter.executeStream?`, normalized stream chunk/result types, `collectStream()` as the bridge from provider stream to `ProviderRunResponse`, runtime wiring that records stream start/complete/failed events without per-token flooding, receipt issuance only after collection, and property/regression tests proving chunk-boundary-independent final output hashes. Out of scope: Anthropic/Gemini/xAI/OpenRouter/LM Studio stream parser implementations, realtime bidirectional sessions, OpenTelemetry export helpers, lineage merkle roots, and FSB-via-npm validation.

</domain>

<decisions>
## Implementation Decisions

### Public Streaming Contract
- `ProviderAdapter` should gain an optional `executeStream?` method so existing consumer adapters with only `execute` remain source-compatible.
- Stream chunks should be a narrow discriminated union focused on normalized text deltas, structured output patches or final raw output, tool-call deltas, usage/final metadata, and provider gateway observations where available.
- The public contract should avoid provider-specific event names, raw SSE payloads, and per-token `RunEvent` exposure; adapters may preserve raw details internally or in `rawResponse` after collection.
- New public value exports must update the Phase 40 root export inventory, and new type-only surfaces must be covered through package-entrypoint `tsd`.

### Collection Semantics
- `collectStream()` is the only supported path from a provider stream into the existing `ProviderRunResponse` shape used by validation, tripwires, persistence, result metadata, and receipt issuance.
- Collection should assemble final outputs deterministically from normalized chunks, preserving chunk order but not chunk boundaries in the final response.
- Usage and gateway metadata should be merged conservatively, preferring explicit final chunks while still allowing adapters to report usage/observed model at stream completion.
- Collection failures should surface as provider execution failures and retain enough metadata for plan attempts and events without exposing raw prompt, output, or artifact content by default.

### Runtime Events and Route Accounting
- `RunEventKind` should gain stream bracketing markers, such as `stream.start`, `stream.complete`, and `stream.failed`, emitted once per provider streaming attempt.
- Streaming events should connect to the same run id, plan id, provider id, model id, and gateway metadata language already used by `provider.attempt`.
- The runtime should select `executeStream?` only when the intent or policy explicitly asks for streaming, otherwise `execute()` remains the default path for current callers.
- Streaming must not mutate `ExecutionPlan.route.selected`, fallback chain semantics, or requested-versus-observed model accounting established in Phases 41 and 42.

### Receipts and Hash Invariants
- Receipts are issued only after `collectStream()` returns a normal `ProviderRunResponse`; there should be no partial or per-chunk receipt issuance in Phase 43.
- Receipt `outputHash` must be computed over the assembled validated final outputs, exactly like non-streaming runs, so chunk boundaries cannot affect signed output identity.
- Property tests should generate equivalent text split across different chunk boundaries and prove that collected outputs and signed output hashes are identical.
- Failure and validation branches should keep the existing terminal receipt semantics; streaming only changes how a response is obtained, not how terminal verdicts are signed.

### the agent's Discretion
- The planner may choose the exact stream chunk type names and whether `collectStream()` lives near provider contracts or in a focused streaming module.
- The planner may choose the initial intent/policy opt-in shape for streaming, but it should be additive and should not make current `ai.run()` calls stream by default.
- The planner may decide whether fake-provider streaming support is added directly to `createFakeProvider` or through a focused test helper, as long as Phase 43 can test the runtime path without live providers.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/lattice/src/providers/provider.ts` owns `ProviderAdapter`, `ProviderRunRequest`, `ProviderRunResponse`, `ProviderGatewayMetadata`, and `Usage`; it is the natural place for additive stream contract types.
- `packages/lattice/src/runtime/create-ai.ts` centralizes provider invocation, attempt recording, validation, tripwire evaluation, result assembly, gateway propagation, and `maybeIssueReceipt`.
- `packages/lattice/src/tracing/tracing.ts` owns the `RunEventKind` vocabulary and `RunEvent` shape.
- `packages/lattice/src/providers/fake.ts` already provides deterministic provider responses for runtime tests and can support streaming fixtures cheaply.
- `packages/lattice/test/public-surface.test.ts` and `packages/lattice/test-d/index.test-d.ts` are the Phase 40 public-surface guardrails for new exports.

### Established Patterns
- Runtime features are additive and preserve old adapter literals; Phase 34 added optional provider fields without breaking four-field consumer adapters.
- Gateway metadata from Phases 41 and 42 is additive and separate from Lattice route selection; streaming should reuse that separation.
- Terminal receipts are issued centrally after validation/tripwire branches and hash the final output value through `fingerprintArtifactValue`.
- Provider tests use fake fetches and fake providers; Phase 43 should not require live streaming endpoints.
- Public runtime values are exact-inventory checked, while type-only package surface is asserted through `tsd`.

### Integration Points
- Streaming contracts connect to `packages/lattice/src/providers/provider.ts`, `packages/lattice/src/index.ts`, and package type tests.
- Stream collection connects to a new focused module plus `packages/lattice/src/runtime/create-ai.ts` before the existing validation and receipt branches.
- Event bracketing connects to `packages/lattice/src/tracing/tracing.ts`, `emitEvent`, `provider.attempt` metadata, and runtime tests.
- Receipt hash invariants connect to `maybeIssueReceipt`, `fingerprintArtifactValue`, in-memory signer/keyset helpers, and receipt verification tests.
- Verification connects to provider contract tests, runtime streaming tests, property tests for chunk-boundary variation, public-surface tests, `tsd`, and package boundary checks.

</code_context>

<specifics>
## Specific Ideas

Autonomous smart-discuss defaults were accepted in Codex default-mode fallback. The preferred implementation shape is an explicit streaming opt-in on the run intent or policy, a small exported `collectStream()` helper, normalized stream chunks that do not expose provider-specific SSE details as the public API, and fake-provider tests that prove the non-streaming path is unchanged.

</specifics>

<deferred>
## Deferred Ideas

Provider-specific streaming parser implementations belong to Phase 44. Multimodal request shaping and realtime session direction belong to Phase 45. Lineage merkle roots and KMS signer shapes belong to Phase 46. OTel export of streaming events belongs to Phase 47. FSB-via-npm dogfood and showcase validation belong to Phase 49.

</deferred>
