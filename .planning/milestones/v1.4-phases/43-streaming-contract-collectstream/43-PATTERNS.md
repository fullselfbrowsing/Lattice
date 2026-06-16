# Phase 43: Streaming Contract + collectStream - Pattern Map

**Date:** 2026-06-16
**Status:** Complete

## Files and Roles

| File | Role | Closest Existing Pattern |
|---|---|---|
| `packages/lattice/src/providers/provider.ts` | Provider contract and stream type home | Phase 34 optional `quirks?` / `negotiateCapabilities?` on `ProviderAdapter` |
| `packages/lattice/src/providers/streaming.ts` | New stream collection helper | Pure helper modules such as `receipts/cid.ts`, `tools/tool-call-validation.ts`, and `capabilities/negotiate.ts` |
| `packages/lattice/src/providers/fake.ts` | Deterministic streaming fixture path | Existing `response` function option for fake-provider tests |
| `packages/lattice/src/policy/policy.ts` | Additive streaming opt-in | `GatewayPolicy` nested policy object and shallow `mergePolicy()` behavior |
| `packages/lattice/src/runtime/create-ai.ts` | Runtime stream execution and receipt finalization | Phase 42 `ProviderRunResponse.gateway` propagation and centralized `maybeIssueReceipt()` |
| `packages/lattice/src/tracing/tracing.ts` | Stream event vocabulary | Additive `RunEventKind` literals for recovery and capability negotiation |
| `packages/lattice/src/runtime/public-types.ts` | Package-root type export path | Existing provider type export block |
| `packages/lattice/src/index.ts` | Public value/type exports | Phase 40 exact public-surface inventory |
| `packages/lattice/src/runtime/create-ai.test.ts` | Runtime/receipt invariant tests | Existing signer/keyset + `verifyReceipt()` tests around output hashes |
| `packages/lattice/src/providers/streaming.test.ts` | Collector unit tests | Existing package-local Vitest files |
| `packages/lattice/test/public-surface.test.ts` | Value export guard | `EXPECTED_PUBLIC_VALUE_EXPORTS` sorted exact list |
| `packages/lattice/test-d/index.test-d.ts` | Package-root type guard | Existing `ProviderGatewayMetadata`, `OpenRouterProviderOptions`, and `ProviderAdapter` assertions |

## Reusable Code Patterns

### Optional Provider Extensions

`ProviderAdapter` already accepts additive optional fields:

```typescript
readonly quirks?: AdapterQuirks;
readonly negotiateCapabilities?: (modelId: string) => Promise<NegotiatedCapabilities>;
```

Phase 43 should follow that model:

```typescript
readonly executeStream?: (
  request: ProviderRunRequest,
) => AsyncIterable<ProviderStreamChunk> | Promise<AsyncIterable<ProviderStreamChunk>>;
```

Do not make `execute` required, and do not require existing adapters to implement streaming.

### Runtime Response Finalization

`create-ai.ts` already treats adapter responses as the single source feeding validation, tripwires, terminal results, and receipts:

```typescript
const response = await adapter.execute(request);
const validation = await validateOutputMap(intent.outputs, response.rawOutputs, plan);
```

Streaming should produce the same `response` variable through:

```typescript
const response = await collectStream(await adapter.executeStream(request));
```

after emitting stream bracketing events.

### Gateway Metadata Propagation

Phase 42 already propagates response gateway metadata without mutating the selected route:

```typescript
...(response.gateway !== undefined ? { gateway: response.gateway } : {}),
model: { requested: route.modelId, observed: observedModelForReceipt(response) },
```

Streaming must preserve this requested-versus-observed separation.

### Receipt Output Hash

`maybeIssueReceipt()` hashes final outputs, not provider transport state:

```typescript
const outputHash =
  input.outputs === undefined
    ? null
    : ((await fingerprintArtifactValue(input.outputs))?.value ?? null);
```

Chunk-boundary invariants should assert this behavior from the outside with two streaming runs producing the same validated output.

### Event Vocabulary

`RunEventKind` is an additive union. Phase 43 should add literals near other runtime events:

```typescript
| "stream.start"
| "stream.complete"
| "stream.failed"
```

Event metadata should stay compact and sanitized.

## Data Flow

1. `ai.run()` builds a deterministic plan and route exactly as before.
2. Runtime builds `ProviderRunRequest`.
3. If streaming is explicitly requested and the adapter has `executeStream?`, runtime emits `stream.start`.
4. Runtime calls `executeStream?` and passes the iterable to `collectStream()`.
5. `collectStream()` returns `ProviderRunResponse`.
6. Runtime emits `stream.complete` or `stream.failed`.
7. Existing validation, tripwire, persistence, result, event, and receipt branches operate on the collected `ProviderRunResponse`.

## Verification Patterns

### Collector Unit Tests

Use literal async generators:

```typescript
async function* chunks() {
  yield { kind: "text-delta", output: "answer", text: "hel" };
  yield { kind: "text-delta", output: "answer", text: "lo" };
  yield { kind: "complete", usage: { promptTokens: 1, completionTokens: 1, costUsd: null } };
}
```

Assert `collectStream(chunks()).rawOutputs.answer === "hello"`.

### Runtime Event Tests

Use a fake provider object literal with both `execute` and `executeStream?` counters. Assert:

- `policy: { stream: true }` calls `executeStream?`.
- no stream policy calls `execute`.
- returned `events` contain exactly one `stream.start` and one `stream.complete`.
- returned `events` do not contain an event per chunk.

### Receipt Hash Tests

Use two providers:

- Provider A chunks `["he", "llo"]`.
- Provider B chunks `["h", "ell", "o"]`.

Both should produce `outputs.answer === "hello"`. With deterministic output content and signer verification, both receipt bodies should have identical `outputHash`.

## Landmines

- Do not add provider-specific streaming code for Anthropic, Gemini, xAI, OpenRouter, or LM Studio; Phase 44 owns adapter implementations.
- Do not add OpenTelemetry SDK dependencies; Phase 47 owns OTel export.
- Do not add per-token `RunEvent` emissions.
- Do not change receipt schema or add partial receipts.
- Do not put raw streamed content into event metadata.
- Do not rely on global mutable streaming config; keep the opt-in in intent policy/runtime request context.

## PATTERN MAPPING COMPLETE
