# Phase 33: Model Capability Registry (~200+ via OpenRouter feed) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-06-08
**Phase:** 33-model-capability-registry-200-via-openrouter-feed
**Areas discussed:** Classifier source of truth, Provider identity scheme, knownFailureModes vocabulary, CI snapshot-drift policy

---

## Classifier source of truth

### Q1.1 -- Classifier reasoning strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid (provider-prefix heuristic + substring overrides) | Heuristic carries the long tail; ~20-entry override table carries judgment calls | done |
| Pure heuristic (provider-prefix only) | One rule table by id-prefix; ships v1.3.0 with known wrong rows (Haiku, gpt-oss) | |
| Hand-curated family table | ~20-30 family entries, slowest to seed, highest initial quality | |

**User's choice:** Hybrid (Recommended)

### Q1.2 -- Classifier location

| Option | Description | Selected |
|--------|-------------|----------|
| scripts/capabilities/classifier.mjs | Build-time only, zero Lattice runtime imports, never shipped in tarball | done |
| packages/lattice/src/capabilities/classifier.ts | Ships in tarball; adds ~3-5 KB; supports late-binding runtime classification | |
| Inline in scripts/refresh-model-registry.mjs | Single-file generator + classifier + fetch + emit | |

**User's choice:** scripts/capabilities/classifier.mjs (Recommended)

### Q1.3 -- Override-table format

| Option | Description | Selected |
|--------|-------------|----------|
| Family-substring -> class object | `{ 'claude-haiku': 'mid_tier_rlhf', ... }`; substring match; ~20 entries | done |
| Full id -> class object (exact match) | One row per OpenRouter id; goes stale on renames | |
| Regex array of {pattern, class} | Most expressive; harder to review; one bad regex mis-tags silently | |

**User's choice:** Family-substring -> class object (Recommended)

### Q1.4 -- Unknown-model policy

| Option | Description | Selected |
|--------|-------------|----------|
| Default open_weight_instruct + WARN | Permissive class, visible CI signal on refresh PRs | done |
| Hard-fail the script | Forces overrides update per refresh; blocks every catalog change | |
| Default to a new 'unknown' class | 6th trainingClass value; every downstream phase handles the extra case | |

**User's choice:** Default to open_weight_instruct + WARN (Recommended)

**Notes:** No follow-up questions on this area. The 4 decisions are tight enough that downstream agents can build the classifier file directly. reasoningSurface and toolCallSurface classifier mechanics are deferred -- same hybrid pattern applies.

---

## Provider identity scheme

### Q2.1 -- What does profile.provider identify

| Option | Description | Selected |
|--------|-------------|----------|
| Both (adapter + originFamily as two fields) | Phase 34 dispatches on adapter; Phase 35 dispatches on originFamily | done |
| Single Lattice adapter only | Phase 35 re-derives originFamily from id; extra parsing step downstream | |
| Single origin family only | Phase 34 looks up adapter binding at runtime; couples adapter to runtime state | |

**User's choice:** Both, as two fields (Recommended)

### Q2.2 -- Multi-adapter model representation

| Option | Description | Selected |
|--------|-------------|----------|
| One profile per (adapter, model) pair | Canonical key `${adapter}:${modelId}`; ~2-3x more entries but each unambiguous | done |
| One profile per model id, adapter is a list | Smaller registry; Phase 34 quirks need separate (adapter, model) table | |
| Per-model with adapter inferred at runtime | Smallest; loses ability to encode per-transport quirks | |

**User's choice:** One profile per (adapter, model) pair (Recommended)

### Q2.3 -- Bare-id lookup resolution

| Option | Description | Selected |
|--------|-------------|----------|
| Two functions: strict + fuzzy | `getCapabilityProfile(canonicalKey)` strict, `findCapabilityProfile(id)` fuzzy returns all matches | done |
| Single function, smart resolution | Strips suffix; first match across adapters in deterministic order; hides adapter | |
| Bare id always returns undefined | Force callers to pass full canonical key; pure but inconvenient | |

**User's choice:** Two functions: strict + fuzzy (Recommended)

### Q2.4 -- Suffix-strip location

| Option | Description | Selected |
|--------|-------------|----------|
| Inside registry module, only on OpenRouter rows | findCapabilityProfile detects OR shape, strips `:variant`; one helper | done |
| Every profile carries an aliases[] field | Most explicit; doubles registry size; every OR entry has 1-2 aliases | |
| Build-time canonicalization in generator | Cheapest at runtime; loses ability to pass suffixed form | |

**User's choice:** Inside the registry module, suffix-strip only on OpenRouter rows (Recommended)

**Notes:** No follow-up questions on this area. The 4 decisions enable both the strict and ergonomic lookup paths and keep the OpenRouter-specific variant suffix handling scoped to one helper.

---

## knownFailureModes vocabulary

### Q3.1 -- Union scope at v1.3.0

