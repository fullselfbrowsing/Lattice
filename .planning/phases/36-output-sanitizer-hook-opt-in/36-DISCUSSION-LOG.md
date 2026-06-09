# Phase 36: Output Sanitizer Hook (opt-in) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-09
**Phase:** 36-output-sanitizer-hook-opt-in
**Areas discussed:** gray-area selection, public API shape, sanitizer behavior, provider integration, observability/tests

---

## Gray-Area Selection

The interactive question tool was unavailable in Default mode. Per workflow
fallback, the recommended option was selected and all areas were covered.

| Option | Description | Selected |
|--------|-------------|----------|
| All | Covers API shape, sanitizer behavior, provider wiring, and observability/test guarantees. | ✓ |
| API + behavior | Focuses on public helper/option shape and exact sanitizer semantics; agent defaults provider wiring. | |
| Provider wiring | Focuses on where the hook runs across the 7 adapters and how failures/metadata are handled. | |

**User's choice:** Tool unavailable; selected recommended default.
**Notes:** This phase is infrastructure-heavy and already constrained by Phase 34
`SanitizerKey` decisions and the Phase 36 roadmap success criteria.

---

## Public API Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Adapter-local option | `sanitizeOutput?: SanitizerFn | readonly SanitizerFn[]` on each first-party adapter factory. | ✓ |
| Runtime-level option | `createAI({ sanitizeOutput })` applies globally to every provider. | |
| Registry DSL | Separate named sanitizer registry resolved by `SanitizerKey`. | |

**User's choice:** Recommended default: adapter-local option.
**Notes:** Roadmap explicitly says each of the 7 adapters accepts an opt-in
`sanitizeOutput` option. Runtime-global configuration would be a new capability.

---

## Sanitizer Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Conservative no-op transforms | Built-ins only rewrite recognized leak shapes and leave unmatched text unchanged. | ✓ |
| Aggressive cleanup | Strip broad patterns even if they may be user-visible content. | |
| Strict failure | Throw when a sanitizer cannot match or parse expected text. | |

**User's choice:** Recommended default: conservative no-op transforms.
**Notes:** Built-ins must not create new regressions by altering valid model output.
Custom sanitizer exceptions can still propagate through the existing adapter failure
path.

---

## Provider Integration

| Option | Description | Selected |
|--------|-------------|----------|
| Adapter execute return path | Sanitize string `rawOutputs` after provider extraction and before returning `ProviderRunResponse`. | ✓ |
| Runtime validation boundary | Sanitize in `createAI` immediately before `validateOutputMap`. | |
| Provider-specific branches only | Implement each adapter independently without a shared helper. | |

**User's choice:** Recommended default: adapter execute return path.
**Notes:** This makes validation, tripwires, receipts, and consumer outputs see the
sanitized text while preserving `rawResponse` for inspection.

---

## Observability and Tests

| Option | Description | Selected |
|--------|-------------|----------|
| Tests only, no new event | Prove behavior with direct/unit/adapter/type tests; avoid emitting output-bearing telemetry. | ✓ |
| New run event | Emit an event whenever a sanitizer changes output. | |
| Sanitizer audit object | Add response metadata describing sanitizer effects. | |

**User's choice:** Recommended default: tests only, no new event.
**Notes:** Output sanitizer telemetry can leak sensitive text. Existing hooks can
observe sanitized `rawOutputs`, and `rawResponse` remains intact for inspection.

---

## the agent's Discretion

- Exact internal helper names and file split.
- Whether the sanitizer pipeline helper is public or internal.
- Exact unit test layout, provided all Phase 36 success criteria are covered.

## Deferred Ideas

- Phase 37 tool-call validation.
- New sanitizer keys beyond the three Phase 34 ids.
- Sanitizer-specific observability events.
