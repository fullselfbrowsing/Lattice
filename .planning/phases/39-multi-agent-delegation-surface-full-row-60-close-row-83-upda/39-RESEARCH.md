# Phase 39: Multi-Agent Delegation Surface (full Row 60 close + Row 83 update) - Research

**Researched:** 2026-06-10
**Domain:** Multi-agent orchestration on top of the existing Lattice single-agent runtime (TypeScript, zero new runtime deps); prompt-cache mechanics (Anthropic cache_control, OpenAI automatic prefix caching); in-process dual-dimension rate limiting; receipt content-addressing
**Confidence:** HIGH (codebase findings verified by direct read; provider cache/rate-limit facts verified against official docs fetched this session)

## Summary

Phase 39 builds `defineAgent` / `runAgentCrew` almost entirely from existing, verified Lattice primitives. The single-agent loop in `packages/lattice/src/agent/runtime.ts` already has the exact dispatch seam the CrewDispatcher needs (step 4g, lines 295-346: tool lookup by name → `runTool` → tool-result conversation turn), and the child's summary re-enters the parent as a standard `role: "tool"` `ConversationTurn` — no new model-facing protocol, exactly as D-04 locks. The main structural work is extracting an injectable dispatch chokepoint from the loop (internal refactor, not a public-surface change), composing per-child budgets from `BudgetInvariant` + `createCostTracker`, and building the new standalone `createRateLimitGroup` infra primitive that wraps the existing `AgentTransport` seam.

Three discretion areas were resolved by research. (1) **Receipt chaining:** there is no existing CID convention in the receipts module — `receiptId` is a UUID — but the codebase has a strong sha256-hex content-addressing precedent (`storage/fingerprint.ts`, `create-ai.ts:944`). Recommend CID = `sha256:<hex>` of the DSSE envelope's decoded canonical payload bytes, derivable from any envelope without re-signing. `parentReceiptCid` lands as an additive optional on the v1.2 body with no version bump — Phase 38's `modelClass` proves the exact pattern, and `verifyReceipt`'s structural gate (`asReceiptBody`) ignores unknown optional fields while the JCS re-canonicalization round-trips them byte-stably. (2) **Cache-prefix sharing:** OpenAI caching is automatic and token-granular (≥1024 tokens, no request change, verify via `usage.prompt_tokens_details.cached_tokens` preserved on `rawResponse`); Anthropic caching is content-block-granular and requires `cache_control` — and the current Anthropic adapter sends `system: ""` with the whole prompt in one mutating user block, so Anthropic cache hits are **impossible today** without an adapter change. Recommend an additive optional `ProviderRunRequest.cacheSystemPrefix?: string` consumed by the Anthropic adapter (mapped to `system: [{type:"text", text, cache_control:{type:"ephemeral"}}]`), gated on `quirks.promptCachingSupported`. (3) **Rate-limit defaults:** verified Anthropic Tier 1 = 50 RPM / 30,000 ITPM (Sonnet 4.x, the most conservative mainstream row), and Anthropic itself documents token-bucket continuous replenishment — D-15's design matches the provider's own enforcement model.

One confirmed claim from the research questions: adapter API keys are closure-private in every first-party adapter (`options.apiKey` captured at factory time, never exposed on the returned object), so per-provider-key bucket grouping must key on adapter **instance identity** (default) with explicit per-`adapter.id` overrides in `CrewPolicy.limits`. Also flagged: AGENTS.md needs **three** edits, not one — the Multi-Agent Crews section, the Rationale paragraph, and the easily-missed "What Not To Use" OpenAI Agents SDK row (line 127) which restates "Out of Scope".

**Primary recommendation:** Build the crew as a new `agent/crew/` module that drives the existing loop through an extracted internal dispatch seam; touch the public `ProviderAdapter` surface only via one additive optional request field; mint per-agent receipts directly via `createReceipt` with a crew-root receipt seeding the chain; ship `createRateLimitGroup` as a standalone `agent/infra/` primitive following the `CostTracker` precedent.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Crew API & Child Dispatch

- **D-01:** Hybrid dispatch model: the parent's **model** sees each child agent as a named tool (per-child tool declarations derived from the child's `id`, a task-string input schema, and `summaryReturnSchema` as the result shape), but the **runtime** branches on a `kind: "agent"` discriminant and routes dispatch through a CrewDispatcher chokepoint instead of `runTool`.
- **D-02:** All crew concerns — CrewPolicy enforcement, `hosts.childHost` wiring, rate-limit-group coordination, cache-prefix sharing, and child receipt minting — live at the CrewDispatcher seam. No policy logic smuggled into tool closures.
- **D-03:** `defineAgent(spec)` returns `AgentSpec { kind: "agent", id, intent, tools, childAgents?, summaryReturnSchema }` as a literal sibling of `defineTool`'s shape, with `childAgents: ReadonlyArray<AgentSpec>` composing by value as a tree.
- **D-04:** Child summaries reuse the existing prompt-reencoded tool-use protocol and Phase 37 tool-call validation — no new model-facing protocol.
- **D-05:** Nesting: `CrewPolicy.maxDepth` defaults to `1` (parent→child only). Recursion is capped, not forbidden — grandchildren are a policy opt-in later without a breaking change. Cycle prevention via an ancestry chain of spec `id`s threaded through dispatch context (and persisted in `AgentSnapshot` for resume); any dispatch whose target `id` already appears in the chain is rejected.

#### CrewPolicy & Budget Composition

- **D-06:** Hierarchical budgets: `CrewPolicy` carries a crew-level `BudgetInvariant` (reused verbatim from `contract/contract.ts`) plus structural caps — `maxTotalIterations`, `maxIterationsPerAgent`, `maxConcurrentChildren`, `maxDepth`.
- **D-07:** Each child's effective budget = `min(spec.contract.budget, remaining crew pool)`. Per-agent sub-budgets are optional; a crew with only `policy.budget` set behaves like a simple shared pool.
- **D-08:** Crew cost accounting reuses `createCostTracker` as-is: one tracker per agent plus one crew-level aggregator instance fed the same per-iteration `Usage` records. Guard against double-counting between child tracker and crew aggregator in tests.
- **D-09:** Classified failure routing: recoverable child failures (`agent-max-iterations`, stuck via `STUCK_REASONS`, `summaryReturnSchema` validation failure) return to the parent as a **structured tool-result error** carrying `{ kind, reason, terminal }` so the parent's loop can react.
- **D-10:** Terminal semantics preserved across the parent/child boundary: tripwire violations and crew-ceiling breach propagate `terminal: true` (consistent with `isTerminal()` in `results/errors.ts`) — the parent must not re-delegate a task a tripwire already rejected; crew-pool exhaustion ends the run. Add a crew-level failure kind (e.g. `crew-budget-exceeded`) to `AgentFailureKind`.
- **D-11:** **Serial children only in v1.3.** `maxConcurrentChildren` is fixed at 1 (concurrent execution deferred). This removes atomic pool-reservation and contended-bucket correctness work from this phase. The type may carry the cap field for forward compatibility, but the runtime rejects or clamps values > 1.

#### Rate-Limit-Group Coordination

- **D-12:** Ship a standalone public primitive (`createRateLimitGroup()` or similar) following the `CostTracker` precedent: standalone pure infra under `agent/infra/`, no dependency on the agent runtime, exported from the package root so consumers can use it with plain `runAgent` outside crews.
- **D-13:** Injection via the existing `AgentTransport` seam — the limiter wraps `transport.call()` / `provider.execute()`. `ProviderAdapter` is NOT modified (preserves the INV-03 7-provider parity invariant). `runAgentCrew` constructs one shared group per provider key and wraps each crew member's transport with it, structurally guaranteeing parent and children share one bucket.
- **D-14:** Dual-dimension bucket: **both** requests/min and tokens/min per provider key (Anthropic/OpenAI enforce RPM and TPM independently; 429 fires on whichever trips first). Lease-based async interface: `acquire(estimate)` reserves on estimated input tokens, `release(actualUsage)` reconciles with the actual `Usage` every adapter already returns.
- **D-15:** Conservative default ≈ Anthropic Tier 1 (~50 requests/min, ~30k input tokens/min per provider key), drained continuously (per-second smoothing) rather than minute-windows.
- **D-16:** Override path is explicit config, not a magic constant: per-key `limits: { requestsPerMinute, tokensPerMinute }` block in `CrewPolicy`, plus a `coordination: "unmanaged"` escape hatch for consumers who handle 429s themselves.
- **D-17:** In-process implementation only for v1.3, but the lease-based interface is the seam for a future cross-process implementation (the same contract could be satisfied by Redis/Durable Object later). No new runtime dependencies (rejected `bottleneck` — request-oriented, unmaintained, and Lattice is zero-runtime-dep).
- **D-18:** Zero new runtime dependencies for the whole phase.

### Claude's Discretion

