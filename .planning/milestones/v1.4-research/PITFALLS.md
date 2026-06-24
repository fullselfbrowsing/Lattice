# Pitfalls Research — v1.4 Provider Breadth + Live Multimodal + Observability Export

**Domain:** Adding streaming/multimodal, gateway delegation, and OTel observability to a shipped TypeScript SDK with Ed25519-signed receipts and deterministic routing
**Researched:** 2026-06-15
**Confidence:** HIGH for streaming-receipt and OTel-PII risks (sourced from OTel GenAI semconv docs, LiteLLM issues, and internal code inspection). MEDIUM for gateway catalog-feed trust (extrapolated from supply-chain research; no Lattice-specific incident yet). HIGH for FSB-validation gap (confirmed by inspection of v1.3 dogfooding decision and public-surface test scope).

---

## Reading Guide

Pitfalls are grouped into four tracks matching the v1.4 themes.

| Code | Track |
|------|-------|
| STRM | Streaming vs. signed-receipt determinism |
| GW | Gateway delegation (LiteLLM / OpenRouter) |
| OTEL | OpenTelemetry exporter + GenAI semconv |
| VAL | FSB-via-npm validation gap |

Each pitfall lists: failure mode, root cause, prevention, warning sign, phase ownership.

---

## Critical Pitfalls

### STRM-1: Receipt signed before stream drains — outputHash commits to partial content

**What goes wrong:**
`maybeIssueReceipt` in `create-ai.ts` fingerprints `input.outputs` to produce `outputHash`. For non-streaming runs this is the complete, deterministic output. For a streaming adapter, if the receipt creation point is reached before the stream is fully consumed (e.g., the receipt is issued at `stage.complete` while the consumer is still reading chunks), `outputHash` will commit to whatever partial buffer exists at that moment. The signature is cryptographically valid but semantically wrong: the receipt attests to a partial output. `lattice repro` and `lattice eval` will fail to reproduce because the re-run produces the full output, whose hash differs.

**Why it happens:**
The current receipt pipeline assumes a fully-materialized `RunSuccess.outputs` object exists at signing time (the non-streaming contract). Streaming adapters will return a `ReadableStream` or async iterator; nothing in the type system forces the caller to drain and buffer the stream before calling `fingerprintArtifactValue`. A naive streaming adapter that hands back an open stream reference will silently sign a partial hash.

**How to avoid:**
Structural enforcement: streaming adapters must buffer-then-sign, not stream-then-sign. Define a `StreamedProviderRunResponse` shape that holds a `streamDone: Promise<ProviderRunResponse>` alongside the `ReadableStream`. The receipt is issued only after `await streamDone`. The `ReadableStream` is surfaced to the consumer independently. This is a two-channel pattern: one channel for the user-visible token flow, one channel for the finalized output used to sign.

**Warning signs:**
- `lattice eval` pass rate drops after streaming adapters ship — eval compares `outputHash` across runs.
- `verifyReceipt` returns `ok: true` but `lattice repro` exits with code 1 (hash mismatch).
- Receipt `outputHash` is different on two runs of the same prompt with a streaming adapter.

**Phase to address:** Streaming adapter implementation phase (whichever introduces the first streaming adapter). The sign-after-drain contract must be the acceptance criterion for merging any streaming PR.

---

### STRM-2: Non-deterministic chunk boundaries produce different `outputHash` on replay

**What goes wrong:**
Even if the stream is fully drained before signing, if `outputHash` is computed as a hash of the incremental chunk sequence rather than a hash of the fully-concatenated final text, two runs that produce identical text but different chunk splits (which is routine — LLM streaming chunk sizes are implementation-defined and vary per call) will produce different hashes. `lattice eval` will see every streaming run as a determinism failure.

**Why it happens:**
`fingerprintArtifactValue` fingerprints whatever structure it receives. If a streaming adapter hands it a list of chunks rather than a single assembled output, the hash is over the chunk list, not the output. This is a silent semantic error — the code path is correct for lists of structured objects but wrong for streaming text assembled in variable-sized pieces.

**How to avoid:**
The receipt pipeline must hash the canonical assembled output, never the chunk sequence. For text: concatenate all chunks into a single UTF-8 string, normalize line endings, then fingerprint. For structured outputs (JSON, tool calls): reassemble to a canonical object before fingerprinting. Add a property-based test: for the same prompt, two streaming runs must produce the same `outputHash` regardless of chunk split.

**Warning signs:**
- `outputHash` differs between streaming runs of the same prompt.
- `evalAgentRun` regression gate reports instability on semantic-cheap evaluator despite identical responses.

**Phase to address:** Streaming adapter implementation phase. This is a correctness invariant that must be stated in the streaming adapter contract and validated by a fast-check property test.

---

### STRM-3: Cost accounting returns `null` on cancelled or interrupted streams

**What goes wrong:**
When a consumer cancels a stream mid-way (via `AbortSignal`, network drop, or backpressure), many provider APIs return a partial or no usage block. The `Usage` object may have `promptTokens` but not `completionTokens`, or may not arrive at all. The receipt then signs `costUsd: null` (unknown) when the run actually incurred real cost. Worse, `CostTracker` misses the in-flight cost from the cancelled call entirely, so `budget.maxCostUsd` enforcement is wrong for the rest of the session.

