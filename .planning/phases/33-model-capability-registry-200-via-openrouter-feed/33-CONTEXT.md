# Phase 33: Model Capability Registry (~200+ via OpenRouter feed) - Context

**Gathered:** 2026-06-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship a typed, build-time-baked registry of model capability profiles so consumers can query model-class behavior (training lineage, reasoning surface, tool-call shape, known failure modes, recommended prompt strategy) BEFORE constructing a request. This closes the structural gap surfaced by the gpt-oss-120b envelope-leak case study (session_1780792387779) -- the first observable instance of a class of failures that will recur with every new open-weight model a consumer integrates.

**Phase 33 is the foundation of the Phase 33-38 model-aware SDK surface.** Decisions captured here are dispatch keys for Phase 34 (adapter quirks), Phase 35 (prompt scaffolds), Phase 36 (output sanitizers), Phase 37 (tool-call validators), and Phase 38 (receipt v1.2 `modelClass` tag). Locking these now reduces gray-area work in 5 downstream phases.

**Locked by ROADMAP success criteria (NOT a gray area):**
- `packages/lattice/src/capabilities/` exposes typed `ModelCapabilityProfile` with `id`, `provider`, `trainingClass`, `reasoningSurface`, `toolCallSurface`, `contextWindow`, `knownFailureModes`, `recommendedPromptStrategy`
- `getCapabilityProfile(id)` lookup with alias support
- `scripts/refresh-model-registry.mjs` build-time generator
- Committed `packages/lattice/src/capabilities/registry.generated.ts`
- CI snapshot-drift gate
- Static supplemental profiles for direct Anthropic, direct Gemini, direct xAI, LM Studio local template
- Registry covers >=200 distinct profiles at v1.3.0 cut

**Out of scope for Phase 33:**
- Sanitizer implementations (Phase 36)
- Prompt scaffolds (Phase 35)
- Tool-call validation (Phase 37)
- Receipt v1.2 schema bump (Phase 38)
- Capability negotiation API (Phase 34)
- Adapter quirk flags (Phase 34)

</domain>

<decisions>
## Implementation Decisions

### Classifier source of truth

- **D-01 (Strategy):** Hybrid classifier -- provider-prefix heuristic as the default rule, with a hand-curated overrides table for known special cases (mid-tier RLHF like Haiku, reasoning models like o1/deepseek-r1, open-weight from frontier orgs like gpt-oss). Heuristic carries the long tail; overrides carry the judgment calls.
- **D-02 (Location):** Classifier lives at `scripts/capabilities/classifier.mjs` -- build-time only, zero Lattice runtime imports, never shipped in the package tarball. Pure Node ESM.
- **D-03 (Override shape):** Family-substring -> trainingClass object. Example: `{ 'claude-haiku': 'mid_tier_rlhf', 'gpt-oss': 'open_weight_instruct', 'o1': 'frontier_rlhf', ... }`. ~20 entries cover ~90% of misclassifications. Substring match against the model id after the provider prefix. Easy to skim in code review, easy to add a new family in one line.
- **D-04 (Unknown policy):** When neither provider-prefix rule nor override matches, default to `trainingClass: 'open_weight_instruct'` and emit a WARN line per unknown id. The refresh script's stdout shows all warnings; CI surfaces them on the refresh PR. Permissive default + visible signal -- never hard-fail on long-tail unknowns.

### Provider identity scheme

