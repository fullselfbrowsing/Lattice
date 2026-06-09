# Phase 35: Prompt Scaffolding Helpers - Context

**Gathered:** 2026-06-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 35 delivers a small prompt scaffolding helper surface for Lattice consumers:
`packages/lattice/src/prompts/scaffolds.ts` exports deterministic, version-pinned
prompt fragments for structured outputs and tool use, keyed by the existing
`RecommendedPromptStrategy` union from Phase 33.

This phase is prevention-oriented. It gives consumers safer system-prompt building
blocks for model classes that interpret schemas and tool instructions differently.
It does not implement runtime output sanitizers, tool-call validators, receipt schema
changes, or multi-agent orchestration.

</domain>

<decisions>
## Implementation Decisions

### Fragment Style and Strictness

- **D-01:** Use hybrid, strategy-specific prompt tone. `frontier` and `reasoning`
  fragments should be terse and contract-like; `mid_tier`, `open_weight`, and
  `local` fragments can be more explicit when that improves instruction following.
- **D-02:** Fragments are deterministic text helpers, not conversational templates.
  They should not include dates, random ids, dynamic examples unrelated to the
  inputs, or environment-specific wording.
- **D-03:** Version-pinning is part of the scaffold contract. Planning should include
  a stable exported version marker or equivalent snapshot-visible marker so patch
  releases cannot silently change prompt bytes.

### Schema and Tool Rendering

- **D-04:** `getStructuredOutputContract(strategy, schema)` should embed a canonical
  rendering of the supplied schema in the returned string. The rendering must be
  deterministic for byte snapshots.
- **D-05:** `getToolUseContract(strategy, tools)` should embed a canonical rendering
  of the supplied tool descriptors in the returned string. It should be copy-pasteable
  by consumers composing system prompts, not a placeholder that requires a second
  formatter.
- **D-06:** Canonical input serialization should use structured data handling and
  stable key ordering where needed. Avoid ad hoc string manipulation that makes
  semantically identical inputs produce unstable prompt bytes.
- **D-07:** Both helpers should make the schema/tool definition clearly instructional
  metadata, not user-visible output text.

### Open-Weight Leak Prevention

- **D-08:** `open_weight` is the strictest and most example-driven strategy. It must
  explicitly separate meta-instructions from literal output instructions.
- **D-09:** The open-weight structured-output fragment must include clear positive
  and negative framing around the envelope/schema: follow the contract, but do not
  emit the contract itself.
- **D-10:** The anchor regression is `session_1780792387779`, where
  `openai/gpt-oss-120b` emitted an internal envelope as the user-visible reply.
  Phase 35 should prove its scaffold prevents that class of leak in the fake
  provider stub required by the roadmap.

### Public API Size

- **D-11:** Keep the public API intentionally small: the two roadmap helpers plus
  narrow supporting exports only when they improve stability or typing.
- **D-12:** Reuse Phase 33's `RecommendedPromptStrategy` type. Do not create a parallel
  prompt-strategy union for Phase 35.
- **D-13:** A small `prompts` barrel is acceptable if it matches existing package
  export patterns. Avoid a builder class, registry DSL, provider-specific prompt
  orchestrator, or runtime injection API in this phase.

### the agent's Discretion

The planner may decide the exact internal file split, constant names, and test
fixture organization, provided the public contract remains the two helper functions
and the prompt bytes are deterministic.

</decisions>

<specifics>
## Specific Ideas

- Anchor case study: `session_1780792387779` / `openai/gpt-oss-120b` / OpenRouter
  `:free` variant, classified in Phase 33 as `open_weight_instruct` with
  `knownFailureModes` including `internal_envelope_leak`.
- The key behavioral distinction is meta-instruction versus literal-instruction.
  Open-weight prompts must not invite the model to answer with the envelope/schema
  text itself.
- Snapshot tests are part of the product contract, not just convenience tests:
  prompt-caching keys depend on stable bytes across patch releases.

</specifics>

<canonical_refs>
## Canonical References

Downstream agents MUST read these before planning or implementing.

### Phase Definition

- `.planning/ROADMAP.md` — Phase 35 goal, dependency, and success criteria.
- `.planning/REQUIREMENTS.md` — Current milestone requirement ledger; note that
  `SCAFF-01` through `SCAFF-04` are planned in the roadmap but not yet authored as
  detailed requirement rows.