**Why it happens:**
Provider streaming endpoints deliver usage in the final SSE frame (e.g., `data: [DONE]` with `usage`). If the stream is cancelled before that frame, the usage is lost. Some providers (LM Studio is documented to have this issue per GitHub issue #557) do not include usage at all in streaming responses.

**How to avoid:**
1. Streaming adapters must catch `AbortError` or stream-cancel and attempt a best-effort usage estimate using the adapter's tokenizer or a `USAGE_UNAVAILABLE` sentinel — never silently drop the cost record.
2. The `CostTracker` `reservedUsd` pattern (budget pre-reservation before call) from v1.3 PITFALLS COST-1 must extend to streaming: reserve the estimated cost before the stream starts, reconcile on drain-complete or cancel.
3. For providers that support `stream_options: { include_usage: true }` (OpenAI, OpenRouter), always pass it. For providers that do not, fallback to tokenizer estimate.

**Warning signs:**
- `receipt.body.usage.costUsd` is `null` on streaming runs but non-null on equivalent non-streaming runs.
- `CostTracker.used()` is lower than billing dashboard after a session with cancelled streams.
- LM Studio streaming adapter never emits a cost.

**Phase to address:** Streaming adapter implementation phase. Each adapter must declare its `usageOnCancel` behavior in the adapter's quirks block (`LmStudioQuirks`, `AnthropicQuirks`, etc.).

---

### STRM-4: Partial-output sanitizers run on incomplete buffers, producing wrong sanitizer decisions

**What goes wrong:**
v1.3 shipped opt-in output sanitizers (`stripReasoningTags`, `stripChatTemplateArtifacts`, `unwrapInternalEnvelope`). These operate on the full completed output. If a streaming adapter applies sanitizers incrementally as chunks arrive, a tag like `<think>` that spans two chunks may not be detected: chunk 1 ends at `<th`, chunk 2 starts at `ink>...`. The sanitizer on chunk 1 sees incomplete content and passes it through; the tag leaks into the consumer output and — if this output is later hashed for a receipt — the `outputHash` commits to unsanitized content, violating the `redact-then-sign` invariant.

**Why it happens:**
Sanitizers were designed for buffer-complete outputs. The v1.3 API contract (`applyOutputSanitizers(output, options)`) takes a complete string. Streaming introduces a temptation to apply them incrementally to reduce latency, but this is structurally incompatible with tag-boundary detection.

**How to avoid:**
Structural rule: sanitizers are applied once, to the fully-buffered output, before the hash is computed and before the result is handed to the consumer. The streaming path is: stream to consumer (raw) → buffer in parallel → drain → sanitize → fingerprint → sign → emit receipt. The consumer sees the raw stream; the receipt attests to the sanitized output. This is the same two-channel model as STRM-1 and must be made explicit in the streaming contract.

**Warning signs:**
- `<think>` or `<|eot_id|>` present in `receipt.body.outputHash` pre-image that is absent in non-streaming runs.
- `stripReasoningTags` test coverage gaps on partial-buffer inputs.

**Phase to address:** Streaming adapter implementation phase. Document the "stream-to-consumer, sanitize-before-sign" invariant as a named architectural rule in the streaming design doc.

---

### STRM-5: Backpressure from slow consumer holds the provider connection open, blocking the receipt

**What goes wrong:**
If the consumer of a streaming response applies backpressure (reads slowly, or has a slow downstream socket), the streaming adapter may be blocked waiting for the consumer to read all chunks before it can drain and sign. During this time, the provider connection is held open. If the consumer aborts, the provider connection drops mid-stream (STRM-3). If the provider's idle-connection timeout fires first, the stream closes with a partial response. The receipt is never issued, or is issued with wrong data.

**Why it happens:**
Web Streams API backpressure is bidirectional: a slow `ReadableStreamDefaultReader` will cause the underlying fetch stream to buffer chunks in memory, but if the buffer fills (or the provider has a server-side idle timeout), the connection is forcibly closed. The two-channel model (STRM-1) partially mitigates this by decoupling consumer-facing stream from the receipt pipeline, but only if the internal buffer is bounded.

**How to avoid:**
1. The internal receipt-pipeline buffer (used to reassemble output for signing) must be independent of the consumer-facing `ReadableStream`. Use a `TransformStream` to tee the provider response: one branch for the consumer, one for the buffered-for-signing pipeline.
2. Set explicit per-adapter idle-stream timeouts (e.g., 30s no-new-chunk = abort) and surface this as a `stream.timeout` option on `ProviderRunRequest`.
3. The receipt-pipeline buffer must be bounded (e.g., 10MB) to prevent OOM on runaway streams; exceed the bound → emit `run.failed` with `reason: 'stream-buffer-overflow'`.

**Warning signs:**
- Receipts not emitted on runs where the consumer reads slowly.
- Provider connections held open for unusually long periods in network inspection.
- OOM errors on large output runs.

**Phase to address:** Streaming adapter implementation phase. The `TransformStream` tee pattern must be in the reference streaming adapter used as the template for all five new adapters.

---

### GW-1: Gateway (LiteLLM/OpenRouter) masks capability mismatch, silently routes to wrong provider

**What goes wrong:**
Lattice's deterministic router selects a provider/model based on the capability catalog (modalities, context window, structured output, tool use). When a LiteLLM or OpenRouter gateway sits between Lattice and the actual model, the gateway may silently reroute the request to a different backend provider that does not match the selected capability profile. For example, Lattice routes to `openrouter:anthropic/claude-opus-4.8` because the catalog says it supports vision and 200K context. OpenRouter's upstream load-balancer routes to a different provider's copy of the model that does not support vision in the current region, or swaps to a different model entirely if the primary is overloaded. The response arrives as if the selected model executed it, but the actual execution used different capabilities.

**Why it happens:**
OpenRouter's provider-routing layer (the `provider.order/only/ignore` arrays in OPENROUTER_QUIRKS) is opt-in and underdocumented. Without explicitly constraining provider routing, OpenRouter may substitute providers for cost/availability reasons. LiteLLM has the same behavior — its `allowed_fails` and fallback lists can reroute without signaling the caller. The receipt will reflect the requested model, not the actual executing model.

**How to avoid:**
1. For capability-critical runs (vision, audio, structured output, long context), emit explicit provider constraints via the OpenRouter `provider.only` array when routing through OpenRouter. This should be a first-class option in `OpenRouterProviderOptions`.
2. The receipt's `model.observed` field (already in the schema) must be populated from the gateway's response headers (`x-openrouter-model`, `openrouter-model`, etc.) — not just the requested model. If `model.observed != model.requested`, emit a `router.mismatch` `RunEvent` and set the receipt route `attemptNumber` to reflect the substitution.
3. Add a parity smoke test: for each capability that drove the route selection, verify it in the observed response (e.g., if the route required vision, verify the response processed the image).

**Warning signs:**
- `receipt.body.model.observed` differs from `receipt.body.model.requested` in production logs.
- Structured output failures on runs that the catalog said the model supported.
- LM Studio / OpenRouter returning 200 but with a different `model` field in the response body.

**Phase to address:** Gateway delegation phase (LiteLLM/OpenRouter integration). The `model.observed` population and `router.mismatch` event must be acceptance criteria.

---

### GW-2: Deterministic plan broken — gateway introduces fallback chain that is opaque to Lattice's router

**What goes wrong:**
Lattice's deterministic router produces a stable, inspectable execution plan. INV-03 requires parity across all 7 provider adapters. When a gateway (LiteLLM or OpenRouter) applies its own internal fallback logic (e.g., primary model fails, gateway falls back to a different model silently), Lattice's plan remains unchanged — it still shows the original route — but the actual execution took a different path. The plan is now misleading: `lattice repro` will replay the original plan, not the gateway's fallback path. Receipt chain integrity is broken because the receipt attests to a plan that did not execute.

**Why it happens:**
Gateways are designed to hide provider complexity from clients. LiteLLM's `fallbacks` config and OpenRouter's `allow_fallbacks` (an explicit quirk in `OPENROUTER_QUIRKS`) both operate below the Lattice router's visibility. The Lattice router sees a single successful response and has no signal that a fallback occurred.

**How to avoid:**
1. Disable silent gateway fallback for capability-routed runs: pass `provider.allow_fallbacks: false` when Lattice has made a capability-specific routing decision. Only allow gateway fallback for runs where the Lattice contract does not require a specific capability tier.
2. Read gateway-provided fallback/routing headers from the response and emit them as `RunEvent` metadata under `provider.attempt`. This surfaces the actual execution path to Lattice's observability layer.
3. The `ReceiptRoute.attemptNumber` must increment when a gateway signals it used a fallback. This prevents the plan from lying about the execution path.

**Warning signs:**
- `lattice repro` produces different results than the original run despite identical inputs.
- OpenRouter response headers include a model that differs from the request.
- CostTracker shows costs inconsistent with the selected model's pricing.

**Phase to address:** Gateway delegation phase. The gateway-fallback-opacity problem must be addressed before INV-03 parity is extended to gateway adapters.

---

### GW-3: Catalog auto-refresh feed is a supply-chain trust boundary with no integrity check

**What goes wrong:**
v1.4 adds auto-refresh of the capability catalog from the OpenRouter `/models` feed. This feed is fetched over HTTPS, but nothing in the current design pins, signs, or validates the schema of the fetched JSON. A compromised CDN, a MITM on misconfigured TLS, or a supply-chain attack on OpenRouter's model listing infrastructure could inject a malicious capability profile — for example, marking a model as supporting `supportsNoTraining: true` or `supportsNoLogging: true` when it does not, causing Lattice to route sensitive data to a model that logs it. This is structurally similar to the supply-chain attacks documented against AI skill ecosystems in 2026.

**Why it happens:**
Auto-refresh replaces the static Phase 33 registry (baked at build time, reviewed by the maintainer) with a runtime-fetched JSON. The trust model changes from "maintainer vetted at publish time" to "network endpoint at runtime." The existing `negotiateCapabilities` path uses TLS but does not apply additional integrity checks to the fetched model data.

**How to avoid:**
1. Define a schema (Zod) for the accepted shape of the OpenRouter `/models` response. Reject any feed that does not parse against this schema — do not merge unexpected fields into the capability catalog.
2. Apply whitelist-based capability floor checks: if the feed marks a known model as having capabilities that the static registry does not attribute to it, log a warning and use the more conservative static values (capability floor, not feed-claimed ceiling).
3. Consider a local feed snapshot approach: cache the validated feed on disk with a `lastValidated` timestamp. If the feed is unresolvable or invalid, fall back to the snapshot rather than to unconstrained fetched data.
4. For data-policy-sensitive capabilities (`supportsNoLogging`, `supportsNoTraining`), never trust the feed alone — require static registry confirmation.

**Warning signs:**
- Feed-refreshed catalog marks a model with data policy claims that differ from the static registry.
- Feed parse fails silently (no warning emitted), and the router falls through to stale or default capabilities.
- A model newly appears in the feed with claimed vision or long-context capabilities that are not documented by the provider.

**Phase to address:** Catalog auto-refresh phase. Schema validation of the fetched feed must be in the acceptance criteria before enabling auto-refresh.

---

### GW-4: Auth credentials and cost tracking are duplicated between Lattice and gateway layer

**What goes wrong:**
LiteLLM and OpenRouter both provide their own cost tracking and virtual key management. When Lattice's `CostTracker` is used alongside a gateway that also tracks cost, two separate budget systems run in parallel with no coordination. The practical failure is that the Lattice contract's `maxCostUsd` may allow a run that the gateway's virtual key budget has already exhausted, resulting in a 429 or error that propagates as a routing failure rather than a budget failure. The receipt then records `contractVerdict: 'execution-failed'` when the true verdict is `'budget-exceeded'`.

Additionally, if the gateway uses a different pricing model (e.g., LiteLLM charges a gateway markup), Lattice's CostTracker computes cost from the provider's per-token pricing, while the actual bill includes the markup. The receipt's `costUsd` is systematically understated.

**How to avoid:**
1. For runs routed through a gateway, prefer provider-reported cost from the gateway's response headers (`x-litellm-response-cost`) over Lattice's internal tokenizer estimate. Update `normalizedUsage.costUsd` from the gateway's cost header if present.
2. Document clearly that `contract.budget.maxCostUsd` enforces Lattice's estimate, not the gateway's bill. Gateway markups are not accounted for.
3. Treat gateway 429s with `x-ratelimit-policy: budget` as `'budget-exceeded'` failures, not routing failures. Map gateway error codes to Lattice's `ContractVerdict` taxonomy.

**Warning signs:**
- Receipt `costUsd` consistently lower than the gateway's dashboard cost for the same runs.
- Gateway 429s appearing as `execution-failed` receipts instead of `no-contract-match`.
- Provider key exhausted at the gateway level while Lattice's CostTracker shows budget remaining.

**Phase to address:** Gateway delegation phase. Document the cost accounting limitations in JSDoc on `OpenRouterProviderOptions` and `LiteLLMProviderOptions`.

---

### GW-5: Data residency policy violated when gateway silently routes to a provider in a different region

**What goes wrong:**
Lattice's `CapabilityContract` and `ModelCapability.dataPolicy` allow expressing data-privacy constraints (`supportsNoLogging`, `supportsNoTraining`). When routing through OpenRouter or LiteLLM, the gateway may satisfy these constraints at the Lattice level — the selected model has the right data policy — but the gateway itself routes to a provider backend in a different jurisdiction. Sensitive user data crosses a data-residency boundary without the Lattice policy layer being aware of it.

**Why it happens:**
Lattice enforces data policy against the capability catalog, which describes the API endpoint (e.g., `openrouter:anthropic/claude-opus-4.8`) not the underlying infrastructure routing. The gateway's provider selection is opaque to Lattice.

**How to avoid:**
1. Document this limitation prominently in the gateway adapter JSDoc: "Data residency constraints expressed in `ModelCapability.dataPolicy` apply to the Lattice-visible endpoint only. Gateway-internal routing may cross jurisdictions. Do not rely on Lattice policy enforcement for GDPR residency requirements when using a gateway adapter."
2. For data-residency-sensitive workloads, recommend direct provider adapters (Anthropic, Gemini, etc.) rather than gateway delegation.

**Warning signs:**
- A team using LiteLLM for EU data residency while relying on Lattice's `dataPolicy` enforcement.

**Phase to address:** Gateway delegation phase. Must be documented before the gateway adapters are released.

---

### OTEL-1: GenAI semantic convention churn breaks downstream dashboards on minor version bumps

**What goes wrong:**
As of June 2026, all OpenTelemetry GenAI semantic conventions remain in **Development** (experimental) status. Every release from v1.37 to v1.41 has modified attribute names: `gen_ai.prompt` and `gen_ai.completion` were deprecated and removed in v1.38; `gen_ai.input.messages` and `gen_ai.output.messages` replaced them; agent span conventions are being added in parallel. If Lattice's OTel exporter emits attributes under the current experimental names, a `@opentelemetry/semantic-conventions` patch release can silently change attribute names, breaking Langfuse/Phoenix dashboards that filter on specific attribute keys.

**Why it happens:**
The `OTEL_SEMCONV_STABILITY_OPT_IN` transition plan explicitly requires instrumentation to freeze at v1.36.0 by default and opt into newer names via an env var. Implementing a custom exporter without following this transition plan means the exporter emits whatever the installed version of `@opentelemetry/semantic-conventions` provides — which changes across minor releases.

**How to avoid:**
1. Pin the attribute name strings as constants in Lattice's exporter, do not import them dynamically from `@opentelemetry/semantic-conventions` (which may be the user's installed version). This gives Lattice explicit control over which attribute names it emits.
2. Expose a `semconvVersion: 'v1.36' | 'latest-experimental'` option on the OTel exporter (mirroring the `OTEL_SEMCONV_STABILITY_OPT_IN` pattern). Default to `'v1.36'` for compatibility; users opt into `'latest-experimental'` at their own risk.
3. Add a CI job that pins to a specific `@opentelemetry/semantic-conventions` version and fails if the emitted attribute names change without a deliberate version bump in Lattice.

