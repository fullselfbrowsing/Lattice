<!-- GSD:project-start source:PROJECT.md -->
## Project

**Lattice**

Lattice is a TypeScript-first capability runtime SDK for AI applications. Developers describe the job, provide any mix of artifacts, declare desired outputs, and set policy constraints; Lattice handles provider routing, context packing, artifact transport, fallback, replay, and inspectable execution plans.

The product is for developers building multimodal AI features who do not want to wire together separate chat, image, transcription, speech, file, memory, routing, and provider abstractions by hand.

**Core Value:** Developers can run one capability-first task across mixed text, image, audio, video, file, JSON, and tool artifacts while Lattice reliably chooses, packages, routes, and explains the underlying model work.

### Constraints

- **Language**: TypeScript-first — closest competitors and early adopters are strongest in the app/product integration ecosystem.
- **Public API**: Capability-first and small — the beginner path should be one `run` call with artifacts, outputs, and policy.
- **Routing**: Deterministic in v0.1 — use capability matrix plus policy scoring and fallback rules before considering opaque AI-chosen routing.
- **Provider surface**: Reuse existing routing/provider infrastructure where it accelerates learning — provider breadth is not the main differentiation.
- **Protocol**: MCP-native where tools/context integration is needed — avoid inventing a proprietary plugin protocol.
- **Architecture**: One umbrella package with modular internals — easy install should coexist with tree-shakable adapters and optional bindings.
- **Transparency**: Every run must be inspectable — model choices, context packing, summaries, artifact transforms, cost, and latency must be explainable.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommendation
## Recommended Stack
### Runtime and Language
| Technology | Current version checked | Purpose | Recommendation | Confidence |
|------------|-------------------------|---------|----------------|------------|
| Node.js | 24.x Active LTS | Primary server/runtime target | Target Node `>=24`; test Node 24 and 25. Node 24 is the stable LTS line and has modern Web APIs needed by an SDK: `fetch`, `Blob`, streams, `FormData`, `crypto`, and native ESM maturity. Do not target Node 18; it is too old for a 2026 SDK. | HIGH |
| TypeScript | `6.0.3` | Source language and public type contract | Use TypeScript 6, `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, and `moduleResolution: "bundler"` for source. Also run a CI job against the TypeScript 7 native preview once the package surface stabilizes, because TS 6 is explicitly a bridge to TS 7. | HIGH |
| Package format | ESM-first with CJS compatibility where cheap | SDK distribution | Publish ESM as the primary format with explicit `exports`. Add CJS only for the umbrella package and key Node adapters if `publint` and `@arethetypeswrong/cli` verify the package shape. Avoid UMD/IIFE. | HIGH |
| Web standard APIs | Native Node/Web APIs | Artifact transport and provider IO | Model `Artifact` payloads around `Blob`, `File`, `ReadableStream`, `ArrayBuffer`, URL references, and metadata rather than Node-only `Buffer` types. Keep `Buffer` support as a Node adapter detail. | HIGH |
### Package Manager, Monorepo, and Release
| Technology | Current version checked | Purpose | Recommendation | Confidence |
|------------|-------------------------|---------|----------------|------------|
| pnpm | `10.33.0` | Package manager/workspaces | Use pnpm workspaces plus catalogs in `pnpm-workspace.yaml` for dependency version control. It fits a multi-package SDK and avoids dependency duplication. | HIGH |
| Changesets | `@changesets/cli@2.31.0` | Versioning/changelogs/publishing | Use Changesets from day one. Lattice will need semver discipline across core, adapters, and storage/media packages; Changesets is the standard monorepo release workflow. | HIGH |
| Turborepo | `turbo@2.9.6` | Task graph/cache | Use Turbo only for package task orchestration (`build`, `test`, `typecheck`, `lint`). Do not let it become an architecture dependency. pnpm remains the workspace authority. | MEDIUM |
| tsdown | `0.21.9` | Library bundling | Use `tsdown` for package builds because it is library-focused, supports declaration output and multiple formats, and is aligned with Rolldown. Keep `tsc --noEmit` as the source of type correctness. | MEDIUM |
| publint | `0.3.18` | Package publication lint | Run in CI before publish to catch bad `exports`, missing files, and invalid package metadata. | HIGH |
| @arethetypeswrong/cli | `0.18.2` | Type package verification | Run in CI for every public package. This is critical if the project publishes mixed ESM/CJS and declaration files. | HIGH |
| TypeDoc | `0.28.19` | API reference | Generate API docs from public packages after the API stops changing weekly. Do not use TypeDoc as a substitute for authored conceptual docs. | MEDIUM |
### Core Provider Surface
| Technology | Current version checked | Purpose | Recommendation | Confidence |
|------------|-------------------------|---------|----------------|------------|
| Vercel AI SDK core | `ai@6.0.168` | Provider/model abstraction, streaming, structured generation, image/embedding APIs | Use as an internal adapter layer, not as Lattice's public API. AI SDK 6 has provider registry, custom providers, OpenAI-compatible provider support, tools/MCP work, standard JSON schema support, and broad TypeScript adoption. It should accelerate provider coverage while Lattice owns capability routing, artifact packing, replay, and execution plans. | HIGH |
| AI SDK provider contracts | `@ai-sdk/provider@3.0.8`, `@ai-sdk/provider-utils@4.0.23` | Adapter boundary | Build `provider-ai-sdk` against provider contracts, but wrap every call in Lattice's own `ProviderAdapter` interface so breaking AI SDK changes do not leak to users. | MEDIUM |
| AI SDK OpenAI-compatible provider | `@ai-sdk/openai-compatible@2.0.41` | OpenAI-compatible gateway integration | Support it for LiteLLM/OpenRouter/local gateways when the AI SDK path is enough. Use direct OpenAI-compatible HTTP for cases requiring full request/response journaling or provider-specific artifact transport. | HIGH |
| OpenAI JS SDK | `openai@6.34.0` | First-party OpenAI Responses/files/audio/realtime support | Use a dedicated OpenAI adapter for OpenAI-specific capabilities, especially Responses API, files, structured outputs, realtime/audio, request IDs, retries, and raw response access. Do not make `openai` a core dependency of the entire SDK. | HIGH |
| LiteLLM | Gateway, Docker stable tags; Python package not embedded | Broad provider gateway and routing infra | Reuse LiteLLM through OpenAI-compatible HTTP as an optional deployment target. Do not vendor or require the Python SDK. Let LiteLLM provide team-level virtual keys, cost tracking, and broad provider proxying; let Lattice provide per-run artifact/context/routing plans. | HIGH |
| OpenAI-compatible API shape | Protocol contract, not a library | Provider interoperability | Define a first-class `OpenAICompatibleProvider` adapter. It should work with LiteLLM, OpenRouter, vLLM, Ollama-compatible proxies, and self-hosted gateways. Log raw request/response envelopes for replay. | HIGH |
### MCP-Native Tool and Context Integration
| Technology | Current version checked | Purpose | Recommendation | Confidence |
|------------|-------------------------|---------|----------------|------------|
| Official MCP TypeScript SDK | `@modelcontextprotocol/sdk@1.29.0` stable; split packages `@modelcontextprotocol/client/server/node/hono/express@2.0.0-alpha.2` | MCP clients, servers, tools, resources, prompts, transports | Use the official MCP TypeScript SDK behind `@lattice/mcp`. For v0.1, prefer stable `@modelcontextprotocol/sdk@1.29.0`. Track the split v2 packages, but do not make alpha packages part of the stable Lattice API until they leave alpha. | MEDIUM |
| MCP transports | stdio, Streamable HTTP, legacy SSE fallback | Tool/context connectivity | Support stdio and Streamable HTTP first. SSE fallback can be adapter-only for legacy servers. Treat MCP resources/prompts/tool results as `Artifact`s so they can be packed, replayed, and traced like provider outputs. | HIGH |
| Standard Schema | `@standard-schema/spec@1.1.0`, `@standard-schema/utils@0.3.0` | Tool/output schema interoperability | Accept Standard Schema at Lattice boundaries. This lets users bring Zod, Valibot, ArkType, or compatible validators without custom adapters. Use Zod as the documented default. | HIGH |
### Validation, Schemas, and Structured Outputs
| Technology | Current version checked | Purpose | Recommendation | Confidence |
|------------|-------------------------|---------|----------------|------------|
| Zod | `4.3.6` | Default public schema and runtime validation | Use Zod 4 as the primary documented schema library. It is TypeScript-first, stable, supports metadata, codecs, and native JSON Schema conversion. Require `strict` TypeScript. | HIGH |
| Standard Schema | `@standard-schema/spec@1.1.0` | Schema-library-neutral public input | Accept any Standard Schema for output schemas, tool inputs, artifact metadata, and policy objects. Normalize internally to a Lattice schema descriptor. | HIGH |
| AJV | `8.18.0` | JSON Schema runtime validation | Use AJV for validating provider-compatible JSON Schema and replay fixtures after converting from Zod/Standard Schema. Keep it internal; do not ask users to learn AJV. | HIGH |
| Valibot | `1.3.1` | Lightweight schema alternative | Support through Standard Schema only. Do not document it as the default. | MEDIUM |
| ArkType | `2.2.0` | Type-syntax schema alternative | Support through Standard Schema only. Useful for advanced TS users, but not the main docs path. | MEDIUM |
| Effect Schema | `effect@3.21.1`, `@effect/schema@0.75.5` | Advanced functional schema/effects | Do not use as the default. Effect is powerful but would impose a programming model on a small SDK. Support via Standard Schema/adapter if user demand appears. | MEDIUM |
| zod-to-json-schema | `3.25.2` | Legacy Zod-to-JSON-Schema conversion | Do not use for new core work. Zod 4 has native `z.toJSONSchema()`. Add compatibility only if a downstream tool still requires it. | HIGH |
### Context Packing and Token Accounting
| Technology | Current version checked | Purpose | Recommendation | Confidence |
|------------|-------------------------|---------|----------------|------------|
| Internal context packer | N/A | Live context, summary, archive split | Build this in Lattice core. It is a core differentiator and should not be delegated to LangChain/LangGraph/Agents SDK memory abstractions. | HIGH |
| Provider-reported usage | N/A | Final cost/token accounting | Prefer provider-reported usage for actual billing and execution plans. Tokenizers are estimates, not ground truth across providers. | HIGH |
| js-tiktoken / tiktoken | `js-tiktoken@1.0.21`, `tiktoken@1.0.22` | OpenAI-style token estimates | Use optional OpenAI-family token estimation where helpful. Keep it pluggable because multimodal context cost depends on provider packaging rules. | MEDIUM |
| gpt-tokenizer | `3.4.0` | Alternative tokenizer | Do not use initially unless it handles a model family needed by the showcase better than tiktoken. | LOW |
### Artifact Transport and Media Processing
| Technology | Current version checked | Purpose | Recommendation | Confidence |
|------------|-------------------------|---------|----------------|------------|
| file-type | `22.0.1` | MIME/type sniffing | Use for artifact ingestion validation. Never trust filename extension alone. | HIGH |
| mime | `4.1.0` | MIME lookup | Use as a fallback lookup helper, not as authoritative validation. | HIGH |
| sharp | `0.34.5` | Image resize/format conversion | Use in optional `media-node` adapter for screenshots/photos. Keep optional because it has native dependencies and may not work in all edge runtimes. | HIGH |
| pdfjs-dist | `5.6.205` | PDF parsing/rendering primitives | Use for PDF page extraction/rendering when needed. Keep behind optional package. | MEDIUM |
| pdf-parse | `2.4.5` | Simple PDF text extraction | Use for low-friction text extraction in Node examples, but do not rely on it for high-fidelity PDF layout. | MEDIUM |
| music-metadata | `11.12.3` | Audio metadata | Use for duration/codec metadata before transcription routing. | MEDIUM |
| ffmpeg-static + execa | `ffmpeg-static@5.3.0`, `execa@9.6.1` | Audio/video transcoding | Provide an optional local transform package. Do not bundle FFmpeg in core; native binaries are too heavy and platform-sensitive. | MEDIUM |
| @aws-sdk/client-s3 | `3.1034.0` | Object storage adapter | Optional artifact store adapter only. Core should accept signed URLs and upload IDs without requiring AWS. | MEDIUM |
### Sessions, Replay, and Storage
| Technology | Current version checked | Purpose | Recommendation | Confidence |
|------------|-------------------------|---------|----------------|------------|
| In-memory store | N/A | Default dev/session store | Include in core for tests and quickstarts. Clearly document that it is not durable. | HIGH |
| Filesystem store | Node `fs` | Local artifact bytes and replay fixtures | Use for first showcase and SDK tests. Store JSONL execution events plus artifact blobs by content hash. | HIGH |
| SQLite adapter | `better-sqlite3@12.9.0` | Durable local sessions/replay index | Build optional `storage-sqlite` for local apps and reproducible replay. It is simple, fast, and does not require running infrastructure. | HIGH |
| Postgres adapter | `postgres@3.4.9` or `pg@8.20.0` | Future production persistence | Defer until there is a hosted/control-plane milestone or a strong user request. Use a storage interface now so it can be added later. | MEDIUM |
| Prisma | Not recommended | ORM | Do not use in the SDK core. It is too heavy for a library runtime and adds codegen/install friction. | HIGH |
| Drizzle/Kysely | `drizzle-orm@0.45.2`, `kysely@0.28.16` | Typed SQL | Do not use initially. Handwritten SQL for the small SQLite adapter is more transparent and avoids tying storage plugins to a query builder. Revisit for Postgres adapter only. | MEDIUM |
### Observability, Plans, and Diagnostics
| Technology | Current version checked | Purpose | Recommendation | Confidence |
|------------|-------------------------|---------|----------------|------------|
| OpenTelemetry JS | `@opentelemetry/api@1.9.1`, `@opentelemetry/sdk-node@0.215.0`, `@opentelemetry/exporter-trace-otlp-http@0.215.0` | Tracing hooks/export | Use OpenTelemetry as the tracing substrate. Do not invent a proprietary trace API. Emit spans for route selection, context packing, artifact transforms, provider calls, fallback, schema validation, and replay. | HIGH |
| pino | `10.3.1` | Optional logger adapter | Core should accept a minimal logger interface. Provide a pino adapter for Node apps, but avoid a hard logger dependency in core. | MEDIUM |
| Langfuse / LangSmith | `@langfuse/tracing@5.2.0`, `langsmith@0.5.21` | AI observability integrations | Do not bake in. Add exporters after core OTel spans and execution plans are stable. | MEDIUM |
### Testing and Quality
| Technology | Current version checked | Purpose | Recommendation | Confidence |
|------------|-------------------------|---------|----------------|------------|
| Vitest | `4.1.5` | Unit/integration tests | Use Vitest for all package tests. It handles TypeScript/ESM better than Jest for this SDK shape. | HIGH |
| @vitest/coverage-v8 | `4.1.5` | Coverage | Use V8 coverage in CI. Gate only critical packages at first to avoid false precision during early design. | HIGH |
| fast-check | `4.7.0` | Property-based tests | Use for router determinism, context budget invariants, artifact graph invariants, and replay idempotency. | HIGH |
| MSW | `2.13.4` | Fetch-level provider mocks | Use for fetch-based provider adapters and examples. | MEDIUM |
| Nock | `14.0.13` | Node HTTP mocks | Use sparingly for SDKs that do not expose fetch cleanly. Prefer MSW/fake servers for web-standard request paths. | MEDIUM |
| Playwright | `1.59.1` | Showcase/e2e testing | Use only for the multimodal work inbox demo or docs examples with UI. Not needed for core SDK tests. | MEDIUM |
| Knip | `6.6.0` | Dead code/dependency checks | Run in CI to keep the SDK small and avoid adapter dependencies leaking into core. | HIGH |
| ESLint | `10.2.1` | Lint | Use ESLint flat config. Keep rules focused on correctness and package boundaries. | HIGH |
| Prettier | `3.8.3` | Formatting | Use for formatting; no custom style debates. | HIGH |
| oxlint | `1.61.0` | Fast lint supplement | Optional once repository size justifies it. Do not introduce until ESLint rules are stable. | LOW |
### CLI, Config, and Developer Experience
| Technology | Current version checked | Purpose | Recommendation | Confidence |
|------------|-------------------------|---------|----------------|------------|
| tsx | `4.21.0` | Local TS execution | Use for examples/scripts. Do not use it as the production runtime. | HIGH |
| commander | `14.0.3` or cac `7.0.0` | CLI argument parsing | Use `commander` if a CLI is needed for replay inspection and fixture generation. Keep CLI separate from core. | MEDIUM |
| dotenv | `17.4.2` | Local env loading | Use only in examples/dev CLI. Core must not load `.env` implicitly. | HIGH |
| jose | `6.2.2` | OAuth/JWT helpers | Use inside MCP/auth adapters when needed. Do not make auth a core dependency until remote MCP auth is implemented. | MEDIUM |
## What Not To Use
| Avoid | Why | Use Instead | Confidence |
|-------|-----|-------------|------------|
| LangChain/LangGraph as the core runtime | They solve orchestration/agent graph problems, but Lattice's differentiator is a tiny capability runtime with artifact/context/routing plans. Depending on them would pull the public model toward chains/graphs. | Own core runtime; optional adapters later. | HIGH |
| OpenAI Agents SDK as the core runtime | It is strong for OpenAI agent loops, sessions, tracing, MCP, and voice, but Lattice is provider-agnostic and ships its own single-agent loop (`ai.runAgent`) on top of the capability runtime + hook pipeline + step-transition tracing. Lattice ships its own opt-in multi-agent crew surface (`defineAgent` + `runAgentCrew`) on top of the same primitives; see Agent Execution Policy below. | Use `openai` JS SDK for OpenAI adapter; ship native `ai.runAgent` for the single-agent loop; study Agents SDK patterns for sessions/tracing/voice. | HIGH |
| LiteLLM Python SDK embedded in Lattice | Lattice is TypeScript-first. Embedding Python adds process/deployment complexity and hides provider envelopes. | Treat LiteLLM as an optional OpenAI-compatible gateway target. | HIGH |
| Provider SDK sprawl in core | Direct dependencies on every provider make install size, auth, errors, and upgrades unmanageable. | Provider adapter packages plus AI SDK/OpenAI-compatible reuse. | HIGH |
| Proprietary plugin protocol | MCP is now the standard integration protocol for tools/context. A custom plugin surface would isolate the ecosystem. | MCP client/server bridge plus internal capability metadata. | HIGH |
| Zod 3 or `zod-to-json-schema` as the default | Zod 4 is stable and has native JSON Schema conversion. Third-party conversion adds compatibility risk. | Zod 4 `z.toJSONSchema()` plus AJV verification. | HIGH |
| Prisma in the SDK | Heavy install, codegen, and runtime assumptions do not fit a small embeddable SDK. | Storage interface, filesystem, and optional SQLite adapter. | HIGH |
| Required native media dependencies in core | `sharp`, FFmpeg, and SQLite are useful but create platform friction. | Optional Node packages. | HIGH |
| Opaque AI-selected routing in v0.1 | It conflicts with the project requirement for deterministic, inspectable routing. | Capability matrix + policy scoring + explicit fallbacks. | HIGH |
| Global mutable provider configuration as the main API | Hard to replay, branch, test, or explain. | Explicit `createAI({ providers, policy, storage, tracing })`. | HIGH |
## Agent Execution Policy
**Policy flip in v1.2 (2026-05-31, Phase 19).** Lattice's prior v1.x stance against built-in multi-agent crews was narrowed. Single-agent execution is now first-class.

**Policy flip in v1.3 (Phase 39).** Multi-agent crews are now first-class via the opt-in `AgentHost` capability: `runAgentCrew({ root, hosts: { childHost }, policy })` with `defineAgent` specs. Single-agent `ai.runAgent` remains the zero-config default.

### Agent Execution — In Scope (v1.2+)

`ai.runAgent(intent)` ships as a method on the runtime returned by `createAI`. The orchestrator drives a `tool_use` protocol loop across the 7 v1.2 provider adapters (OpenAI, OpenAI-compatible, Anthropic, Gemini, xAI, OpenRouter, LM Studio) without coupling to any host platform. Composition surfaces:

- **HookPipeline** (v1.2 Phase 15) — `BAND.SAFETY` handlers can deny iterations via `context.deny = { reason }`; `BAND.OBSERVABILITY` handlers receive per-iteration `step.transition` events.
- **createCheckpointHook** (v1.2 Phase 16) — auto-registered on `BAND.OBSERVABILITY` when `intent.signer` is provided so each iteration mints a v1.1 Capability Receipt with step-marker linked-list threading.
- **Provider adapters** (v1.2 Phase 17) — single `ProviderAdapter` shape preserved; tool_use protocol formatting is the agent orchestrator's responsibility via `formatToolsForProvider`.
- **SurvivabilityAdapter** (v1.2 Phase 18) — composes with `AgentHost` (v1.2 Phase 20) so the agent loop resumes after MV3 SW eviction, Cloudflare Worker freeze, Lambda thaw, or equivalent host-controlled execution interruption.
- **Contract budget** (v1.1 Phase 7, extended Phase 19) — `maxIterations` and `maxWallTimeMs` invariants enforced alongside `maxCostUsd`.

The runtime is host-agnostic. Node, MV3 SW, edge worker, Lambda, and equivalent runtimes consume the same `ai.runAgent` API; per-runtime concerns (scheduler, transport, storage) live behind the pluggable `AgentHost` adapter shipping in Phase 20.

### Multi-Agent Crews — First-class via opt-in `AgentHost` capability (v1.3+)

Parent-child loops now ship through `defineAgent` specs and `runAgentCrew({ root, hosts: { childHost }, policy })`. Child agents return structured summary envelopes `{ summary, artifacts, receipts }` validated by `summaryReturnSchema`, then the parent receives the summary as a normal tool result. Children execute serially in v1.3. Crew-level `BudgetInvariant` and structural caps bound total work; rate-limit coordination shares one provider-key bucket through the `AgentTransport` seam; per-agent receipts chain through `parentReceiptCid`; cache-prefix sharing uses Anthropic `cache_control` and OpenAI automatic prefix caching where adapters support it.

The surface is opt-in only. Existing `ai.runAgent` consumers see no behavior change, and single-agent execution remains the default path.

### Rationale

The original audit trail (`automation/.planning/LATTICE-PIN.md` from FSB v0.10.0-attempt-2 → Lattice v1.2 retro Phases 14-18) demonstrated that the underlying primitives — capability receipts, hook bands, step-transition tracing, provider adapter parity, survivability — compose cleanly into a single-agent loop without requiring a separate framework dependency (LangGraph, OpenAI Agents SDK, etc.). The agent loop is small and runtime-agnostic by design. The v1.3 crew surface ships as a thin composition over the same primitives (`CrewDispatcher` + existing loop), kept opt-in so the public model stays capability-first rather than graph/crew-first.

## Initial Install Sets
### Core Workspace
### Provider Adapters
### MCP Adapter
### Optional Media and Storage
## Roadmap Implications
## Confidence Assessment
| Area | Confidence | Notes |
|------|------------|-------|
| Runtime baseline | HIGH | Node 24 Active LTS and TypeScript 6 are current official targets; OpenAI SDK requires Node 20+ and modern runtimes. |
| Provider reuse | HIGH | AI SDK and LiteLLM both explicitly target multi-provider/OpenAI-compatible use. The exact adapter API may move, so keep it internal. |
| MCP | MEDIUM | Official TypeScript SDK is Tier 1, but package boundaries are changing: stable v1 package exists while split v2 packages are alpha. |
| Validation | HIGH | Zod 4 stable, Standard Schema is designed for cross-library validation, and MCP docs are adopting Standard Schema language. |
| Media stack | MEDIUM | Libraries are current, but PDF/audio/video transforms vary by platform and provider requirements. Keep optional. |
| Storage | HIGH for local SQLite/filesystem; MEDIUM for future Postgres | v0.1 should stay embeddable; production storage can be added behind interfaces. |
| Observability | HIGH | OpenTelemetry is the right substrate; AI-specific exporters should remain optional. |
## Sources
- TypeScript 6 announcement: https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/
- Node.js release status: https://nodejs.org/en/about/previous-releases
- AI SDK 6 announcement: https://vercel.com/blog/ai-sdk-6/
- AI SDK provider management: https://ai-sdk.dev/docs/ai-sdk-core/provider-management
- OpenAI JavaScript/TypeScript SDK: https://github.com/openai/openai-node
- OpenAI Responses migration guide: https://developers.openai.com/api/docs/guides/migrate-to-responses
- OpenAI Agents SDK TypeScript docs: https://openai.github.io/openai-agents-js/
- LiteLLM README/docs entry: https://github.com/BerriAI/litellm
- MCP SDK overview: https://modelcontextprotocol.io/docs/sdk
- MCP TypeScript SDK repository: https://github.com/modelcontextprotocol/typescript-sdk
- MCP TypeScript SDK reference: https://ts.sdk.modelcontextprotocol.io/
- Standard Schema spec: https://standardschema.dev/schema
- Zod docs: https://zod.dev/
- Zod JSON Schema docs: https://zod.dev/json-schema
- tsdown docs: https://tsdown.dev/guide/
- pnpm docs: https://pnpm.io/
- Changesets repository: https://github.com/changesets/changesets
- Vitest docs: https://v4.vitest.dev/
- fast-check docs: https://fast-check.dev/
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
