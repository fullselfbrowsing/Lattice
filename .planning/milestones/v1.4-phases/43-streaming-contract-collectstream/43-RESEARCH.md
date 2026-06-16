# Phase 43: Streaming Contract + collectStream - Research

**Date:** 2026-06-16
**Status:** Complete

## Scope Summary

Phase 43 should add the core streaming contract, not provider-specific stream parsers. The safest implementation path is to make streaming an additive provider capability, collect streams into the existing `ProviderRunResponse`, and then let the current validation, tripwire, persistence, result, and receipt branches run unchanged.

## Existing Architecture

### Provider Boundary

- `packages/lattice/src/providers/provider.ts` owns the public `ProviderAdapter`, `ProviderRunRequest`, `ProviderRunResponse`, `ProviderGatewayMetadata`, and `Usage` types.
- `ProviderAdapter.execute` is optional today, and v1.2/v1.3 compatibility depends on old adapter literals remaining valid.
- `ModelCapability.streaming` already exists as a capability flag, so Phase 43 does not need to invent a catalog concept.

### Runtime Boundary

- `packages/lattice/src/runtime/create-ai.ts` centralizes route selection, provider invocation, validation, tripwire evaluation, event collection, result assembly, and receipt issuance.
- `findExecutableAdapter()` currently returns providers with `execute`; a streaming path needs a sibling selection for `executeStream?` without making streaming the default.
- `maybeIssueReceipt()` computes `outputHash` from the terminal `outputs` value after validation succeeds. This is the right invariant to preserve for streaming because it already ignores provider transport shape.

### Event Boundary

- `packages/lattice/src/tracing/tracing.ts` owns `RunEventKind`.
- Existing events are run/stage/provider/fallback/validation/tool/replay/recovery/capability markers. Streaming should add bracketing events only, not one event per token.
- `emitEvent()` pushes events to the returned result and sends sanitized event metadata to configured sinks.

### Public Surface Boundary

- `packages/lattice/src/index.ts` re-exports runtime values and type-only contracts through `packages/lattice/src/runtime/public-types.ts`.
- `packages/lattice/test/public-surface.test.ts` exact-inventory checks runtime value exports.
- `packages/lattice/test-d/index.test-d.ts` proves package-root type accessibility.

## Recommended Design

### Stream Types

Define a small normalized stream union in `provider.ts` or a focused `streaming.ts` module:

```typescript
export type ProviderStreamChunk =
  | ProviderStreamStartChunk
  | ProviderStreamTextDeltaChunk
  | ProviderStreamOutputDeltaChunk
  | ProviderStreamToolCallDeltaChunk
  | ProviderStreamUsageChunk
  | ProviderStreamCompleteChunk;
```

The initial minimum viable set can be text, output, usage, and complete chunks. Tool-call delta support may be type-only in Phase 43 if no provider parser consumes it yet. The key is that chunks are normalized and provider-neutral.

### `executeStream?`

Add this optional method to `ProviderAdapter`:

```typescript
readonly executeStream?: (
  request: ProviderRunRequest,
) => AsyncIterable<ProviderStreamChunk> | Promise<AsyncIterable<ProviderStreamChunk>>;
```

This keeps old adapters source-compatible and allows Phase 44 provider implementations to land independently.

### `collectStream()`

`collectStream(stream, options?)` should return `Promise<ProviderRunResponse>`. It should:

- concatenate ordered text deltas into named output fields;
- merge final raw output chunks into `rawOutputs`;
- preserve `normalizedUsage` from usage/final chunks;
- merge `gateway` observations when provided;
- optionally record a compact `rawResponse` summary such as stream chunk count and provider metadata, not raw provider SSE frames.

The collection result is the only object passed to validation and receipt issuance.

### Runtime Opt-In

Add a narrow opt-in field, preferably under policy because streaming is an execution preference:

```typescript
policy: {
  stream?: true
}
```

or a typed equivalent on `PolicySpec`. The runtime should use `executeStream?` only when that flag is set and the selected adapter has it. If streaming is requested but unavailable, fail the provider attempt with a clear execution error or fall back to the next route according to the existing fallback rules.