- `.planning/STATE.md` — Current milestone progress and Phase 35 next-action state.

### Upstream Decisions

- `.planning/phases/33-model-capability-registry-200-via-openrouter-feed/33-CONTEXT.md`
  — Defines `RecommendedPromptStrategy`, the gpt-oss-120b anchor failure, and the
  model-class/failure-mode vocabulary Phase 35 consumes.
- `.planning/phases/34-adapter-quirk-flags-capability-negotiation-api/34-CONTEXT.md`
  — Clarifies that `system_prompt_echo` is prompt-engineering territory, while
  sanitizer implementation is Phase 36.
- `.planning/phases/34-adapter-quirk-flags-capability-negotiation-api/34-05-PLAN.md`
  — Notes Phase 35 independence from Phase 34 and confirms it reads Phase 33's
  `recommendedPromptStrategy` enum.

### Code Surfaces

- `packages/lattice/src/capabilities/profile.ts` — Source of
  `RecommendedPromptStrategy`, `ModelCapabilityProfile`, and known failure modes.
- `packages/lattice/src/capabilities/index.ts` — Local barrel export pattern for
  capability-facing helpers and types.
- `packages/lattice/src/index.ts` — Root public export pattern for package APIs.
- `packages/lattice/test/capabilities-registry-integration.test.ts` — Pattern for
  closed-union membership checks and registry-level invariants.
- `packages/lattice/test/capabilities-sanitizer-recommendations.test.ts` — Pattern
  for small pure helper tests with exhaustive table assertions.
- `packages/lattice/test-d/capabilities.test-d.ts` — Type-level pattern confirming
  `RecommendedPromptStrategy` remains distinct from `TrainingClass`.
- `packages/lattice/test-d/index.test-d.ts` — Root package type-export test pattern.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `RecommendedPromptStrategy` already exists with the exact five values Phase 35
  needs: `"frontier" | "mid_tier" | "open_weight" | "reasoning" | "local"`.
- `ModelCapabilityProfile.recommendedPromptStrategy` is the intended dispatch key.
  Consumers can call Phase 35 helpers after resolving a profile through the existing
  capability lookup/negotiation path.
- `KnownFailureMode` already includes `internal_envelope_leak` and
  `system_prompt_echo`, which explains why open-weight scaffolds need stronger
  prompt framing.

### Established Patterns

- Public APIs are rooted in small, typed modules plus local barrels, then re-exported
  from `packages/lattice/src/index.ts`.
- Capability code uses closed string-literal unions and runtime arrays/tests to keep
  public values from drifting.
- Existing tests favor pure Vitest unit coverage plus `test-d` assertions for public
  type contracts.
- Generated registries are not the right place for Phase 35 prompt text. Prompt
  scaffolds should live in a hand-authored `prompts` module.

### Integration Points

- Add `packages/lattice/src/prompts/scaffolds.ts`.
- Add `packages/lattice/src/prompts/index.ts` if following the local barrel pattern.
- Re-export the public helpers and any narrow supporting type/constants from
  `packages/lattice/src/index.ts`.
- Add focused tests under `packages/lattice/test/`, including byte snapshots or
  exact-string assertions per strategy and fake provider stub regressions.
- Add `test-d` coverage so the exported helpers accept the existing
  `RecommendedPromptStrategy` type and do not widen strategy values to `string`.

### Tooling Note

`gsd-tools init phase-op 35` currently returns `phase_found: false`, while
`gsd-tools roadmap get-phase 35` resolves Phase 35 correctly. Downstream GSD steps
may need to rely on the explicit phase path above or repair roadmap parsing before
automation can initialize this phase normally.

</code_context>

<deferred>
## Deferred Ideas

- Phase 36 owns sanitizer implementations such as `unwrapInternalEnvelope`,
  `stripReasoningTags`, and `stripChatTemplateArtifacts`.
- Phase 37 owns tool-call validation and malformed/hallucinated tool-call handling.
- Phase 38 owns receipt schema changes such as `lattice-receipt/v1.2` and
  `modelClass`.
- Phase 39 owns multi-agent crew concepts if the roadmap keeps that scope.
- Runtime automatic prompt injection, provider-specific prompt orchestration, a prompt
  registry DSL, and model-family-specific prompt packs are out of scope for Phase 35.

</deferred>

---

*Phase: 35-prompt-scaffolding-helpers*
*Context gathered: 2026-06-09*