**Warning signs:**
- Langfuse/Phoenix dashboards show empty data after a `@opentelemetry/semantic-conventions` update.
- Attribute names in traces differ between Lattice SDK versions despite no Lattice source changes.
- `gen_ai.prompt` in spans after v1.38 of semconv (deprecated and removed).

**Phase to address:** OTel exporter implementation phase. The pinned-constants approach must be the design decision before writing any attribute-emission code.

---

### OTEL-2: PII leakage into spans — receipts are redaction-aware; OTel spans must be too

**What goes wrong:**
Lattice's receipt pipeline enforces `redact-then-sign` ordering: PII is redacted before the receipt body is canonicalized and signed. OTel spans are a separate channel. If the `RunEventKind` exporter naively serializes `RunEvent.metadata` into span attributes, it may include content that the receipt pipeline would have redacted: user prompts, tool call arguments, PII-containing model outputs, or tripwire-detected PII evidence. The receipt shows the redacted version; the OTel span shows the raw version. The span is then exported to Langfuse/Phoenix, which may have weaker access controls than the Lattice receipt store.

**Why it happens:**
`RunEvent.metadata` is a `Record<string, unknown>` — it accepts arbitrary content. When events are emitted (e.g., `provider.attempt`, `tool.call`, `validation.complete`), the metadata may include request bodies or output fragments. The receipt pipeline has an explicit redaction hook; the OTel export path currently has none.

