# Phase 39: Multi-Agent Delegation Surface (full Row 60 close + Row 83 update) - Context

**Gathered:** 2026-06-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 39 opens Lattice's multi-agent surface as a first-class **opt-in**
capability. Single-agent `ai.runAgent` remains the zero-config default;
multi-agent behavior activates only when the consumer calls the new crew API.

In scope:
- `defineAgent(spec): AgentSpec` as a sibling of `defineTool`, carrying
  `{ id, intent, tools, childAgents, summaryReturnSchema }`.
- `runAgentCrew({ root: AgentSpec, hosts: { childHost: AgentHost }, policy: CrewPolicy })`
  exposed from the runtime returned by `createAI`.
- Parent-child delegation loops with structured summary-return: child completes
  → returns `{ summary, artifacts, receipts }` matching `summaryReturnSchema`;
  parent receives it as a tool result and continues.
- Prompt-cache-prefix sharing across crew members, verifiable on Anthropic +
  OpenAI providers.
- Rate-limit-group coordination: typed token bucket shared per provider key
  across the crew.
- Per-agent receipt minting with new `parentReceiptCid?: string` chain-link
  field on `CapabilityReceiptBody`.
- `examples/agent-crew/` showcase (parent-summarizer + 3 child-researchers,
  real Ed25519 signing of every per-agent receipt) + `evalAgentRun`-style
  regression test against a fake provider.
- `AGENTS.md` Multi-Agent Policy flip: "Out of Scope" → "First-class via
  opt-in `AgentHost` capability".
- `docs/fsb-integration-gaps.md` Row 60 → "Covered"; Row 83 → "Covered" with
  v1.2 Phase 20 backlink (the backlink was missed at the time).
- Author `DELEG-01` through `DELEG-08` in `.planning/REQUIREMENTS.md` during
  planning/execution (the 8 remaining planned v1.3 REQ-IDs).

Out of scope:
- Hosted or platform-managed crew orchestration (control planes, queueing
  services, billing, fleet management) — embeddable opt-in API only.
- Provider-native tool use (deferred to v1.4).
- Cross-process rate-limit coordination (in-process only; design a seam).
- Conversation handoff/control-transfer patterns.

</domain>

<decisions>
## Implementation Decisions

### Crew API & Child Dispatch

- **D-01:** Hybrid dispatch model: the parent's **model** sees each child agent
  as a named tool (per-child tool declarations derived from the child's `id`,
  a task-string input schema, and `summaryReturnSchema` as the result shape),
  but the **runtime** branches on a `kind: "agent"` discriminant and routes
  dispatch through a CrewDispatcher chokepoint instead of `runTool`.
- **D-02:** All crew concerns — CrewPolicy enforcement, `hosts.childHost`
  wiring, rate-limit-group coordination, cache-prefix sharing, and child
  receipt minting — live at the CrewDispatcher seam. No policy logic smuggled
  into tool closures.
- **D-03:** `defineAgent(spec)` returns
  `AgentSpec { kind: "agent", id, intent, tools, childAgents?, summaryReturnSchema }`
  as a literal sibling of `defineTool`'s shape, with
  `childAgents: ReadonlyArray<AgentSpec>` composing by value as a tree.
- **D-04:** Child summaries reuse the existing prompt-reencoded tool-use
  protocol and Phase 37 tool-call validation — no new model-facing protocol.
- **D-05:** Nesting: `CrewPolicy.maxDepth` defaults to `1` (parent→child only).
  Recursion is capped, not forbidden — grandchildren are a policy opt-in later
  without a breaking change. Cycle prevention via an ancestry chain of spec
  `id`s threaded through dispatch context (and persisted in `AgentSnapshot`
  for resume); any dispatch whose target `id` already appears in the chain is
  rejected.

### CrewPolicy & Budget Composition

- **D-06:** Hierarchical budgets: `CrewPolicy` carries a crew-level
  `BudgetInvariant` (reused verbatim from `contract/contract.ts`) plus
  structural caps — `maxTotalIterations`, `maxIterationsPerAgent`,
  `maxConcurrentChildren`, `maxDepth`.
- **D-07:** Each child's effective budget =
  `min(spec.contract.budget, remaining crew pool)`. Per-agent sub-budgets are
  optional; a crew with only `policy.budget` set behaves like a simple shared
  pool.
- **D-08:** Crew cost accounting reuses `createCostTracker` as-is: one tracker
  per agent plus one crew-level aggregator instance fed the same per-iteration
  `Usage` records. Guard against double-counting between child tracker and
  crew aggregator in tests.
- **D-09:** Classified failure routing: recoverable child failures
  (`agent-max-iterations`, stuck via `STUCK_REASONS`, `summaryReturnSchema`
  validation failure) return to the parent as a **structured tool-result
  error** carrying `{ kind, reason, terminal }` so the parent's loop can react.
