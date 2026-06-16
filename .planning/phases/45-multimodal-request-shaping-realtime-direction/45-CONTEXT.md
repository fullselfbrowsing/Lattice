# Phase 45: Multimodal Request Shaping + Realtime Direction - Context

**Gathered:** 2026-06-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 45 maps existing Lattice artifacts into native Anthropic and Gemini multimodal request shapes while keeping provider packaging inspectable in execution plans. In scope: Anthropic image artifacts as Messages image blocks; Gemini image/audio/video artifacts as `parts[]`; shared packaging metadata explaining base64/inline, URL, file-id, file reference, privacy, MIME, and size-policy choices; and public direction-level realtime session types/checkpoint helpers. Out of scope: live provider uploads, production WebSocket clients, WebRTC/SIP, bidirectional media runtime execution, and changing `ai.run()` into a realtime session API.

</domain>

<decisions>
## Implementation Decisions

### Provider Packaging Evidence
- Extend `ProviderPackagedArtifactPlan` additively so every packaged artifact can carry provider request evidence: provider-native shape, source type, media type, size bytes, and the reason the transport was chosen.
- Keep `transport` as the stable routing-facing field. Use richer metadata for provider-specific distinctions such as Anthropic `image.source.file` versus Gemini `fileData.fileUri`.
- Treat existing provider file identifiers/URIs as metadata-driven file references. Phase 45 must not implement upload calls.
- Apply policy before body shaping. `noUpload` blocks provider-upload/file-id references, `noPublicUrl` blocks URL references, and `restricted` artifacts cannot leave the runtime as URL/base64/provider references.
- Add a conservative inline payload size branch for media so large artifacts prefer file references and otherwise fail with an explainable packaging warning.

### Anthropic Request Shaping
- Keep the existing Messages endpoint and response parsing. Only change request body construction so image artifacts become native content blocks.
- Support image source variants:
  - `base64`/inline: `{ type: "image", source: { type: "base64", media_type, data } }`
  - URL: `{ type: "image", source: { type: "url", url } }`
  - file-id: `{ type: "image", source: { type: "file", file_id } }`
- Add `anthropic-beta: files-api-2025-04-14` only when a request references Anthropic file IDs.
- Preserve the current string `content` body for plain text-only requests to avoid churn in established tests.

### Gemini Request Shaping
- Keep the existing `generateContent` and `streamGenerateContent` endpoints, safety settings, generation config, and response parsing.
- Build one user content object whose `parts[]` includes the task text and then native media parts.
- Support inline media with `{ inlineData: { mimeType, data } }`.
- Support URLs and pre-uploaded file references with `{ fileData: { mimeType, fileUri } }`.
- Do not upload or register files; use metadata such as `geminiFileUri`, `providerFileUri`, or `fileUri` when available.

### Realtime Direction
- Add a small public realtime type surface that separates bidirectional sessions from one-shot provider streaming:
  - `RealtimeSessionSpec`
  - `RealtimeCheckpointInput`
  - provider-specific realtime target descriptors for OpenAI Realtime and Gemini Live
  - `createRealtimeCheckpointContext()` for stable checkpoint step markers
- The helper should prepare checkpoint context only. It should not open sockets or mint receipts by itself.
- Step names and session identifiers must remain stable identifiers, not user content, matching `createCheckpointHook` rules.

### the agent's Discretion
- The implementation may add helper modules under `providers/` and `realtime/` when that keeps request builders readable.
- Tests should use fake fetches and local artifact values only; no live provider calls.
- Use package-root type tests for public realtime exports if implementation adds new exported types.

</decisions>

<code_context>
## Existing Code Insights

### Packaging
- `packages/lattice/src/providers/packaging.ts` chooses generic transports and derives packaged artifact refs.
- `packages/lattice/src/plan/plan.ts` owns `ProviderPackagingPlan` and `ProviderPackagedArtifactPlan`.
- `packages/lattice/src/runtime/create-ai.ts` calls `packageArtifactsForProvider()` at plan time and again per fallback attempt, so richer metadata must come from the shared helper.

### Providers
- `packages/lattice/src/providers/anthropic.ts` currently sends `messages[0].content` as the task string.
- `packages/lattice/src/providers/gemini.ts` currently sends `contents[0].parts[0].text` as the task text.
- Phase 44 made both adapters share request builders between `execute()` and `executeStream()`, so multimodal shaping must apply to both paths.

### Realtime
- `packages/lattice/src/contract/checkpoint.ts` already defines stable step-marker receipt fields and a `createCheckpointHook()` helper.
- `packages/lattice/src/receipts/types.ts` already supports `sessionId`, `stepName`, `stepIndex`, `previousStepName`, and `parentStepName`.
- `packages/lattice/src/sessions/session.ts` has durable session IDs but no realtime media session abstraction.
- `packages/lattice/src/providers/streaming.ts` is single-shot stream collection and should stay separate from realtime bidirectional sessions.

</code_context>

<specifics>
## Specific Ideas

Use metadata keys liberally but deterministically:
- Anthropic file ID: `metadata.anthropicFileId`, `metadata.providerFileId`, or `metadata.fileId`
- Gemini file URI: `metadata.geminiFileUri`, `metadata.providerFileUri`, or `metadata.fileUri`
- Base64 string payload marker: `metadata.encoding: "base64"` or a `data:` URL value
- URL: artifact value that is an HTTP(S) URL or `metadata.url`

Add a focused packaging test file because there is no existing dedicated test for `packageArtifactsForProvider()`.

</specifics>

<deferred>
## Deferred Ideas

Provider upload calls are deferred to a future storage/media adapter phase. Full OpenAI Realtime and Gemini Live socket clients are explicitly deferred beyond v1.4 interface direction. Realtime usage accounting and binary media transport backpressure are not in Phase 45.

</deferred>