**How to avoid:**
1. Define a `SpanSanitizer` interface parallel to `redactReceiptBody`: `(event: RunEvent) => RunEvent` that is applied before any attribute is written to a span. Ship a default implementation that strips keys matching PII detector patterns from `metadata`.
2. Span attributes for `gen_ai.input.messages` and `gen_ai.output.messages` (if emitted at all) must go through the same default redaction policy as receipts. Apply `defaultPiiDetectors` before emitting.
3. Content capture must be **opt-in**, defaulting to off, mirroring the OTel GenAI spec's recommendation that "no prompt content or tool arguments are captured with GenAI telemetry by default."
4. The `redactionPolicyId` from the receipt must appear as a span attribute so Langfuse/Phoenix consumers can cross-reference which policy was applied to both the receipt and the trace.

**Warning signs:**
- User prompt content appearing in Langfuse trace attribute inspector.
- PII-detector patterns (email, SSN, phone) found in exported span attribute values.
- `tool.call` events exporting tool arguments that include user-supplied credentials or PII.

**Phase to address:** OTel exporter implementation phase. The `SpanSanitizer` default must be in place before any export to Langfuse/Phoenix is enabled. This is the highest-severity pitfall in the OTel track — a PII leak to an observability platform is a data breach, not a bug.

---

