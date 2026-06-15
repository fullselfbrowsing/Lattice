# Phase 34: Adapter Quirk Flags + Capability Negotiation API - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-06-08
**Phase:** 34-adapter-quirk-flags-capability-negotiation-api
**Areas discussed:** quirks + negotiateCapabilities placement, /models endpoint caching policy, /models fetch-failure policy, recommendedSanitizers source / Phase 36 coupling

---

## quirks + negotiateCapabilities placement

### Q1.1 -- quirks field location

| Option | Description | Selected |
|--------|-------------|----------|
| Optional on ProviderAdapter interface | 7 first-party adapters require it via narrowed return types; v1.2 consumer adapters unchanged | done |
| Required on ProviderAdapter interface | Every adapter discloses quirks; breaking for v1.2 consumers | |
| Only on concrete factory return types | No interface change; downcasting required downstream | |

**User's choice:** Optional on ProviderAdapter interface (Recommended)

### Q1.2 -- negotiateCapabilities location

| Option | Description | Selected |
|--------|-------------|----------|
| Optional method on ProviderAdapter + top-level helper | First-party adapters implement; consumer adapters fall through helper | done |
| Top-level helper function only | No interface change; per-adapter /models code lives in central dispatcher | |
| Required method on ProviderAdapter | Breaking for v1.2; consumer adapters write own registry fallback | |

**User's choice:** Optional method on ProviderAdapter interface (Recommended)

### Q1.3 -- quirks shape

| Option | Description | Selected |
|--------|-------------|----------|
| Per-adapter typed sub-interface | AnthropicQuirks extends AdapterQuirks {...}, IDE autocomplete after discriminant | done |
| Single base + providerSpecific record | All adapter-specific flags string-keyed booleans; no typing help | |
| Single flat closed-union of all flag names | Type-safe single shape; each adapter sees wide bag | |

**User's choice:** Per-adapter typed sub-interface (Recommended)

### Q1.4 -- consumer-adapter fallback

| Option | Description | Selected |
|--------|-------------|----------|
| Synthesize from Phase 33 registry, source: 'registry' | Free function reads getCapabilityProfile, maps to NegotiatedCapabilities | done |
| Throw 'adapter does not support negotiation' | Forces explicit migration; penalizes consumers | |
| Return undefined | Caller deals with absence; defeats purpose of registry fallback | |

**User's choice:** Synthesize from Phase 33 registry, source: 'registry' (Recommended)

**Notes:** Non-breaking surface; consumer adapters from v1.2 keep working. Top-level helper centralizes the registry-fallback path.

---

## /models endpoint caching policy

### Q2.1 -- default caching policy

| Option | Description | Selected |
|--------|-------------|----------|
| In-memory TTL, default 5 min | Standard SDK pattern; per-adapter Map<modelId, {result, expiresAt}> | done |
| Process-lifetime cache | First call fetches, subsequent reuse forever; staleness risk | |
| No cache | Maximally accurate; rate-limit risk on hot paths | |
| Pluggable cache adapter | Most flexible; more surface area | |

**User's choice:** In-memory TTL, default 5 min (Recommended)

### Q2.2 -- cache scope

| Option | Description | Selected |
|--------|-------------|----------|
| Per-instance cache | Each factory call gets own Map; no cross-contamination | done |
| Per-process (module-level) cache | One shared Map; max efficiency, key-poisoning risk | |
| Per-instance + opt-in process cache | Default per-instance, opt-in sharing via shared option | |

**User's choice:** Per-instance cache (Recommended)

### Q2.3 -- eviction policy

| Option | Description | Selected |
|--------|-------------|----------|
| Lazy expiry on read | No background timer; doesn't pin Node event loop | done |
| Active eviction via setInterval | Cleaner memory; pins event loop, bad for libraries | |
| LRU with size cap | Bounded entries; overkill for ~200-model adapters | |

**User's choice:** Lazy expiry (Recommended)

### Q2.4 -- TTL configurability

| Option | Description | Selected |
|--------|-------------|----------|
| Per-adapter option in factory | modelsCacheTtlMs option; 0 disables, Infinity = forever | done |
| Single global TTL via top-level config | One knob for all adapters; loses per-adapter control | |
| Fixed 5min, not configurable | Simplest; no escape hatch for testing or edge needs | |

**User's choice:** Per-adapter option in factory (Recommended)

**Notes:** No follow-up questions. The 4 decisions form a self-contained caching layer that survives long-running processes and testing scenarios.

---

## /models fetch-failure policy

### Q3.1 -- default failure handling

| Option | Description | Selected |
|--------|-------------|----------|
| Fall back to Phase 33 registry, source: 'registry-fallback' | Graceful; mirrors D-18 OpenRouter drift gate; never throws | done |
| Throw a typed FetchError to the caller | Honest; disruptive in hot paths | |
| Return undefined | Loose contract; reimplements fallback per consumer | |

