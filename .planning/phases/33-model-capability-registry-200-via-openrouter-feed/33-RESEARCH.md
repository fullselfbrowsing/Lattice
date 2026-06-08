# Phase 33: Model Capability Registry (~200+ via OpenRouter feed) - Research

**Researched:** 2026-06-08
**Domain:** Build-time codegen + typed runtime lookup table + scheduled snapshot-drift CI
**Confidence:** HIGH (OpenRouter shape verified live; classifier/codegen/CI patterns cross-checked against LiteLLM + Vercel AI Gateway; lookup design verified against Lattice's existing v1.2 surface)

## Summary

Phase 33 ships a typed, build-time-baked registry of model capability profiles. The work breaks into four mechanical parts: (1) author the `ModelCapabilityProfile` types and lookup module in `packages/lattice/src/capabilities/`; (2) author a Node-only ESM build-time generator at `scripts/refresh-model-registry.mjs` that fetches OpenRouter `/api/v1/models` and writes `registry.generated.ts`; (3) author a sibling classifier at `scripts/capabilities/classifier.mjs` with provider-prefix heuristic + ~20-entry family-substring override table; (4) author a weekly `.github/workflows/registry-drift.yml` that re-runs the generator in `--check` mode and auto-opens a PR with the regenerated file.

The OpenRouter feed today (verified live 2026-06-08) returns **341 models** at `/api/v1/models` across **57 provider prefixes**, unauthenticated GET, no pagination — single 407 KB JSON response that gzips to 47 KB. After supplemental static profiles for direct Anthropic / Gemini / xAI / LM Studio the registry will comfortably exceed the >=200 success criterion. The published TypeScript file is estimated at **~93 KB raw / ~4-6 KB gzipped** — a single-digit-percent uptick on the existing 686 KB unpacked tarball.

**Primary recommendation:** Author the registry as a single inline `const REGISTRY = [...]` array typed `as const satisfies readonly ModelCapabilityProfile[]`, build the lookup `Map` lazily on first call, write the generator using `node:fetch` with a 3-retry exponential backoff, and pin every third-party action in `registry-drift.yml` to a 40-character SHA per the established CI-02 discipline. The hard-pin question for the planner: confirm whether the workflow uses `peter-evans/create-pull-request@<sha>` (canonical scheduled-PR action, will hit the existing repo "Allow Actions to create PRs" gate) or `gh pr create` via a workflow-scoped fine-grained PAT (LiteLLM's pattern; bypasses the gate but adds a long-lived secret).

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Classifier source of truth**
- **D-01 (Strategy):** Hybrid classifier — provider-prefix heuristic as the default rule, with a hand-curated overrides table for known special cases (mid-tier RLHF like Haiku, reasoning models like o1/deepseek-r1, open-weight from frontier orgs like gpt-oss). Heuristic carries the long tail; overrides carry the judgment calls.
- **D-02 (Location):** Classifier lives at `scripts/capabilities/classifier.mjs` — build-time only, zero Lattice runtime imports, never shipped in the package tarball. Pure Node ESM.
- **D-03 (Override shape):** Family-substring -> trainingClass object. Example: `{ 'claude-haiku': 'mid_tier_rlhf', 'gpt-oss': 'open_weight_instruct', 'o1': 'frontier_rlhf', ... }`. ~20 entries cover ~90% of misclassifications. Substring match against the model id after the provider prefix.
- **D-04 (Unknown policy):** When neither provider-prefix rule nor override matches, default to `trainingClass: 'open_weight_instruct'` and emit a WARN line per unknown id. CI surfaces them on the refresh PR. Permissive default + visible signal — never hard-fail on long-tail unknowns.

**Provider identity scheme**
- **D-05 (Two fields):** Each profile carries BOTH `adapter` (Lattice transport: `openrouter | anthropic | openai | openai-compat | xai | gemini | lm-studio`) AND `originFamily` (model creator: `openai | anthropic | meta | mistral | google | xai | deepseek | qwen | ...`).
- **D-06 (Adapter enum):** Closed string union — one of the 7 Lattice-shipped transports. Adding a new adapter is a typed breaking change.
- **D-07 (originFamily enum):** Open extensible string — new model creators emerge frequently and shouldn't break the type.
- **D-08 (Canonical key):** `${adapter}:${modelId}` — one profile per (adapter, model) pair. `openrouter:openai/gpt-oss-120b` and `openai:gpt-oss-120b` are TWO distinct entries with the same `originFamily: 'openai'`.
- **D-09 (Lookup — strict):** `getCapabilityProfile(canonicalKey: string): ModelCapabilityProfile | undefined`.
- **D-10 (Lookup — fuzzy):** `findCapabilityProfile(id: string): ModelCapabilityProfile[]` does suffix-strip + multi-adapter lookup, returns in deterministic adapter order (direct adapters first, openrouter last).
- **D-11 (Suffix-strip scope):** Variant suffix handling (`:free`, `:beta`) lives inside the registry module's `findCapabilityProfile` and applies ONLY to OpenRouter-shaped ids (`vendor/model:variant`).

**knownFailureModes vocabulary**
- **D-12 (Scope at v1.3.0):** 7 modes in the typed union: `internal_envelope_leak`, `reasoning_tag_leak`, `system_prompt_echo`, `template_artifact_leak`, `hallucinated_tool_name`, `malformed_tool_arguments`, `premature_termination`.
- **D-13 (Union shape):** Closed string-literal union — TypeScript catches typos at compile time; exhaustive switch enforced in Phase 36 sanitizer dispatch.
- **D-14 (Population policy):** Class-derived defaults + per-family overrides.
  - `frontier_rlhf` -> `[]`
  - `mid_tier_rlhf` -> `['system_prompt_echo']`
  - `open_weight_instruct` -> `['internal_envelope_leak', 'system_prompt_echo', 'malformed_tool_arguments']`
  - `open_weight_base` -> `['internal_envelope_leak', 'system_prompt_echo', 'malformed_tool_arguments', 'hallucinated_tool_name', 'premature_termination']`
  - `local_quantized` -> `['internal_envelope_leak', 'system_prompt_echo', 'template_artifact_leak', 'malformed_tool_arguments', 'premature_termination']`
- **D-15 (Receipt v1.2 modelClass):** Receipt v1.2's `modelClass` field (Phase 38) carries `trainingClass` only.

**CI snapshot-drift policy**
- **D-16 (Detection mechanism):** CI re-runs `node scripts/refresh-model-registry.mjs --check` — generator writes to a temp file, then diffs against committed `registry.generated.ts`. Non-zero exit on any difference.
- **D-17 (Strictness):** Bit-exact diff.
- **D-18 (Fetch failure):** Skip the check + WARN on OpenRouter fetch failure; exit 0 with stderr warning.
- **D-19 (Placement):** `.github/workflows/registry-drift.yml` — weekly cron (`0 6 * * 1` Monday morning UTC) + `workflow_dispatch`. On drift, the workflow auto-opens a refresh PR. PR-time `ci.yml` does NOT call OpenRouter.

### Claude's Discretion

These are implementation details the planner / agent decides:

- Exact text of stderr WARN messages on classifier unknowns
- Internal data structure for the lookup hash tables (Map vs plain object) — research recommends lazy `Map` builder
- Exact regex for the OpenRouter variant-suffix matcher
- Whether `registry.generated.ts` lives as one large file or splits per adapter — research recommends single file
- Test fixture strategy for the classifier — research recommends golden-fixture snapshot + per-family unit tests
- Whether `recommendedPromptStrategy` uses the same 5-bucket enum as `trainingClass` — research recommends ONE shared `TrainingClass` ↔ `RecommendedPromptStrategy` mapping (see Q9)
- Exact name of the changesets entry produced by Phase 33

### Deferred Ideas (OUT OF SCOPE)

- `reasoningSurface` / `toolCallSurface` classifier mechanics (planner can use trainingClass decisions as a template; surface back to me if genuinely ambiguous)
- Open Question 1 — inline TS vs external JSON: locked as inline TS
- Open Question 2 — sanitizer inside-adapter vs separate pipeline: Phase 36
- Open Question 4 — semver of prompt fragments: Phase 35
- Open Question 8 — prompt caching key stability: Phase 35
- OpenRouter rate-limit handling specifics for the refresh script (3 retries with backoff is the sensible default)
- Registry growth past 200 (monitor via tarball size; address only if it grows past ~100 KB)

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| **CAPS-01** | Typed `ModelCapabilityProfile` + `getCapabilityProfile` lookup with alias support in `packages/lattice/src/capabilities/` | Q5 (lookup design), Q9 (enum shape), Q11 (exports), §Standard Stack, §Architecture Patterns |
| **CAPS-02** | `scripts/refresh-model-registry.mjs` fetches OpenRouter feed, transforms via classifier, commits `registry.generated.ts` | Q1 (OpenRouter API), Q2 (codegen patterns), Q7 (test fixtures), §Code Examples |
| **CAPS-03** | CI re-runs script in `--check` mode and fails on drift; weekly cron auto-PR | Q3 (drift CI), Q4 (scheduled auto-PR), §Code Examples, §Pitfalls |
| **CAPS-04** | Static supplemental profiles for direct Anthropic / Gemini / xAI / LM Studio | Q8 (static profiles separation), §Architecture Patterns |
| **CAPS-05** | Registry covers >=200 distinct profiles at v1.3.0 cut | Q1 (341 OpenRouter rows verified live) + ~3 static profiles, easily over threshold |

## Project Constraints (from CLAUDE.md)

No `./CLAUDE.md` exists at the Lattice repo root. The user's private global CLAUDE.md (loaded as system context) applies:

- **Never run applications automatically** — generator + drift workflow must be triggered explicitly (cron + manual dispatch satisfy this; the planner should not introduce a `pnpm postinstall` hook that auto-runs the refresh)
- **No emojies** in terminal logs, READMEs, or markdown files unless explicitly asked
- **Browser automation policy** — N/A for this phase (no live-browser interaction)

Inferred from existing v1.2 PKG-01/INDEX-01 discipline and the repo's CI scripts:

- **Zero external runtime dependencies in `scripts/`** — verify-rename.mjs and check-workflow-safety.mjs use only `node:` built-ins. The refresh script MUST follow this; `node:fs/promises`, `node:fetch` (built-in since Node 18), `node:path`, `node:url`. **No `axios`, no `node-fetch`, no `ofetch`.**
- **Every new public type/function lands in `packages/lattice/src/index.ts`** — non-negotiable per Phase 14/15.
- **Closed string-literal unions throughout v1.1/v1.2** — match `ResumePolicy`, `RunEventKind`, `VerifyResultErrorKind` style (`type Foo = "a" | "b" | "c"`).
- **`publint` + `arethetypeswrong/cli` lint gates active** via `pnpm -r lint:packages` — registry exports must be bundler-safe.
- **`tsdown` bundler with `treeshake: true`** — registry layout must not defeat tree-shaking (see Q5).
- **SHA-pinned third-party actions (CI-02)** — every `uses:` in `registry-drift.yml` MUST be a 40-character SHA.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js built-in `fetch` | Node >=24 (already engines target) | HTTP GET to `https://openrouter.ai/api/v1/models` | Lattice scripts/ has zero-external-deps discipline; native fetch is stable since Node 18, GA in 20, fine in 24. [VERIFIED: scripts/verify-rename.mjs uses only `node:` built-ins; engines.node `>=24` in package.json] |
| Node.js `node:fs/promises` | builtin | Write `registry.generated.ts`, compare against committed file in `--check` mode | Matches `check-tarball-leak.mjs` and `verify-rename.mjs` pattern [VERIFIED: scripts/check-tarball-leak.mjs:24] |
| TypeScript `as const satisfies` | TS 5.0+ (Lattice has TS 6) | Inline registry typed as readonly literal | Enables Map lookup + tree-shaking + tsd narrowing [CITED: https://dev.to/tommykw/differences-and-usage-of-as-const-and-readonly-in-typescript-4bkb] |
| `vitest` 4 | already installed | Unit tests for classifier + lookup functions | Repo standard [VERIFIED: packages/lattice/package.json] |
| `tsd` | already installed | Type-level tests for `ModelCapabilityProfile` narrowing | Matches v1.2 PKG-01 INDEX-01 discipline [VERIFIED: packages/lattice/test-d/index.test-d.ts] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `peter-evans/create-pull-request` action | `@v8.1.1` SHA `5f6978faf089d4d20b00c7766989d076bb2fc7f1` (or `@v7.0.8` SHA `271a8d0340265f705b14b6d32b9829c1cb33d45e`) | Auto-open the weekly refresh PR | De facto choice for scheduled auto-PR workflows; LiteLLM's variant uses `gh pr create` instead [CITED: https://github.com/peter-evans/create-pull-request; VERIFIED via gh api on 2026-06-08] |
| `actions/checkout` SHA `df4cb1c069e1874edd31b4311f1884172cec0e10` | already pinned in ci.yml | Checkout for cron workflow | Reuse the same SHA as ci.yml [VERIFIED: .github/workflows/ci.yml:31] |
| `actions/setup-node` SHA `48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e` | already pinned in ci.yml | Node 24 for the refresh step | Reuse the same SHA [VERIFIED: .github/workflows/ci.yml:37] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `peter-evans/create-pull-request` | `gh pr create` shell-script pattern (LiteLLM-style) | LiteLLM ships `gh pr create` with a `GH_TOKEN` secret; bypasses the "Allow Actions to create PRs" repo setting but introduces a long-lived PAT — bad fit with Phase 28's OIDC discipline. peter-evans is purpose-built and the repo setting is one click. [CITED: https://github.com/BerriAI/litellm/blob/main/.github/workflows/auto_update_price_and_context_window.yml] |
| `as const satisfies readonly ModelCapabilityProfile[]` | Plain typed array w/o `as const` | Lose narrowing; `Map` constructor accepts both; cost is zero compile-time guarantees. Recommended pattern is the `as const satisfies` form. |
| `Map` lookup built at module load | Plain object literal | `Map` survives keys that contain `__proto__` / numeric-coercion; safer for arbitrary user input. Module-load build is one-shot O(N); same as lazy. |
| Inline `registry.generated.ts` | External JSON loaded at build time | Locked by ROADMAP success criterion (CONTEXT.md Deferred Ideas: "ROADMAP success criterion locks `registry.generated.ts` (inline TS); decided") |

**Installation:**

No new runtime dependencies. No new dev dependencies. Phase 33 adds only build-time scripts (zero deps) and a GitHub Actions workflow.

**Version verification:**

```bash
# OpenRouter feed shape verified on 2026-06-08 via:
curl -s 'https://openrouter.ai/api/v1/models' | jq '.data | length'  # -> 341
# peter-evans/create-pull-request SHAs verified on 2026-06-08 via:
gh api 'repos/peter-evans/create-pull-request/git/refs/tags/v8.1.1' --jq '.object.sha'  # 5f6978faf089d4d20b00c7766989d076bb2fc7f1
gh api 'repos/peter-evans/create-pull-request/git/refs/tags/v7.0.8' --jq '.object.sha'  # 271a8d0340265f705b14b6d32b9829c1cb33d45e
```

## Architecture Patterns

### Recommended Project Structure

```
packages/lattice/src/capabilities/
├── profile.ts                  # type ModelCapabilityProfile + KnownFailureMode + TrainingClass + ReasoningSurface + ToolCallSurface + RecommendedPromptStrategy + Adapter unions
├── registry.generated.ts       # generated; committed; large inline array; DO NOT EDIT header
├── registry.static.ts          # hand-edited supplemental profiles (Anthropic direct, Gemini direct, xAI direct, LM Studio template)
├── lookup.ts                   # getCapabilityProfile + findCapabilityProfile + variant-suffix stripper
└── index.ts                    # local barrel; re-exported by ../../index.ts

scripts/
├── refresh-model-registry.mjs  # CLI entrypoint: fetch -> transform -> write; supports --check
└── capabilities/
    ├── classifier.mjs          # provider-prefix heuristic + family-substring overrides + failure-mode defaults
    ├── classifier.test.mjs     # vitest unit tests against fixture JSON
    └── __fixtures__/
        └── openrouter-models-snapshot.json  # frozen golden fixture for offline classifier tests

.github/workflows/
└── registry-drift.yml          # weekly cron + workflow_dispatch -> auto-PR on drift
```

### Pattern 1: Inline `as const satisfies` registry with lazy Map builder

**What:** The generated file exports a typed inline array; the lookup module builds a `Map` lazily at first call.

**When to use:** Always for static SDK data of ~200-500 entries. Beyond ~5000 entries, consider splitting per-adapter files; we are nowhere near that.

**Example:**

```typescript
// Source: packages/lattice/src/capabilities/registry.generated.ts
// [DO NOT EDIT — generated by scripts/refresh-model-registry.mjs from OpenRouter feed.
//  Regenerate via `node scripts/refresh-model-registry.mjs`. Drift gated by
//  .github/workflows/registry-drift.yml — run on PR is intentional, not a manual edit.]
import type { ModelCapabilityProfile } from "./profile.js";

export const GENERATED_PROFILES = [
  {
    id: "openai/gpt-oss-120b",
    adapter: "openrouter",
    originFamily: "openai",
    trainingClass: "open_weight_instruct",
    reasoningSurface: "none",
    toolCallSurface: "native_lenient",
    contextWindow: 131072,
    knownFailureModes: ["internal_envelope_leak", "system_prompt_echo", "malformed_tool_arguments"],
    recommendedPromptStrategy: "open_weight",
  },
  // ... 340 more rows ...
] as const satisfies readonly ModelCapabilityProfile[];
```

```typescript
// Source: packages/lattice/src/capabilities/lookup.ts
import type { ModelCapabilityProfile } from "./profile.js";
import { GENERATED_PROFILES } from "./registry.generated.js";
import { STATIC_PROFILES } from "./registry.static.js";

let _lookupCache: Map<string, ModelCapabilityProfile> | undefined;

function getLookupMap(): Map<string, ModelCapabilityProfile> {
  if (_lookupCache === undefined) {
    _lookupCache = new Map();
    for (const p of [...STATIC_PROFILES, ...GENERATED_PROFILES]) {
      _lookupCache.set(`${p.adapter}:${p.id}`, p);
    }
  }
  return _lookupCache;
}

export function getCapabilityProfile(canonicalKey: string): ModelCapabilityProfile | undefined {
  return getLookupMap().get(canonicalKey);
}

// adapter order: direct adapters first, openrouter last — D-10
const ADAPTER_ORDER: ReadonlyArray<ModelCapabilityProfile["adapter"]> = [
  "anthropic", "openai", "gemini", "xai", "openai-compat", "lm-studio", "openrouter",
];

const OPENROUTER_VARIANT_RE = /^[^/]+\/[^/]+:(?:free|thinking)$/;
function stripOpenRouterVariant(id: string): string {
  // Only OpenRouter-shaped ids (vendor/model:variant). Other adapters pass through verbatim.
  return OPENROUTER_VARIANT_RE.test(id) ? id.slice(0, id.lastIndexOf(":")) : id;
}

export function findCapabilityProfile(id: string): ModelCapabilityProfile[] {
  const stripped = stripOpenRouterVariant(id);
  const map = getLookupMap();
  const matches: ModelCapabilityProfile[] = [];
  for (const adapter of ADAPTER_ORDER) {
    const hit = map.get(`${adapter}:${stripped}`);
    if (hit) matches.push(hit);
  }
  return matches;
}
```

### Pattern 2: Generator emits deterministic output

**What:** The generator MUST produce byte-identical output across re-runs (this is the bit-exact diff D-17 depends on). Three rules: sort the input array, never use `Date.now()` in the file body, pin the JSON-stringify shape.

**Sort key:** Sort first by `adapter` (alphabetical), then by `id` (alphabetical). OpenRouter returns models in a non-stable order — likely creation date desc — so the first 30 rows on Mon 06-08 are different from the first 30 rows on Mon 06-15 even though the model set hasn't changed. Sort eliminates this drift class.

**Header:** Include a fixed header that does NOT contain a timestamp:

```typescript
// SCAFFOLD: file header for registry.generated.ts (NO timestamps)
// AUTO-GENERATED FILE — DO NOT EDIT.
// Source: scripts/refresh-model-registry.mjs
// Upstream: https://openrouter.ai/api/v1/models
// Regenerate with: node scripts/refresh-model-registry.mjs
// CI drift gate: .github/workflows/registry-drift.yml (weekly cron)
```

**Deterministic JSON serialization:** Use a custom stringifier that emits keys in a fixed order — never rely on `JSON.stringify` key order in regenerated objects. The simplest pattern is to construct each row literal with the keys spelled out in source order in the generator.

**Trailing newline:** Always emit a final `\n`. Bit-exact diff means the difference between EOF-with-newline and EOF-without-newline is a CI failure; force the convention.

### Pattern 3: Generator `--check` mode mirrors `verify-rename.mjs`

**What:** `node scripts/refresh-model-registry.mjs --check` regenerates the file to an in-memory string and diffs against the committed file. Non-zero exit on drift. Exit 0 with WARN on OpenRouter fetch failure (D-18).

**Example shape (build on `scripts/verify-rename.mjs`):**

```javascript
const args = new Set(process.argv.slice(2));
const checkMode = args.has("--check");

let upstream;
try {
  upstream = await fetchOpenRouterModels();  // 3-retry exponential backoff
} catch (err) {
  if (checkMode) {
    console.warn(`[refresh-model-registry] WARN — upstream fetch failed: ${err?.message ?? err}. Skipping drift check.`);
    process.exit(0);  // D-18: skip + warn, never fail PR on upstream outage
  }
  console.error(`[refresh-model-registry] FAIL — upstream fetch failed: ${err?.message ?? err}`);
  process.exit(1);
}

const generated = renderRegistry(classify(upstream));  // pure
const committed = await readFile(REGISTRY_PATH, "utf8").catch(() => "");

if (checkMode) {
  if (generated !== committed) {
    console.error("[refresh-model-registry] FAIL — registry.generated.ts is stale.");
    console.error("[refresh-model-registry] Regenerate locally with: node scripts/refresh-model-registry.mjs");
    console.error(`[refresh-model-registry] Diff (first 80 lines):`);
    printDiff(committed, generated);
    process.exit(1);
  }
  console.log("[refresh-model-registry] OK — registry matches upstream.");
  return;
}

await writeFile(REGISTRY_PATH, generated, "utf8");
console.log(`[refresh-model-registry] OK — wrote ${REGISTRY_PATH} (${generated.length} bytes).`);
```

### Anti-Patterns to Avoid

- **Embedding a build-time timestamp in `registry.generated.ts`** — guarantees diff failure on every run. Locked: no timestamp.
- **Using `JSON.stringify(profile)` per row** — key order is implementation-defined in some Node versions for object literals containing numeric-looking keys; safe in modern Node but the explicit-keys-in-template approach is more durable.
- **Calling `fetch()` from inside `packages/lattice/src/capabilities/`** — the runtime registry must be 100% static. Network is build-time only. Verified by `tsdown treeshake: true` not pulling in fetch-related code.
- **Letting the classifier import from `packages/lattice/src/`** — D-02 locks the classifier as build-time only with zero Lattice runtime imports. The classifier emits plain objects; the generator wraps them with the type annotation.
- **Using `eval` or dynamic property access on the lookup map** — defeats tsdown tree-shaking and breaks `noUncheckedIndexedAccess`. Stick to `Map.get`.
- **Hand-editing `registry.generated.ts`** — the file must round-trip through the generator. The drift gate catches this, but the file header announces the rule.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP retry with exponential backoff | Custom retry wrapper | A tiny inline 3-iteration retry with `setTimeout` (~15 LOC), or `fetch-retry` (NOT — zero-deps rule) | We can't import a runtime lib in `scripts/`. A tiny inline retry is faster to write and easier to audit than any library. |
| YAML parser for workflow file | Custom YAML reader | The `registry-drift.yml` is hand-edited by humans; no parser needed. | `check-workflow-safety.mjs` deliberately uses string scanning over YAML parsing (verified line 30 of that file). Same call here: the drift workflow has no auto-modified YAML. |
| Diff library for `--check` mode output | Wire `diff` from npm | Print line-counts of additions/removals + suggest `node scripts/refresh-model-registry.mjs` to regenerate; full diff lives in `git diff` after regen | Better DX: the developer's tool of choice is `git diff`, not whatever inline diff we'd render. Keep the script's output a one-liner pointer. |
| Custom rate-limit-respecting fetch wrapper | Implement Retry-After parsing | OpenRouter doesn't rate-limit unauth GET on `/models` (verified live: 4 consecutive requests, all 200, no 429). Just retry on 5xx and network errors. | Over-engineering. The endpoint is a static-ish file served via Cloudflare. If it 429s in the future, add `Retry-After` handling then. |

**Key insight:** Phase 33 is mostly mechanical (fetch + transform + write + diff + gate). The temptation will be to reach for an HTTP client library or a snapshot-test framework. Resist both. Lattice's `scripts/` invariant is zero-deps; the diff happens via byte-string compare and `git diff` post-regen.

## Runtime State Inventory

Phase 33 is greenfield: a new module, a new generated file, a new workflow. Skipped per researcher instructions for non-rename phases.

## Common Pitfalls

### Pitfall 1: OpenRouter feed reorders rows daily

**What goes wrong:** The OpenRouter feed appears to return models in a non-deterministic order (likely creation date desc with insertion-time-based ties). On 2026-06-08 the first 5 models include `nvidia/nemotron-3.5-content-safety:free`, `qwen/qwen3.7-plus`, `minimax/minimax-m3` — none of which existed two months ago. A regeneration tomorrow may surface a different first-5 even with no underlying model change.
**Why it happens:** OpenRouter never promised a stable ordering. Their `created` timestamp suggests they sort by recency.
**How to avoid:** Sort the array in the generator before emitting — by `adapter` then `id`, alphabetical. Verify the generator output is byte-identical on two back-to-back local runs as part of Wave 0.
**Warning signs:** First CI drift run after merging mysteriously fails despite no upstream change. Cause = generator forgot to sort.

### Pitfall 2: `context_length` mismatch between top-level and `top_provider`

**What goes wrong:** 50 out of 341 models (~15%) have a top-level `context_length` that does NOT equal `top_provider.context_length`. The top-level is the model's published maximum; `top_provider.context_length` is what OpenRouter's routing infrastructure actually offers (often smaller due to provider tier policies). If you pick the wrong one your `contextWindow` will be aspirational, not actual.
**Why it happens:** OpenRouter exposes both because consumers need both. The model card says 1M tokens; the OpenRouter free tier might cap at 64K.
**How to avoid:** Document the choice in `classifier.mjs` and apply consistently. Recommendation: `top_provider.context_length ?? context_length` — what OpenRouter will actually accept on a request. Cite the decision in a JSDoc block on the classifier function.
**Warning signs:** Consumer issue: "Lattice said 1M but the request 400s at 65K tokens."

### Pitfall 3: `~` tilde-prefixed "latest" aliases pollute the registry

**What goes wrong:** OpenRouter exposes 8 alias entries with a leading `~`: `~anthropic/claude-sonnet-latest`, `~openai/gpt-latest`, etc. These point at whatever the provider's currently-latest model is. Their `trainingClass` will shift over time. If the classifier blindly emits a profile for them, you'll get phantom drift every time the underlying alias points to a new model.
**Why it happens:** OpenRouter publishes these as a developer convenience, not as canonical model identifiers.
**How to avoid:** In the classifier, skip ids starting with `~` from the OpenRouter snapshot. Alternatively, profile them but flag the assumption — recommendation: **skip them.** A user querying `getCapabilityProfile("openrouter:~anthropic/claude-sonnet-latest")` should get `undefined`, prompting them to resolve to the canonical id first.
**Warning signs:** Drift PR opens weekly because a `~latest` alias' trainingClass / failure-modes shifted.

### Pitfall 4: Generator includes free / thinking variants but classifier sees them as new families

**What goes wrong:** The feed has 23 `:free` variants and 1 `:thinking` variant. If the classifier does substring-match on the full id without stripping the variant suffix first, `openai/gpt-oss-120b:free` won't hit the `gpt-oss` override. Both `openai/gpt-oss-120b` and `openai/gpt-oss-120b:free` need the same trainingClass `open_weight_instruct` per CONTEXT.md.
**Why it happens:** Easy to forget which side strips the variant.
**How to avoid:** The classifier strips OpenRouter variants BEFORE classifying. Generator emits TWO profiles for `gpt-oss-120b` (the canonical and the `:free` variant) but the trainingClass field is the same for both. Bonus: the `findCapabilityProfile` runtime stripper from D-11 is symmetric and can be unit-tested with the case-study id pair.
**Warning signs:** Case-study test for `openrouter:openai/gpt-oss-120b:free` fails because the profile says `frontier_rlhf` (default OpenAI prefix). This is the exact failure the success criterion forbids; catch in Wave 0.

### Pitfall 5: Drift workflow opens duplicate PRs

**What goes wrong:** Without a fixed `branch:` name on `peter-evans/create-pull-request`, every weekly run opens a new PR. The first week you get `refresh/model-registry`, the next week `refresh/model-registry-1`, and so on. Maintainer wakes up Monday with 6 open refresh PRs.
**Why it happens:** Default action behavior is to create unique branches per run. The action does support a fixed branch (`branch:` input) which updates the existing PR in-place if the diff hasn't been merged.
**How to avoid:** Set `branch: chore/refresh-model-registry` (fixed) so re-runs update the open PR rather than spawning siblings. Pin `delete-branch: true` so merged PRs cleanly remove the branch.
**Warning signs:** First weekend after enabling the cron, the PR list is cluttered with `chore/refresh-model-registry-N` siblings.

### Pitfall 6: tsdown tree-shaking dies on the large literal

**What goes wrong:** A consumer that imports only `getCapabilityProfile` from `@full-self-browsing/lattice` ends up with the entire 341-row inline array in their bundle. Total bundle size jumps by ~93 KB raw / ~6 KB gzipped.
**Why it happens:** Tree-shaking works for unused functions, not for data that the function depends on. `getCapabilityProfile` references `GENERATED_PROFILES`, so any import of the function pulls the whole array.
**How to avoid:** This is FINE. The registry is purpose-built static data; consumers querying it WANT the whole thing. The package is `"sideEffects": false` in package.json (verified line 19) so tsdown won't pull additional state. The ~93 KB raw / ~6 KB gzipped is below the implicit ~100 KB advisory threshold from CONTEXT.md (line 155).
**Warning signs:** A consumer complains about bundle size growth. Response: this is intentional; the registry IS what they're paying for. Provide a per-adapter import alternative in v1.4 if it bites.

## Code Examples

### Example: `scripts/refresh-model-registry.mjs` skeleton

```javascript
#!/usr/bin/env node
/**
 * Phase 33 — D-16 / D-17 / D-18 — Build-time OpenRouter snapshot generator.
 *
 * Fetches https://openrouter.ai/api/v1/models, classifies each entry via
 * scripts/capabilities/classifier.mjs, sorts by (adapter, id), and writes
 * packages/lattice/src/capabilities/registry.generated.ts.
 *
 * Modes:
 *   default          — write the file
 *   --check          — diff against committed file; exit 1 on drift;
 *                      exit 0 with WARN on upstream fetch failure (D-18)
 *
 * Dependencies: zero external npm packages. node: built-ins only.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { classify, FAILURE_MODE_DEFAULTS } from "./capabilities/classifier.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const REGISTRY_PATH = join(repoRoot, "packages/lattice/src/capabilities/registry.generated.ts");
const UPSTREAM_URL = "https://openrouter.ai/api/v1/models";

const HEADER = `// AUTO-GENERATED FILE — DO NOT EDIT.
// Source: scripts/refresh-model-registry.mjs
// Upstream: https://openrouter.ai/api/v1/models
// Regenerate with: node scripts/refresh-model-registry.mjs
// CI drift gate: .github/workflows/registry-drift.yml (weekly cron)
import type { ModelCapabilityProfile } from "./profile.js";

export const GENERATED_PROFILES = [
`;

const FOOTER = `] as const satisfies readonly ModelCapabilityProfile[];
`;

async function fetchWithRetry(url, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const resp = await fetch(url, { headers: { Accept: "application/json" } });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      return await resp.json();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        const backoffMs = 500 * Math.pow(2, i);
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
  }
  throw lastErr;
}

function renderRow(profile) {
  // Explicit key order — guarantees byte-stable output. Do not change.
  return `  {
    id: ${JSON.stringify(profile.id)},
    adapter: ${JSON.stringify(profile.adapter)},
    originFamily: ${JSON.stringify(profile.originFamily)},
    trainingClass: ${JSON.stringify(profile.trainingClass)},
    reasoningSurface: ${JSON.stringify(profile.reasoningSurface)},
    toolCallSurface: ${JSON.stringify(profile.toolCallSurface)},
    contextWindow: ${profile.contextWindow},
    knownFailureModes: [${profile.knownFailureModes.map((m) => JSON.stringify(m)).join(", ")}],
    recommendedPromptStrategy: ${JSON.stringify(profile.recommendedPromptStrategy)},
  },
`;
}

function render(profiles) {
  const sorted = [...profiles].sort((a, b) => {
    if (a.adapter !== b.adapter) return a.adapter.localeCompare(b.adapter);
    return a.id.localeCompare(b.id);
  });
  return HEADER + sorted.map(renderRow).join("") + FOOTER;
}

function transformFeed(rawFeed) {
  const profiles = [];
  for (const raw of rawFeed.data) {
    if (raw.id.startsWith("~")) continue;  // skip ~latest aliases (Pitfall 3)
    const classification = classify(raw);  // returns trainingClass, originFamily, etc.
    profiles.push({
      id: raw.id,
      adapter: "openrouter",
      originFamily: classification.originFamily,
      trainingClass: classification.trainingClass,
      reasoningSurface: classification.reasoningSurface,
      toolCallSurface: classification.toolCallSurface,
      // D-of-current-research: prefer top_provider when present (Pitfall 2)
      contextWindow: raw.top_provider?.context_length ?? raw.context_length,
      knownFailureModes: classification.knownFailureModes,
      recommendedPromptStrategy: classification.recommendedPromptStrategy,
    });
  }
  return profiles;
}

async function main() {
  const checkMode = process.argv.includes("--check");
  let feed;
  try {
    feed = await fetchWithRetry(UPSTREAM_URL);
  } catch (err) {
    const msg = err?.message ?? String(err);
    if (checkMode) {
      console.warn(`[refresh-model-registry] WARN — upstream fetch failed (${msg}). Skipping drift check (D-18).`);
      return;
    }
    console.error(`[refresh-model-registry] FAIL — upstream fetch failed: ${msg}`);
    process.exit(1);
  }
  const generated = render(transformFeed(feed));
  if (checkMode) {
    const committed = await readFile(REGISTRY_PATH, "utf8").catch(() => "");
    if (generated !== committed) {
      console.error("[refresh-model-registry] FAIL — registry.generated.ts is stale.");
      console.error("[refresh-model-registry] Regenerate with: node scripts/refresh-model-registry.mjs");
      console.error(`[refresh-model-registry] (Generated ${generated.length} bytes vs committed ${committed.length} bytes.)`);
      process.exit(1);
    }
    console.log("[refresh-model-registry] OK — registry matches upstream.");
    return;
  }
  await writeFile(REGISTRY_PATH, generated, "utf8");
  console.log(`[refresh-model-registry] OK — wrote ${REGISTRY_PATH} (${generated.length} bytes).`);
}

main().catch((err) => {
  console.error(`[refresh-model-registry] FAIL — unexpected: ${(err && err.stack) || String(err)}`);
  process.exit(1);
});
```

### Example: `scripts/capabilities/classifier.mjs` skeleton

```javascript
/**
 * Phase 33 — D-01 / D-03 / D-04 / D-14 — Build-time training-class classifier.
 *
 * Hybrid: provider-prefix heuristic first, then family-substring overrides,
 * then unknown-default. Permissive default + visible WARN per D-04.
 *
 * Build-time only. Zero Lattice runtime imports.
 */

export const FAILURE_MODE_DEFAULTS = {
  frontier_rlhf: [],
  mid_tier_rlhf: ["system_prompt_echo"],
  open_weight_instruct: ["internal_envelope_leak", "system_prompt_echo", "malformed_tool_arguments"],
  open_weight_base: ["internal_envelope_leak", "system_prompt_echo", "malformed_tool_arguments", "hallucinated_tool_name", "premature_termination"],
  local_quantized: ["internal_envelope_leak", "system_prompt_echo", "template_artifact_leak", "malformed_tool_arguments", "premature_termination"],
};

// Provider-prefix heuristic (D-01). Default trainingClass per provider.
// Verified against OpenRouter feed 2026-06-08: 57 distinct prefixes, top
// 10 cover ~80% of models.
const PROVIDER_PREFIX_RULES = {
  "openai":      { trainingClass: "frontier_rlhf",        originFamily: "openai" },
  "anthropic":   { trainingClass: "frontier_rlhf",        originFamily: "anthropic" },
  "google":      { trainingClass: "frontier_rlhf",        originFamily: "google" },
  "x-ai":        { trainingClass: "frontier_rlhf",        originFamily: "xai" },
  "meta-llama":  { trainingClass: "open_weight_instruct", originFamily: "meta" },
  "mistralai":   { trainingClass: "open_weight_instruct", originFamily: "mistral" },
  "qwen":        { trainingClass: "open_weight_instruct", originFamily: "qwen" },
  "deepseek":    { trainingClass: "open_weight_instruct", originFamily: "deepseek" },
  "nvidia":      { trainingClass: "open_weight_instruct", originFamily: "nvidia" },
  "moonshotai":  { trainingClass: "open_weight_instruct", originFamily: "moonshot" },
  "minimax":     { trainingClass: "open_weight_instruct", originFamily: "minimax" },
  "z-ai":        { trainingClass: "open_weight_instruct", originFamily: "zai" },
  "bytedance-seed": { trainingClass: "open_weight_instruct", originFamily: "bytedance" },
  "amazon":      { trainingClass: "frontier_rlhf",        originFamily: "amazon" },
  "openrouter":  { trainingClass: "open_weight_instruct", originFamily: "openrouter" },
  // ... extend as needed; unknown prefixes hit FALLBACK below ...
};

const FALLBACK = { trainingClass: "open_weight_instruct", originFamily: "unknown" };

// Family-substring overrides (D-03). Match against the id AFTER stripping
// provider prefix and variant suffix (`:free`, `:thinking`). Order matters —
// first hit wins. Keep this list to ~20 entries; broader rules go in the
// prefix heuristic above.
const FAMILY_OVERRIDES = [
  // Anthropic mid-tier
  { match: "claude-haiku", trainingClass: "mid_tier_rlhf" },
  { match: "claude-3-haiku", trainingClass: "mid_tier_rlhf" },
  { match: "claude-3.5-haiku", trainingClass: "mid_tier_rlhf" },
  // OpenAI reasoning + open-weight
  { match: "o1", trainingClass: "frontier_rlhf", reasoningSurface: "hidden_cot" },
  { match: "o3", trainingClass: "frontier_rlhf", reasoningSurface: "hidden_cot" },
  { match: "gpt-oss", trainingClass: "open_weight_instruct" },
  // Gemini Flash mid-tier
  { match: "gemini-flash", trainingClass: "mid_tier_rlhf" },
  { match: "gemini-2.0-flash", trainingClass: "frontier_rlhf" },
  // Grok mid-tier
  { match: "grok-mini", trainingClass: "mid_tier_rlhf" },
  // Reasoning open-weight
  { match: "deepseek-r1", reasoningSurface: "inlined_tags", knownFailureModesAdd: ["reasoning_tag_leak"] },
  { match: "qwen-qwq",  reasoningSurface: "inlined_tags", knownFailureModesAdd: ["reasoning_tag_leak"] },
  // Llama Guard (safety)
  { match: "llama-guard", trainingClass: "open_weight_instruct" },
];

const PROMPT_STRATEGY_BY_CLASS = {
  frontier_rlhf:        "frontier",
  mid_tier_rlhf:        "mid_tier",
  open_weight_instruct: "open_weight",
  open_weight_base:     "open_weight",
  local_quantized:      "local",
};

function stripVariant(id) {
  // OpenRouter variants: vendor/model:free | vendor/model:thinking
  const m = id.match(/^([^/]+\/[^/]+):(?:free|thinking)$/);
  return m ? m[1] : id;
}

export function classify(rawEntry) {
  const id = rawEntry.id;
  const [prefix, ...rest] = id.split("/");
  const after = rest.join("/");
  const stripped = stripVariant(id).split("/").slice(1).join("/");

  const prefixRule = PROVIDER_PREFIX_RULES[prefix];
  let trainingClass = prefixRule?.trainingClass ?? FALLBACK.trainingClass;
  let originFamily  = prefixRule?.originFamily  ?? prefix;
  let reasoningSurface = "none";
  let toolCallSurface  = inferToolCallSurface(rawEntry);
  let extraFailureModes = [];

  for (const override of FAMILY_OVERRIDES) {
    if (stripped.includes(override.match)) {
      if (override.trainingClass) trainingClass = override.trainingClass;
      if (override.reasoningSurface) reasoningSurface = override.reasoningSurface;
      if (override.knownFailureModesAdd) extraFailureModes = override.knownFailureModesAdd;
      break;  // first hit wins
    }
  }
  if (!prefixRule) {
    console.warn(`[classifier] WARN — unknown prefix '${prefix}' for id '${id}'. Defaulting to ${FALLBACK.trainingClass}.`);
  }
  const baseFailureModes = FAILURE_MODE_DEFAULTS[trainingClass] ?? [];
  const knownFailureModes = [...new Set([...baseFailureModes, ...extraFailureModes])];
  return {
    originFamily,
    trainingClass,
    reasoningSurface,
    toolCallSurface,
    knownFailureModes,
    recommendedPromptStrategy: PROMPT_STRATEGY_BY_CLASS[trainingClass],
  };
}

function inferToolCallSurface(raw) {
  // OpenRouter exposes supported_parameters — if "tools" appears the model
  // ships a tool-call surface. Frontier providers ship "strict"; open-weight
  // ships "lenient". For Phase 33 just classify by ecosystem.
  const params = raw.supported_parameters ?? [];
  if (!params.includes("tools")) return "none";
  if (params.includes("structured_outputs")) return "native_strict";
  return "native_lenient";
}
```

### Example: `.github/workflows/registry-drift.yml` skeleton

```yaml
# Lattice Registry Drift Workflow
# Phase 33 — D-19. Weekly cron + manual dispatch. Auto-opens a refresh PR
# when the OpenRouter snapshot diverges from the committed registry.
# PR-time ci.yml does NOT call OpenRouter (network-free PR loop).
name: registry-drift

on:
  schedule:
    - cron: '0 6 * * 1'  # Monday 06:00 UTC
  workflow_dispatch:

permissions:
  contents: read

jobs:
  refresh:
    name: refresh
    runs-on: ubuntu-latest
    # Job-scoped permissions — needs to push branch + open PR + read repo.
    permissions:
      contents: write
      pull-requests: write
    steps:
      - name: Checkout repository
        uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10  # v4.x — same SHA as ci.yml

      - name: Set up pnpm
        uses: pnpm/action-setup@0e279bb959325dab635dd2c09392533439d90093

      - name: Set up Node.js
        uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e
        with:
          node-version: '24'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Regenerate model registry
        run: node scripts/refresh-model-registry.mjs

      - name: Open refresh PR
        # SHA pin per CI-02. v8.1.1.
        uses: peter-evans/create-pull-request@5f6978faf089d4d20b00c7766989d076bb2fc7f1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          branch: chore/refresh-model-registry
          delete-branch: true
          base: main
          commit-message: 'chore(capabilities): refresh model registry from OpenRouter feed'
          title: 'chore(capabilities): refresh model registry from OpenRouter feed'
          body: |
            Automated weekly refresh of `packages/lattice/src/capabilities/registry.generated.ts`.

            Generated by `.github/workflows/registry-drift.yml` from the live OpenRouter
            `/api/v1/models` feed via `scripts/refresh-model-registry.mjs`.

            Review checklist:
            - [ ] Any new model class warnings in the workflow logs (unknown prefixes)?
            - [ ] Diff matches expected upstream changes (new models, retired models, context window adjustments)?
            - [ ] No unintended schema drift (extra fields, missing fields)?
          labels: |
            automated
            capabilities
```

### Example: classifier vitest test pattern (Q7)

```typescript
// packages/lattice/test/capabilities-classifier.test.ts
// Note: classifier itself is .mjs in scripts/; this test exercises it via
// dynamic import. The fixture is a frozen subset of the OpenRouter feed
// captured at phase-33 authoring time.
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// @ts-expect-error — classifier is .mjs, dynamic import returns untyped module
const { classify } = await import("../../../scripts/capabilities/classifier.mjs");

describe("Phase 33 classifier", () => {
  it("classifies gpt-oss-120b as open_weight_instruct with internal_envelope_leak", () => {
    const result = classify({
      id: "openai/gpt-oss-120b:free",
      supported_parameters: ["tools", "tool_choice"],
    });
    expect(result.trainingClass).toBe("open_weight_instruct");
    expect(result.knownFailureModes).toContain("internal_envelope_leak");
    expect(result.recommendedPromptStrategy).toBe("open_weight");
  });

  it("classifies claude-3-haiku as mid_tier_rlhf via family override", () => {
    const result = classify({
      id: "anthropic/claude-3-haiku",
      supported_parameters: ["tools", "tool_choice"],
    });
    expect(result.trainingClass).toBe("mid_tier_rlhf");
    expect(result.knownFailureModes).toContain("system_prompt_echo");
  });

  it("classifies deepseek-r1 with reasoning_tag_leak", () => {
    const result = classify({
      id: "deepseek/deepseek-r1",
      supported_parameters: ["tools", "reasoning"],
    });
    expect(result.reasoningSurface).toBe("inlined_tags");
    expect(result.knownFailureModes).toContain("reasoning_tag_leak");
  });

  it("falls back to open_weight_instruct for unknown prefixes", () => {
    const result = classify({
      id: "futurelab/some-new-model",
      supported_parameters: [],
    });
    expect(result.trainingClass).toBe("open_weight_instruct");
    expect(result.toolCallSurface).toBe("none");
  });

  it("matches golden snapshot for the frozen fixture", async () => {
    const fixture = JSON.parse(
      await readFile(resolve(__dirname, "../../../scripts/capabilities/__fixtures__/openrouter-models-snapshot.json"), "utf8"),
    );
    const classified = fixture.data.slice(0, 30).map(classify);
    expect(classified).toMatchSnapshot();
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Hand-maintained model list inline in adapter code | Centralized typed registry, build-time generated from a single upstream | LiteLLM ~2024; Vercel AI Gateway 2025 | Single source of truth; one PR per upstream change instead of N |
| Runtime fetch of capability data on first request | Build-time bake-in + scheduled refresh PR | Vercel AI Gateway's 5-min cache, then LiteLLM's static JSON | Faster cold start; offline-safe; auditable diff per refresh |
| Mutable model registry (consumer can register additions) | Frozen, typed, regenerate-only registry | Lattice's design choice for v1.3 | Trades flexibility for typed guarantees; consumer adds future v1.4 hooks if needed |

**Deprecated/outdated:**
- Vercel AI SDK's `experimental_createProviderRegistry` (mentioned in some 2025 tutorials) — superseded by `createProviderRegistry` in AI SDK v6+ [CITED: https://ai-sdk.dev/docs/introduction]
- TSLint `file-header` rule — TSLint deprecated; current recommendation for "DO NOT EDIT" headers is plain string in a file header comment, no lint rule needed [CITED: https://palantir.github.io/tslint/rules/file-header/]

## Assumptions Log

> The following claims could not be verified to HIGH confidence in this research pass. The
> planner and discuss-phase should treat them as items worth confirming before committing
> to PLAN.md.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `top_provider.context_length ?? context_length` is the right precedence for the registry's `contextWindow` | Pitfall 2 / Q1 | Consumer requests fail at the OpenRouter routing layer despite the registry reporting the published max; mitigation: document the choice and add a Pitfall 2 test |
| A2 | Skipping `~`-prefixed aliases is the right call (vs profiling them with a marker) | Pitfall 3 | Consumers that genuinely rely on the alias get `undefined` and have to canonicalize first; mitigation: document in the lookup function's JSDoc |
| A3 | `openrouter:` adapter prefix is sufficient — we don't need a separate `provider_id` field tracking the actual upstream (Together, Fireworks, etc.) that OpenRouter routes to | D-08 / Q5 | Phase 34 quirk-flag work may want the upstream provider; if so, the registry needs another field. Mitigation: surface to planner if Phase 34 plans surface this need |
| A4 | `peter-evans/create-pull-request@v8.1.1` is the right pin (vs v7.0.8) | §Standard Stack | v8 dropped Node 16 runner support, requires Node 20+; Lattice CI runs Node 24, so v8 is the safer choice; mitigation: doc rationale in registry-drift.yml |
| A5 | The 7-mode `KnownFailureMode` vocabulary covers v1.3.0; v1.4+ may add modes | D-12 | Adding a mode in v1.4 is a typed breaking change (CONTEXT.md acknowledges this); mitigation: changelog flag |
| A6 | The classifier override table at ~20 entries covers ~90% of misclassifications | D-03 | If the long tail is fatter, we'll see many unknown WARNs in the first refresh — acceptable, signals where to extend the table |
| A7 | LM Studio "local-quantized template" can be ONE generic profile with consumer-parameterized contextWindow (vs N templates per common model) | Q8 | A consumer expecting per-model profiles for their local Llama3 8B will get the generic template; mitigation: document the policy + extension hook in Phase 34 if surfaced |

## Open Questions

1. **Does the registry need a hashable revision marker?**
   - What we know: The case-study (`session_1780792387779`) is reproducible if Phase 36's sanitizer test asserts against a frozen snapshot of the gpt-oss-120b profile. If the snapshot changes silently between Lattice versions, the test starts failing for the wrong reason.
   - What's unclear: Should `getCapabilityProfile` expose the registry version (e.g., a const `REGISTRY_REVISION` derived from the snapshot hash)? Phase 38 receipts could include it for downstream telemetry.
   - Recommendation: Defer to Phase 38. Phase 33 ships the registry; Phase 38 decides receipt v1.2 fields.

2. **Should `recommendedPromptStrategy` be its own enum or share `trainingClass`?**
   - What we know: The research doc proposes 5 strategies (`'frontier' | 'mid_tier' | 'open_weight' | 'reasoning' | 'local'`) for Phase 35.
   - What's unclear: `trainingClass` is `'frontier_rlhf' | 'mid_tier_rlhf' | 'open_weight_instruct' | 'open_weight_base' | 'local_quantized'`. These five map 1:1 onto the strategies BUT one is more granular. Two open-weight classes (`open_weight_instruct` + `open_weight_base`) both map to strategy `open_weight`; the `reasoning` strategy doesn't have a trainingClass at all (orthogonal to lineage).
   - Recommendation: **Two separate enums.** `trainingClass` is the lineage taxonomy (5 strings); `recommendedPromptStrategy` is the prompt-tuning bucket (5 strings, only 3 of which overlap with trainingClass identifiers). Phase 35 dispatches on `recommendedPromptStrategy`; receipts carry `trainingClass`. The classifier maps trainingClass + reasoningSurface to recommendedPromptStrategy via a small lookup table (e.g., `reasoningSurface === 'hidden_cot' || 'inlined_tags' → 'reasoning'`).

3. **Do we need a `findCapabilityProfile` overload that takes adapter as a parameter?**
   - What we know: D-10 specifies `findCapabilityProfile(id: string): ModelCapabilityProfile[]` — returns all matches.
   - What's unclear: Consumers who already know the adapter would prefer the strict lookup. The strict is `getCapabilityProfile("openrouter:openai/gpt-4o")`. The fuzzy is `findCapabilityProfile("openai/gpt-4o")` -> [openrouter profile, openai profile].
   - Recommendation: Ship the two functions as specified in CONTEXT.md. No overload — the strict form already serves the "I know the adapter" case via the canonical-key syntax.

4. **Should the classifier emit a JSON sidecar of its decisions for review?**
   - What we know: The drift PR body needs to explain WHY a row changed.
   - What's unclear: We could write a tiny `registry.audit.json` alongside `registry.generated.ts` carrying the per-id explanation (`{ "openai/gpt-oss-120b": { "matched_override": "gpt-oss" } }`). Would help review but adds a second drift surface.
   - Recommendation: SKIP for v1.3.0. The drift PR diff itself is the audit log; a second sidecar doubles the maintenance and adds drift potential.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| OpenRouter `/api/v1/models` endpoint | Generator | YES (verified 2026-06-08) | n/a — versionless | Skip + WARN (D-18); use last-known committed snapshot |
| Node `fetch` (built-in) | Generator | YES | Node 24 | — |
| `pnpm` 10.33 | Workflow steps | YES | per Phase 24 | — |
| GitHub Actions `peter-evans/create-pull-request` | Drift workflow | YES | v8.1.1 SHA `5f6978faf089d4d20b00c7766989d076bb2fc7f1` | LiteLLM-style `gh pr create` (rejected per §Standard Stack Alternatives) |
| Repo setting: "Allow GitHub Actions to create and approve pull requests" | Drift workflow auto-PR | UNKNOWN — repo-level setting; planner must verify | n/a | If disabled, the workflow fails at the create-PR step with a known error message; fallback is to enable the setting OR ship a workflow-scoped fine-grained PAT |

**Missing dependencies with no fallback:**
- None that block Phase 33 implementation.

**Missing dependencies with fallback:**
- OpenRouter outage: D-18 covers this (skip + WARN in `--check` mode).

**Action item for the planner:** Verify the repo-level setting "Allow GitHub Actions to create and approve pull requests" is enabled in the `fullselfbrowsing/Lattice` repo Settings -> Actions -> General -> Workflow permissions. If not enabled, either flip it (preferred) or fall back to a `GH_TOKEN` PAT (avoid; adds a long-lived secret). [CITED: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository]

## MUST-do Dimensions for the Plan (Q11)

Per PKG-01/INDEX-01 discipline, every new public export lands in `packages/lattice/src/index.ts`. Enumerated:

**New types (re-exported as `type` from index.ts):**
- `ModelCapabilityProfile` — the main interface
- `KnownFailureMode` — closed string-literal union (7 members per D-12)
- `TrainingClass` — closed string-literal union (5 members)
- `ReasoningSurface` — closed string-literal union (5 members per research doc Axis B)
- `ToolCallSurface` — closed string-literal union (5 members per research doc Axis C)
- `RecommendedPromptStrategy` — closed string-literal union (5 members)
- `CapabilityAdapter` — closed string-literal union (the 7 Lattice adapters per D-06)

**New functions (re-exported as values from index.ts):**
- `getCapabilityProfile(canonicalKey: string): ModelCapabilityProfile | undefined` — D-09
- `findCapabilityProfile(id: string): ModelCapabilityProfile[]` — D-10

**Optional but recommended exports:**
- `ALL_KNOWN_FAILURE_MODES: readonly KnownFailureMode[]` — useful for exhaustive iteration; not breaking to add
- `ALL_TRAINING_CLASSES: readonly TrainingClass[]` — same rationale
- A pure helper `stripOpenRouterVariant(id: string): string` (named export) — Phase 34 and 36 may want it; advisable to export

**Not exported (build-time only):**
- The classifier module
- The generator script
- The fixture JSON

**Required tsd type-level tests (per packages/lattice/test-d/):**
```typescript
import { expectType } from "tsd";
import { getCapabilityProfile, type ModelCapabilityProfile } from "..";

const result = getCapabilityProfile("openrouter:openai/gpt-oss-120b");
expectType<ModelCapabilityProfile | undefined>(result);

// Exhaustiveness check for KnownFailureMode (will fail to compile if a mode is added without updating the switch)
import type { KnownFailureMode } from "..";
function check(m: KnownFailureMode): "covered" {
  switch (m) {
    case "internal_envelope_leak":
    case "reasoning_tag_leak":
    case "system_prompt_echo":
    case "template_artifact_leak":
    case "hallucinated_tool_name":
    case "malformed_tool_arguments":
    case "premature_termination":
      return "covered";
  }
}
expectType<"covered">(check("internal_envelope_leak"));
```

## Tarball Impact (Q10)

| Surface | Size (raw) | Size (gzipped) |
|---------|-----------|---------------|
| Estimated `registry.generated.ts` (341 OpenRouter rows + ~5 static profiles, inline) | ~93 KB | ~4-6 KB |
| Current `@full-self-browsing/lattice@1.3.0-rc.0` published unpacked size | 685,934 bytes (~670 KB) | n/a (npm reports `dist.unpackedSize` only) |
| Estimated new unpacked size after Phase 33 | ~780 KB | n/a |

**Verdict:** Below the implicit ~100 KB-of-registry-file advisory threshold in CONTEXT.md line 155. The CI tarball-leak gate from Phase 24 (`scripts/check-tarball-leak.mjs`) is unaffected — it scans for stale names, not file sizes.

**Source for current tarball size:**
```bash
npm view @full-self-browsing/lattice@1.3.0-rc.0 dist.unpackedSize
# -> 685934
```
[VERIFIED: live npm registry probe, 2026-06-08]

## Validation Architecture (workflow.nyquist_validation: false)

`workflow.nyquist_validation` is explicitly `false` in `.planning/config.json` (verified). Skipping Validation Architecture per researcher instructions.

## Security Domain

`security_enforcement` is not present in `.planning/config.json` (treat as default; the planning surface for Lattice already includes a CRYPTO-01 hardening discipline). Phase 33 is a typed-data-and-codegen phase with no auth surface, no input validation surface beyond the OpenRouter response, and no secrets handling. Applicable lightweight checks:

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | YES — OpenRouter response is parsed JSON, untrusted upstream | Zod schema check OR runtime type-guards in the generator before classification; reject rows missing `id` (zero deps; tiny custom validator) |
| V14.2 Supply Chain | YES — every new GitHub Action MUST be SHA-pinned | Per CI-02 / D-12; verified scaffolding in §Standard Stack |
| V11.1 Business Logic | YES — drift gate is the integrity control for the registry surface | Bit-exact diff (D-17); rejects undocumented mutation |

### Known Threat Patterns for build-time codegen

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Compromised upstream feed injects malicious model id | Tampering | Drift PR REQUIRES human review (no auto-merge); SHA-pinned action prevents action-supply-chain replacement; classifier defaults to permissive but visible-WARN (D-04) |
| Generated file edited by hand to bypass classifier | Tampering | Drift gate catches this on the next refresh; file header announces the rule; reviewer guidance in the auto-PR body |
| Long-lived PAT for the auto-PR step | Information disclosure (token exfiltration) | Rejected in §Standard Stack Alternatives; use the repo-setting + `GITHUB_TOKEN` path instead |

## Sources

### Primary (HIGH confidence)
- OpenRouter `/api/v1/models` endpoint (verified live 2026-06-08; unauthenticated GET returns 341 models, 407 KB, single response) — https://openrouter.ai/api/v1/models
- OpenRouter Models endpoint field semantics — https://openrouter.ai/docs/llms-full.txt (extracted field list; rate-limit / pagination not specified in docs)
- `peter-evans/create-pull-request@v8.1.1` SHA `5f6978faf089d4d20b00c7766989d076bb2fc7f1` (verified via `gh api`)
- `peter-evans/create-pull-request@v7.0.8` SHA `271a8d0340265f705b14b6d32b9829c1cb33d45e` (verified via `gh api`)
- Lattice existing codebase: `packages/lattice/src/providers/provider.ts`, `packages/lattice/src/routing/catalog.ts`, `packages/lattice/src/providers/openrouter.ts`, `packages/lattice/src/index.ts`, `packages/lattice/package.json`, `scripts/verify-rename.mjs`, `scripts/check-workflow-safety.mjs`, `scripts/check-tarball-leak.mjs`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`
- Lattice published tarball metadata: `npm view @full-self-browsing/lattice@1.3.0-rc.0 dist.unpackedSize` -> 685934
- LiteLLM auto-update workflow pattern — https://raw.githubusercontent.com/BerriAI/litellm/main/.github/workflows/auto_update_price_and_context_window.yml

### Secondary (MEDIUM confidence)
- Vercel AI Gateway models endpoint pattern — https://vercel.com/docs/ai-gateway/models-and-providers and https://github.com/vercel/ai/blob/main/packages/gateway/src/gateway-model-entry.ts
- OpenRouter API authentication overview — https://openrouter.ai/docs/api/reference/authentication and https://openrouter.ai/docs/api/reference/limits
- LiteLLM `model_prices_and_context_window.json` registry shape — https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json
- TypeScript `as const satisfies` pattern — https://dev.to/tommykw/differences-and-usage-of-as-const-and-readonly-in-typescript-4bkb
- tsdown tree-shaking guarantees — https://tsdown.dev/options/tree-shaking
- peter-evans/create-pull-request scheduled-cron examples — https://github.com/peter-evans/create-pull-request/blob/main/docs/examples.md and https://peterevans.dev/posts/github-actions-how-to-create-pull-requests-automatically/
- GitHub repo "Allow Actions to create PRs" setting — https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository
- Prisma `migrate diff` and drift-detection workflow — https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/mental-model

### Tertiary (LOW confidence — flagged for validation)
- OpenRouter rate-limit specifics for `/models` (docs do not state; 4 consecutive live requests succeeded with no throttling — empirical, not documented) — surfaced in Pitfall section as a "won't hit" but if it does in CI, retry policy is the fallback
- "20 entries cover ~90% of misclassifications" — extrapolated from CONTEXT.md D-03; will be empirically validated after the first generator run

## Metadata

**Confidence breakdown:**
- OpenRouter API shape and feed contents: **HIGH** — live verified, full response captured
- Codegen patterns (deterministic output, `as const satisfies`, sort discipline): **HIGH** — standard TS + JS practice, cross-verified with LiteLLM + Vercel AI Gateway
- Snapshot-drift CI pattern (`--check` mode mirroring `verify-rename.mjs`): **HIGH** — exact pattern already in the repo
- Scheduled auto-PR via peter-evans (action SHA, permissions, branch reuse): **HIGH** — action verified, SHAs verified, repo-setting interaction documented but the per-repo setting state is UNKNOWN to me (planner should verify)
- Lookup function performance and bundle behavior: **MEDIUM** — `Map` lazy build is uncontroversial but tsdown-specific tree-shaking of a single 93 KB array vs split files would need to be measured if it ever matters; for now, single-file is the correct tradeoff
- Classifier override coverage: **MEDIUM** — based on CONTEXT.md guidance + my reading of the OpenRouter feed; first refresh PR is the empirical test
- 5-bucket trainingClass enum sufficiency for v1.3.0: **MEDIUM** — derived from the research doc Part 2 taxonomy; some long-tail classes (e.g., MoE-distilled, instruct-but-quantized) may need own bucket in v1.4

**Research date:** 2026-06-08
**Valid until:** 2026-07-08 (OpenRouter feed evolves quickly; verify the rate-limit + auth + shape assumptions before any v1.4 work that materially re-architects the registry)

## RESEARCH COMPLETE