- **D-10:** Terminal semantics preserved across the parent/child boundary:
  tripwire violations and crew-ceiling breach propagate `terminal: true`
  (consistent with `isTerminal()` in `results/errors.ts`) — the parent must
  not re-delegate a task a tripwire already rejected; crew-pool exhaustion
  ends the run. Add a crew-level failure kind (e.g. `crew-budget-exceeded`)
  to `AgentFailureKind`.
- **D-11:** **Serial children only in v1.3.** `maxConcurrentChildren` is fixed
  at 1 (concurrent execution deferred). This removes atomic pool-reservation
  and contended-bucket correctness work from this phase. The type may carry
  the cap field for forward compatibility, but the runtime rejects or clamps
  values > 1.

### Rate-Limit-Group Coordination

- **D-12:** Ship a standalone public primitive (`createRateLimitGroup()` or
  similar) following the `CostTracker` precedent: standalone pure infra under
  `agent/infra/`, no dependency on the agent runtime, exported from the
  package root so consumers can use it with plain `runAgent` outside crews.
- **D-13:** Injection via the existing `AgentTransport` seam — the limiter
  wraps `transport.call()` / `provider.execute()`. `ProviderAdapter` is NOT
  modified (preserves the INV-03 7-provider parity invariant).
  `runAgentCrew` constructs one shared group per provider key and wraps each
  crew member's transport with it, structurally guaranteeing parent and
  children share one bucket.
- **D-14:** Dual-dimension bucket: **both** requests/min and tokens/min per
  provider key (Anthropic/OpenAI enforce RPM and TPM independently; 429 fires
  on whichever trips first). Lease-based async interface:
  `acquire(estimate)` reserves on estimated input tokens, `release(actualUsage)`
  reconciles with the actual `Usage` every adapter already returns.
- **D-15:** Conservative default ≈ Anthropic Tier 1 (~50 requests/min,
  ~30k input tokens/min per provider key), drained continuously (per-second
  smoothing) rather than minute-windows.
- **D-16:** Override path is explicit config, not a magic constant: per-key
  `limits: { requestsPerMinute, tokensPerMinute }` block in `CrewPolicy`,
  plus a `coordination: "unmanaged"` escape hatch for consumers who handle
  429s themselves.
- **D-17:** In-process implementation only for v1.3, but the lease-based
  interface is the seam for a future cross-process implementation (the same
  contract could be satisfied by Redis/Durable Object later). No new runtime
  dependencies (rejected `bottleneck` — request-oriented, unmaintained, and
  Lattice is zero-runtime-dep).
- **D-18:** Zero new runtime dependencies for the whole phase.

### Claude's Discretion

The user did not select these areas for discussion — researcher/planner decide,
anchored to the roadmap success criteria:

- **Receipt chaining (`parentReceiptCid`):** exact CID derivation, whether the
  field lands as an additive optional on the existing v1.2 body (no new schema
  version expected — Phase 38 noted `parentReceiptCid` ships in Phase 39 on
  v1.2), root-agent behavior (field absent), interaction with checkpoint
  receipts. Must not regress Phase 38's CRYPTO-01 downgrade defense or v1.1
  verification compatibility.
- **Cache-prefix sharing mechanism:** how the shared system-prompt prefix is
  composed across child invocations (consider Phase 35 scaffolds' byte-stable
  version-pinned fragments), and how "verifiable on Anthropic + OpenAI"
  is demonstrated (cache-hit metrics in usage responses).
- Exact public naming (`runAgentCrew` option fields, `CrewPolicy` member
  names, rate-limit primitive name), file layout under
  `packages/lattice/src/agent/`, and DELEG-01..08 requirement wording.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition & requirements
- `.planning/ROADMAP.md` §Phase 39 — goal, 3 success criteria, DELEG-01..08 mapping, risk notes (policy flip is a public-contract change; bucket sizing risk).
- `.planning/REQUIREMENTS.md` — DELEG REQ-IDs must be authored here during this phase (8 planned, 0 authored).

### Policy & gap-tracking docs this phase mutates
- `AGENTS.md` §Multi-Agent Crews (around lines 137-153) — current "Out of Scope" policy text that flips to "First-class via opt-in `AgentHost` capability".
- `docs/fsb-integration-gaps.md` Row 60 (Delegation blocker → "Covered") and Row 83 (recovery markers → "Covered" with v1.2 Phase 20 backlink; the row sits near Row 70/72 survivability entries that document the v1.2 commits `a4609bc`/`109d6ae` to backlink against).