- **D-05 (Two fields):** Each `ModelCapabilityProfile` carries BOTH `adapter` (Lattice transport: `openrouter | anthropic | openai | openai-compat | xai | gemini | lm-studio`) AND `originFamily` (model creator: `openai | anthropic | meta | mistral | google | xai | deepseek | qwen | ...`). Phase 34 quirks dispatch on `adapter`; Phase 35 scaffolds dispatch on `originFamily`. No re-derivation needed downstream.
- **D-06 (Adapter enum):** Closed string union -- one of the 7 Lattice-shipped transports. Adding a new adapter is a typed breaking change.
- **D-07 (originFamily enum):** Open extensible string -- new model creators emerge frequently and shouldn't break the type. Phase 35 scaffold dispatch handles unknown originFamily by falling back to the `recommendedPromptStrategy` derived from trainingClass.
- **D-08 (Canonical key):** `${adapter}:${modelId}` -- one profile per (adapter, model) pair. `openrouter:openai/gpt-oss-120b` and `openai:gpt-oss-120b` are TWO distinct entries with the same `originFamily: 'openai'`. Honest about transport quirks (Phase 34) which can genuinely differ per adapter. Expected registry size: ~3x the unique-model count.
- **D-09 (Lookup -- strict):** `getCapabilityProfile(canonicalKey: string): ModelCapabilityProfile | undefined` returns exactly the matching (adapter, model) profile. Public, strict, no resolution magic.
- **D-10 (Lookup -- fuzzy):** `findCapabilityProfile(id: string): ModelCapabilityProfile[]` does suffix-strip + multi-adapter lookup and returns ALL matching profiles in deterministic adapter order (direct adapters first, openrouter last). Ergonomic helper for pre-routing capability inspection where the adapter hasn't been chosen yet.
- **D-11 (Suffix-strip scope):** Variant suffix handling (`:free`, `:beta`) lives inside the registry module's `findCapabilityProfile` and applies ONLY to OpenRouter-shaped ids (`vendor/model:variant`). Other adapters' ids pass through verbatim. Strip logic is one helper, not leaked to consumers.

### knownFailureModes vocabulary

- **D-12 (Scope at v1.3.0):** 7 modes in the typed union -- pragmatic middle between the 4 Cat-1 output-shape leaks alone and the full 24-mode taxonomy from the research doc:
  1. `internal_envelope_leak` (the observed gpt-oss-120b case)
  2. `reasoning_tag_leak` (`<think>` leakage from DeepSeek-R1, Qwen QwQ)
  3. `system_prompt_echo`
  4. `template_artifact_leak` (`<|im_start|>`, `[INST]`, `<<SYS>>` token leakage)
  5. `hallucinated_tool_name`
  6. `malformed_tool_arguments`
  7. `premature_termination` (finish_reason: length)
- **D-13 (Union shape):** Closed string-literal union -- `type KnownFailureMode = 'internal_envelope_leak' | 'reasoning_tag_leak' | ...`. TypeScript catches typos at compile time; exhaustive switch is enforced in Phase 36 sanitizer dispatch. Adding a mode in v1.4+ is a typed breaking change (intentional gate).
- **D-14 (Population policy):** Class-derived defaults + per-family overrides. Each `trainingClass` has a default set in the classifier file:
  - `frontier_rlhf` -> `[]`
  - `mid_tier_rlhf` -> `['system_prompt_echo']`
  - `open_weight_instruct` -> `['internal_envelope_leak', 'system_prompt_echo', 'malformed_tool_arguments']`
  - `open_weight_base` -> `['internal_envelope_leak', 'system_prompt_echo', 'malformed_tool_arguments', 'hallucinated_tool_name', 'premature_termination']`
  - `local_quantized` -> `['internal_envelope_leak', 'system_prompt_echo', 'template_artifact_leak', 'malformed_tool_arguments', 'premature_termination']`
  
  Per-family overrides in `scripts/capabilities/classifier.mjs` add/remove modes (e.g., `deepseek-r1` adds `reasoning_tag_leak`; `qwen-qwq` adds `reasoning_tag_leak`).
- **D-15 (Receipt v1.2 modelClass):** Receipt v1.2's `modelClass` field (Phase 38) carries `trainingClass` only -- one of the 5 string values. Stable across model patches (gpt-4o-2024-05-13 and gpt-4o-2024-08-06 share trainingClass), so receipts remain comparable across rebuilds. Small and bounded -- safe for receipt schema.

