# Phase 19: Delegation Surface Policy Flip + Agent Runtime Entrypoint - Context

**Gathered:** 2026-05-31
**Status:** Ready for planning
**Mode:** Forward (net-new). First Track B phase. Smart discuss completed; 4 grey areas resolved with recommended answers (all accepted).

<domain>
## Phase Boundary

Lattice opens the **Delegation** surface previously declared out of scope in v1.x `AGENTS.md`. A new `ai.runAgent(intent)` method ships on the runtime returned by `createAI`. The runtime drives a tool_use protocol loop across the 7 v1.1+v1.2 provider adapters, composes with the Phase 15 `HookPipeline` for safety-band veto and observability-band per-iteration receipt minting, and emits `step.transition` events per iteration. Single-agent only (multi-agent crews remain Out of Scope).

Out of scope for Phase 19:
- Pluggable `AgentHost` adapter with scheduler/transport/storage seams (Phase 20).
- Cost tracker / transcript store / goal-progress / action-history primitives (Phase 21).
- Showcase + eval mode (Phase 22).
- Recovery / eviction-resume tracing markers (Phase 20 via TRACE-EXT-01 deferred).

</domain>

<decisions>
## Implementation Decisions

### Area 1: Agent Runtime Entrypoint Shape (all 4 recommended answers accepted)

- **Q1 — Method on `createAI` runtime:** `ai.runAgent(intent)` lives next to `ai.run(intent)` on the runtime object returned by `createAI`. Composes naturally with v1.1 contract/policy/tracer/signer config already wired up via `LatticeConfig`. One runtime surface to maintain.
- **Q2 — Single `Promise<AgentResult>` return:** Matches v1.0 `ai.run` ergonomics. Per-iteration observability flows through the existing `RunEventKind`/`HookPipeline` machinery (tracer events + lifecycle hooks). No bifurcation of the user-facing API.
- **Q3 — New `AgentIntent` type:** Distinct from `RunIntent`. Shape: `{ task: string; tools: readonly Tool[]; host?: AgentHost; contract?: CapabilityContract; policy?: RunPolicy; outputs?: OutputContract; pipeline?: HookPipeline; signer?: ReceiptSigner; tracer?: TracerLike }`. Keeps `RunIntent` narrow for single-shot calls.
- **Q4 — Termination via policy fields:** `contract.budget` gains optional `maxIterations: number` and `maxWallTimeMs: number` invariants alongside existing `maxCostUsd` (Phase 7). Declarative, inspectable, replayable. Pre-flight router checks budget fields BEFORE first provider call.

### Area 2: Tool Registry Surface (all 4 recommended answers accepted)

- **Q1 — Reuse v1.0 `defineTool` + `Tool` types:** Agent loop dispatches the existing primitive in a loop instead of once. Consistent vocabulary. No new tool primitive.
- **Q2 — Plain `readonly Tool[]` array:** `AgentIntent.tools` is `readonly Tool[]`. User composes via standard array ops. No `AgentToolRegistry` class.
- **Q3 — Artifact-wrapped tool results:** Tool results pass through `artifact.toolResult(...)` (v1.0 convention) so receipts embed artifact hashes and replay works through existing pipeline.
- **Q4 — Dual Standard Schema validation:** `defineTool` schema validated at definition time (already v1.0 behavior); arguments validated at call time against the same schema. Invalid args become a typed tool-error, not a thrown exception.

### Area 3: HookPipeline Integration (all 4 recommended answers accepted)

- **Q1 — Caller-owned optional pipeline:** `AgentIntent.pipeline?: HookPipeline` is optional. If absent, `runAgent` creates a default `createHookPipeline()` internally. Caller can pre-register `SAFETY`-band handlers before invocation.
- **Q2 — New `BEFORE_AGENT_ITERATION` + `AFTER_AGENT_ITERATION` lifecycle events:** Additive to `HookLifecycleEvent` union (Phase 15). Each agent iteration also emits the existing `BEFORE_PROVIDER`/`AFTER_PROVIDER`/`BEFORE_TOOL`/`AFTER_TOOL` per inner call. Handlers see both granularities.
- **Q3 — `context.deny` veto pattern:** A `SAFETY`-band handler sets `context.deny = { reason: string }` on the (cloned-then-frozen) `HookContext`. After the band runs, the runtime inspects `pipeline.lastDenialReason()` — if set, the iteration aborts BEFORE provider invocation. Result: `RunFailure` of kind `agent-iteration-denied` with the reason. Composable with existing `structuredClone`+`Object.freeze` band semantics.
- **Q4 — Auto-register `createCheckpointHook` when signer present:** If `intent.signer` is provided AND `intent.pipeline.autoRegisterCheckpoint !== false`, `runAgent` auto-registers `createCheckpointHook({ signer, tracer })` on `BAND.OBSERVABILITY`. Convenient default for the common signed-receipt-per-iteration case; opt-out via `pipeline.autoRegisterCheckpoint = false`.

### Area 4: Provider Routing for tool_use (all 4 recommended answers accepted)