| Option | Description | Selected |
|--------|-------------|----------|
| Pragmatic middle (7 modes) | 4 Cat-1 output-shape leaks + 2 tool-call malfunctions + 1 premature_termination | done |
| Tight (4 Cat-1 only) | Smallest surface; lowest dead-code risk; ships only what was observed | |
| Broad (all 24 from research doc) | Future-proof; ~15 modes ship as dead tags v1.3 | |

**User's choice:** Pragmatic middle (Recommended)

### Q3.2 -- Union shape

| Option | Description | Selected |
|--------|-------------|----------|
| Closed string-literal union | Exhaustive switch enforced; adding a mode is a typed breaking change | done |
| Open string with branded type | Most extensible; loses exhaustive-switch safety | |
| Closed union + 'custom' escape hatch | Theoretical best-of-both; in practice becomes a dumping ground | |

**User's choice:** Closed string-literal union (Recommended)

### Q3.3 -- Population policy

| Option | Description | Selected |
|--------|-------------|----------|
| Class-derived defaults + per-family overrides | Each trainingClass has default set; overrides in classifier.mjs add/remove | done |
| Per-family curation only | All modes come from override table; long-tail rows ship empty | |
| Empty by default; populated as observed | Most honest; least useful out of the box | |

**User's choice:** Class-derived defaults + per-family overrides (Recommended)

### Q3.4 -- Receipt v1.2 modelClass shape

| Option | Description | Selected |
|--------|-------------|----------|
| trainingClass only | One of 5 strings; stable across model patches; small bounded receipt delta | done |
| trainingClass + reasoningSurface | Distinguishes o1 from gpt-4o; adds second typed field | |
| Full canonical key + classifier snapshot SHA | Most forensic; receipt bloat from repeated SHA | |

**User's choice:** trainingClass only (Recommended)

**Notes:** No follow-up questions on this area. The pragmatic-middle scope is small enough that Phase 36 can ship a sanitizer per mode and Phase 35 can use them as scaffold dispatch tags.

---

## CI snapshot-drift policy

### Q4.1 -- Detection mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Re-run generator, diff against committed file | Self-contained; matches verify-rename / check-workflow-safety pattern | done |
| Checksum of OpenRouter response | Most paranoid; catches description-field changes that round-trip identical | |
| No CI check; cron-based refresh PR only | Simplest; risk entry mitigation gap | |

**User's choice:** Re-run generator, diff against committed file (Recommended)

### Q4.2 -- Diff strictness

| Option | Description | Selected |
|--------|-------------|----------|
| Bit-exact diff | Any byte difference fails; aligns with ROADMAP risk entry intent | done |
| Additive-only (additions OK, removals/edits fail) | Quieter signal; silent addition risk | |
| Bit-exact on classified fields only | Filters OR description noise; adds --check-mode complexity | |

**User's choice:** Bit-exact diff (Recommended)

### Q4.3 -- Fetch failure handling

| Option | Description | Selected |
|--------|-------------|----------|
| Skip the check, WARN | Upstream outage doesn't block PRs; catches up on next run | done |
| Fail the check | Couples Lattice CI to OpenRouter uptime; Rekor-class blip risk | |
| Retry 3x with backoff, then fail | Standard retry; higher CI minutes on outage | |

**User's choice:** Skip the check, warn (Recommended)

### Q4.4 -- CI placement

| Option | Description | Selected |
|--------|-------------|----------|
| Separate scheduled workflow (weekly cron + manual dispatch) | New registry-drift.yml; auto-opens refresh PR; ci.yml stays network-free | done |
| Every PR + main push (in ci.yml) | Most aggressive; one OR request per CI run | |
| Manual-only (no automation) | Smallest footprint; success-criterion gap | |

**User's choice:** Separate scheduled workflow (Recommended)

**Notes:** No follow-up questions on this area. The four decisions form a self-contained drift-detection system that keeps PR-time CI fast and surfaces catalog changes on a predictable weekly cadence.

---

## Claude's Discretion

Areas where the user explicitly accepted "you decide" or where downstream agents (researcher, planner) have flexibility:

- Exact text of stderr WARN messages on classifier unknowns
- Internal data structure for lookup hash tables (Map vs plain object)
- Exact regex for OpenRouter variant-suffix matcher
- Whether registry.generated.ts is one file or splits per adapter
- Test fixture strategy for the classifier
- Whether recommendedPromptStrategy uses the same 5-bucket enum as trainingClass
- Exact name of the changesets entry produced by Phase 33

## Deferred Ideas

- reasoningSurface + toolCallSurface classifier mechanics (same hybrid pattern; planner can extrapolate)
- Research doc Open Question 1 (inline TS vs external JSON) -- decided by ROADMAP success criterion
- Research doc Open Question 2 (sanitizer placement) -- Phase 36 question
- Research doc Open Question 4 (semver versioning of prompt fragments) -- Phase 35 question
- Research doc Open Question 8 (prompt-caching key stability) -- Phase 35 risk, already in ROADMAP
- OpenRouter rate-limit handling for refresh script -- implementation detail; sensible defaults OK
- Registry growth past 200 -- monitor via tarball size; ~100 KB upper bound advisory