### CI snapshot-drift policy

- **D-16 (Detection mechanism):** CI re-runs `node scripts/refresh-model-registry.mjs --check` -- generator writes to a temp file, then diffs against committed `packages/lattice/src/capabilities/registry.generated.ts`. Non-zero exit on any difference. Self-contained pattern matching `verify-rename.mjs` and `check-workflow-safety.mjs` from Phase 25 (zero external state, classifier IS the truth).
- **D-17 (Strictness):** Bit-exact diff. Any byte-level difference fails. OpenRouter added a model -> fail. OpenRouter changed a context_length -> fail. Forces the "intentional refresh PR" outcome the ROADMAP risk entry explicitly calls for. Refresh PR frequency: realistically once or twice a month.
- **D-18 (Fetch failure):** Skip the check + WARN. The generator's `--check` mode treats OpenRouter fetch failure (timeout, 5xx, rate limit) as "cannot determine drift -- skipping" and exits 0 with a stderr warning. CI overall still passes. Upstream OpenRouter outage shouldn't block unrelated PRs. Drift catches up on the next successful run.
- **D-19 (Placement):** Drift check lives in a separate `.github/workflows/registry-drift.yml` -- weekly cron (`0 6 * * 1` Monday morning UTC) + `workflow_dispatch` for manual trigger. On drift, the workflow auto-opens a refresh PR with the regenerated `registry.generated.ts`. PR-time `ci.yml` does NOT call OpenRouter. Keeps PR loop fast (zero network calls per PR) and surfaces drift on a predictable cadence.

### Claude's Discretion

These are implementation details downstream agents (researcher, planner) decide:

- Exact text of stderr WARN messages on classifier unknowns
- Internal data structure for the lookup hash tables (Map vs plain object)
- Exact regex for the OpenRouter variant-suffix matcher
- Whether `registry.generated.ts` lives as one large file or splits per adapter (advisory: one file unless gzip size hurts)
- Test fixture strategy for the classifier (recommended: golden snapshot + per-family unit tests)
- Whether the `recommendedPromptStrategy` field uses the same 5-bucket enum as `trainingClass` or a separate set (Phase 35 may want this)
- Exact name of the changesets entry produced by Phase 33

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Primary research input (drives Phase 33-38)
- `/Users/lakshmanturlapati/Desktop/FSB/automation/lattice/MULTI-MODEL-OUTPUT-CONTRACT-RESEARCH.md` -- 447-line research doc; the source of the model-class taxonomy (Part 2), failure-mode catalog (Part 3), failure-mode x model-class matrix (Part 4), and the 7 proposed Improvements that drive Phases 33-38. Phase 33 implements Improvement 1 (capability registry).

### Gap tracker
- `docs/fsb-integration-gaps.md` -- row 60 is the multi-agent gap that Phase 39 closes; not directly Phase 33 but the source doc for the v1.3 milestone extension.

