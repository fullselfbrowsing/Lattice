# Phase 8: Tripwire Invariants with Terminal Semantics - Context

**Gathered:** 2026-05-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Developers can declare semantic/policy invariants on a `CapabilityContract` using a fluent Standard Schema-backed builder. The runtime evaluates them post-execution (after output schema validation succeeds, before the result returns) as a distinct `"tripwire"` plan stage. Violations are typed `TripwireViolationError` failures carrying `terminal: true`, and the existing v1.0 fallback chain refuses to retry them.

Out of scope for Phase 8: receipt issuance (Phase 9), replay envelope embedding (Phase 10), CLI (Phase 11), eval gate (Phase 12). Mid-stream tripwire abort is deferred to v1.2 — Phase 8 is post-execution only.
</domain>

<decisions>
## Implementation Decisions

### Invariant DSL Shape
- Fluent builder exported as `inv` from `packages/lattice/src/contract/invariants.ts` with these helpers:
  - `inv.mustCite(name: string)` — asserts the output object contains at least one citation referencing `name` (typically an artifact id). Path defaults to `evidence` if the output has a citations field; the runtime locates the citations payload in the output.
  - `inv.fieldFromTable(path: string, allowedValues: readonly string[])` — asserts the value at `path` is one of `allowedValues`.
  - `inv.noPII(path: string)` — asserts the string value at `path` does NOT match any registered PII pattern.
  - `inv.matches(path: string, schema: StandardSchemaV1<unknown, T>)` — asserts the value at `path` validates against an arbitrary Standard Schema.
- Each helper returns an `InvariantDeclaration` object: `{ id: string, kind: "must-cite" | "field-from-table" | "no-pii" | "matches", ...kind-specific-fields }`. `id` is auto-generated as `${kind}-${counter}` if not supplied; callers may pass a custom id via the second-positional-arg overload `inv.mustCite(name, { id })`.
- Builder is Standard Schema-shaped — every invariant compiles down to a Standard Schema validator under the hood so outputs/tools/contracts share one validator surface.
- The CapabilityContract `invariants?: InvariantDeclaration[]` field (declared in Phase 7) is now evaluated.

### Stage Placement
- New `"tripwire"` `ExecutionStageKind` added to the plan stage union, placed between `"validation"` and `"persistence"`.
- Tripwire stage runs ONLY if output schema validation succeeds. Validation failures take precedence in the verdict.
- Each invariant is evaluated in declaration order; the FIRST violation aborts the stage (no need to evaluate the rest in v1.1).

### Terminal-Flag Wiring
- New `TripwireViolationError` variant on `LatticeRunError` (additive): `kind: "tripwire-violated", terminal: true, invariantId, evidence: TripwireEvidence`.
- A new exported predicate `isTerminal(error: LatticeRunError): boolean` returns `true` for `tripwire-violated` and `no-contract-match` (both should bypass retries). The existing fallback chain in `runtime/create-ai.ts` consults this predicate before retrying.
- `RunFailure.usage` carries the cost-so-far when tripwire fires (the run executed, so tokens were spent). This is the natural Phase 7 behavior — `normalizeAdapterUsage` extracts usage from the successful provider response that the tripwire later rejected.

### PII Detection (`inv.noPII()`)
- Regex-based, zero new dependencies. Detector list lives in `packages/lattice/src/contract/pii-detectors.ts`:
  - email: `/[\w.+-]+@[\w-]+\.[\w.-]+/`
  - US SSN: `/\b\d{3}-\d{2}-\d{4}\b/`
  - credit card: 13-19 digit sequences passing the Luhn check (filter out trivially-formatted strings)
  - US phone: `/\b\d{3}-\d{3}-\d{4}\b/` and `/\(\d{3}\)\s?\d{3}-\d{4}/`
- ML-based or library-based detection deferred (future requirement).
- The detector list is exported as `defaultPiiDetectors` so callers can compose their own list, but Phase 8 only wires the default set.

