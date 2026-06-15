# Phase 39: Multi-Agent Delegation Surface (full Row 60 close + Row 83 update) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-10
**Phase:** 39-multi-agent-delegation-surface-full-row-60-close-row-83-upda
**Areas discussed:** Crew API & child dispatch, CrewPolicy & budget composition, Rate-limit token bucket
**Mode:** Advisor (research-backed comparison tables; calibration tier: standard, vendor philosophy: pragmatic)

---

## Crew API & Child Dispatch

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid: child-as-tool + crew dispatcher | Model sees each child as a named tool; runtime branches on `kind: "agent"` and routes through a CrewDispatcher chokepoint for policy/receipts/rate-limits (advisor recommendation) | ✓ |
| Pure agents-as-tools (defineTool wrap) | Child compiled into an ordinary ToolDefinition whose execute runs the child loop; no chokepoint for crew concerns | |
| Generic dispatch_agent primitive | Single built-in tool, Claude Code Task-style `{ agent, task }`; loses per-child schemas | |
| Handoff/control-transfer | Parent yields conversation to child; contradicts summary-return contract | |

**User's choice:** Hybrid: child-as-tool + crew dispatcher (recommended)
**Notes:** Includes `CrewPolicy.maxDepth` default 1, ancestry-chain cycle prevention, `defineAgent` mirroring `defineTool` with `kind` discriminant.

---

## CrewPolicy & Budget Composition

| Option | Description | Selected |
|--------|-------------|----------|
| Hierarchical ceiling + sub-budgets | Crew-level BudgetInvariant + caps; child budget = min(spec budget, remaining pool); classified failure routing (recoverable → tool-result error, tripwire/ceiling → terminal) (advisor recommendation) | ✓ |
| Crew-global shared pool, fail-fast | One pool, any child failure terminates crew; parent can never react | |
| Per-agent budgets only | No crew ceiling; aggregate spend unbounded — eval gate unenforceable | |

**User's choice:** Hierarchical ceiling + sub-budgets (recommended)
**Notes:** Follow-up on child concurrency: **Serial only in v1.3** — `maxConcurrentChildren` fixed at 1; atomic pool reservations and contended-bucket work deferred (candidate for v1.4).

---

## Rate-Limit Token Bucket

| Option | Description | Selected |
|--------|-------------|----------|
| Standalone primitive via transport seam | Public `createRateLimitGroup()` following CostTracker precedent; dual RPM+TPM bucket per provider key; wraps AgentTransport, ProviderAdapter untouched (INV-03); lease-based acquire/release; Anthropic Tier-1-ish conservative default + explicit override + `coordination: "unmanaged"` escape hatch (advisor recommendation) | ✓ |
| Crew-internal coordinator | Private object inside runAgentCrew, never exported; out-of-crew runAgent can't join the group | |
| Fourth AgentHost seam (rateLimiter) | Per-agent host seam for shared crew state — wrong granularity, invites separate-bucket races | |
| Adopt bottleneck dependency | Request-oriented, not token-aware, unmaintained; Lattice is zero-runtime-dep | |

**User's choice:** Standalone primitive via transport seam (recommended)
**Notes:** In-process only for v1.3; lease interface is the seam for cross-process later.

---

## Claude's Discretion

- Receipt chaining (`parentReceiptCid`) mechanics — CID derivation, additive optional on v1.2 body, root-agent behavior, checkpoint-receipt interaction (area offered but not selected for discussion).
- Cache-prefix sharing mechanism and how Anthropic/OpenAI cache hits are verified (area offered but not selected).
- Exact public naming, file layout, and DELEG-01..08 wording.

## Deferred Ideas

- Concurrent child execution (`maxConcurrentChildren > 1`) — deferred to a future milestone by the serial-only decision.
- Cross-process rate-limit coordination behind the lease-based interface.