### OTEL-3: Double instrumentation — Vercel AI SDK and Lattice both emit OTel spans for the same provider call

**What goes wrong:**
The v1.3 stack uses Vercel AI SDK internally for some adapter paths (`createAISdkProvider`, `createOpenAICompatibleProvider` wraps AI SDK). Vercel AI SDK 6 ships built-in OTel instrumentation that emits `gen_ai.*` spans for every provider call. If Lattice's own OTel exporter also emits spans for the same calls (mapped from `RunEventKind`), the same provider invocation appears twice in the trace: once from AI SDK and once from Lattice. Langfuse/Phoenix will show duplicate root spans, making cost and latency analysis incorrect.

**Why it happens:**
When a user installs Lattice in a Node.js app that already has an OTel SDK configured, the AI SDK's auto-instrumentation activates. Lattice then also emits spans. Neither library is aware of the other's instrumentation.

**How to avoid:**
1. Lattice's exporter must be a **bridge**, not a parallel instrumentor. It should attach Lattice-specific attributes to the existing AI SDK span context when one is active, rather than creating a new root span. Use `opentelemetry.trace.getActiveSpan()` to detect an existing span before creating a new one.
2. Provide a `disableAiSdkAutoInstrumentation` option on the Lattice OTel exporter for users who want Lattice spans only.
3. Document in the OTel exporter README: "If you use Vercel AI SDK adapters, the AI SDK will emit its own gen_ai spans. Use Lattice's span bridge mode to annotate those spans rather than creating parallel spans."

**Warning signs:**
- Duplicate root spans in Langfuse trace view for the same provider call.
- Token counts doubled in Langfuse's cost calculation dashboard.
- OTel span count 2x higher than expected after enabling Lattice exporter.

**Phase to address:** OTel exporter implementation phase. The bridge-vs-parallel decision must be made before any span creation code is written.

---

### OTEL-4: Exporter backpressure causes `RunEventSink` to block the `ai.run` hot path

**What goes wrong:**
`RunEventSink` is typed as `(event: RunEvent) => void | Promise<void>`. If the OTel exporter's `BatchSpanProcessor` queue fills up (the default max queue size in `@opentelemetry/sdk-node` is 2048 spans; at high run volume this fills quickly), the OTel SDK drops spans silently. However, if the Lattice exporter `await`s the OTel export and the export is blocked by a full queue or a slow OTLP endpoint, the `await` in `RunEventSink` propagates latency back into the `ai.run` call — adding OTel export latency to the user's perceived model latency.

**Why it happens:**
`BatchSpanProcessor.onEnd()` is nominally non-blocking, but the span queue can back up when the OTLP exporter is slow. If the Lattice exporter uses `SimpleSpanProcessor` instead of `BatchSpanProcessor`, every span export is synchronous, making it far worse.

**How to avoid:**
1. The Lattice OTel exporter must use `BatchSpanProcessor` (not `SimpleSpanProcessor`) and configure it with explicit queue limits and a non-blocking `onEnd` path.
2. The `RunEventSink` implementation for OTel must be fire-and-forget: emit spans synchronously to the `BatchSpanProcessor.onEnd()`, never `await` the export. The export happens asynchronously in the background.
3. Expose `maxQueueSize` and `maxExportBatchSize` as configurable options on the Lattice OTel exporter.
4. Test: under artificial OTLP endpoint latency (100ms response time), assert that `ai.run` p99 latency is unaffected.