- **Q1 — Sticky provider:** After the first successful provider call, the agent loop stays on that provider for subsequent iterations. Preserves cache_control / system prompt caching. Explicit fallback only when the sticky provider fails (typed `RunFailure` from a single iteration); on fallback the loop resets caching state.
- **Q2 — Orchestrator-owned `formatToolsForProvider` helper:** New `packages/lattice/src/agent/format-tools.ts` exports `formatToolsForProvider(provider, tools, mode?)`. Knows native shapes (Anthropic `tools[]`, OpenAI `tools[]`, Gemini `function_declarations`). Returns provider-specific request fragment plus a parser closure. `ProviderAdapter` shape stays unchanged — INV-03 7-provider parity contract preserved.
- **Q3 — Native tool_use where supported; prompt-reencoded fallback:** Native: openai, openai-compat, anthropic, gemini, xai, openrouter (passes through). Fallback: lm-studio when target model lacks native tools (detected via `formatToolsForProvider` mode flag passed by caller). Fallback encodes tools into a structured system+user message and parses the model's JSON response.
- **Q4 — Validation at final answer only:** Output schema (`AgentIntent.outputs`) validated once per run, against the final assistant message (the one without a `tool_use` block). Intermediate iterations are not schema-validated. Matches v1.0 `outputs` validation timing.

### Out-of-Scope Boundary Decisions
- `AgentHost` adapter (scheduler/transport/storage seams) — Phase 20.
- Cost tracker, transcript store, goal-progress tracker, action-history dedup, PermissionContext — Phase 21.
- Persistence + resume across SW eviction — Phase 20 (composition with SurvivabilityAdapter from Phase 18).
- Multi-agent / parent-child loops / handoff — Out of Scope for v1.x.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 14** `packages/lattice/src/index.ts` public surface — `runAgent` re-exports thread through here.
- **Phase 15** `packages/lattice/src/contract/bands.ts` — `createHookPipeline` + `BAND` enum + `HookLifecycleEvent` union. Phase 19 extends the union additively (BEFORE_AGENT_ITERATION, AFTER_AGENT_ITERATION).
- **Phase 16** `packages/lattice/src/contract/checkpoint.ts` — `createCheckpointHook`. Phase 19 auto-registers this when `intent.signer` is provided.
- **Phase 17** `packages/lattice/src/providers/*.ts` — 7 provider adapters. Phase 19 dispatches via existing `ProviderAdapter` interface; no adapter modification.
- **v1.0** `packages/lattice/src/tools/tools.ts` — `defineTool`, `Tool`, `runTool`. Phase 19 reuses these primitives.
- **v1.0** `packages/lattice/src/artifacts/artifact.ts` — `artifact.toolResult(...)` for tool-result wrapping.
- **v1.0** `packages/lattice/src/runtime/create-ai.ts` — `createAI()` returns the runtime object. Phase 19 extends this object with `runAgent` method.
- **v1.1** `packages/lattice/src/contract/contract.ts` — `CapabilityContract` shape. Phase 19 extends `BudgetInvariant` with `maxIterations` + `maxWallTimeMs`.
- **v1.1** `packages/lattice/src/contract/tripwire.ts` — `inv` builder. Reused for output validation.
- **v1.1** `packages/lattice/src/tracing/tracing.ts` — `RunEventKind` already has `"step.transition"` (Phase 16). Phase 19 emits it once per iteration via `createCheckpointHook` (or directly when no signer is present).

### Established Patterns
- Public surface re-exports are flat (one line per source file).
- Tests live alongside source (`runtime.test.ts` next to `runtime.ts`).
- Types are exported via `export { value, type Type }` pairs.
- Standard Schema is the validation primitive across the codebase (`tools/tools.ts`, `tripwire.ts`).

### Integration Points
- `ai.runAgent` lives next to `ai.run` on the runtime object (`create-ai.ts`).
- New `packages/lattice/src/agent/` module groups all Phase 19+ files.
- Public surface re-exports `runAgent` (or `ai.runAgent` via the method), `AgentIntent`, `AgentResult`, `formatToolsForProvider`.

</code_context>

<specifics>
## Specific Ideas

- The `AgentResult` shape mirrors `RunSuccess`/`RunFailure` with additional optional `iterations: ReadonlyArray<IterationRecord>` field listing per-iteration provider invocations, tool calls, and durations. Inspectable by callers who don't want to wire a custom tracer.
- `formatToolsForProvider` returns `{ requestFragment: object; parseToolUse: (response: ProviderResponse) => ToolUseRequest[] | null }`. The `parseToolUse` closure knows the response shape for each native protocol; returns `null` when the response is a final answer (no tool_use block).
- Sticky-provider state: the first successful provider call records the `providerName` on the loop state. Subsequent iterations skip routing and call that provider directly. On failure, the loop falls back to the deterministic router for the next iteration.

</specifics>

<deferred>
## Deferred Ideas

- Streaming agent iterations — not needed for v1.2; future milestone.
- Multi-agent / parent-child handoff — explicit OOS for v1.x.
- Tool-call dedup / consecutive-identical-call detection — Phase 21 (action-history primitive).
- Goal-progress detection — Phase 21.
- Cost-budget mid-iteration abort — Phase 21 once cost tracker primitive ships; Phase 19 only enforces `maxCostUsd` at iteration boundaries via budget check after each `AFTER_PROVIDER` event.

</deferred>
