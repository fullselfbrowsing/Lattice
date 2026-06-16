# Phase 41: Gateway Delegation - LiteLLM + Gateway Policy - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-06-15
**Phase:** 41-gateway-delegation-litellm-gateway-policy
**Areas discussed:** LiteLLM helper shape, Gateway policy passthrough, Route accounting, Gateway fallback defaults

---

## LiteLLM Helper Shape

Interactive selection UI was unavailable in the current mode. The defaults were presented in chat, and the user replied `defaults`.

| Option | Description | Selected |
|--------|-------------|----------|
| Thin wrapper | Delegate to `createOpenAICompatibleProvider` with LiteLLM defaults and no new transport behavior. | yes |
| Gateway adapter | Add LiteLLM-specific request-body behavior and gateway semantics inside a thicker provider adapter now. | |
| Planner decides | Let the planner choose the conservative shape during planning. | |

**User's choice:** Thin wrapper default.
**Notes:** This matches v1.4 research and the established LM Studio/OpenRouter/xAI wrapper pattern.

---

## Gateway Policy Passthrough

Interactive selection UI was unavailable in the current mode. The defaults were presented in chat, and the user replied `defaults`.

| Option | Description | Selected |
|--------|-------------|----------|
| Typed object | Add an explicit additive gateway policy/hints object while keeping existing policy fields intact. | yes |
| Raw bag | Pass arbitrary metadata through with minimal typing. | |
| Planner decides | Let the planner choose the least risky typed surface. | |

**User's choice:** Typed object default.
**Notes:** The object should support route tags, provider preferences, and gateway metadata without changing Lattice route scoring.

---

## Route Accounting

Interactive selection UI was unavailable in the current mode. The defaults were presented in chat, and the user replied `defaults`.

| Option | Description | Selected |
|--------|-------------|----------|
| Split fields | Show Lattice-selected provider/model separately from gateway hints or observed gateway model metadata. | yes |
| Gateway route | Treat the gateway-selected model as the Lattice route when known. | |
| Planner decides | Let planning choose the representation that preserves deterministic routing best. | |

**User's choice:** Split fields default.
**Notes:** This preserves replayability and keeps `ExecutionPlan.route.selected` deterministic.

---

## Gateway Fallback Defaults

Interactive selection UI was unavailable in the current mode. The defaults were presented in chat, and the user replied `defaults`.

| Option | Description | Selected |
|--------|-------------|----------|
| Fallback off by default | Do not enable silent gateway fallback by default; expose fallback/load-balancing only as explicit gateway hints. | yes |
| Gateway decides | Let LiteLLM/OpenAI-compatible gateway fallback behavior stand without Lattice-level defaults or accounting. | |
| Planner decides | Let planning choose the safest fallback default. | |

**User's choice:** Fallback off by default.
**Notes:** This follows the v1.4 research warning that silent gateway fallback can make replay and receipts attest to a route that did not actually run.

---

## the agent's Discretion

- Exact names for the typed gateway policy/hints object.
- Whether LiteLLM gets a dedicated `LiteLLMQuirks` subtype or reuses `OpenAICompatQuirks`.
- Exact plan/event metadata field names, as long as Lattice-selected route and gateway metadata remain separate.
- Whether gateway hints are available through provider options, run policy, or both.

## Deferred Ideas

- OpenRouter multi-model fallback arrays and terminal receipt resolved-model semantics: Phase 42.
- Streaming gateway behavior: Phases 43 and 44.
- FSB-via-npm dogfood of the full v1.4 gateway surface: Phase 49.
