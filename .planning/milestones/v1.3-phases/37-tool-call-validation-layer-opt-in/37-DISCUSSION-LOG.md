# Phase 37: Tool-Call Validation Layer (opt-in) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-06-09
**Phase:** 37-tool-call-validation-layer-opt-in
**Areas discussed:** Normalized return shape, failure handling, schema strictness, agent/runtime composition

---

## Gray Area Selection

The workflow attempted to use the interactive `request_user_input` picker, but it
was unavailable in Default mode. Per the GSD skill adapter fallback, the
recommended default path was selected: discuss all key decisions and use the
safe/default choices grounded in the current codebase.

| Option | Description | Selected |
|--------|-------------|----------|
| All key decisions | Clarify return shape, failure handling, schema strictness, and composition with the existing agent tool loop. | yes |
| API semantics only | Focus on public option/error behavior and let the planner decide internal placement. | |
| Use defaults | Use recommended choices and write context without more back-and-forth. | |

**User's choice:** Fallback selected recommended default.
**Notes:** This is a workflow fallback, not a user-stated preference. The context is intentionally explicit so it can be reviewed before planning.

---

## Normalized Return Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Add `ProviderRunResponse.toolCalls` | Add an optional normalized list while preserving raw provider text and raw response. | yes |
| Mutate `rawOutputs` | Rewrite provider text to include only valid tool calls. | |
| Agent-loop only | Validate only inside `runAgent`, leaving adapters unaware. | |

**User's choice:** Recommended default: add `toolCalls`.
**Notes:** This is additive and lets all seven adapters satisfy the roadmap's returned-list language without losing inspection/replay fidelity.

---

## Failure Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Fail closed by default | `onFailure` defaults to `"throw"` when validation is enabled. | yes |
| Drop by default | Invalid calls are omitted unless the consumer asks for thrown errors. | |
| Callback by default | Invalid calls invoke a callback by default. | |

**User's choice:** Recommended default: fail closed.
**Notes:** Callback mode reports each invalid call and then drops it from the validated list; it must not execute malformed calls.

---

## Schema Strictness

| Option | Description | Selected |
|--------|-------------|----------|
| Reject extra fields by default | Extra fields are validation failures unless explicitly allowed. | yes |
| Allow extra fields by default | Preserve permissive behavior unless consumer opts into strictness. | |
| Defer entirely to schema | Do not add any Lattice-level extra-field option. | |

**User's choice:** Recommended default: reject extra fields when detectable.
**Notes:** Exact `extra_fields` detection is required for Zod object schemas; generic Standard Schema inputs may fall back to `invalid_args` when shape introspection is unavailable.

---

## Agent Runtime Composition

| Option | Description | Selected |
|--------|-------------|----------|
| Adapter validates, agent prefers normalized calls | Adapters populate `toolCalls`; `runAgent` uses them when present and keeps parser fallback for consumer adapters. | yes |
| Agent owns all validation | Keep validation solely in the agent loop. | |
| Native provider tool-use expansion | Add native tool request/response plumbing now. | |

**User's choice:** Recommended default: adapter validates, agent prefers normalized calls.
**Notes:** Native provider tool-use request formatting is deferred; this phase validates the current prompt-reencoded envelope.

---

## the agent's Discretion

- Exact file split for validator implementation.
- Exact callback property name.
- Exact helper function names.
- Exact test file organization.

## Deferred Ideas

- Provider-native tool-use request formatting.
