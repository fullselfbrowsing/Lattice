# Phase 45: Multimodal Request Shaping + Realtime Direction - Validation

## Automated Gates

Run after implementation:

```bash
pnpm --filter @full-self-browsing/lattice test -- packaging anthropic gemini realtime public-types
pnpm --filter @full-self-browsing/lattice test:types
pnpm --filter @full-self-browsing/lattice typecheck
node scripts/check-core-package-boundary.mjs
```

## Acceptance Matrix

| Requirement | Evidence |
|-------------|----------|
| MMRT-01 | Anthropic tests assert base64 image blocks, URL image blocks, file-id image blocks, and beta header behavior. |
| MMRT-02 | Gemini tests assert image/audio/video parts use `inlineData` or `fileData` according to metadata and packaging. |
| MMRT-03 | Packaging tests assert inline/base64, URL, file-id/file-reference, MIME, privacy, and size-policy branches, including plan metadata. |
| MMRT-04 | Public realtime type tests assert `RealtimeSessionSpec` is distinct from `ProviderStream` and exports through package root. |
| MMRT-05 | Realtime docs/types/tests assert checkpoint step marker design for OpenAI Realtime and Gemini Live while explicitly deferring production socket implementation. |

## Manual Review Points

- Check request body helpers remain readable and do not duplicate large provider-specific blocks.
- Check execution-plan metadata explains choices without embedding raw base64 payloads.
- Check `restricted` artifacts cannot be packaged via URL/base64/file-id.
- Check no dependency was added for media or WebSocket handling.