**User's choice:** Fall back to Phase 33 registry, source: 'registry-fallback' (Recommended)

### Q3.2 -- auth-error policy

| Option | Description | Selected |
|--------|-------------|----------|
| Auth (401/403) throw, transient (5xx, timeout, network) fall back | Surfaces config bugs; survives provider hiccups | done |
| All errors fall back uniformly | Maximally graceful; hides 401 typos | |
| All errors throw | Simplest; pushes fallback work to every consumer | |

**User's choice:** Auth errors throw, transient errors fall back (Recommended)

### Q3.3 -- retry policy

| Option | Description | Selected |
|--------|-------------|----------|
| 2 retries with exponential backoff (immediate + 200ms + 1s) | Matches Phase 33's refresh script pattern | done |
| No retries; fall back immediately | Fastest; transient blips serve stale data unnecessarily | |
| Configurable retry count, default 2 | Adds knob; matches modelsCacheTtlMs ergonomics | |

**User's choice:** 2 retries with exponential backoff (Recommended)

### Q3.4 -- observability

| Option | Description | Selected |
|--------|-------------|----------|
| Emit via Lattice's existing RunEventKind | Integrates with v1.2 tracing/hook infrastructure | done |
| console.warn stderr line | Simple; not capturable in structured tracing | |
| Nothing -- just source field | Quietest; bug surface harder to debug | |

**User's choice:** Emit via Lattice's existing RunEventKind (Recommended)

**Notes:** No follow-up questions. The 4 decisions form a layered failure-handling system that distinguishes config bugs (401 -> throw) from provider hiccups (5xx -> retry then fallback).

---

## recommendedSanitizers source / Phase 36 coupling

### Q4.1 -- SanitizerKey type

| Option | Description | Selected |
|--------|-------------|----------|
| Closed string union mirroring Phase 36 | Locks 3 sanitizer keys; compile-time guarantee | done |
| Open string array | Most flexible; runtime drift between 34 and 36 | |
| Derived view of KnownFailureMode | Single source of truth; conflates failure vs sanitizer concepts | |

**User's choice:** Closed string union mirroring Phase 36 (Recommended)

### Q4.2 -- derivation table

| Option | Description | Selected |
|--------|-------------|----------|
| Registry-driven mapping table SANITIZER_BY_FAILURE_MODE | Single mapping; testable | done |
| Per-profile recommendedSanitizers field on ModelCapabilityProfile | Phase 33 carries Phase 36 knowledge; coupling concern | |
| Computed at negotiate-time only (no static table) | Hand-coded switch; loses single source of truth | |

**User's choice:** Registry-driven mapping table (Recommended)

### Q4.3 -- mapping table location

| Option | Description | Selected |
|--------|-------------|----------|
| packages/lattice/src/capabilities/sanitizer-recommendations.ts | New module; sibling to profile.ts, lookup.ts | done |
| packages/lattice/src/capabilities/profile.ts | Mixed types+mapping module; breaks Phase 33's clean structure | |
| Inside Phase 34's adapter modules | Mapping duplicated across 7 files; drift risk | |

**User's choice:** packages/lattice/src/capabilities/sanitizer-recommendations.ts (Recommended)

### Q4.4 -- no-sanitizer encoding

| Option | Description | Selected |
|--------|-------------|----------|
| null in Record + dropped from output array | Preserves exhaustive switch over KnownFailureMode | done |
| Omit non-sanitizable modes from the table | Smaller mapping; loses exhaustiveness gate | |
| Separate SanitizableFailureMode type | Most type-precise; doubles union-management cost | |

**User's choice:** null in the Record (Recommended)

**Notes:** No follow-up questions. Phase 36 receives a tight, exhaustive contract: SanitizerKey union locked, mapping table locked, null encoding locked. Phase 36 implements; doesn't redefine.

---

## Claude's Discretion

Areas where the user explicitly accepted "you decide" or where downstream agents (researcher, planner) have flexibility:

- Exact field names for per-adapter quirks (consistent style across adapters)
- Quirk fixture file format (JSON vs TS literal) and per-adapter test layout
- Inflight-request coalescing for negotiate() (advisory: yes)
- Exact NegotiationAuthError class shape
- Whether `source: "live"` distinguishes "live + registry intersected" from "live only, no registry profile" (advisory: add `"live-only"` if needed)
- Logging format for the capabilities.negotiation.fallback event payload
- Test fixture strategy

## Deferred Ideas

- Phase 36 sanitizer implementations (D-13 locks the ids; Phase 36 ships code)
- inflight-request coalescing details
- Telemetry headers on /models calls (User-Agent)
- `source: "live-only"` distinct from `"live"` (Claude's discretion)
- NegotiationAuthError -> ConsumerCallback for OAuth refresh (v1.4)
- Quirks-aware routing (not v1.3)