### Events

Add `RunEventKind` literals:

- `stream.start`
- `stream.complete`
- `stream.failed`

Emit them once per streaming attempt. Metadata should include status/gateway/summary fields only, such as chunk count, output keys, gateway requested/observed model, and failure reason.

### Receipts

Do not change receipt schema in Phase 43. The runtime should call `collectStream()` first, then call the existing terminal branches. Receipt invariants are:

- success receipt `outputHash` hashes assembled validated outputs;
- validation-failed and tripwire branches keep current semantics;
- equivalent final outputs split across different chunks produce the same `outputHash`.

## Implementation Pitfalls

| Pitfall | Impact | Avoidance |
|---|---|---|
| Making streaming default when `executeStream?` exists | Current callers change behavior unexpectedly | Require an explicit policy/runtime opt-in |
| Emitting one `RunEvent` per token | High-cardinality, expensive, unsafe telemetry | Emit only start/complete/failed bracketing events |
| Signing chunks or partial outputs | Receipt semantics become hard to verify and replay | Sign only after `collectStream()` produces final outputs |
| Provider-specific chunk types in public API | Phase 44 adapter parsers leak upstream protocol details | Normalize into provider-neutral chunk kinds |
| Allowing chunk boundaries into hashes | Replay and receipts become nondeterministic | Property-test same final text with different chunk splits |
| Requiring all adapters to stream | Breaks existing provider parity | Keep `executeStream?` optional and non-streaming path unchanged |

## Validation Architecture

### Automated Test Layers

1. **Provider contract tests**
   - File: `packages/lattice/src/providers/provider.test.ts` or `packages/lattice/src/providers/streaming.test.ts`.
   - Assert old adapter literals still satisfy `ProviderAdapter`.
   - Assert `collectStream()` assembles text/output chunks into `ProviderRunResponse`.
   - Assert usage and gateway metadata merge rules.

2. **Runtime streaming tests**
   - File: `packages/lattice/src/runtime/create-ai.test.ts`.
   - Use a fake provider with `executeStream?`.
   - Assert `policy.stream: true` uses the stream path.
   - Assert normal calls still use `execute`.
   - Assert events include `stream.start` and `stream.complete` and do not include per-token events.
   - Assert `stream.failed` appears on stream collection failure.

3. **Receipt invariant tests**
   - File: `packages/lattice/src/runtime/create-ai.test.ts`.
   - Use in-memory signer/keyset helpers and `verifyReceipt`.
   - Run two streaming providers that produce the same final output with different chunk boundaries.
   - Assert verified receipt `outputHash` values match and are 64-character hex strings.

4. **Public surface/type tests**
   - Files: `packages/lattice/test/public-surface.test.ts`, `packages/lattice/test-d/index.test-d.ts`.
   - Assert any new runtime value export such as `collectStream` is inventoried.
   - Assert stream chunk, stream policy, and `executeStream?` types are reachable from the package root.

5. **Package gates**
   - `pnpm --filter @full-self-browsing/lattice test -- streaming create-ai provider`
   - `pnpm --filter @full-self-browsing/lattice test:types`
   - `pnpm --filter @full-self-browsing/lattice typecheck`
   - `node scripts/check-core-package-boundary.mjs`

### Security Considerations

- Stream event metadata must not contain raw prompt, output, artifacts, provider SSE frames, auth headers, or API keys.
- Collection errors should report concise failure strings and should not dump chunk payloads.
- Public stream chunk types should be readonly where practical and avoid mutable shared state.

## Plan Shape Recommendation

Use three plans:

1. **Streaming public contract and collector** — type surface, `collectStream()`, fake/test helpers, public/type guards.
2. **Runtime stream execution and events** — opt-in policy, stream path selection, start/complete/failed events, non-streaming fallback behavior.
3. **Receipt hash invariants and package closure** — signer/receipt tests proving chunk-boundary independence, final package gates, and changeset.

## RESEARCH COMPLETE