- **Receipt chaining (`parentReceiptCid`):** exact CID derivation, whether the field lands as an additive optional on the existing v1.2 body (no new schema version expected — Phase 38 noted `parentReceiptCid` ships in Phase 39 on v1.2), root-agent behavior (field absent), interaction with checkpoint receipts. Must not regress Phase 38's CRYPTO-01 downgrade defense or v1.1 verification compatibility.
- **Cache-prefix sharing mechanism:** how the shared system-prompt prefix is composed across child invocations (consider Phase 35 scaffolds' byte-stable version-pinned fragments), and how "verifiable on Anthropic + OpenAI" is demonstrated (cache-hit metrics in usage responses).
- Exact public naming (`runAgentCrew` option fields, `CrewPolicy` member names, rate-limit primitive name), file layout under `packages/lattice/src/agent/`, and DELEG-01..08 requirement wording.

### Deferred Ideas (OUT OF SCOPE)

- **Concurrent child execution** (`maxConcurrentChildren > 1`) — deferred from v1.3 by D-11. Requires atomic crew-pool reservations in the cost aggregator and a properly contended token bucket. Candidate for v1.4.
- **Cross-process rate-limit coordination** (Redis/Durable Object behind the lease-based interface) — seam designed in v1.3, implementation deferred.
- Hosted crew orchestration — permanently out of scope per REQUIREMENTS.md.
</user_constraints>

<phase_requirements>
## Phase Requirements

DELEG-01..08 are **planned but not yet authored** in `.planning/REQUIREMENTS.md` — the planner must author them (with traceability rows) before/alongside plan creation. Proposed draft wording, mapped to the three roadmap success criteria:

| ID | Proposed wording (draft — planner finalizes) | Success criterion | Research Support |
|----|----------------------------------------------|-------------------|------------------|
| DELEG-01 | `defineAgent(spec): AgentSpec` ships in `packages/lattice/src/agent/` as a literal sibling of `defineTool` (tools.ts:29 shape), returning `{ kind: "agent", id, intent, tools, childAgents?, summaryReturnSchema }` with `childAgents: ReadonlyArray<AgentSpec>` composing by value; exported from the package root with tsd type coverage. | SC1 | §defineAgent mirror; D-03 |
| DELEG-02 | `runAgentCrew({ root, hosts: { childHost }, policy })` is exposed on the runtime returned by `createAI` via the same lazy-`import()` pattern as `runAgent` (create-ai.ts:152-158); `CrewPolicy` carries a crew-level `BudgetInvariant` (reused verbatim) plus `maxTotalIterations`, `maxIterationsPerAgent`, `maxConcurrentChildren` (rejected/clamped to 1), `maxDepth` (default 1); per-child effective budget = `min(spec budget, remaining crew pool)`; crew cost accounting uses one `createCostTracker` per agent plus one crew aggregator with double-counting guarded by tests. | SC1, SC2 | §runAgentCrew entry; D-06/D-07/D-08/D-11 |
| DELEG-03 | Parent-child delegation executes through a CrewDispatcher chokepoint: the parent's model sees each child as a named tool (prompt-reencoded protocol + Phase 37 validation unchanged), the runtime branches on `kind: "agent"`, the child runs its own bounded loop, and the validated `{ summary, artifacts, receipts }` summary (per `summaryReturnSchema`) re-enters the parent conversation as a `role: "tool"` turn. Recoverable child failures return as structured tool-result errors `{ kind, reason, terminal }`; tripwire violations and crew-ceiling breach propagate `terminal: true`; `AgentFailureKind` gains `crew-budget-exceeded`; cycle prevention rejects any dispatch whose target id appears in the ancestry chain (persisted in `AgentSnapshot` for resume). | SC2 | §Dispatch seam; D-01/D-02/D-04/D-05/D-09/D-10 |
| DELEG-04 | Crew members share a byte-stable prompt-cache prefix: the shared system/tool prefix is composed deterministically (Phase 35 scaffold discipline), the Anthropic adapter gains an opt-in path that emits the prefix as a `cache_control`-marked system block, OpenAI relies on automatic prefix caching, and tests verify (a) the Anthropic request shape carries `cache_control` and (b) cache-hit counters (`cache_read_input_tokens` / `prompt_tokens_details.cached_tokens`) are surfaced from `rawResponse` for assertion. | SC2 | §Cache-prefix sharing |
| DELEG-05 | A standalone rate-limit-group primitive (`createRateLimitGroup` or similar) ships under `agent/infra/` and the package root: dual-dimension (RPM + input-TPM) continuously-drained token bucket with a lease interface (`acquire(estimate)` / `release(actualUsage)`), conservative default ≈ Anthropic Tier 1 (50 RPM / 30k input TPM), per-key `limits` override in `CrewPolicy`, `coordination: "unmanaged"` escape hatch, injected by wrapping the `AgentTransport` seam (no `ProviderAdapter` change), one shared group per provider key across the crew. | SC3 | §Rate-limit group; D-12..D-17 |
| DELEG-06 | `CapabilityReceiptBody` gains additive optional `parentReceiptCid?: string` on schema v1.2 (no version bump); a public CID helper derives `sha256:<hex>` from an envelope's canonical payload bytes; per-agent crew receipts chain via the field (root receipt omits it); CRYPTO-01 regression suite extended: forged v1/v1.1 downgrades carrying `parentReceiptCid` rejected, v1.1 verification compatibility preserved, DSSE/JCS byte stability with the field proven. | SC3 | §Receipt chaining |
| DELEG-07 | `examples/agent-crew/` showcases a parent-summarizer + 3 child-researchers crew (serial children) with real Ed25519 signing of every per-agent receipt, written to a receipts dir and verified via `verifyReceipt`; an `evalAgentRun`-style regression test gates crew iterations-to-goal + cost against a committed baseline using a scripted fake provider. | SC3 | §evalAgentRun extension; examples/agent-loop pattern |
| DELEG-08 | Policy + audit-trail surfaces flip: `AGENTS.md` Multi-Agent Crews section (and the "What Not To Use" OpenAI Agents SDK row + Rationale paragraph) updated to "First-class via opt-in `AgentHost` capability"; `docs/fsb-integration-gaps.md` Row 60 → "Covered" with Phase 39 backlink, Row 83 → "Covered" with v1.2 Phase 20 backlink (commit `3794896`); all new public symbols exported from `src/index.ts` and pass publint/attw/tsd gates; changeset documents the crew surface. | SC1 + doc flips | §Doc edits |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

No `./CLAUDE.md` exists in this repository. The user's global instruction applies to any commits made during this phase: **never add "Co-Authored-By" or AI self-attribution lines to commit messages or PRs.** No `.claude/skills/` or `.agents/skills/` directories exist.

Repo-level constraints with CLAUDE.md-equivalent force (from AGENTS.md + established phase patterns, verified in code):

- Zero **new** runtime dependencies (`packages/lattice` ships only `@standard-schema/spec`, `canonicalize`, `mime` — D-18 forbids additions).
- INV-03 7-provider parity: `ProviderAdapter` interface methods untouched; new behavior composes via transport/hook seams or additive-optional fields (Phase 34/37 precedent).
- `exactOptionalPropertyTypes` is on — all optional fields use the conditional-spread pattern (`...(x !== undefined ? { x } : {})`), verified throughout receipt.ts/runtime.ts.
- Public surface is release-audited: every new export needs `src/index.ts` re-export + tsd/`test-d/*.test-d.ts` coverage + publint/attw green (`pnpm -r lint:packages`).
- No background timers that pin the event loop (lazy expiry pattern documented in anthropic.ts D-07).
- Library code must run on Node ≥ 24 with web-standard APIs (`crypto.subtle`, `fetch`, `atob`) — no Node-only Buffer in src (checkpoint.ts:255 precedent).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `defineAgent` spec factory | SDK type layer (`agent/`) | — | Pure value constructor, sibling of `defineTool` |
| `runAgentCrew` entry + lazy import | Runtime facade (`runtime/create-ai.ts`) | Crew orchestrator (`agent/crew/`) | Facade stays thin; orchestration lives beside `agent/runtime.ts` |
| Parent/child loop execution | Crew orchestrator (CrewDispatcher) | Existing single-agent loop (`agent/runtime.ts`) | D-02: all crew policy at the dispatcher seam; loop reused per agent |
| Summary-return validation | Crew dispatcher | `outputs/validate.ts` (Standard Schema) | Same validation kernel `runTool` uses |
| Rate-limit group | Standalone infra (`agent/infra/`) | Transport wrapper composed by crew | D-12/D-13: pure primitive, no runtime dependency |
| Cache-prefix composition | Crew dispatcher (prefix assembly) | Provider adapter (Anthropic `cache_control` emission) | Prefix bytes are crew-owned; wire-format emission is adapter-owned |
| Receipt minting + chaining | Crew dispatcher (per-agent mint) | `receipts/` (CID helper, body field) | Receipts module owns schema + CID; dispatcher owns when/what to mint |
| Policy/doc flips | Repo docs (`AGENTS.md`, `docs/fsb-integration-gaps.md`) | — | Text-only edits with stable row anchors |

## Standard Stack

### Core (all internal — D-18 forbids new dependencies)

| Module | Location | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `runAgent` loop | `src/agent/runtime.ts` | Per-agent bounded loop reused verbatim per crew member | Already enforces budget pre-checks, hook bands, snapshot/resume |
| `formatToolsForProvider` | `src/agent/format-tools.ts` | Prompt-reencoded tool protocol; child tool declarations + summary re-entry turns | D-04 locks reuse; `describeForSystem()` exposes the byte-stable system block |
| `defineTool` shape | `src/tools/tools.ts:29` | Template `defineAgent` mirrors with `kind: "agent"` | D-03 |
| `BudgetInvariant` | `src/contract/contract.ts:28` | `CrewPolicy.budget`, reused verbatim | D-06; already carries `maxCostUsd`/`maxIterations`/`maxWallTimeMs` |
| `createCostTracker` | `src/agent/infra/cost-tracker.ts` | Per-agent + crew-aggregate accounting | D-08; pure accumulator, `budgetStatus()` built in |
| `createReceipt` / `verifyReceipt` | `src/receipts/` | Per-agent receipt minting + chain verification | Phase 38 v1.2 body; redact→canonicalize→PAE→sign ordering locked |
| `createCheckpointHook` | `src/contract/checkpoint.ts` | Per-iteration receipts (unchanged); reference for direct-mint pattern | Best-effort mint contract (D-07 of Phase 3) |
| `AgentTransport` | `src/agent/host.ts:83` | Rate-limiter injection point | D-13; `call(provider, request)` wraps `execute()` |
| `evalAgentRun` | `src/agent/eval.ts` | Crew regression gate (unchanged — see §evalAgentRun) | Pure comparison kernel over `{iterationsToGoal, usage}` |
| `validateSchemaOutput` | `src/outputs/validate.ts` | `summaryReturnSchema` validation (Standard Schema) | Same kernel `runTool` uses for input validation |
| Phase 35 scaffolds | `src/prompts/scaffolds.ts` | Byte-stable, version-pinned prefix fragments (`PROMPT_SCAFFOLD_VERSION`) | Deterministic canonical JSON → stable cache keys |

### Supporting

| Tool | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | 4.1.5 (workspace) | Unit/integration tests; `vi.useFakeTimers()` + `advanceTimersByTimeAsync` for bucket drain tests | Precedent at `adapters.test.ts:519`, `xai.test.ts:430` |
| tsd + vitest typecheck | 0.33.0 | `test-d/*.test-d.ts` public-type tests | Every new public type (AgentSpec, CrewPolicy, RateLimitGroup, receipt field) |
| publint + attw | 0.3.18 / 0.18.2 | Package-surface gates | `pnpm -r lint:packages` per PR |
| changesets | 2.31.0 | Release notes for the crew surface | `.changeset/v1.3.0-*.md` naming convention in repo |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Internal dispatch-seam refactor of runtime.ts | Wrapping children as `ToolDefinition` closures | Rejected by D-01/D-02 — policy logic in tool closures is explicitly forbidden |
| Hand-rolled token bucket | `bottleneck` npm package | Rejected by D-17 (request-oriented, unmaintained, violates zero-dep) |
| `sha256` CID of canonical payload | UUID receiptId as the chain link | UUID is not content-addressed — a forged body could reuse an id; hash binds the link to signed bytes |
| Additive `ProviderRunRequest.cacheSystemPrefix` | New `ProviderAdapter` method | Rejected — INV-03 parity; optional request field is the Phase 37 `toolCalls` precedent inverted |

**Installation:** none — `pnpm install` of the existing workspace only.

## Package Legitimacy Audit

This phase installs **zero external packages** (D-18: zero new runtime dependencies; all dev tooling already in the workspace lockfile). No slopcheck run required.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
consumer
   │  ai.runAgentCrew({ root: AgentSpec, hosts: { childHost }, policy: CrewPolicy })
   ▼
create-ai.ts facade ── lazy import("../agent/crew/run-crew.js")
   ▼
runAgentCrew orchestrator
   ├── validate policy (maxConcurrentChildren <= 1, maxDepth, budget present?)
   ├── mint crew-root receipt (signer present) ──────────────┐
   ├── build RateLimitGroup per provider key ── wrap transports
   ├── compose shared cache prefix (tool descriptions + scaffold fragments)
   ▼                                                          │
parent agent loop (existing runtime.ts, internal dispatch seam injected)
   │  model emits {"tool_calls":[{name:"<childId>", args:{task}}]}
   ▼
CrewDispatcher.dispatch(req)
   ├── name ∈ childAgents?  ──no──► runTool(tool, args)  (unchanged path)
   ├── ancestry-chain cycle check + maxDepth check
   ├── derive child budget = min(child contract, remaining crew pool)
   ▼
child agent loop (runtime.ts again, childHost + wrapped transport)
   │  bounded by child budget; per-iteration checkpoints as today
   ▼
child completes → AgentResult
   ├── success → validate {summary, artifacts, receipts} vs summaryReturnSchema
   │             mint child receipt { parentReceiptCid: crewRootCid } ◄──┘
   │             conversation.push({ role:"tool", content: JSON(summary...), toolCallId, toolName })
   └── failure → structured tool-result error { kind, reason, terminal }
                 terminal:true → parent must not re-dispatch; crew-pool breach → crew-budget-exceeded
   ▼
parent continues → final answer → CrewResult { result, perAgent[], usage, receipts }
```

Every provider call (parent or child) flows: `loop → host.transport.call → rateLimitWrapper.acquire → provider.execute → rateLimitWrapper.release(actualUsage)`.

### Recommended Project Structure

```
packages/lattice/src/agent/
├── crew/
│   ├── agent-spec.ts        # defineAgent + AgentSpec type (D-03)
│   ├── crew-policy.ts       # CrewPolicy + validation (D-06, D-11 clamp/reject)
│   ├── dispatcher.ts        # CrewDispatcher chokepoint (D-01/D-02)
│   ├── run-crew.ts          # runAgentCrew orchestrator + CrewResult
│   └── *.test.ts            # colocated tests (repo convention)
├── infra/
│   └── rate-limit-group.ts  # createRateLimitGroup (D-12) — standalone, pure
├── runtime.ts               # + extracted internal dispatch seam (not exported from index)
└── format-tools.ts          # + option to omit system block from buildTask (cache hoist)
packages/lattice/src/receipts/
├── types.ts                 # + parentReceiptCid?: string on CapabilityReceiptBody
├── receipt.ts               # + parentReceiptCid on CreateReceiptInput (conditional spread)
└── cid.ts (new)             # receiptCid(envelope): Promise<string>  ("sha256:<hex>")
examples/agent-crew/
├── package.json             # mirrors examples/agent-loop (workspace:^ dep, private)
├── setup.mjs                # crew wiring: signer/keyset, scripted fake, tools
└── index.mjs                # run, verify every receipt, print eval gate line
```

### Pattern 1: Internal dispatch seam extraction (answers research Q1)

**What:** `runtime.ts` step 4g (lines 295-346) resolves each `ToolUseRequest` by `intent.tools.find(t => t.name === req.name)`, runs `runTool`, and pushes a `role: "tool"` turn. Extract this into an injectable dispatcher so the crew can branch on child names **without changing the public `runAgent` signature**.

**How:** Two viable shapes — recommend (a):
- (a) Export an internal `runAgentLoop(intent, config, internalOptions?)` from a non-public module (`agent/loop-internal.ts` or an extra non-exported parameter on `runAgent`), where `internalOptions.dispatchToolUse?: (req: ToolUseRequest, ctx) => Promise<{ content: string }>` defaults to the current `runTool` path. `run-crew.ts` imports it directly (same package; `src/index.ts` does not re-export it — public surface unchanged).
- (b) Build the parent's `intent.tools` with synthetic entries and intercept in a forked loop — rejected: duplicates the loop, drifts from runtime.ts fixes.

**Conversation re-entry shape (verified):** the child summary re-enters as exactly the turn `runTool` results use today:

```typescript
// Source: packages/lattice/src/agent/runtime.ts:334-339 (existing tool-result push)
conversation.push({
  role: "tool",
  content: JSON.stringify({ summary, artifacts, receipts }), // validated vs summaryReturnSchema
  toolCallId: req.id,
  toolName: childSpec.id,
});
```

`format-tools.ts buildTask` renders this as `TOOL_RESULT (name=<childId> id=<id>):\n<content>` — no protocol change (D-04). Structured failure mirrors the existing error convention (`runtime.ts:309-311` emits `JSON.stringify({ error })`), extended per D-09:

```typescript
content: JSON.stringify({ error: { kind: "agent-max-iterations", reason, terminal: false } })
```

**Child tool declaration for the parent's model:** synthesize a minimal descriptor consumed by `formatToolsForProvider` (it only reads `name` / `description` / `inputSchema`; a `~standard` stub schema is the established pattern — `examples/agent-loop/setup.mjs:54-60`). The description should embed the child's intent + the `summaryReturnSchema` result shape so the model knows what comes back.

### Pattern 2: Receipt CID + chain (answers research Q2)

**No existing CID convention exists** — verified by grep: zero `cid` hits in `src/`. `receiptId` is `crypto.randomUUID()` (receipt.ts:85). Content-addressing precedents: `storage/fingerprint.ts` (`{algorithm:"sha256", value: hex}` via `crypto.subtle.digest`), `create-ai.ts:944` (`sha256HexOfCanonicalContract`), `IterationRecord.toolCalls[].argsHash` (note: types.ts:50 claims sha256 but `stableHash` at runtime.ts:493 actually uses djb2 — do **not** copy that helper for receipt CIDs).

**Recommended derivation:** `receiptCid(envelope) = "sha256:" + hex(sha256(base64decode(envelope.payload)))` — i.e., the digest of the DSSE canonical payload bytes (the exact bytes that were signed). Properties: derivable from any envelope without keys; binds the link to the signed content; stable because verifyReceipt already proves `canonicalize(body) === payloadBytes` byte-equality (verify.ts:149-155). Implement with `crypto.subtle` + the `atob` decode pattern from checkpoint.ts:255.

**Additive-optional on v1.2 — confirmed safe, no version bump:**
- `asReceiptBody` (verify.ts:36-63) checks only required fields; unknown/optional fields pass.
- Re-canonicalization (verify.ts:149) canonicalizes the **parsed** body including `parentReceiptCid`, so JCS round-trip remains byte-equal — exactly how `modelClass` landed in Phase 38.
- `createReceipt` adds it via conditional spread (mirror receipt.ts:103 `modelClass` line).
- Redaction: it's a stable identifier (hash), not user content — redact.ts intentionally leaves such fields alone (same rationale as step-marker fields).
- 38-CONTEXT.md explicitly states `parentReceiptCid` ships in Phase 39 **on v1.2**.

**Chain topology (discretion — recommendation):** receipts are immutable, so a link can only point to a receipt that already exists. A child finishes **before** its parent's final receipt exists, so "child → parent-completion receipt" is impossible. Recommend:

1. `runAgentCrew` mints a **crew-root receipt** at crew start (signer present): zero usage, verdict `"success"`, `route: { providerId: "lattice-crew", capabilityId: "lattice-crew/run", attemptNumber: 1 }`-style synthetic identifiers (checkpoint.ts DEFAULT_ROUTE precedent), `parentReceiptCid` absent.
2. Every per-agent completion receipt (parent and children) carries `parentReceiptCid = crewRootCid`. With `maxDepth: 1` this is a complete, verifiable chain; the ancestry-chain design extends it to grandchildren later (child-of-child links to its dispatching agent's **dispatch-time** receipt if depth >1 is ever enabled).
3. The child's `receipts: ReceiptCid[]` summary field carries the CIDs of the child's own receipts (completion + per-iteration checkpoints if captured), so the parent's model and the final `CrewResult` can reference them.
4. Per-iteration checkpoint receipts via `createCheckpointHook` are **unchanged** (no parentReceiptCid) — extending `CheckpointHookOptions` is optional scope; the dispatcher mints agent-completion receipts directly via `createReceipt` (D-02: minting lives at the dispatcher seam).

**CRYPTO-01 non-regression tests (replicate Phase 38's RECEIPT12-02 pattern, verify.test.ts):** forged v1 body carrying `parentReceiptCid` → `schema-version-too-low`; absent version → `schema-version-too-low`; `lattice-receipt/v2` literal → `version-mismatch`; signed v1.1 receipt (no new field) still verifies; v1.2 receipt with `parentReceiptCid` round-trips DSSE/JCS byte-stably and verifies; tampered `parentReceiptCid` → `canonicalization-mismatch`/`signature-invalid`.

### Pattern 3: Cache-prefix sharing (answers research Q3)

**Verified provider facts (fetched 2026-06-10 from official docs):**

| Property | Anthropic | OpenAI |
|---|---|---|
| Mechanism | Explicit `cache_control: {type:"ephemeral"}` breakpoints (up to 4), hierarchy `tools → system → messages`; newer top-level automatic `cache_control` places breakpoint on last cacheable block | Fully automatic, no request change; optional `prompt_cache_key` / `prompt_cache_retention` |
| Granularity | **Content-block** — prefix up to breakpoint must be 100% byte-identical blocks | **Token-prefix** — exact prefix match over the serialized prompt; first ~256 tokens hashed, 128-token increments |
| Minimum | Per-model: 1,024 tokens (Sonnet 4.x / Opus 4.x), up to 4,096 (Haiku 4.5) | 1,024 tokens |
| TTL | 5 min default (refresh on reuse); `ttl: "1h"` at 2x write cost | 5-10 min inactivity, up to 1h (24h extended retention on newer models) |
| Usage fields | `usage.cache_creation_input_tokens`, `usage.cache_read_input_tokens` | `usage.prompt_tokens_details.cached_tokens` |
| Other invalidators | Model, tools, tool_choice, images, workspace isolation | Model, exact tokens |

[CITED: platform.claude.com/docs/en/docs/build-with-claude/prompt-caching; developers.openai.com/api/docs/guides/prompt-caching]

**Codebase reality (verified):** the Anthropic adapter sends `system: ""` and the entire prompt as one user content string (anthropic.ts:396-408); prompt caching was explicitly deferred at Phase 4 (anthropic.ts:33). Because Anthropic caching is block-granular and the single user block mutates every iteration (conversation grows), **Anthropic cache hits are structurally impossible today**. OpenAI/compat sends `request.task` as the first text part of the user message (adapters.ts:160-211); because OpenAI caching is token-granular, a byte-stable leading region of `task` **already qualifies** with zero adapter changes. Both adapters preserve the full provider body on `rawResponse` (adapters.ts:243, anthropic.ts:441), so cache counters are assertable without touching the normalized `Usage` shape.

**Recommended mechanism:**
1. The crew composes one shared prefix per crew = `handle.describeForSystem()` (format-tools.ts:214 — the byte-stable tool-description + envelope-instruction block) optionally concatenated with Phase 35 `getToolUseContract(strategy, tools)` fragments (canonical JSON, `PROMPT_SCAFFOLD_VERSION`-pinned — ROADMAP risk note on cache-key stability). All children of one crew share the same tool surface for the prefix to be byte-identical; per-child task text follows the prefix.
2. **OpenAI path:** no adapter change. Keep the prefix at the head of `task` (buildTask already places systemBlock first). Verify via `rawResponse.usage.prompt_tokens_details.cached_tokens > 0` on the 2nd+ same-prefix call.
3. **Anthropic path:** additive optional `ProviderRunRequest.cacheSystemPrefix?: string` (name at planner discretion). When present, the Anthropic adapter emits `system: [{ type: "text", text: prefix, cache_control: { type: "ephemeral" } }]` instead of `system: ""`, and `task` carries only the conversation body. Adapters that ignore the field must not lose content, so the dispatcher decides composition per adapter: `adapter.quirks?.promptCachingSupported === true` (AnthropicQuirks flag, quirks.ts:48) → hoist prefix to `cacheSystemPrefix`; otherwise → fold prefix into `task` (today's behavior). `format-tools.ts` needs a small option to emit the conversation body without the system block (or a `buildTaskBody()` sibling) so the hoisted prefix is not duplicated.
4. **Verifiability:** (a) PR-time: mocked-fetch unit tests assert the Anthropic request JSON carries the `cache_control`-marked system block and that the dispatcher/tests can read `cache_read_input_tokens` from a fixture response; byte-equality snapshot test proves the prefix is identical across three child dispatches. (b) Real-provider proof: cannot run at PR time (repo policy: real providers nightly/manual only) — provide a documented opt-in script in `examples/agent-crew/` (env-keyed, skipped by default) and/or hand to Phase 31 INTEG canary. The shared prefix in the example must exceed 1,024 tokens to be cacheable at all — pad tool descriptions accordingly.

`ProviderRunRequest` additive-field precedent: Phase 37 added `toolCalls` to `ProviderRunResponse` and Phase 34 added two optional members to `ProviderAdapter` without breaking v1.2 consumers; an optional request field is the same class of change. Consumer adapters (4-field literals) ignore it harmlessly **only when the dispatcher's quirks check gates the hoist** — that check is mandatory.

### Pattern 4: Rate-limit group (answers research Q4)

**Interface (D-14 lease-based):**

```typescript
// agent/infra/rate-limit-group.ts — standalone, zero deps, no agent-runtime import
export interface RateLimitGroupOptions {
  readonly requestsPerMinute?: number;   // default 50  (Anthropic Tier 1, verified)
  readonly tokensPerMinute?: number;     // default 30_000 input TPM (Sonnet 4.x Tier 1, verified)
  readonly now?: () => number;           // injectable clock for tests (default Date.now)
}
export interface RateLimitLease {
  release(actual: { promptTokens: number }): void;  // reconcile estimate vs actual Usage
}
export interface RateLimitGroup {
  readonly kind: "rate-limit-group";
  acquire(estimate: { inputTokens: number }): Promise<RateLimitLease>;
}
```

**Continuous drain without timer pinning:** no `setInterval`. Refill is computed lazily at each `acquire` from the timestamp delta (`available = min(cap, available + elapsedMs * perMsRate)`), matching the lazy-expiry rule documented in anthropic.ts (library must not pin the Node event loop). When capacity is insufficient, compute the exact deficit wait and `setTimeout` once. **Tests:** vitest fake timers (`vi.useFakeTimers()` + `await vi.advanceTimersByTimeAsync(...)`) fake both `Date.now` and `setTimeout` — existing precedent at adapters.test.ts:519-531 and xai.test.ts:430-444; the injectable `now` option is belt-and-braces for pure-logic tests. Anthropic itself documents token-bucket continuous replenishment for its limits, so the model matches the enforcer. [CITED: platform.claude.com/docs/en/api/rate-limits]

**Transport composition (D-13):**

```typescript
// crew/dispatcher.ts (or infra) — wraps the existing AgentTransport seam, ProviderAdapter untouched
export function withRateLimit(group: RateLimitGroup, inner?: AgentTransport): AgentTransport {
  return {
    async call(provider, request) {
      const lease = await group.acquire({ inputTokens: estimateInputTokens(request.task) });
      try {
        const response = inner !== undefined
          ? await inner.call(provider, request)
          : await provider.execute!(request);
        lease.release({ promptTokens: response.normalizedUsage?.promptTokens ?? 0 });
        return response;
      } catch (err) {
        lease.release({ promptTokens: 0 }); // refund estimate on failure (planner: decide refund policy)
        throw err;
      }
    },
  };
}
```

Token estimation: a chars/4 heuristic is sufficient for reservation since `release` reconciles with actual `normalizedUsage.promptTokens` (every adapter populates it — verified for anthropic/compat/fake). `transcript-store.ts` exports a `TokenEstimator` type to align the signature with.

**Per-provider-key grouping — claim verified:** every first-party factory captures `options.apiKey` in closure (anthropic.ts:241, adapters.ts:158/477) and the returned adapter exposes only `id`/`kind`/`capabilities`/`quirks`/`execute`/`negotiateCapabilities`. The key is unrecoverable at runtime. Therefore: default grouping = **one group per distinct adapter instance** in the crew's provider config (parent + children share instances → share buckets structurally, satisfying D-13's "structurally guaranteeing"); `CrewPolicy.limits` overrides are keyed by `adapter.id` (e.g. `limits: { anthropic: { requestsPerMinute, tokensPerMinute } }`); `coordination: "unmanaged"` skips wrapping entirely (D-16). Two adapter instances with the same `id` but different keys would share a group under id-keyed overrides — document that instance identity is the true key and `id` is the override addressing scheme.

**Crew member wiring:** `runAgentCrew` wraps each member's host: parent uses `intent.host` (or noop) with its transport wrapped; children use `hosts.childHost` with **the same group instance** wrapping their transports. Wrapping composes with consumer transports (FSB offscreen bridge) because `withRateLimit(group, existingTransport)` nests.

### Pattern 5: Serial-only dispatch + clamp (answers research Q5)

The existing loop already processes `toolUseRequests` strictly in order (`for (const req of toolUseRequests)`, runtime.ts:303) and `await`s each dispatch — multiple child calls in one envelope execute serially with zero extra machinery. `maxConcurrentChildren` enforcement happens **once, at `runAgentCrew` entry** (crew-policy validation): value `undefined` or `1` → proceed; `> 1` → recommend **reject with a typed error** (`TypeError` or a `CrewPolicyError` naming the field and the v1.3 limit) rather than silent clamp — consistent with the project's "explicit config, no magic" stance (D-16) and fail-fast precedent (`runTool` throws on invalid input). The type keeps the field for forward compatibility (D-11 allows either; planner may choose clamp+tracer-warning instead, but pick one and test it).

### Pattern 6: evalAgentRun crew gate (answers research Q6)

`evalAgentRun(baseline, current, options)` is a pure kernel over `AgentRunSnapshot { iterationsToGoal, usage }` with default tolerances (+1 iteration, +10% cost) and a `mixed-cost-unknown` guard. **No API change is needed for the success criterion**: derive the crew snapshot from `CrewResult` — `iterationsToGoal` = total iterations across all agents (parent + children), `usage` = the crew aggregator's `total()`. The regression test (vitest, colocated under `agent/crew/`) runs the parent-summarizer + 3-researchers crew against a scripted fake provider (deterministic response sequence, the `examples/agent-loop/setup.mjs:87-94` pattern extended to script parent envelopes naming children), asserts crew success, then gates with `evalAgentRun` against an inline/committed baseline. Requirement: `CrewResult` must expose per-agent results + aggregate usage + total iteration count so the snapshot is derivable (also feeds D-08's double-counting test: crew aggregate === sum of per-agent trackers === parent + children usage, each `Usage` recorded exactly once).

### Anti-Patterns to Avoid

- **Policy in tool closures** — wrapping a child as a `ToolDefinition` whose `execute` runs the child loop violates D-01/D-02 explicitly.
- **`setInterval` refill** in the rate limiter — pins the event loop; lazy timestamp refill only.
- **Copying `stableHash` (djb2) for receipt CIDs** — runtime.ts:493 is a non-cryptographic convenience hash; receipt chain links must be sha256.
- **Mutating `ProviderAdapter` or its 7 implementations' method signatures** — INV-03. Additive optional fields only.
- **Template-generating the cache prefix per call** — any non-byte-stable fragment (timestamps, random ids, unsorted keys) silently zeroes the cache-hit rate (ROADMAP Phase 35 risk note). Use canonical serialization + pinned scaffold versions.
- **Letting the child's full transcript flow back to the parent** — only the validated `{ summary, artifacts, receipts }` envelope re-enters; that is the entire point of summary-return.
- **Re-dispatching after `terminal: true`** — parent loop must treat tripwire-rejected child failures as non-retryable (D-10); test it.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-agent budget enforcement | New budget checker | `runAgent`'s existing pre-iteration checks + `BudgetInvariant` | Wall-time/iteration/cost checks at runtime.ts:138-162 already enforced per loop |
| Cost accumulation | New aggregator | `createCostTracker` (one per agent + one crew) | D-08 locks it; `budgetStatus()` gives the 80% warning band free |
| Summary validation | Custom JSON checks | `validateSchemaOutput` (Standard Schema) | Same kernel as `runTool`; Zod-compatible per repo convention |
| Tool-call parsing/validation | New envelope parser | `parseToolUseEnvelope` + Phase 37 `validateToolCallRequests` | D-04; fence/prose tolerance already battle-tested |
| Receipt signing/canonical form | Any new signing path | `createReceipt` (redact→JCS→PAE→sign ordering is UNRETROFITTABLE) | 09-CONTEXT lock; one conditional-spread line adds the new field |
| Snapshot/resume for children | Crew-level persistence | `AgentHost.storage` + `SurvivabilityAdapter` per child | Phase 20 contract already round-trips `AgentSnapshot` (extend with ancestry chain) |
| Cache-hit accounting in `Usage` | Widening the `Usage` type | Read provider counters off `rawResponse` | `Usage` is a v1.1-locked 3-field shape; rawResponse is preserved by all adapters |
| Sleep/backoff in tests | Real-time waits | vitest fake timers (`advanceTimersByTimeAsync`) | Precedent in adapters/xai/anthropic tests; keeps suite fast and deterministic |

**Key insight:** every crew concern except the rate-limit bucket and the CID helper is a composition of already-verified primitives; the phase's risk concentrates in the dispatch-seam refactor and the two cross-cutting contracts (receipt chain, cache prefix), not in new algorithms.

## Common Pitfalls

### Pitfall 1: Anthropic cache verification against the current adapter is a false test
**What goes wrong:** Writing a test that asserts cache hits while the adapter still sends `system: ""` + single mutating user block — Anthropic block-granular caching can never hit; the test either fakes meaninglessly or fails mysteriously.
**Why it happens:** OpenAI's token-granular automatic caching makes "prefix in the task string" feel sufficient for both providers.
**How to avoid:** The Anthropic path REQUIRES the adapter change (cache_control-marked system block). Assert the request JSON shape in a mocked-fetch test; treat live cache-hit counters as the nightly/manual proof.
**Warning signs:** A plan task claiming "verify Anthropic cache hits" with no anthropic.ts edit in any task.

### Pitfall 2: Receipt chain ordering paradox
**What goes wrong:** Designing `child.parentReceiptCid → parent completion receipt` — that receipt doesn't exist until after children finish; the chain is unconstructible.
**How to avoid:** Chain to a receipt minted **before** the child runs (crew-root receipt at crew start; or dispatch-time receipts if richer lineage is wanted).
**Warning signs:** Any design where a CID must reference a receipt minted later in wall-clock time.

### Pitfall 3: Double-counting usage between child tracker and crew aggregator
**What goes wrong:** Recording the child's per-iteration `Usage` into the child tracker AND separately recording the child's cumulative `AgentResult.usage` into the crew aggregator → child usage counted twice; crew pool exhausts early; `crew-budget-exceeded` fires spuriously.
**How to avoid:** Feed the aggregator the **same per-iteration records** (D-08 wording: "fed the same per-iteration `Usage` records"), or only roll up child totals once at completion — pick one and assert `crewTotal === parentTotal + Σ childTotals` in a test.
**Warning signs:** Aggregator wired in both an AFTER_AGENT_ITERATION hook and at child completion.

### Pitfall 4: Budget pool derivation ignores `costUsd: null`
**What goes wrong:** Fake providers and unpriced adapters report `costUsd: null` ("unmeasured", distinct from 0 — provider.ts:56 contract). `min(childBudget, remainingPool)` arithmetic on null poisons to NaN or silently disables the cap.
**How to avoid:** Mirror the existing semantics: cost checks only apply when `costUsd !== null` (runtime.ts:149-152, cost-tracker.ts:51); iteration/wall-time caps always apply. Test the null-cost crew explicitly (the fake-provider regression will hit this on day one).
**Warning signs:** Arithmetic on `usage.costUsd` without a null guard.

### Pitfall 5: Synthetic child tool declarations break Phase 37 validation
**What goes wrong:** If `validateToolCalls` is enabled on an adapter, returned tool calls validate against a `ToolDefinition[]` registry; child names absent from that registry classify as `unknown_tool` and get dropped/thrown before the dispatcher ever sees them.
**How to avoid:** The synthetic child descriptors must be real `ToolDefinition`-shaped values included in whatever registry the adapter option sees (or documented as incompatible: crew + adapter-level `validateToolCalls` requires passing the synthesized declarations). Add a regression test for crew + `validateToolCalls` co-use.
**Warning signs:** Crew tests only run against adapters without the validation option.

### Pitfall 6: `exactOptionalPropertyTypes` breakage on new optional fields
**What goes wrong:** Assigning `parentReceiptCid: undefined` or `cacheSystemPrefix: undefined` literally fails typecheck or changes JCS bytes.
**How to avoid:** Conditional-spread everywhere (the receipt.ts:103 `modelClass` line is the copy-paste template). JCS canonicalization throws on `undefined` values (canonical.ts:54).

### Pitfall 7: AGENTS.md has three stale-policy surfaces, not one
**What goes wrong:** Flipping only the "Multi-Agent Crews — Out of Scope" section leaves line 127 ("What Not To Use" row: "parent-child loops, summary-return, cache-prefix sharing, rate-limit-group coordination remain Out of Scope") and the Rationale paragraph (line 157: "Multi-agent orchestration … explicitly not the product") contradicting the new policy.
**How to avoid:** Edit all three (see §Doc edits). Grep `AGENTS.md` for "Out of Scope" + "multi-agent" after editing.

### Pitfall 8: Snapshot/resume drift for `AgentSnapshot`
**What goes wrong:** D-05 requires the ancestry chain persisted in `AgentSnapshot` for resume, but `AgentSnapshot.version` is the locked literal `"agent-snapshot/v1"` (host.ts:48). Adding a required field breaks existing serialized snapshots.
**How to avoid:** Add the ancestry chain as an **optional** field (absent = root, backward-compatible), or bump to `agent-snapshot/v2` with a v1-accepting deserialize path. Decide explicitly; test resume of a v1 snapshot.

## Code Examples

### defineAgent mirroring defineTool
```typescript
// Source: packages/lattice/src/tools/tools.ts:29-36 (pattern), D-03 (shape)
export interface AgentSpec {
  readonly kind: "agent";
  readonly id: string;
  readonly intent: string;                       // task/persona for the child loop
  readonly tools: ReadonlyArray<ToolDefinition<StandardSchemaV1>>;
  readonly childAgents?: ReadonlyArray<AgentSpec>;
  readonly summaryReturnSchema: StandardSchemaV1; // validates { summary, artifacts, receipts }
}
export function defineAgent(definition: Omit<AgentSpec, "kind">): AgentSpec {
  return { kind: "agent", ...definition };
}
```

### runAgentCrew on the AI facade (lazy-import pattern)
```typescript
// Source: packages/lattice/src/runtime/create-ai.ts:152-158 (existing runAgent shape)
runAgentCrew(options: import("../agent/crew/run-crew.js").RunAgentCrewOptions) {
  return import("../agent/crew/run-crew.js").then((mod) => mod.runAgentCrew(options, config));
},
```

### parentReceiptCid on the receipt body (Phase 38 modelClass template)
```typescript
// Source: packages/lattice/src/receipts/receipt.ts:103 (conditional-spread precedent)
...(input.parentReceiptCid !== undefined ? { parentReceiptCid: input.parentReceiptCid } : {}),
```

### Receipt CID helper
```typescript
// Source pattern: storage/fingerprint.ts:14-19 + contract/checkpoint.ts:255 (atob decode)
export async function receiptCid(envelope: ReceiptEnvelope): Promise<string> {
  const bytes = Uint8Array.from(atob(envelope.payload), (c) => c.charCodeAt(0));
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}
```

### Anthropic cache_control emission (opt-in path)
```json
// Source: platform.claude.com prompt-caching docs (fetched 2026-06-10) — request body shape
{
  "model": "...",
  "system": [{ "type": "text", "text": "<byte-stable crew prefix>", "cache_control": { "type": "ephemeral" } }],
  "messages": [{ "role": "user", "content": "<conversation body>" }],
  "max_tokens": 2000
}
```
Cache-hit assertion fields: response `usage.cache_creation_input_tokens` (first call) then `usage.cache_read_input_tokens > 0` (subsequent calls); OpenAI: `usage.prompt_tokens_details.cached_tokens`. Both available via the preserved `rawResponse`.

### Fake-timer bucket test skeleton
```typescript
// Source pattern: packages/lattice/src/providers/adapters.test.ts:519-531
vi.useFakeTimers();
const group = createRateLimitGroup({ requestsPerMinute: 2, tokensPerMinute: 1000 });
await group.acquire({ inputTokens: 400 });
await group.acquire({ inputTokens: 400 });
const third = group.acquire({ inputTokens: 400 });   // must wait for drain
await vi.advanceTimersByTimeAsync(30_000);            // half-minute refill
await third;                                          // resolves after continuous drain
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| AGENTS.md: multi-agent fully Out of Scope | Single-agent first-class (v1.2 Phase 19); crews still out | 2026-05-31 | This phase performs the second, final policy flip |
| Anthropic caching: per-block `cache_control` only | Top-level automatic `cache_control` (auto breakpoint placement) also available | per current docs | Simplifies adapter change, but block-granularity still requires the prefix in its own system block |
| OpenAI caching: opt-in unknown | Automatic ≥1024 tokens; `prompt_cache_key`/`prompt_cache_retention` optional controls | GA since 2024, retention controls newer | Zero adapter work for the OpenAI path |
| Receipt schema v1.1 | v1.2 with optional `modelClass`; `createReceipt` always mints v1.2 | Phase 38 (2026-06-09) | `parentReceiptCid` lands on v1.2 with no bump |
| Single dispatch path (`runTool` only) | Phase 37 normalized `ProviderRunResponse.toolCalls` preferred over text parse (runtime.ts:245-251) | Phase 37 | CrewDispatcher must consume the same normalized `ToolUseRequest` shape from either source |

**Deprecated/outdated:** `ProviderRunResponse.usage` (`UsageRecord`) is deprecated in favor of `normalizedUsage` — the rate limiter and crew accounting must read `normalizedUsage` only. Anthropic doc URLs under `docs.anthropic.com` 301-redirect to `platform.claude.com` — quirks.ts CITED links still work but new citations should use the new host.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | An additive optional field on `ProviderRunRequest` does not violate the project's INV-03 reading (which textually covers `ProviderAdapter`) | Cache-prefix Pattern 3 | If maintainers read INV-03 to freeze request/response types too, fall back to an Anthropic-factory-level option carrying the prefix (clunkier; prefix fixed at adapter construction). Phase 37's `toolCalls` response addition suggests additive fields are accepted. [ASSUMED] |
| A2 | The chars/4 input-token estimate is acceptable for lease reservation given `release()` reconciliation | Rate-limit Pattern 4 | Persistent under/over-estimation skews short-window throughput; reconciliation bounds drift to one in-flight request (serial children make this benign) [ASSUMED] |
| A3 | The crew-root-receipt chain topology (flat chain at maxDepth 1) satisfies the roadmap's "receipts chain via parentReceiptCid" intent | Receipt Pattern 2 | If reviewers want dispatch-level lineage, add per-dispatch receipts — additive, no schema change [ASSUMED] |
| A4 | `examples/agent-crew` real-provider cache verification can be deferred to an env-keyed opt-in script / Phase 31 canary (PR CI stays fake-provider-only) | Cache-prefix Pattern 3 | If "verifiable" must mean CI-proven against live APIs, this conflicts with the repo's nightly-only real-provider posture — needs explicit user sign-off [ASSUMED] |
| A5 | Anthropic minimum-cacheable-token table fetched today (512-4096 by model) is current; exact per-model numbers may shift | Cache-prefix Pattern 3 | Example prefix sized ≥4096 tokens would be safe across all models; otherwise document model choice [CITED: platform.claude.com] |

All other factual claims in this document are [VERIFIED] by direct codebase reads at the cited file:line locations or [CITED] from official provider docs fetched this session.

## Open Questions (RESOLVED)

All five questions were resolved at plan time; the locking plan/task is cited inline per item.

1. **Where does the parent's `AgentIntent` come from in `runAgentCrew`?**
   - What we know: `AgentSpec` carries `{ id, intent, tools, childAgents, summaryReturnSchema }`; the existing loop consumes `AgentIntent { task, tools, host?, contract?, signer?, ... }`.
   - What's unclear: mapping of `spec.intent` (string) + crew-level signer/tracer/pipeline onto each member's `AgentIntent`; whether `RunAgentCrewOptions` carries `signer`/`tracer`/`pipeline` at crew level (recommended: yes, crew-level, threaded to every member).
   - Recommendation: planner defines `RunAgentCrewOptions = { root, hosts: { childHost }, policy, signer?, tracer?, providers? via createAI config }` and documents the mapping table in the plan.
   - RESOLVED (39-06 Task 1): `RunAgentCrewOptions = { root, hosts: { childHost }, policy, signer?, tracer? }` with signer/tracer threaded crew-level into every member's `AgentIntent`; parent task from `root.intent`, tools = `root.tools` + synthesized childToolDeclarations; providers come via `createAI` config as recommended.
2. **Does the root agent's own summary need `summaryReturnSchema` validation?**
   - What we know: criterion 2 validates child returns; root returns a normal `AgentResult` to the caller.
   - Recommendation: validate only children; the crew returns the parent's `AgentSuccess.output` untouched plus crew metadata (`CrewResult`).
   - RESOLVED (39-05 Task 1; confirmed in 39-06 Task 1): children only — `validateSchemaOutput` runs on child summary envelopes; the parent's `AgentSuccess.output` is returned untouched in `CrewResult` (not schema-validated).
3. **Reject vs clamp for `maxConcurrentChildren > 1`** — D-11 permits either. Recommendation: reject (typed error) for explicitness; cheap to flip later.
   - RESOLVED (39-03 Task 2): reject — `validateCrewPolicy({ maxConcurrentChildren: 2 })` throws a `TypeError` naming the field and stating the serial-only v1.3 limit (D-11).
4. **`AgentSnapshot` ancestry-chain versioning** (Pitfall 8) — optional field vs v2 literal. Recommendation: optional field, absent = root.
   - RESOLVED (39-03 Task 2): optional field — `ancestry?: readonly string[]` on `AgentSnapshot`, absent = root; the `agent-snapshot/v1` version literal is unchanged (backward compat asserted in tests).
5. **Rate-limit refund policy on provider failure** — refund the full token estimate on throw, or burn it? Provider may have consumed quota despite the error. Recommendation: refund request-count? No — keep both reserved (conservative, matches a real 429-adjacent failure) and document; planner may choose either with a test.
   - RESOLVED (39-02 Task 2): burn — on provider throw, `lease.release({ promptTokens: estimate })` keeps the reservation consumed (no refund; the provider may have consumed quota), locked with a dedicated failure-path test asserting a subsequent acquire reflects the burned estimate.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | runtime/tests | ✓ (engines >=24) | 24.x per repo engines | — |
| pnpm | workspace | ✓ | 10.33.1 (packageManager pin) | — |
| vitest/tsd/publint/attw/changesets | gates | ✓ | workspace devDeps (4.1.5 / 0.33.0 / 0.3.18 / 0.18.2 / 2.31.0) | — |
| Anthropic/OpenAI API keys | live cache-hit proof only | ✗ (not in repo; by policy never PR-time) | — | Mocked-fetch shape tests + env-keyed opt-in script / Phase 31 canary |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** real provider keys (fallback documented above; this is the A4 assumption).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 (+ tsd 0.33.0 for type-level) |
| Config file | none needed (vitest defaults; tests colocated as `src/**/*.test.ts`; type tests in `test-d/`) |
| Quick run command | `pnpm --filter @full-self-browsing/lattice test -- <file>` (e.g. `vitest run src/agent/crew/run-crew.test.ts`) |
| Full suite command | `pnpm test && pnpm typecheck && pnpm test:types && pnpm -r lint:packages` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DELEG-01 | `defineAgent` shape + tree composition + public types | unit + tsd | `vitest run src/agent/crew/agent-spec.test.ts`; `tsd` via `pnpm test:types` | ❌ Wave 0 |
| DELEG-02 | `runAgentCrew` facade, policy validation, budget pool min(), aggregator no-double-count | unit | `vitest run src/agent/crew/run-crew.test.ts src/agent/crew/crew-policy.test.ts` | ❌ Wave 0 |
| DELEG-03 | dispatch branch, summary re-entry turn, D-09/D-10 failure routing, cycle rejection, `crew-budget-exceeded` | unit + integration (fake provider) | `vitest run src/agent/crew/dispatcher.test.ts src/agent/crew/crew-integration.test.ts` | ❌ Wave 0 |
| DELEG-04 | Anthropic request carries cache_control system block; prefix byte-equality across 3 dispatches; cache counters readable from rawResponse fixtures | unit (mocked fetch) | `vitest run src/providers/anthropic.test.ts src/agent/crew/cache-prefix.test.ts` | anthropic.test.ts ✅ (extend); cache-prefix ❌ Wave 0 |
| DELEG-05 | dual-dimension drain, lease reconcile, defaults, unmanaged escape, transport wrap | unit (fake timers) | `vitest run src/agent/infra/rate-limit-group.test.ts` | ❌ Wave 0 |
| DELEG-06 | parentReceiptCid mint/verify, CID helper, CRYPTO-01 non-regression matrix, JCS byte stability | unit | `vitest run src/receipts/receipt.test.ts src/receipts/verify.test.ts src/receipts/cid.test.ts` | receipt/verify ✅ (extend); cid ❌ Wave 0 |
| DELEG-07 | showcase runs end-to-end, every receipt verifies, evalAgentRun gate green | integration + example smoke | `vitest run src/agent/crew/crew-eval.test.ts`; `pnpm --filter @full-self-browsing/lattice build && node examples/agent-crew/index.mjs` | ❌ Wave 0 |
| DELEG-08 | exports present + gates green; doc text flipped | type/package + manual-only (doc text) | `pnpm test:types && pnpm -r lint:packages`; doc diff review is manual (justification: prose assertions) | test-d files ✅ (extend index.test-d.ts); new crew test-d ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** targeted `vitest run <touched test files>` + `pnpm --filter @full-self-browsing/lattice typecheck`
- **Per wave merge:** `pnpm test` (full vitest, both packages) + `pnpm test:types`
- **Phase gate:** `pnpm test && pnpm typecheck && pnpm test:types && pnpm -r lint:packages` all green + `node examples/agent-crew/index.mjs` exit 0 before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/agent/crew/agent-spec.test.ts` — DELEG-01
- [ ] `src/agent/crew/crew-policy.test.ts` + `run-crew.test.ts` — DELEG-02
- [ ] `src/agent/crew/dispatcher.test.ts` + `crew-integration.test.ts` (scripted fake provider) — DELEG-03
- [ ] `src/agent/crew/cache-prefix.test.ts` — DELEG-04
- [ ] `src/agent/infra/rate-limit-group.test.ts` — DELEG-05
- [ ] `src/receipts/cid.test.ts` — DELEG-06
- [ ] `src/agent/crew/crew-eval.test.ts` + `examples/agent-crew/{package.json,setup.mjs,index.mjs}` — DELEG-07
- [ ] `test-d/agent-crew.test-d.ts` (+ extend `index.test-d.ts`, `receipt-v12.test-d.ts`) — DELEG-08
- Framework install: none — vitest/tsd already wired.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (SDK; provider keys are consumer-supplied) | apiKey stays closure-private (existing pattern); never log it — error messages use `err.message` only (T-34-02-01 pattern, anthropic.ts:149) |
| V3 Session Management | no | — |
| V4 Access Control | yes (tool/child permissioning) | existing `createPermissionContext` guard hook composes per child unchanged; SAFETY-band deny survives crew boundary |
| V5 Input Validation | yes | Standard Schema validation for child task args and `summaryReturnSchema` returns; Phase 37 tool-call validation reused (D-04) |
| V6 Cryptography | yes | `crypto.subtle` Ed25519 + SHA-256 only (existing receipts module); never hand-roll; CID = sha256 of signed canonical bytes |

### Known Threat Patterns for this phase

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Receipt downgrade (forged v1/v1.1 body carrying new field) | Tampering | CRYPTO-01 gate already short-circuits pre-crypto (verify.ts:118-131); extend the forged-downgrade test matrix with `parentReceiptCid` |
| Chain forgery (claiming a false parent) | Tampering/Repudiation | `parentReceiptCid` is inside the signed body; verifiers can resolve the CID and check the referenced envelope's payload hash matches |
| Child prompt injection steering the parent | Elevation of privilege | Only the schema-validated summary envelope re-enters the parent; structured failure objects (not raw model text) for errors; permission/SAFETY hooks run per child |
| API-key leakage via new error paths | Information disclosure | Rate-limit and dispatcher errors must never serialize request headers/options; follow the `stringifyErr` message-only rule |
| Quota exhaustion / runaway crew spend | DoS | Crew `BudgetInvariant` + `maxTotalIterations` + `crew-budget-exceeded` terminal kind; rate-limit group caps RPM/TPM; conservative Tier-1 defaults |
| User content in receipt identifier fields | Information disclosure | `parentReceiptCid` is a hash (stable identifier); do not add free-form crew names to receipt bodies without redaction review (step-marker field rule, checkpoint.ts:33-37) |

## Doc Edits (exact current text → proposed replacement)

### AGENTS.md (three surfaces)

1. **Line 127** ("What Not To Use" → OpenAI Agents SDK row) currently ends: *"Lattice does not embed a multi-agent crew framework (parent-child loops, summary-return, cache-prefix sharing, rate-limit-group coordination remain Out of Scope; see Agent Execution Policy below)."* → Replace the parenthetical with: *"Lattice ships its own opt-in multi-agent crew surface (`defineAgent` + `runAgentCrew`) on top of the same primitives; see Agent Execution Policy below."*
2. **Lines 136-137** (policy header) currently: *"**Policy flip in v1.2 (2026-05-31, Phase 19).** Lattice's prior v1.x stance — 'multi-agent: Out of Scope' — has been narrowed. Single-agent execution is now first-class; multi-agent crews remain Out of Scope."* → Append a second flip note: *"**Policy flip in v1.3 (Phase 39).** Multi-agent crews are now first-class via the opt-in `AgentHost` capability: `runAgentCrew({ root, hosts: { childHost }, policy })` with `defineAgent` specs. Single-agent `ai.runAgent` remains the zero-config default."*
3. **Lines 151-153** (section "### Multi-Agent Crews — Out of Scope" + body) → Retitle "### Multi-Agent Crews — First-class via opt-in `AgentHost` capability (v1.3+)" and replace the body with the crew description: parent-child loops with structured summary-return (`{ summary, artifacts, receipts }` per `summaryReturnSchema`), serial children (v1.3), crew-level `BudgetInvariant` + structural caps, shared rate-limit group per provider key via the `AgentTransport` seam, per-agent receipts chained via `parentReceiptCid`, cache-prefix sharing on Anthropic (`cache_control`) + OpenAI (automatic). Note explicitly: opt-in only — no behavior change for `ai.runAgent` consumers.
4. **Line 157** (Rationale) currently ends: *"Multi-agent orchestration introduces parent-child state-management complexity that would dominate the public API and pull the design toward a 'crew framework' surface, which is explicitly not the product."* → Replace final sentence with a v1.3 update: the crew surface ships as a thin composition over the same primitives (CrewDispatcher + existing loop), kept opt-in so the public model stays capability-first rather than graph/crew-first.

### docs/fsb-integration-gaps.md

1. **Row 60** (line 60) currently: `| Delegation | Task-delegation primitive (parent-child loops + summary-return + cache-prefix sharing + rate-limit-group coordination) | Out of scope | Blocker | Lattice currently excludes multi-agent. Requires Lattice-policy negotiation per FSB STATE.md R3 mitigation. ... |` → flip to `| Covered | n/a |` with Notes: *"v1.3 Phase 39 opens the multi-agent surface: `defineAgent` + `runAgentCrew` (parent-child loops, schema-validated summary-return), `createRateLimitGroup` (shared per-provider-key RPM+TPM bucket via the AgentTransport seam), cache-prefix sharing (Anthropic cache_control system block; OpenAI automatic prefix caching), per-agent receipts chained via `parentReceiptCid` on the v1.2 body. Lattice commits `<phase-39-commits>`."* (Also update the §Delegation surface-inventory paragraph at line 55, which restates the old AGENTS.md stance.)
2. **Row 83** (line 83) currently: `| Observability | recovery / eviction-resume markers in the tracing union | Needs addition | Important | Paired with the MV3-survivability adapter. |` → flip to `| Covered | n/a |` with Notes: *"Retroactively covered in v1.2 Phase 20 — `recovery.start` / `recovery.complete` / `recovery.failed` added to `RunEventKind` (tracing.ts) alongside the AgentHost storage seam, closing TRACE-EXT-01. Lattice commit `3794896` (backlink missed at the time; recorded by v1.3 Phase 39). Paired survivability surface: commits `a4609bc` / `109d6ae` (rows 70/72)."* [VERIFIED: `git log -S 'recovery.start'` → commit `3794896` "feat(20-01..02): AgentHost adapter + runAgent host integration + recovery markers (HOST-01..03, TRACE-EXT-01)"]

## Sources

### Primary (HIGH confidence)
- Direct codebase reads (all file:line cites verified this session): `agent/runtime.ts`, `agent/types.ts`, `agent/host.ts`, `agent/format-tools.ts`, `agent/eval.ts`, `agent/infra/{cost-tracker,action-history,goal-progress}.ts`, `tools/tools.ts`, `contract/{contract,checkpoint}.ts`, `receipts/{types,receipt,verify,canonical,redact}.ts`, `providers/{provider,anthropic,adapters,quirks,fake}.ts`, `runtime/create-ai.ts`, `results/errors.ts`, `prompts/scaffolds.ts`, `storage/fingerprint.ts`, `index.ts`, `examples/agent-loop/*`, `AGENTS.md`, `docs/fsb-integration-gaps.md`, package.jsons, `.changeset/`, `test-d/`
- Anthropic prompt caching: https://platform.claude.com/docs/en/docs/build-with-claude/prompt-caching (fetched 2026-06-10) — cache_control mechanics, per-model minimums, TTL, usage fields, byte-identity requirements
- Anthropic rate limits: https://platform.claude.com/docs/en/api/rate-limits (fetched 2026-06-10) — Tier 1 = 50 RPM / 30k ITPM (Sonnet 4.x); token-bucket continuous replenishment; cache-aware ITPM (cache reads don't count for most models); 429 + retry-after + anthropic-ratelimit-* headers
- OpenAI prompt caching: https://developers.openai.com/api/docs/guides/prompt-caching (fetched 2026-06-10) — automatic, ≥1024 tokens, exact token-prefix matching, `usage.prompt_tokens_details.cached_tokens`, 5-10min TTL
- Git history: commit `3794896` (Phase 20 recovery markers) via `git log -S`

### Secondary (MEDIUM confidence)
- `.planning/phases/38-receipt-v1-2-schema-modelclass-tag/38-CONTEXT.md` (parentReceiptCid deferral on v1.2), `.planning/ROADMAP.md` §Phase 39 + Risks, `.planning/REQUIREMENTS.md` (DELEG planned-not-authored)

### Tertiary (LOW confidence)
- None — no unverified WebSearch claims included.

## Metadata

**Confidence breakdown:**
- Dispatch seam / loop reuse: HIGH — read the loop line-by-line; the seam is a mechanical extraction
- Receipt chaining: HIGH on schema/verify safety (Phase 38 precedent in code); MEDIUM on chain topology (discretion area, A3)
- Cache-prefix: HIGH on provider mechanics (official docs, current); MEDIUM on the ProviderRunRequest-field mechanism choice (A1)
- Rate-limit group: HIGH — defaults verified against current Anthropic Tier 1 table; bucket design matches provider's own documented algorithm
- Pitfalls: HIGH — each grounded in a specific code location or verified provider behavior

**Research date:** 2026-06-10
**Valid until:** ~2026-07-10 for codebase findings (stable, single branch); provider cache/rate-limit numbers ~30 days (Anthropic tier tables and model minimums shift with model releases — re-fetch before sizing the example prefix)