**Warning signs:**
- `ai.run` p99 latency increases after enabling the OTel exporter.
- OTel SDK logs "Dropping span because max queue size reached."
- OTLP endpoint error rate causes visible latency regression in Lattice.

**Phase to address:** OTel exporter implementation phase. The `BatchSpanProcessor` with fire-and-forget `onEnd` must be the only supported configuration.

---

### VAL-1: FSB-via-npm dogfooding covers only the API slice FSB uses — new exports regress silently

**What goes wrong:**
v1.3 superseded the synthetic canary (Phases 30–32) in favor of FSB consuming Lattice via the published npm package. This is a credible real-world integration test, but it is not a full-surface test. FSB exercises only the capabilities it uses: `createAI`, `runAgent`, the receipt verification path, and the adapters it has wired. Exports added in v1.4 — the OTel exporter, streaming adapters, gateway delegation, `lattice eval --agent` — may have type errors, missing exports, or runtime failures that FSB never exercises because FSB does not use those features. A broken `createOpenRouterGatewayProvider` or a mis-exported OTel exporter type can survive multiple npm releases before anyone notices.

This is structurally confirmed by inspecting `test/public-surface.test.ts`: it covers the v1.1/v1.2/v1.3 surface explicitly (contract, tripwires, receipts, sanitizers, scaffold) but will not automatically cover v1.4 additions unless the test is extended.

**Why it happens:**
FSB is a real application with a specific feature set. It cannot be expected to exercise every Lattice export. The canary strategy works for the features FSB uses; it is blind to features FSB does not use.

**How to avoid:**
1. For every v1.4 public export, add at minimum a smoke test in `test/public-surface.test.ts` that imports and type-checks the export. This is the "can it be imported" gate that runs on every CI push.
2. Run `publint` and `@arethetypeswrong/cli` against the tarball after every build, specifically checking all new export paths.
3. For the OTel exporter: add a canary integration test in the FSB codebase that wires up the exporter — even if it exports to a no-op OTLP endpoint — so the wiring is exercised per release.
4. Track the "coverage ratio": for each v1.4 REQ-ID that adds a public export, confirm a corresponding entry in `public-surface.test.ts` or a FSB integration test.

**Warning signs:**
- A v1.4 release ships and the first GitHub issue is "TypeError: createOtelExporter is not a function" from an external consumer.
- `@arethetypeswrong/cli` reports an error on a new export path that was not caught in CI.
- `public-surface.test.ts` last modified date predates the v1.4 release date.

**Phase to address:** Every v1.4 implementation phase. The `public-surface.test.ts` update must be in the acceptance criteria for every phase that adds a public export. This is an ongoing discipline, not a one-time gate.

---

### VAL-2: Streaming adapters shipping with `streaming: false` in capability catalog break INV-03 parity

**What goes wrong:**
The existing capability catalog (`catalog.ts`) has `streaming: false` as the default for all providers. v1.4 adds streaming to five adapters. If the streaming implementation ships but the catalog entry still says `streaming: false`, the deterministic router will never select those adapters for streaming-capable runs (the capability filter will exclude them). Worse, if a user manually specifies a streaming-capable model and the adapter's execute path returns a stream, but `NegotiatedCapabilities.supports.streaming` is `false` (from a stale registry entry), the receipt will attest to a non-streaming run when a streaming run occurred. INV-03 parity tests may pass on the individual adapter tests but fail at the integration level where the router's capability filter is involved.

**How to avoid:**
Streaming support must be added atomically: adapter code + capability catalog entry + `NegotiatedCapabilities.supports.streaming: true` + INV-03 parity smoke extended to streaming mode. Treat the parity smoke as the merge gate.

**Warning signs:**
- Streaming adapter works in isolation tests but is never selected by the router in integration.
- `receipt.body.model.observed` shows a non-streaming model even though the adapter returned a stream.
- `negotiateCapabilities` returns `streaming: false` for a model that is documented as streaming-capable.

