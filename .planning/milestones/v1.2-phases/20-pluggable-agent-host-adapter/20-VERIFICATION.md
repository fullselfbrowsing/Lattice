---
phase: 20-pluggable-agent-host-adapter
verified: 2026-05-31T00:00:00Z
status: passed
score: 4/4 must-haves verified
overrides_applied: 0
verification_mode: real-runtime
---

# Phase 20: Pluggable AgentHost Adapter + TRACE-EXT-01 Verification Report

**Phase Goal:** `AgentHost` ships as a public interface with three optional seams (scheduler, transport, storage). `createNoopAgentHost()` ships as the Node-test reference implementation. The host composes with the Phase 18 `SurvivabilityAdapter` so the storage seam emits eviction snapshots; on resume, the agent loop re-enters at the recorded step. `RunEventKind` (Phase 16) gains three recovery markers, closing TRACE-EXT-01 (the one Important row left open by the v1.1 audit).

**Verified:** 2026-05-31
**Status:** passed via real-runtime tests (no Lattice primitive mocks)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `AgentHost` interface exports three optional seams (`scheduler`, `transport`, `storage`); each is invocable | VERIFIED | `host.ts` declarations + `host.test.ts` shape + behavior cases. `createNoopAgentHost()` returns all three. Public surface `public-surface.test.ts` "re-exports createNoopAgentHost as a value". HOST-01 closed. |
| 2 | `createNoopAgentHost()` is the Node-test reference impl: scheduler resolves immediately, transport delegates to provider.execute, storage save/load/clear are no-ops | VERIFIED | `host.test.ts` (8 cases): immediate resolution, transport delegation, transport error on missing execute, storage no-op semantics, composable custom storage seam. HOST-02 closed. |
| 3 | `SurvivabilityAdapter` composes with `AgentHost`: snapshot is saved post-iteration, loaded on resume, deserialized via the adapter; loop re-enters at the recorded step | VERIFIED | `host-integration.test.ts` 6 cases. `survivability-integration.test.ts` proves the full eviction-resume contract end-to-end: simulated eviction at iteration boundary captures snapshot via storage.save; second runtime loads snapshot via storage.load + survivabilityAdapter.deserialize; iteration resumes at the captured index; cumulative usage carries across the simulated process boundary; per-iteration receipts from both halves verify under the same ephemeral Ed25519 KeySet. HOST-03 closed. |
| 4 | `RunEventKind` admits three new recovery markers (`recovery.start`, `recovery.complete`, `recovery.failed`); the agent loop emits them at the right boundaries | VERIFIED | `tracing.ts` union extended. `host-integration.test.ts` "resumes from a pre-existing snapshot" asserts recovery.start + recovery.complete fire in order. `host-integration.test.ts` "emits recovery.failed and starts fresh when a snapshot is corrupt" asserts recovery.failed fires + storage cleared + fresh start. `host-integration.test.ts` "does not emit recovery.* events when no snapshot exists" asserts no recovery events on fresh start. TRACE-EXT-01 closed. |

## File-Level Evidence

### Plan 20-01

| File | Change | Status |
|---|---|---|
| `packages/lattice/src/agent/host.ts` | NEW — `AgentHost`, `AgentScheduler`, `AgentTransport`, `AgentStorage`, `AgentSnapshot` types; `createNoopAgentHost()` factory | LANDED |
| `packages/lattice/src/agent/host.test.ts` | NEW — 8 vitest cases | LANDED |
| `packages/lattice/src/tracing/tracing.ts` | RunEventKind extended additively with `recovery.start`, `recovery.complete`, `recovery.failed` | LANDED |
| `packages/lattice/src/agent/types.ts` | Phase 19 forward-decl replaced with re-export from host.js; AgentIntent gains `survivabilityAdapter?` field | LANDED |

### Plan 20-02

| File | Change | Status |
|---|---|---|
| `packages/lattice/src/agent/runtime.ts` | runAgent refactored: defaults host to `createNoopAgentHost()`; resolves survivabilityAdapter; resume path (load + deserialize + restore state) with recovery.start / .complete / .failed emission; transport seam dispatch; per-iteration storage.save with serialize; storage.clear on success; scheduler.scheduleNext between iterations | LANDED |
| `packages/lattice/src/agent/integration.test.ts` | Phase 19 integration tracer typed correctly with `kind: "tracer"` (TracerLike shape required) | UPDATED |
| `packages/lattice/src/agent/host-integration.test.ts` | NEW — 6 vitest cases | LANDED |

### Plan 20-03

| File | Change | Status |
|---|---|---|
| `packages/lattice/src/index.ts` | Phase 20 re-exports: `createNoopAgentHost` (value) + `AgentScheduler` / `AgentTransport` / `AgentStorage` / `AgentSnapshot` types | LANDED |
| `packages/lattice/test/public-surface.test.ts` | +2 cases asserting Phase 20 surface reachability | LANDED |
| `packages/lattice/src/agent/survivability-integration.test.ts` | NEW — 1 large end-to-end integration smoke proving full eviction-resume contract with real Ed25519 + per-iteration receipt verification across simulated process boundary | LANDED |
| `.planning/phases/20-pluggable-agent-host-adapter/20-VERIFICATION.md` | NEW (this file) | LANDED |

## Test Posture

| Workspace | Pre-Phase 20 (post-19) | Plan 20-01 close | Plan 20-02 close | Plan 20-03 close (final) |
|---|---:|---:|---:|---:|
| `packages/lattice` | 525 | 533 (+8 host) | 539 (+6 host-integration) | 542 (+2 public-surface, +1 survivability-integration) |
| `packages/lattice-cli` | 144 | 144 | 144 | 144 |
| **Total** | **669** | **677** | **683** | **686** |

**Phase 20 net: +17 new vitest cases across 4 source/test files. 686 PASS / 0 FAIL on `pnpm -r test`. Phase 19 + earlier Track A baseline preserved — host defaults to noop, so prior runtime tests continue to pass unchanged.**

## REQ-IDs Closed

| REQ-ID | Plan | Status |
|---|---|---|
| HOST-01 | 20-01 | CLOSED |
| HOST-02 | 20-01 | CLOSED |
| HOST-03 | 20-02 | CLOSED |
| TRACE-EXT-01 | 20-01 (literals) + 20-02 (emission) | CLOSED |

## Conclusion

Phase 20 verified passed via real-runtime tests against the full Phase 18 SurvivabilityAdapter + Phase 16 createCheckpointHook + Phase 17 provider stack. The host abstraction is independently swappable per seam — callers can replace just storage (for MV3 SW), just transport (for cross-process bridges), or all three together. The eviction-resume contract is end-to-end demonstrated with real Ed25519 receipt verification across a simulated process boundary.

**Carried forward to Phase 21+:** Concrete host implementations (chrome.storage.session MV3 host, Cloudflare Worker Durable Object host, AWS Lambda DynamoDB host) — out of scope for v1.2 Lattice core; lives in consumer codebases like FSB. Mid-iteration mid-provider-call eviction recovery is also out of scope; Phase 20 resumes at iteration boundaries only.
