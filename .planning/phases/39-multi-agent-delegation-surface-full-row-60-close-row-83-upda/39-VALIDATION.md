---
phase: 39
slug: multi-agent-delegation-surface-full-row-60-close-row-83-upda
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-06-10
---

# Phase 39 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from 39-RESEARCH.md `## Validation Architecture`.
> Task map bound to plans 39-01..39-08 (21 tasks, all with `<automated>` verify).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.5 (+ tsd 0.33.0 for type-level) |
| **Config file** | none needed — vitest defaults; tests colocated as `src/**/*.test.ts`; type tests in `test-d/` |
| **Quick run command** | `pnpm --filter @full-self-browsing/lattice test -- <file>` (e.g. `vitest run src/agent/crew/run-crew.test.ts`) |
| **Full suite command** | `pnpm test && pnpm typecheck && pnpm test:types && pnpm -r lint:packages` |
| **Estimated runtime** | ~60-120 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run targeted `vitest run <touched test files>` + `pnpm --filter @full-self-browsing/lattice typecheck`
- **After every plan wave:** Run `pnpm test` (full vitest, both packages) + `pnpm test:types`
- **Before `/gsd-verify-work`:** Full suite green + `node examples/agent-crew/index.mjs` exit 0
- **Max feedback latency:** ~120 seconds

---

## Per-Task Verification Map

`pnpm L test` abbreviates `pnpm --filter @full-self-browsing/lattice test`; `tc` abbreviates `pnpm --filter @full-self-browsing/lattice typecheck`.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 39-01-T1 | 39-01 | 1 | DELEG-01..08 (authoring) | — | All 8 REQ-IDs authored in REQUIREMENTS.md with traceability rows | doc grep gate | `grep -c '\*\*DELEG-0[1-8]\*\*' .planning/REQUIREMENTS.md \| grep -qx 8` (+ traceability/placeholder gates per plan) | n/a (doc gate) | ⬜ pending |
| 39-01-T2 | 39-01 | 1 | DELEG-06 | — | `receiptCid` content-address helper, JCS byte stability | unit | `pnpm L test -- src/receipts/cid.test.ts` | ❌ W0 (created in task) | ⬜ pending |
| 39-01-T3 | 39-01 | 1 | DELEG-06 | CRYPTO-01 | `parentReceiptCid` on v1.2 body + CRYPTO-01 non-regression matrix | unit | `pnpm L test -- src/receipts/receipt.test.ts src/receipts/verify.test.ts && tc` | ✅ (extend) | ⬜ pending |
| 39-02-T1 | 39-02 | 1 | DELEG-05 | — | dual-dimension (RPM+TPM) lease bucket, continuous drain, conservative defaults | unit (fake timers) | `pnpm L test -- src/agent/infra/rate-limit-group.test.ts` | ❌ W0 (created in task) | ⬜ pending |
| 39-02-T2 | 39-02 | 1 | DELEG-05 | — | `withRateLimit` transport wrap, burn-on-failure (OQ5), no header/request leakage on error path | unit (fake timers) | `pnpm L test -- src/agent/infra/rate-limit-group.test.ts && tc` | created in 39-02-T1 | ⬜ pending |
| 39-03-T1 | 39-03 | 1 | DELEG-01 | — | `defineAgent` shape + tree composition + kind discriminant | unit | `pnpm L test -- src/agent/crew/agent-spec.test.ts` | ❌ W0 (created in task) | ⬜ pending |
| 39-03-T2 | 39-03 | 1 | DELEG-02 | — | `validateCrewPolicy` defaults/reject (OQ3), `crew-budget-exceeded` kind, `AgentSnapshot.ancestry` compat (OQ4) | unit | `pnpm L test -- src/agent/crew/crew-policy.test.ts src/agent && tc` | ❌ W0 (created in task) | ⬜ pending |
| 39-03-T3 | 39-03 | 1 | DELEG-03 | — | runtime dispatch seam (internal, non-exported) + format-tools body-only option, no single-agent regression | unit | `pnpm L test -- src/agent && tc` | ✅ (extend src/agent suite) | ⬜ pending |
| 39-04-T1 | 39-04 | 1 | DELEG-04 | — | `ProviderRunRequest.cacheSystemPrefix` + Anthropic `cache_control` emission | unit (mocked fetch) | `pnpm L test -- src/providers/anthropic.test.ts && tc` | ✅ (extend) | ⬜ pending |
| 39-04-T2 | 39-04 | 1 | DELEG-04 | — | mocked-fetch request shapes + cache counters readable from rawResponse fixtures | unit (mocked fetch) | `pnpm L test -- src/providers/anthropic.test.ts` | ✅ (extend) | ⬜ pending |
| 39-05-T1 | 39-05 | 2 | DELEG-03 | — | dispatch branch, child execution, summary-return validation (children only — OQ2) | unit (fake provider) | `pnpm L test -- src/agent/crew/dispatcher.test.ts` | ❌ W0 (created in task) | ⬜ pending |
| 39-05-T2 | 39-05 | 2 | DELEG-03, DELEG-06 | — | cycle/depth enforcement, D-09/D-10 failure routing, per-child receipt chaining | unit | `pnpm L test -- src/agent/crew/dispatcher.test.ts src/receipts && tc` | created in 39-05-T1 | ⬜ pending |
| 39-05-T3 | 39-05 | 2 | DELEG-04 | — | byte-stable cache-prefix composition; prefix byte-equality across 3 dispatches | unit | `pnpm L test -- src/agent/crew/cache-prefix.test.ts src/agent/crew/dispatcher.test.ts` | ❌ W0 (created in task) | ⬜ pending |
| 39-06-T1 | 39-06 | 3 | DELEG-02 | — | `runAgentCrew` orchestrator: policy at entry, budget pool min(), aggregator no-double-count, crew-root receipt anchor (OQ1) | unit (fake provider) | `pnpm L test -- src/agent/crew/run-crew.test.ts && tc` | ❌ W0 (created in task) | ⬜ pending |
| 39-06-T2 | 39-06 | 3 | DELEG-02, DELEG-05 | T-39-29 | shared rate-limit group per provider key wired via transport, `ai.runAgentCrew` facade, public exports (seam stays internal) | unit + package gate | `pnpm L test -- src/agent/crew && tc && pnpm L exec publint` | created in 39-06-T1 | ⬜ pending |
| 39-06-T3 | 39-06 | 3 | DELEG-03 | — | end-to-end fake-provider crew scenarios, `crew-budget-exceeded` terminal semantics | integration (fake provider) | `pnpm L test -- src/agent/crew/crew-integration.test.ts && pnpm test` | ❌ W0 (created in task) | ⬜ pending |
| 39-07-T1 | 39-07 | 4 | DELEG-07 | — | showcase runs end-to-end, every per-agent receipt Ed25519-signed and verifies | example smoke | `pnpm L build && node examples/agent-crew/index.mjs` | ❌ W0 (created in task) | ⬜ pending |
| 39-07-T2 | 39-07 | 4 | DELEG-07 | — | `evalAgentRun` crew regression gate green against fake provider | integration | `pnpm L test -- src/agent/crew/crew-eval.test.ts` | ❌ W0 (created in task) | ⬜ pending |
| 39-08-T1 | 39-08 | 5 | DELEG-08 | T-39-27, T-39-28 | AGENTS.md 3-surface flip + Row 60/83 Covered with git-resolvable backlinks | doc grep gate | `bash -c '! grep -qi "remain Out of Scope" AGENTS.md && grep -q "First-class via opt-in" AGENTS.md && grep -q "3794896" docs/fsb-integration-gaps.md'` | n/a (doc gate) | ⬜ pending |
| 39-08-T2 | 39-08 | 5 | DELEG-08 | T-39-29 | tsd coverage for every new public symbol + changeset staged | tsd | `pnpm --filter @full-self-browsing/lattice test:types` | ❌ W0 (test-d/agent-crew.test-d.ts created in task; index.test-d.ts ✅ extend) | ⬜ pending |
| 39-08-T3 | 39-08 | 5 | DELEG-08 (phase gate) | — | full suite + package gates + showcase all green; no skip/todo in phase diff (from `ca24e8b`) | full suite | `pnpm test && pnpm typecheck && pnpm test:types && pnpm -r lint:packages && node examples/agent-crew/index.mjs` | n/a (gate only) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

