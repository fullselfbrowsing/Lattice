# Phase 45: Multimodal Request Shaping + Realtime Direction - Research

## Official Sources Checked

- Anthropic vision docs: https://platform.claude.com/docs/en/build-with-claude/vision
- Anthropic Files API docs: https://platform.claude.com/docs/en/build-with-claude/files
- Gemini file input methods: https://ai.google.dev/gemini-api/docs/file-input-methods
- Gemini generateContent API: https://ai.google.dev/api/generate-content
- OpenAI Realtime guide: https://developers.openai.com/api/docs/guides/realtime
- OpenAI Realtime WebSocket guide: https://developers.openai.com/api/docs/guides/realtime-websocket
- OpenAI Realtime conversations guide: https://developers.openai.com/api/docs/guides/realtime-conversations
- Gemini Live API reference: https://ai.google.dev/api/live
- Gemini Live API overview: https://ai.google.dev/gemini-api/docs/live-api
- Gemini Live WebSocket guide: https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket

## Findings

### Anthropic Images

Anthropic documents three image input methods for Claude Messages: base64 image content blocks, URL references, and Files API references. The image block shape uses `type: "image"` and a `source` object whose `type` is `base64`, `url`, or `file`. Anthropic also notes images work best before text when the use case permits.

Files API references require the beta header `anthropic-beta: files-api-2025-04-14`. The Files API docs state image files map to the `image` content block type and supported image MIME types include JPEG, PNG, GIF, and WebP. The Files API is beta and is not zero-data-retention eligible, so the packaging plan should make file-id use visible.

### Gemini Media Inputs

Gemini `generateContent` supports images, audio, video, documents, tools, and more through `contents[].parts[]`. The file input guide distinguishes inline data from file references:
- inline data is best for small files and transient/real-time inputs, with a 100 MB request/payload limit and 50 MB for PDFs;
- File API upload is for larger/reused files and is temporary;
- external URLs are public/cloud data fetched per request;
- File API GCS URI registration and uploaded file URIs become file references.

The existing adapter already uses lower-camel JSON fields (`generationConfig`, `safetySettings`) and the JS examples use `inlineData`/`fileData` style helper objects. Phase 45 should follow the existing adapter style and type tests around exact request body shape.

### Realtime Direction

OpenAI Realtime sessions are stateful and keep a connection open while applications send audio, receive events, and update session state. The docs distinguish voice-agent, translation, and transcription sessions. OpenAI recommends WebRTC for browser/mobile clients and WebSocket for server-to-server use. Realtime conversations consist of a Session object, Conversation, and Responses, and WebSocket audio input uses base64-encoded JSON events.

Gemini Live is also stateful over WebSockets. The WebSocket API establishes a session that can send text, audio, or video to Gemini and receive audio, text, or function call requests. Its initial setup message carries the model, generation parameters, system instructions, and tools, and configuration cannot be updated while the connection is open. Gemini Live is still documented as preview; the overview lists audio/text/image inputs and raw audio output, while the raw WebSocket guide requires client-managed JSON messages and API-key authentication in the URL.

## Implications

- `ai.run({ policy: { stream: true } })` remains a single-shot response stream. It must not become a realtime media session.
- Realtime public surface should be interface-level only and should describe session targets, checkpoint markers, and future receipt threading.
- Packaging plans must be explicit enough for users to audit whether media was inlined, base64 encoded, referenced by URL, or referenced by provider file ID/URI.
- File IDs/URIs are provider-specific references; Phase 45 should not perform uploads or hide that a previous upload/registration is required.
