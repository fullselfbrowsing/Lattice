---
phase: 43
slug: streaming-contract-collectstream
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-16
---

# Phase 43 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest + tsd |
| **Config file** | `packages/lattice/vitest.config.ts`; package `tsd` config in `packages/lattice/package.json` |
| **Quick run command** | `pnpm --filter @full-self-browsing/lattice test -- streaming create-ai provider` |
| **Full suite command** | `pnpm --filter @full-self-browsing/lattice test && pnpm --filter @full-self-browsing/lattice test:types && pnpm --filter @full-self-browsing/lattice typecheck` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm --filter @full-self-browsing/lattice test -- streaming create-ai provider`
- **After every plan wave:** Run `pnpm --filter @full-self-browsing/lattice test && pnpm --filter @full-self-browsing/lattice test:types && pnpm --filter @full-self-browsing/lattice typecheck`
- **Before `$gsd-verify-work`:** Full suite plus `node scripts/check-core-package-boundary.mjs` must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 43-01-01 | 01 | 1 | STRM-01 | T-43-01 | Existing `ProviderAdapter` literals remain compatible while `executeStream?` is optional | type/unit | `pnpm --filter @full-self-browsing/lattice test -- streaming provider` | yes | pending |
| 43-01-02 | 01 | 1 | STRM-02 | T-43-02 | `collectStream()` assembles final `ProviderRunResponse` without exposing raw provider stream frames | unit | `pnpm --filter @full-self-browsing/lattice test -- streaming` | yes | pending |
| 43-01-03 | 01 | 1 | STRM-01 | T-43-03 | Package root exports only intentional streaming values/types | type/public | `pnpm --filter @full-self-browsing/lattice test:types` | yes | pending |
| 43-02-01 | 02 | 2 | STRM-04 | T-43-04 | Runtime emits only `stream.start`, `stream.complete`, and `stream.failed` bracketing events | unit | `pnpm --filter @full-self-browsing/lattice test -- create-ai` | yes | pending |
| 43-02-02 | 02 | 2 | STRM-01, STRM-02 | T-43-05 | Streaming is explicit opt-in and non-streaming calls keep using `execute()` | unit | `pnpm --filter @full-self-browsing/lattice test -- create-ai` | yes | pending |
| 43-03-01 | 03 | 3 | STRM-03, STRM-05 | T-43-06 | Signed receipt `outputHash` is based on assembled final outputs, not chunk boundaries | property/unit | `pnpm --filter @full-self-browsing/lattice test -- create-ai streaming` | yes | pending |
| 43-03-02 | 03 | 3 | STRM-01..STRM-05 | T-43-07 | Full package gates pass with no optional dependency leak | package | `node scripts/check-core-package-boundary.mjs` | yes | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements:

- `packages/lattice/src/runtime/create-ai.test.ts` exists and already covers runtime receipts, events, and signer verification.
- `packages/lattice/src/providers/provider.test.ts` exists and can host provider contract compatibility checks.
- `packages/lattice/test/public-surface.test.ts` exists for value-export inventory checks.
- `packages/lattice/test-d/index.test-d.ts` exists for package-root type coverage.
- Vitest and tsd are already installed for the package.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| None | STRM-01..STRM-05 | All Phase 43 behaviors are contract/runtime invariants and can be verified with automated tests | N/A |

---

## Validation Sign-Off

- [x] All tasks have automated verify commands or existing Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all missing references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-16
