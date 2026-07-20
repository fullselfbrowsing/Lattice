// Public lookup surface for the model capability registry.
//
// Three exported functions:
//   - getCapabilityProfile(canonicalKey)   — strict, exact `${adapter}:${id}` lookup
//   - findCapabilityProfile(id)            — fuzzy, multi-adapter, OpenRouter suffix-strip
//   - stripOpenRouterVariant(id)           — pure helper, OpenRouter-shape only
//
// Quirk negotiation and sanitizers reuse stripOpenRouterVariant.
// The lazy Map cache is built once on first lookup from STATIC + GENERATED
// arrays and reused across calls; _resetLookupCacheForTests is exported for
// vitest case isolation but is NOT re-exported from the public surface.

import type { CapabilityAdapter, ModelCapabilityProfile } from "./profile.js";
import { GENERATED_PROFILES } from "./registry.generated.js";
import { STATIC_PROFILES } from "./registry.static.js";

/**
 * Adapter order keeps direct adapters first and OpenRouter last. The
 * `findCapabilityProfile` helper walks this list and concatenates hits in
 * order, so consumers iterating over the result see direct-adapter
 * profiles before the OpenRouter routing equivalent. This makes the
 * "I have a direct adapter wired AND I have OpenRouter wired" case
 * deterministic (direct wins; OpenRouter is the fallback).
 */
const ADAPTER_ORDER: ReadonlyArray<CapabilityAdapter> = [
  "anthropic",
  "openai",
  "gemini",
  "xai",
  "openai-compat",
  "lm-studio",
  "openrouter",
];

/**
 * Anchored, bounded OpenRouter variant regex. Matches the live
 * variant set verified against the OpenRouter feed on 2026-06-08:
 * `:free` and `:thinking` only. Linear-time worst case — no nested
 * quantifiers, finite alternation, and anchors on both ends prevent
 * pathological backtracking.
 *
 * Pattern: `vendor/model:variant` where `vendor` and `model` are each
 * non-empty non-`/` segments. Direct-adapter canonical keys like
 * `anthropic:claude-opus-4` do NOT match (no slash before the colon).
 */
const OPENROUTER_VARIANT_RE = /^[^/]+\/[^/]+:(?:free|thinking)$/;

/**
 * Strip the OpenRouter variant suffix (`:free` or `:thinking`) from an
 * OpenRouter-shaped id (`vendor/model:variant`). Other adapter id shapes
 * pass through verbatim — does not, for example, alter
 * `anthropic:claude-opus-4` (direct-adapter canonical key) or
 * `openai/gpt-4o:beta` (an unrecognized variant).
 *
 * Exported because adapter quirks and output sanitizers need the same
 * normalization.
 */
export function stripOpenRouterVariant(id: string): string {
  if (!OPENROUTER_VARIANT_RE.test(id)) return id;
  const colonIdx = id.lastIndexOf(":");
  return colonIdx === -1 ? id : id.slice(0, colonIdx);
}

/**
 * Lazy Map cache. Built once on first call to `getLookupMap`; reused for
 * every subsequent strict or fuzzy lookup. Test-only reset via
 * `_resetLookupCacheForTests` because vitest's `vi.doMock` flow needs to
 * re-import lookup.ts with a fresh cache when the mocked registries
 * change between cases.
 */
let _lookupCache: Map<string, ModelCapabilityProfile> | undefined;

function getLookupMap(): Map<string, ModelCapabilityProfile> {
  if (_lookupCache !== undefined) return _lookupCache;
  const map = new Map<string, ModelCapabilityProfile>();
  // STATIC first so generated entries with the same canonical key would
  // overwrite. By current design STATIC and GENERATED do not share keys
  // (static profiles use direct adapters; generated entries use the
  // openrouter adapter), but the iteration order documents the
  // precedence if the registries ever overlap.
  //
  // The explicit `readonly ModelCapabilityProfile[]` widening is required
  // because the bootstrap arrays ship as `readonly []` (an empty tuple)
  // via `[] as const satisfies readonly ModelCapabilityProfile[]`. Once
  // populated with real rows, the iteration variable type stays
  // `ModelCapabilityProfile` either way.
  const staticProfiles: readonly ModelCapabilityProfile[] = STATIC_PROFILES;
  const generatedProfiles: readonly ModelCapabilityProfile[] = GENERATED_PROFILES;
  for (const profile of staticProfiles) {
    map.set(`${profile.adapter}:${profile.id}`, profile);
  }
  for (const profile of generatedProfiles) {
    map.set(`${profile.adapter}:${profile.id}`, profile);
  }
  _lookupCache = map;
  return map;
}

/**
 * Test-only escape hatch — reset the lazy Map cache. NOT re-exported
 * from src/index.ts; only reachable by tests importing lookup.ts
 * directly. Vitest `vi.doMock` flow uses `vi.resetModules()` to force
 * re-import; this reset is a belt-and-suspenders for any future test
 * that wants to mutate the underlying arrays in-place.
 */
export function _resetLookupCacheForTests(): void {
  _lookupCache = undefined;
}

/**
 * Strict lookup returns the capability profile for the exact
 * `${adapter}:${modelId}` canonical key. Returns `undefined` if the key
 * is not registered. No fuzzy matching — use `findCapabilityProfile`
 * for that.
 *
 * Examples:
 *   getCapabilityProfile("openrouter:openai/gpt-oss-120b") -> profile
 *   getCapabilityProfile("anthropic:claude-opus-4")        -> profile
 *   getCapabilityProfile("not-a-real-key")                  -> undefined
 *
 * The lookup is case-sensitive on the canonical key. The backing store is
 * `Map<string, ModelCapabilityProfile>`,
 * not a plain object literal, so `__proto__` and other prototype-chain
 * keys are safe (Map uses SameValueZero, not property lookup).
 */
export function getCapabilityProfile(
  canonicalKey: string,
): ModelCapabilityProfile | undefined {
  return getLookupMap().get(canonicalKey);
}

/**
 * Fuzzy lookup strips the OpenRouter variant suffix (if any) and
 * return ALL matching profiles across every adapter, in deterministic
 * order: direct adapters first (anthropic, openai, gemini, xai,
 * openai-compat, lm-studio), then OpenRouter.
 *
 * Useful for pre-routing capability inspection where the adapter has
 * not yet been chosen — the consumer can iterate the returned list
 * and pick the first compatible one. Returns `[]` when no match is
 * found across any adapter.
 *
 * Suffix stripping applies only to OpenRouter-shaped ids. Direct-adapter ids
 * pass through verbatim:
 *   findCapabilityProfile("openai/gpt-oss-120b:free")
 *     -> [openrouter:openai/gpt-oss-120b]
 *   findCapabilityProfile("claude-opus-4")
 *     -> [anthropic:claude-opus-4, ...]   (no suffix-strip)
 */
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