### Prior phase context (constraints carried forward)
- `.planning/phases/38-receipt-v1-2-schema-modelclass-tag/38-CONTEXT.md` — receipt v1.2 minting policy (D-01..D-05); explicitly deferred `parentReceiptCid` to Phase 39; CRYPTO-01 downgrade defense must be preserved.
- `.planning/phases/37-tool-call-validation-layer-opt-in/37-CONTEXT.md` — normalized `ProviderRunResponse.toolCalls`, validation envelope rules the crew dispatch path reuses.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/lattice/src/agent/runtime.ts` — single-agent loop with the
  tool-dispatch seam (handlers looked up by name) where the `kind: "agent"`
  branch lands; pre-iteration budget checks the crew pool derivation reuses.
- `packages/lattice/src/agent/host.ts` — `AgentHost` (scheduler/transport/
  storage seams), `createNoopAgentHost`, `AgentSnapshot` (carries the ancestry
  chain for resume). `AgentTransport` is the rate-limiter injection point.
- `packages/lattice/src/agent/infra/cost-tracker.ts` — standalone
  `contract.budget`-aware accumulator; instantiate per-agent + once as crew
  aggregator.
- `packages/lattice/src/agent/infra/` — goal-progress (stuck detection),
  action-history (`STUCK_REASONS`), permission-context, transcript-store: all
  compose per-child unchanged.
- `packages/lattice/src/tools/tools.ts:29` — `defineTool` shape that
  `defineAgent` mirrors with a `kind` discriminant.
- `packages/lattice/src/contract/contract.ts` — `BudgetInvariant` reused
  verbatim as `CrewPolicy.budget`.
- `packages/lattice/src/agent/types.ts` — `AgentFailureKind` taxonomy to
  extend with crew-level kind(s); `AgentIntent`/`AgentResult` shapes children
  reuse.
- `packages/lattice/src/receipts/` — receipt v1.2 body (Phase 38) gains
  optional `parentReceiptCid`.
- `packages/lattice/src/agent/eval.ts` — `evalAgentRun` kernel the crew
  regression gate extends.
- `packages/lattice/src/providers/anthropic.ts` + `providers/quirks.ts` —
  existing cache-control/prompt-cache touchpoints for cache-prefix sharing.
- `examples/agent-loop/` — showcase pattern `examples/agent-crew/` follows
  (real Ed25519 signing, receipts to `.lattice/receipts/`).

### Established Patterns
- Opt-in, adapter-local/explicit-call options — no global `createAI({...})`
  toggles (Phases 36/37). The crew surface is opt-in via `runAgentCrew`.
- INV-03 7-provider parity: `ProviderAdapter` interface untouched; new
  behavior composes via transport/hook seams.
- Zero runtime dependencies in `packages/lattice`.
- Terminal semantics (`isTerminal()`): tripwire violations never retried —
  must survive the parent/child boundary.
- Standard Schema validation everywhere (`summaryReturnSchema` follows
  `defineTool`'s schema handling, Zod-compatible).
- Plan files follow `39-NN-PLAN.md`; REQ-IDs authored in
  `.planning/REQUIREMENTS.md` before milestone audit.

### Integration Points
- `packages/lattice/src/runtime/create-ai.ts:116-157` — `runAgent` lazy-import
  pattern; `runAgentCrew` lands beside it with the same lazy `import()` shape.
- `packages/lattice/src/index.ts` — package-root exports for `defineAgent`,
  crew types, and the rate-limit primitive (public surface index is
  release-audited; publint/attw/tsd gates apply).
- Receipt minting path — per-agent receipts chain via `parentReceiptCid`;
  every per-agent receipt signed in the showcase.
- Phase 29 (stable v1.3.0 publish) depends on this phase — the public surface
  added here ships in the first stable release, so naming is a one-shot
  decision.

</code_context>

<specifics>
## Specific Ideas

- Showcase: parent-summarizer + 3 child-researchers crew (`examples/agent-crew/`)
  with real Ed25519 signing of every per-agent receipt — children run serially
  per D-11.
- "I know what I'm doing" override must be a visible config value
  (`coordination: "unmanaged"`), not a magic constant — directly answers the
  roadmap's bucket-sizing risk note.

</specifics>

<deferred>
## Deferred Ideas

- **Concurrent child execution** (`maxConcurrentChildren > 1`) — deferred from
  v1.3 by D-11. Requires atomic crew-pool reservations in the cost aggregator
  and a properly contended token bucket. Candidate for v1.4.
- **Cross-process rate-limit coordination** (Redis/Durable Object behind the
  lease-based interface) — seam designed in v1.3, implementation deferred.
- Hosted crew orchestration — permanently out of scope per REQUIREMENTS.md.

</deferred>

---

*Phase: 39-multi-agent-delegation-surface-full-row-60-close-row-83-upda*
*Context gathered: 2026-06-10*