**Phase to address:** Streaming adapter implementation phase. The atomic update rule (adapter + catalog + negotiation + parity) must be in the PR checklist.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Sign stream mid-flight instead of post-drain | Slightly lower time-to-receipt | Partial `outputHash`; `lattice repro` and `lattice eval` permanently broken for streaming runs | Never |
| Emit raw `RunEvent.metadata` as span attributes | Zero extra code | PII leaks to Langfuse/Phoenix; data breach | Never |
| Import gen_ai attribute names from `@opentelemetry/semantic-conventions` at runtime | Smaller exporter code | Dashboard breakage on semconv minor version bump | Never for stable exporters |
| Allow gateway silent fallback | Resilience out-of-box | Plan lies about execution path; receipts attest to wrong route | Never when determinism or data policy matters |
| Skip `public-surface.test.ts` update for new exports | Faster PR | New exports regress silently; first signal is a user GitHub issue | Never for v1.x public API |
| Trust OpenRouter feed capabilities for data-policy fields at face value | Simpler catalog code | Sensitive data routed to logging provider | Never |
| Use `SimpleSpanProcessor` for OTel exporter | Simpler setup | OTel export latency added to every `ai.run` call | Never in production paths |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| OpenRouter streaming | Assuming `streamingDiverges: false` means chunk-sequence determinism | Chunks are always non-deterministic in split; only the assembled output is deterministic |
| LiteLLM cost tracking | Relying on Lattice's per-token pricing when LiteLLM adds a markup | Read `x-litellm-response-cost` header; document the gap |
| OTel + AI SDK | Creating parallel spans for the same provider call | Use bridge mode: attach to existing AI SDK span if active |
| OpenRouter `/models` feed | Using feed-claimed `supportsNoLogging` for GDPR routing | Require static registry confirmation for data-policy fields |
| LM Studio streaming | Expecting streaming usage block in final frame | LM Studio does not include usage in streaming responses; use tokenizer estimate |
| Langfuse OTLP ingestion | Sending raw prompt content as span attributes | Apply `SpanSanitizer` before any content attribute is emitted |
| Gen_ai semconv v1.38+ | Using `gen_ai.prompt` / `gen_ai.completion` attribute names | Deprecated and removed; use `gen_ai.input.messages` / `gen_ai.output.messages` |
| Catalog auto-refresh | Merging all feed fields including unexpected ones | Parse against strict Zod schema; reject or warn on unknown fields |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Sanitizer applied per-chunk on streaming output | Tag boundaries missed; race between consumer and sanitizer pipeline | Sanitize only on fully-buffered post-drain output | Day 1 of streaming with reasoning-tag models |
| `await`-ing OTel export in RunEventSink | `ai.run` latency spikes on OTLP backend slowdown | Fire-and-forget; `BatchSpanProcessor` only | When OTLP backend latency > 10ms |
| Unbounded stream buffer for receipt signing | OOM on long-context streaming runs | Bound the internal buffer (e.g., 10MB); emit `stream-buffer-overflow` failure on exceed | Runs with output > buffer limit |
| Full catalog re-fetch on every run | 200ms+ added to every `ai.run` cold-start | TTL cache per instance (default: 5 minutes) — already exists in `OpenRouterProviderOptions.modelsCacheTtlMs` | Without TTL: any sustained load |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| OTel spans emit raw prompt/output content by default | PII data breach via observability platform | Content capture off by default; opt-in with explicit `SpanSanitizer` |
| Trust catalog feed's data-policy claims without static verification | Sensitive data routed to logging provider | Static registry overrides feed for data-policy fields |
| Gateway fallback to an unknown provider silently | Data policy violated; receipts attest wrong model | `provider.allow_fallbacks: false` for capability-critical runs; validate `model.observed` |
| Stream-then-sign instead of drain-then-sign | Receipt attests to partial output; replay determinism broken | Structural enforcement: sign only after `streamDone` resolves |
| Export KMS signer private key material in span attributes | Key compromise | KMS adapter shapes (v1.4 carried scope) must never log key material; redact `kid`-adjacent attributes |

---

## "Looks Done But Isn't" Checklist

- [ ] **Streaming adapters:** Receipt issued before stream drains — verify `outputHash` matches between two runs of the same prompt using a streaming adapter (STRM-1)
- [ ] **Streaming adapters:** Chunk-sequence hashing instead of assembled-output hashing — run fast-check property test asserting `outputHash` stability across chunk-boundary variations (STRM-2)
- [ ] **Streaming adapters:** `CostTracker` not updated on stream cancel — verify `usage.completionTokens` is non-zero or `null` (never zero) on cancelled streams (STRM-3)
- [ ] **Streaming adapters:** Sanitizers applied pre-drain — verify `<think>` tags absent in `outputHash` pre-image on xAI/Anthropic extended-thinking streaming runs (STRM-4)
- [ ] **Gateway delegation:** `model.observed` field populated from gateway response headers — verify receipt `model.observed != model.requested` logs a `router.mismatch` event (GW-1)
- [ ] **Gateway delegation:** Silent gateway fallback enabled for capability-critical runs — verify `provider.allow_fallbacks: false` is the default when capability constraints exist (GW-2)
- [ ] **Catalog auto-refresh:** Feed parsed against strict Zod schema — verify a malformed feed entry is rejected with a warning, not silently merged (GW-3)
- [ ] **OTel exporter:** Raw metadata emitted to spans — verify default `SpanSanitizer` strips PII-matching patterns from all `metadata` values (OTEL-2)
- [ ] **OTel exporter:** AI SDK double-instrumentation — verify no duplicate root spans in a trace when AI SDK adapters are used with Lattice OTel exporter (OTEL-3)
- [ ] **OTel exporter:** `ai.run` latency unaffected by OTel export — verify p99 latency unchanged under slow OTLP backend with `BatchSpanProcessor` (OTEL-4)
- [ ] **Public surface:** New v1.4 exports have corresponding `public-surface.test.ts` entries — verify test file modified date is same PR as the export addition (VAL-1)
- [ ] **Streaming + catalog:** `streaming: true` in capability catalog updated atomically with adapter code — verify INV-03 parity smoke includes streaming mode (VAL-2)

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| STRM-1 (partial outputHash shipped) | HIGH | Receipt schema is locked; `outputHash` commitments in existing receipts are wrong. Patch the adapter; issue a new receipt schema version (v1.3?) with a `streamMode` flag; document that streaming receipts issued before the patch are not replayable |
| STRM-3 (cost loss on cancel) | LOW | Add `usageOnCancel: 'estimate' | 'unavailable'` to adapter quirks; patch CostTracker to use estimate; no receipt schema change needed |
| GW-1 (gateway masks capability mismatch) | MEDIUM | Add `model.observed` population from response headers; patch all gateway adapters; re-run INV-03 parity smoke |
| GW-3 (malicious catalog feed entry) | HIGH | Incident response: freeze auto-refresh, revert to static registry, audit receipts issued using the compromised capability data, rotate catalog cache |
| OTEL-2 (PII leaked to spans) | HIGH | Disable content capture immediately (flip default to off); notify affected users; assess whether the OTLP backend (Langfuse/Phoenix) can delete the affected traces |
| OTEL-1 (semconv churn breaks dashboards) | MEDIUM | Pin attribute name constants in exporter source; ship a patch release; document the breaking change in CHANGELOG |
| VAL-1 (export regression not caught by FSB) | LOW-MEDIUM | Extend `public-surface.test.ts` for the broken export; patch the export; publish a patch release |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| STRM-1 partial outputHash | Streaming adapter implementation | fast-check: two streaming runs produce same outputHash |
| STRM-2 chunk-sequence hashing | Streaming adapter implementation | fast-check: outputHash stable across chunk-boundary variations |
| STRM-3 cost on cancel | Streaming adapter implementation per adapter | budget=0 cancel test; CostTracker reconciliation test |
| STRM-4 sanitizer pre-drain | Streaming adapter implementation | reasoning-tag model streaming test; hash pre-image inspection |
| STRM-5 backpressure blocks receipt | Streaming adapter implementation | slow-reader integration test; OOM guard test |
| GW-1 capability mismatch via gateway | Gateway delegation phase | model.observed population test; router.mismatch event test |
| GW-2 gateway opaque fallback | Gateway delegation phase | lattice repro round-trip on a gateway-fallback scenario |
| GW-3 catalog feed supply-chain | Catalog auto-refresh phase | malformed feed rejection test; data-policy override test |
| GW-4 cost duplication between layers | Gateway delegation phase | cost header override test; 429-as-budget-exceeded mapping test |
| GW-5 data residency via gateway | Gateway delegation phase | JSDoc + SECURITY.md documentation; no test (architectural limitation) |
| OTEL-1 semconv churn | OTel exporter implementation | pinned-constants CI diff test |
| OTEL-2 PII in spans | OTel exporter implementation | SpanSanitizer unit test + PII detector integration test |
| OTEL-3 double instrumentation | OTel exporter implementation | Duplicate span detection integration test with AI SDK |
| OTEL-4 exporter backpressure | OTel exporter implementation | Slow-OTLP latency regression test; BatchSpanProcessor config test |
| VAL-1 FSB coverage gap | Every v1.4 phase | public-surface.test.ts updated per PR; publint + attw in CI |
| VAL-2 streaming capability in catalog | Streaming adapter implementation | INV-03 parity smoke extended to streaming mode |

