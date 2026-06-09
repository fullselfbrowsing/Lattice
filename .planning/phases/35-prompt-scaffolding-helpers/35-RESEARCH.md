# Phase 35: Prompt Scaffolding Helpers - Research

**Researched:** 2026-06-09
**Domain:** Deterministic prompt-fragment helpers keyed by model prompt strategy
**Confidence:** HIGH for internal codebase patterns; HIGH for serialization approach because `canonicalize@3.0.0` is already a package dependency and receipt test vector surface.

## Summary

Phase 35 should ship a small hand-authored `packages/lattice/src/prompts/` module, not another registry or provider adapter extension. The implementation can reuse Phase 33's existing `RecommendedPromptStrategy` type and Phase 9's existing `canonicalize` dependency to solve the two hard parts: typed strategy dispatch and stable byte identity for schema/tool payloads.

The recommended API surface is:

```typescript
export const PROMPT_SCAFFOLD_VERSION = "lattice.prompt-scaffold/v1" as const;
export const PROMPT_STRATEGIES = [
  "frontier",
  "mid_tier",
  "open_weight",
  "reasoning",
  "local",
] as const satisfies readonly RecommendedPromptStrategy[];

export function getStructuredOutputContract(
  strategy: RecommendedPromptStrategy,
  schema: unknown,
): string;

export function getToolUseContract(
  strategy: RecommendedPromptStrategy,
  tools: unknown,
): string;
```

`PROMPT_SCAFFOLD_VERSION` is the visible version pin required by SCAFF-02. It gives snapshot tests and consumers a stable marker without adding a builder or registry. `PROMPT_STRATEGIES` is a narrow runtime constant for exhaustive tests; it is not a new type.

The helper internals should canonicalize `schema` and `tools` through `canonicalize(value)`. This repo already depends on `canonicalize@3.0.0` for receipt/replay stability, and `packages/lattice/src/receipts/canonical.ts` already establishes the error pattern when canonicalization returns `undefined`. Reusing it avoids custom key-sorting logic.

## Locked Context Applied

- Reuse `RecommendedPromptStrategy` from `packages/lattice/src/capabilities/profile.ts`; do not define a parallel strategy union.
- Keep the public API small: two helpers plus narrow constants.
- `open_weight` gets the strictest wording and examples because it closes the gpt-oss-120b envelope-leak class from `session_1780792387779`.
- Phase 35 only emits prompt text. It does not implement Phase 36 sanitizers, Phase 37 tool-call validation, Phase 38 receipt changes, or Phase 39 multi-agent orchestration.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **SCAFF-01** | Export `getStructuredOutputContract(strategy, schema): string` and `getToolUseContract(strategy, tools): string` using Phase 33's `RecommendedPromptStrategy` union | Existing `profile.ts` type; root export discipline in `src/index.ts`; local barrel pattern in `capabilities/index.ts` |
| **SCAFF-02** | Deterministic, version-pinned fragment bytes with canonical schema/tool serialization | Existing `canonicalize` dependency and receipt canonicalization tests; snapshot pattern in `capabilities-classifier.test.ts` |
| **SCAFF-03** | `open_weight` distinguishes meta-instruction from literal output instruction with example-driven framing | Phase 33 anchor failure and Phase 34 sanitizer mapping: `system_prompt_echo` remains prompt-engineering territory |
| **SCAFF-04** | Per-strategy regression coverage and fake provider stubs prove open-weight envelope leak is prevented | Existing Vitest + tsd setup; `PROMPT_STRATEGIES` enables exhaustive strategy loops |

## Existing Code Patterns

### Public Surface

`packages/lattice/src/index.ts` re-exports every public type/function from local module barrels. Phase 35 should follow the Phase 33/34 pattern:

- Add `packages/lattice/src/prompts/scaffolds.ts`.
- Add `packages/lattice/src/prompts/index.ts`.
- Re-export the helpers/constants from `packages/lattice/src/index.ts`.

### Pure Helper Modules

`packages/lattice/src/capabilities/sanitizer-recommendations.ts` is the closest analog: a pure module with a closed typed table, narrow exports, no I/O, and focused unit tests. `scaffolds.ts` should match that style.

### Canonical Serialization

`packages/lattice/src/receipts/canonical.ts` already uses:

```typescript
const json = canonicalize(body);
if (json === undefined) {
  throw new Error("...");
}
```

Phase 35 should use the same pattern for prompt scaffold inputs:

