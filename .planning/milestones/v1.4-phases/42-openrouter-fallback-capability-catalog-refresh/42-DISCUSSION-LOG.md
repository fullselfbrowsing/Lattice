# Phase 42: OpenRouter Fallback + Capability Catalog Refresh - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-06-15
**Phase:** 42-openrouter-fallback-capability-catalog-refresh
**Areas discussed:** OpenRouter fallback request shape, resolved model accounting, catalog refresh and registry diff behavior, verification and public surface

---

## Workflow Note

The normal `AskUserQuestion` UI was unavailable in this Default-mode Codex session. Per the GSD adapter fallback, the workflow selected the reasonable default: discuss all identified gray areas and capture evidence-backed implementation defaults. The user explicitly invoked `$gsd-discuss-phase 42`; no code files were changed.

---

## Area Selection

| Option | Description | Selected |
|--------|-------------|----------|
| All areas | Covers fallback arrays, resolved-model accounting, catalog refresh behavior, and CI/manual drift reporting. | yes |
| Fallback path | Focus only on OpenRouter `models[]` request shape and resolved-model propagation. | |
| Catalog refresh | Focus only on deterministic registry diffs and refresh failure behavior. | |

**User's choice:** Interactive choice unavailable; selected the recommended all-area default.
**Notes:** Code scout found existing OpenRouter adapter support, existing registry generator, and Phase 41 gateway policy metadata that make all areas tightly coupled.

---

## OpenRouter Fallback Request Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Typed `fallbackModels` option | OpenRouter-specific, clear intent, avoids exposing arbitrary provider body mutation. | yes |
| Generic `extraBody` option | Flexible but makes public API and redaction/accounting broader than Phase 42 requires. | |
| OpenRouter SDK integration | Defers serialization to SDK but adds a runtime dependency that requirements explicitly reject. | |

**User's choice:** Selected typed `fallbackModels` default.
**Notes:** OpenRouter docs describe OpenAI-compatible model fallback through a `models` array; Lattice should serialize it directly through the existing fetch path.

---

## Resolved Model Accounting

| Option | Description | Selected |
|--------|-------------|----------|
| Preserve requested route, record observed model additively | Keeps deterministic Lattice routing inspectable while showing what OpenRouter served. | yes |
| Rewrite selected route to observed model | Makes the route look like Lattice selected a model it did not select. | |
| Record only in raw response | Avoids public shape changes but fails ORCAT-02 result/plan/event/receipt visibility. | |

**User's choice:** Selected additive observed-model accounting.
**Notes:** Existing `ReceiptModel.observed` and `ProviderGatewayMetadata.observedModel` are already available integration points.

---

## Catalog Refresh and Registry Diff Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Extend existing build-time generator | Reuses deterministic renderer, fixture tests, and scheduled refresh workflow. | yes |
| Runtime refresh during `ai.run()` | Convenient but explicitly out of scope and risks deterministic routing drift. | |
| Separate new generator | Avoids touching Phase 33 code but duplicates refresh logic and review rules. | |

**User's choice:** Selected existing-generator extension.
**Notes:** Existing `scripts/refresh-model-registry.mjs` already encodes no timestamps, stable sorting, bit-exact checks, retry behavior, and scheduled PR flow.

---

## Verification and Public Surface

| Option | Description | Selected |
|--------|-------------|----------|
| Full cross-surface tests | Covers request body, runtime metadata, receipts, registry diffs, package surface, and dependency boundaries. | yes |
| Adapter-only tests | Faster but misses ORCAT-02 receipt/result/event obligations. | |
| Manual refresh-only validation | Too weak for deterministic registry changes and Phase 40 guardrail expectations. | |

**User's choice:** Selected full cross-surface tests.
**Notes:** Phase 40 requires public-surface and package-type evidence for new exports; Phase 42 also needs receipt integration tests because the receipt field already exists but is currently passed as `null`.

---

## the agent's Discretion

- Planner may choose exact public type names for fallback arrays and gateway observation metadata.
- Planner may choose whether result gateway metadata reuses `ProviderGatewayMetadata` or a narrower exported type.
- Planner may split fallback and registry refresh work into separate plans for review clarity.

## Deferred Ideas

- OpenRouter streaming through OpenAI-compatible streaming paths.
- Anthropic Messages `fallbacks` through OpenRouter.
- Full `@openrouter/sdk` integration.
- Runtime catalog refresh during `ai.run()`.
- FSB-via-npm validation for this new surface.