### Violation Evidence Shape
- `TripwireEvidence`: `{ invariantId: string, kind: "must-cite" | "field-from-table" | "no-pii" | "matches", path: string, observed: unknown, message: string }`.
- The `observed` field is the raw value that triggered the violation (or, for `must-cite`, the array of citations actually found). For `no-pii`, `observed` is the matched substring + detector name (NOT the full input string — keeps redacted form intact for future Phase 9 receipts).
- `TripwireEvidence` is exported from the public surface so consumers can inspect and serialize it.

### Claude's Discretion
- Exact file layout under `packages/lattice/src/contract/` is at Claude's discretion (recommend `invariants.ts` for builder, `tripwire.ts` for runtime evaluator, `pii-detectors.ts` for the regex list).
- Internal path-traversal helper for resolving `path` strings (e.g., `"action.kind"` → `output.action.kind`) is at Claude's discretion. Keep it tiny — no lodash/jsonpath.
- Specific `id` autogen scheme — sequential counter or hash — is at Claude's discretion.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/lattice/src/contract/contract.ts` — `CapabilityContract.invariants?: InvariantDeclaration[]` field already declared in Phase 7 (type-level only); now needs runtime evaluation.
- `packages/lattice/src/outputs/validate.ts` — output schema validation already plumbed; add tripwire stage AFTER successful validation.
- `packages/lattice/src/results/errors.ts` — additive new variant `TripwireViolationError` with `terminal: true`.
- `packages/lattice/src/runtime/create-ai.ts` — `runWithConfig`. The post-validation, pre-result section is where tripwire runs. Fallback chain consults `isTerminal()` before retrying.
- `packages/lattice/src/plan/plan.ts` — `ExecutionStageKind` union; add `"tripwire"`.
- `@standard-schema/spec` — already in catalog; reuse for `inv.matches(schema)`.

### Established Patterns
- Validators return `{ success: true, value } | { success: false, issues }` via Standard Schema.
- `LatticeRunError` is an additive tagged union.
- All public types exported via `packages/lattice/src/index.ts`.

### Integration Points
- `ExecutionStageKind`: add `"tripwire"` between `"validation"` and `"persistence"`.
- `LatticeRunError`: add `TripwireViolationError` variant.
- `runWithConfig`: after validation success, run tripwires; on violation, return RunFailure with the new variant. Before any retry attempt, consult `isTerminal()`.
- `index.ts`: export `inv`, `InvariantDeclaration`, `TripwireViolationError`, `TripwireEvidence`, `isTerminal`.
</code_context>

<specifics>
## Specific Ideas

- Tripwire evaluator is a pure function: `evaluateTripwires(output: unknown, invariants: readonly InvariantDeclaration[], detectors: PiiDetector[] = defaultPiiDetectors) -> { ok: true } | { ok: false, evidence: TripwireEvidence }`. This makes the evaluator reusable in Phase 12's eval gate (tripwires-as-scorers is a future requirement; the pure-function signature is forward-compat).
- The path-resolution helper supports dotted paths (`action.kind`), bracket indexing (`citations[0]`), and a special `*` segment for "any element in this array" (used by `inv.mustCite` to scan a citations array). Keep it ~30 LOC, no dependency.
- Tests: unit tests for each invariant kind, integration tests for the runtime path (declare a contract with tripwires, run a fake provider that returns a violating output, assert TripwireViolationError emitted, assert NO retry occurred, assert usage populated).
</specifics>

<deferred>
## Deferred Ideas

- Mid-stream tripwire abort (deferred to v1.2 per REQUIREMENTS.md).
- `shadow | enforce` mode per invariant (deferred to v1.2).
- Streaming-cheap vs streaming-expensive predicate split (deferred to v1.2).
- Tripwires-as-eval-scorers wiring (the pure-function signature is forward-compat, but the actual wiring lives in Phase 12).
- ML/library-based PII detection (regex-only in v1.1).
- Multiple violations per run (Phase 8 aborts on first violation).
</deferred>