---

## Sources

- [OpenTelemetry GenAI Semantic Conventions — Inside the LLM Call (OTel Blog, 2026)](https://opentelemetry.io/blog/2026/genai-observability/)
- [How OpenTelemetry Traces LLM Calls, Agent Reasoning, and MCP Tools (Greptime, 2026-05-09)](https://greptime.com/blogs/2026-05-09-opentelemetry-genai-semantic-conventions)
- [Semantic conventions for generative client AI spans (OTel official spec)](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/)
- [gen_ai.prompt and gen_ai.completion deprecated in latest semconv — openllmetry issue #3515](https://github.com/traceloop/openllmetry/issues/3515)
- [OTel semantic-conventions v1.37.0 gen-ai directory](https://github.com/open-telemetry/semantic-conventions/tree/v1.37.0/docs/gen-ai)
- [How to Fix Span Batch Export Error in OpenTelemetry SDKs (OneUptime, 2026)](https://oneuptime.com/blog/post/2026-02-06-fix-span-batch-export-error-opentelemetry-sdks/view)
- [How to Implement Backpressure Handling in OpenTelemetry Pipelines (OneUptime, 2026)](https://oneuptime.com/blog/post/2026-02-06-backpressure-handling-opentelemetry-pipelines/view)
- [Langfuse OpenTelemetry Tracing Support (Langfuse Changelog, 2025-02-14)](https://langfuse.com/changelog/2025-02-14-opentelemetry-tracing)
- [LM Studio SDK: streaming responses don't include token usage — GitHub issue #557](https://github.com/lmstudio-ai/lmstudio-js/issues/557)
- [LiteLLM: x-litellm-response-cost not returned when streaming with include_usage — GitHub issue #12689](https://github.com/BerriAI/litellm/issues/12689)
- [Diagnosing Errors — Provider vs Gateway (LiteLLM docs)](https://docs.litellm.ai/docs/proxy/error_diagnosis)
- [How We Handle LLM Provider Failover at Scale (LLM Gateway, 2026)](https://llmgateway.io/blog/how-we-handle-llm-provider-failover)
- [Your Agent Is Mine: Measuring Malicious Intermediary Attacks on the LLM Supply Chain (arXiv, 2026)](https://arxiv.org/html/2604.08407)
- [OpenRouter June 2026: New Models, Pricing and Rankings (Digital Applied, 2026)](https://www.digitalapplied.com/blog/openrouter-new-models-june-2026-roundup-pricing-rankings)
- [Resume tokens and last-event IDs for LLM streaming (DEV.to / Ably, 2026)](https://dev.to/ablyblog/resume-tokens-and-last-event-ids-for-llm-streaming-how-they-work-what-they-cost-to-build-4l7e)
- [How to track LLM token usage (2026) (Braintrust)](https://www.braintrust.dev/articles/how-to-track-llm-token-usage-2026)
- Lattice v1.3 source inspection: `packages/lattice/src/receipts/`, `packages/lattice/src/runtime/create-ai.ts`, `packages/lattice/src/providers/`, `packages/lattice/src/tracing/tracing.ts`, `packages/lattice/test/public-surface.test.ts`

---
*Pitfalls research for: v1.4 Provider Breadth + Live Multimodal + Observability Export (Lattice — Ed25519-signed capability-runtime SDK)*
*Researched: 2026-06-15*