### Roadmap + requirements
- `.planning/ROADMAP.md` -- Phase 33 section (lines 196-208) -- locked success criteria; risk entry on OpenRouter registry drift (Phase 33 risk in Risks section)
- `.planning/REQUIREMENTS.md` -- existing 54 REQ-IDs through Phase 32; CAPS-01..05 to be added in Phase 33 plan (33 new REQ-IDs total for Phases 33-39)
- `.planning/PROJECT.md` -- milestone goal statement (paragraph needs update to match expanded ROADMAP; flagged as a v1.3 milestone-level task, not Phase 33's responsibility)

### Existing Lattice surface (do not duplicate, do not break)
- `packages/lattice/src/providers/provider.ts` -- existing `ModelCapability` interface (modality + pricing + tool use). Phase 33's `ModelCapabilityProfile` is a SIBLING, not a replacement. Lives in a different module (`capabilities/`) and tracks orthogonal facts.
- `packages/lattice/src/routing/catalog.ts` -- v1.0 `CapabilityCatalog` shape and `createCapabilityCatalog` factory. Router reads ModelCapability; it does NOT read ModelCapabilityProfile. Phase 33 explicitly does not touch the router.
- `packages/lattice/src/providers/openrouter.ts` -- existing OpenRouter adapter; understand its model-id shape (`vendor/model:variant`) since the suffix-strip logic mirrors it
- `packages/lattice/src/index.ts` -- public surface index; new `getCapabilityProfile`, `findCapabilityProfile`, types must be re-exported here per v1.2 PKG-01 discipline

### CI scaffolding patterns (reuse)
- `scripts/verify-rename.mjs` -- Phase 24 scaffold for build-time `--check` mode; D-16 uses the same pattern
- `scripts/check-workflow-safety.mjs` -- Phase 25 / Phase 28 scaffold for repo-script CI gates; D-16 mirrors its zero-external-state design
- `scripts/check-tarball-leak.mjs` -- Phase 24 scaffold for tarball inspection; relevant if registry.generated.ts size matters for the published tarball

### Release pipeline (do not touch in Phase 33)
- `.github/workflows/ci.yml` -- PR-time gates from Phase 25; D-19 adds a new sibling workflow but does NOT modify ci.yml
- `.github/workflows/release.yml` -- Phase 28 OIDC publish; outside Phase 33 scope

### Receipt schema (read-only for Phase 33; Phase 38 mutates)
- `packages/lattice/src/receipt/` -- existing v1.1 schema. D-15 declares the v1.2 `modelClass` shape but Phase 33 does NOT implement the bump (Phase 38 does)

### Upstream API
- OpenRouter `/api/v1/models` endpoint -- live API, no auth required for the read-only models list. Snapshot at refresh PR time becomes the source of truth.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`scripts/verify-rename.mjs`** and **`scripts/check-workflow-safety.mjs`** are existing Phase 24/25 patterns: Node-only ESM, zero external deps, `--check` mode that exits non-zero on drift, structured stderr output. Phase 33's `refresh-model-registry.mjs` and the new `registry-drift.yml` workflow follow this exact pattern. Don't reinvent.

- **`ModelCapability` (in `packages/lattice/src/providers/provider.ts`)** -- existing v1.0 type. Phase 33 does NOT extend this. Instead, `ModelCapabilityProfile` is a new sibling type in `packages/lattice/src/capabilities/profile.ts`. The two never overlap: ModelCapability answers "can this model handle image input + what does it cost?" while ModelCapabilityProfile answers "how does this model misbehave + what prompt style does it want?".

### Established Patterns

- **Per-package src/index.ts re-export discipline (v1.2 PKG-01/INDEX-01)** -- every new public type lands in `packages/lattice/src/index.ts`. The planner must NOT forget `getCapabilityProfile`, `findCapabilityProfile`, `ModelCapabilityProfile`, `KnownFailureMode`, the trainingClass / reasoningSurface / toolCallSurface enums, and supporting types.

- **Closed string-literal unions throughout v1.1/v1.2** (see `ResumePolicy`, `RunEventKind`, `VerifyResultErrorKind`). D-13 follows this pattern.

- **Generator + committed artifact pattern** is already used elsewhere: `packages/lattice-cli` ships a tsdown-bundled bin generated from src/. The refresh-model-registry.mjs -> registry.generated.ts pipeline reuses that mental model.

### Integration Points

- **Public surface** -- `packages/lattice/src/index.ts` adds 5 new exports (lookup functions + types + enums) per PKG-01
- **tsd types tests** (`packages/lattice/test-d/`) -- must add type-level assertions for `getCapabilityProfile` return narrowing and `KnownFailureMode` exhaustive checks
- **Lint gate** -- `publint` and `arethetypeswrong/cli` (already wired via `pnpm -r lint:packages` in PR-time CI) must stay green
- **Tarball inspection (Phase 24 CI-05)** -- registry.generated.ts will land in the tarball; the existing tarball-leak check stays green so long as the file size is reasonable (advisory: <100 KB)
- **No router touching** -- v1.0 routing logic in `packages/lattice/src/routing/router.ts` reads `ModelCapability` from `CapabilityCatalog`. Phase 33 does NOT change routing semantics. The registry is a SECOND, parallel data surface that consumers query manually before constructing a request.

</code_context>

<specifics>
## Specific Ideas

Anchoring case study: **session_1780792387779** -- gpt-oss-120b on FSB autopilot emitting `{"summary": "Greeted the user."}` as the user-visible reply for the task "hi". This is the failure Phase 33 makes systematically queryable, and Phase 36 will eventually auto-sanitize. The classifier MUST flag `openrouter:openai/gpt-oss-120b` and its `:free` variant with `trainingClass: 'open_weight_instruct'` and `knownFailureModes` including `internal_envelope_leak`. If the generated registry does not show that exact behavior on a manual `getCapabilityProfile` query during Phase 33 verification, the implementation is wrong.

OpenRouter id-shape examples the planner should plan tests against:
- `anthropic/claude-3.5-sonnet` -- frontier_rlhf, none failure modes
- `anthropic/claude-3-haiku` -- mid_tier_rlhf via family override
- `openai/gpt-4o` -- frontier_rlhf
- `openai/o1` -- frontier_rlhf with reasoningSurface: hidden_cot
- `openai/gpt-oss-120b:free` -- open_weight_instruct via family override; variant suffix strips to base
- `deepseek/deepseek-r1` -- open_weight_instruct + reasoning_tag_leak override
- `qwen/qwen-2.5-72b-instruct` -- open_weight_instruct
- `meta-llama/llama-3.3-70b-instruct` -- open_weight_instruct
- `google/gemini-2.0-flash-001` -- frontier_rlhf (note OpenRouter routes through Google, so adapter:openrouter, originFamily:google)

Supplemental static profiles (success criterion 3) must include:
- `anthropic:claude-opus-4` (direct Anthropic, not via OpenRouter)
- `gemini:gemini-2.5-pro` (direct Gemini)
- `xai:grok-4` (direct xAI)
- `lm-studio:<local-template>` -- generic local-quantized template (consumer parameterizes contextWindow at runtime)

</specifics>

<deferred>
## Deferred Ideas

- **reasoningSurface and toolCallSurface classifier mechanics** -- I asked about trainingClass only. The same hybrid-classifier pattern applies; planner can use the trainingClass decisions as a template. If the planner finds genuine ambiguity, they should surface it back as a planner question.
- **Open Question 1 from research doc (inline TS vs external JSON for seed data)** -- ROADMAP success criterion locks `registry.generated.ts` (inline TS); decided.
- **Open Question 2 from research doc (sanitizer inside-adapter vs separate pipeline)** -- Phase 36 question, not Phase 33.
- **Open Question 4 from research doc (semver versioning of prompt fragments)** -- Phase 35 question, not Phase 33.
- **Open Question 8 from research doc (prompt caching key stability)** -- Phase 35 risk, already noted in ROADMAP Risks section.
- **OpenRouter rate-limit handling for the refresh script** -- relevant to Phase 33 implementation but downstream agent details; planner can use sensible defaults (3 retries with backoff).
- **Registry growth past 200** -- success criterion is "at least 200." Long tail of OpenRouter models will swell to 300-400 over time; no specific upper bound. Monitor via tarball size; address if it grows past ~100 KB.

### Reviewed Todos (not folded)

None -- no pending todos matched Phase 33's scope at discuss time.

</deferred>

---

*Phase: 33-Model Capability Registry (~200+ via OpenRouter feed)*
*Context gathered: 2026-06-08*