```typescript
function canonicalPromptJson(value: unknown, label: string): string {
  const json = canonicalize(value);
  if (json === undefined) {
    throw new Error(
      `get${label}Contract: input must be JSON-serializable for deterministic prompt scaffolds.`,
    );
  }
  return json;
}
```

The executor can choose exact helper naming, but the behavior must be explicit: unsupported values fail loudly instead of silently producing unstable prompt bytes.

## Recommended Fragment Structure

Every returned string should have the same high-level sections so snapshots are easy to review:

```text
Lattice Prompt Scaffold: lattice.prompt-scaffold/v1
Strategy: <strategy>
Purpose: <structured-output | tool-use>

<strategy-specific instructions>

Contract:
<canonical JSON>
```

`frontier` and `reasoning` should be concise. `mid_tier`, `open_weight`, and `local` can repeat critical instructions. `reasoning` should explicitly say not to expose hidden reasoning or scratchpad content in the final answer; it should not implement a sanitizer.

The open-weight structured-output fragment should include these exact concepts so tests can grep them:

- `The contract below is an instruction, not text to output.`
- `Do not answer with the schema, envelope, or any field name unless that field belongs in the final user-visible JSON.`
- `Bad: {"summary":"Greeted the user."} when the user asked for a natural-language reply.`
- `Good: Greeted the user.`

The open-weight tool-use fragment should similarly say the tool list is available action metadata, not text to copy into the answer.

## Testing Strategy

Use one Vitest file: `packages/lattice/test/prompt-scaffolds.test.ts`.

Required coverage:

- `PROMPT_STRATEGIES` equals the five `RecommendedPromptStrategy` literals in the roadmap order.
- Both helpers include `PROMPT_SCAFFOLD_VERSION`.
- Both helpers are deterministic for object-key ordering: `{ b: 1, a: 2 }` and `{ a: 2, b: 1 }` produce identical fragments.
- Both helpers throw on non-canonicalizable inputs such as functions.
- Snapshot or exact-string coverage exists for every strategy/helper pair.
- Fake provider stubs model strategy behavior:
  - frontier/reasoning/mid_tier/local stubs do not emit internal envelopes when given their scaffold.
  - open_weight stub emits `{"summary":"Greeted the user."}` without the meta-vs-literal guard, but returns `Greeted the user.` when the Phase 35 scaffold is used.

Use one tsd file: `packages/lattice/test-d/prompt-scaffolds.test-d.ts`.

Required type coverage:

- `getStructuredOutputContract(strategy: RecommendedPromptStrategy, schema)` returns `string`.
- `getToolUseContract(strategy: RecommendedPromptStrategy, tools)` returns `string`.
- `"frontier_rlhf"` and `"not-a-strategy"` are rejected.
- `PROMPT_STRATEGIES[number]` is assignable to `RecommendedPromptStrategy`.

## Threat Model

| Threat | Severity | Mitigation |
|--------|----------|------------|
| Prompt scaffold text is mistaken for a security boundary against malicious user prompts | medium | JSDoc and tests should describe scaffolds as prompt-engineering helpers only; no claims of sandboxing or policy enforcement |
| Non-deterministic serialization invalidates prompt-cache keys across patch releases | high | Use `canonicalize`, include version marker, assert exact byte snapshots |
| Open-weight models emit the internal schema/envelope as final output | high | Open-weight strategy includes meta-vs-literal boundary and fake-provider regression tests |
| Tool descriptors are copied into user-visible answers | medium | Tool-use fragments explicitly frame tools as action metadata, not answer text |

## Pitfalls

- Do not use `JSON.stringify` directly for input rendering; insertion order can make byte identity unstable.
- Do not export a `PromptStrategy` alias that shadows `RecommendedPromptStrategy`.
- Do not hide prompt text in generated files. Prompt fragments are hand-authored public behavior and should be reviewable.
- Do not implement sanitization in this phase. `unwrapInternalEnvelope` remains Phase 36.
- Do not wire scaffolds into adapter request paths automatically. Phase 35 is a helper surface for consumers.

## Verification Commands

```bash
pnpm --filter @full-self-browsing/lattice typecheck
pnpm --filter @full-self-browsing/lattice test prompt-scaffolds
pnpm --filter @full-self-browsing/lattice test:types
pnpm --filter @full-self-browsing/lattice lint:packages
```

## RESEARCH COMPLETE