All 21 tasks carry an `<automated>` verify command; no task relies on manual-only verification (the two manual items below are supplementary doc/live-provider reviews, not task gates).

---

## Wave 0 Requirements

- [ ] `src/agent/crew/agent-spec.test.ts` — stubs for DELEG-01 (39-03-T1)
- [ ] `src/agent/crew/crew-policy.test.ts` + `run-crew.test.ts` — DELEG-02 (39-03-T2, 39-06-T1)
- [ ] `src/agent/crew/dispatcher.test.ts` + `crew-integration.test.ts` (scripted fake provider) — DELEG-03 (39-05-T1, 39-06-T3)
- [ ] `src/agent/crew/cache-prefix.test.ts` — DELEG-04 (39-05-T3)
- [ ] `src/agent/infra/rate-limit-group.test.ts` — DELEG-05 (39-02-T1)
- [ ] `src/receipts/cid.test.ts` — DELEG-06 (39-01-T2)
- [ ] `src/agent/crew/crew-eval.test.ts` + `examples/agent-crew/{package.json,setup.mjs,index.mjs}` — DELEG-07 (39-07-T1/T2)
- [ ] `test-d/agent-crew.test-d.ts` (+ extend `index.test-d.ts`, `receipt-v12.test-d.ts`) — DELEG-08 (39-08-T2)
- Framework install: none — vitest/tsd already wired.

Each Wave 0 test file is created by the same task that implements the behavior (TDD `<behavior>` blocks precede implementation), so `wave_0_complete` flips to `true` as execution proceeds — no separate scaffold plan needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| AGENTS.md + fsb-integration-gaps.md Row 60/83 text flips | DELEG-08 | Prose assertions — doc diff review (grep gates in 39-08-T1 cover the mechanical part) | Diff the Multi-Agent Policy section, "What Not To Use" row (~line 127), and gap rows 60/83; confirm Row 83 backlinks commit `3794896` |
| Live Anthropic/OpenAI prompt-cache hit counters | DELEG-04 | Real providers gated to nightly/manual only (repo policy) | Run env-keyed opt-in script in `examples/agent-crew/` (skipped by default); assert `cache_read_input_tokens` > 0 on dispatches 2+; shared prefix must exceed 1,024 tokens |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (21/21 carry `<automated>`)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (every ❌ W0 file maps to the task that creates it)
- [x] No watch-mode flags (all commands are one-shot `vitest run` / `test --` invocations)
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved at plan revision (2026-06-10) — `wave_0_complete` remains `false` until execution creates the Wave 0 test files.
