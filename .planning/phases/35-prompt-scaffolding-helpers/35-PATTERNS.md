# Phase 35: Prompt Scaffolding Helpers - Pattern Map

**Mapped:** 2026-06-09
**Scope:** Files expected for Phase 35 implementation and verification.

## Files To Create Or Modify

| Target | Role | Closest Existing Analog | Notes |
|--------|------|-------------------------|-------|
| `packages/lattice/src/prompts/scaffolds.ts` | New pure helper module | `packages/lattice/src/capabilities/sanitizer-recommendations.ts` | Closed strategy table, no I/O, no new deps, deterministic helper functions |
| `packages/lattice/src/prompts/index.ts` | New local barrel | `packages/lattice/src/capabilities/index.ts` | Re-export types/constants/functions from `scaffolds.ts` |
| `packages/lattice/src/index.ts` | Public root export | Phase 33/34 export blocks in same file | Add a Phase 35 block near capability/negotiation exports |
| `packages/lattice/test/prompt-scaffolds.test.ts` | Runtime + snapshot tests | `packages/lattice/test/capabilities-sanitizer-recommendations.test.ts`, `packages/lattice/test/capabilities-classifier.test.ts` | Pure helper assertions plus strategy snapshots |
| `packages/lattice/test/__snapshots__/prompt-scaffolds.test.ts.snap` | Snapshot bytes | `packages/lattice/test/__snapshots__/capabilities-classifier.test.ts.snap` | Created by Vitest when snapshot tests are updated |
| `packages/lattice/test-d/prompt-scaffolds.test-d.ts` | Public type tests | `packages/lattice/test-d/capabilities.test-d.ts` | Verifies strategy parameter uses `RecommendedPromptStrategy` |
| `packages/lattice/test/public-surface.test.ts` | Runtime root-export smoke | Existing phase sections in same file | Add `typeof getStructuredOutputContract === "function"` assertions |
| `.changeset/v1.3.0-prompt-scaffolds.md` | Release notes | `.changeset/v1.3.0-capability-registry.md` | Minor package change for new public helper surface |

## Source Patterns

### Pure Helper Table

Use the `sanitizer-recommendations.ts` shape:

- file-level phase comment
- type imports only where possible
- narrow exported constants
- one or two small exported functions
- no runtime I/O

### Canonical Bytes

Use the `receipts/canonical.ts` pattern:

- call `canonicalize(value)`
- throw when it returns `undefined`
- test deterministic key ordering

Do not write a custom recursive sorter unless `canonicalize` is insufficient. It is already part of `@full-self-browsing/lattice` runtime dependencies.

### Public Export Discipline

Use the Phase 33/34 blocks in `packages/lattice/src/index.ts`:

```typescript
// Phase 35 — Prompt Scaffolding Helpers
export {
  PROMPT_SCAFFOLD_VERSION,
  PROMPT_STRATEGIES,
  getStructuredOutputContract,
  getToolUseContract,
} from "./prompts/index.js";
```

No separate `PromptStrategy` type export should be added.

### Test-D Discipline

Use `expectType`, `expectAssignable`, and `expectError` from `tsd`, matching `test-d/capabilities.test-d.ts`.

Required negative cases:

- `getStructuredOutputContract("frontier_rlhf", {})`
- `getToolUseContract("not-a-strategy", [])`

## Data Flow

1. Consumer resolves a model profile with Phase 33/34 APIs.
2. Consumer reads `profile.recommendedPromptStrategy`.
3. Consumer passes that strategy plus their schema/tool descriptors into Phase 35 helpers.
4. Helpers return deterministic prompt fragments for consumer-composed system prompts.

No adapter should call these helpers automatically in Phase 35.

## PATTERN MAPPING COMPLETE
