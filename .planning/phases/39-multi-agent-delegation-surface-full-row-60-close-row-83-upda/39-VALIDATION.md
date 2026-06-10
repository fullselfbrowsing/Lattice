---
phase: 39
slug: multi-agent-delegation-surface-full-row-60-close-row-83-upda
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-10
---

# Phase 39 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from 39-RESEARCH.md `## Validation Architecture`.

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

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | DELEG-01 | — | `defineAgent` shape + tree composition + public types | unit + tsd | `vitest run src/agent/crew/agent-spec.test.ts`; `pnpm test:types` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DELEG-02 | — | `runAgentCrew` facade, policy validation, budget pool min(), aggregator no-double-count | unit | `vitest run src/agent/crew/run-crew.test.ts src/agent/crew/crew-policy.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DELEG-03 | — | dispatch branch, summary re-entry turn, D-09/D-10 failure routing, cycle rejection, `crew-budget-exceeded` | unit + integration (fake provider) | `vitest run src/agent/crew/dispatcher.test.ts src/agent/crew/crew-integration.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DELEG-04 | — | Anthropic request carries cache_control system block; prefix byte-equality across 3 dispatches; cache counters readable from rawResponse fixtures | unit (mocked fetch) | `vitest run src/providers/anthropic.test.ts src/agent/crew/cache-prefix.test.ts` | anthropic.test.ts ✅ (extend); cache-prefix ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DELEG-05 | — | dual-dimension drain, lease reconcile, conservative defaults, `unmanaged` escape, transport wrap | unit (fake timers) | `vitest run src/agent/infra/rate-limit-group.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DELEG-06 | CRYPTO-01 | parentReceiptCid mint/verify, CID helper, CRYPTO-01 non-regression matrix, JCS byte stability | unit | `vitest run src/receipts/receipt.test.ts src/receipts/verify.test.ts src/receipts/cid.test.ts` | receipt/verify ✅ (extend); cid ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DELEG-07 | — | showcase runs end-to-end, every receipt verifies, evalAgentRun gate green | integration + example smoke | `vitest run src/agent/crew/crew-eval.test.ts`; `pnpm --filter @full-self-browsing/lattice build && node examples/agent-crew/index.mjs` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DELEG-08 | — | exports present + publint/attw/tsd gates green; doc text flipped | type/package + manual (docs) | `pnpm test:types && pnpm -r lint:packages` | test-d ✅ (extend); crew test-d ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/agent/crew/agent-spec.test.ts` — stubs for DELEG-01
- [ ] `src/agent/crew/crew-policy.test.ts` + `run-crew.test.ts` — DELEG-02
- [ ] `src/agent/crew/dispatcher.test.ts` + `crew-integration.test.ts` (scripted fake provider) — DELEG-03
- [ ] `src/agent/crew/cache-prefix.test.ts` — DELEG-04
- [ ] `src/agent/infra/rate-limit-group.test.ts` — DELEG-05
- [ ] `src/receipts/cid.test.ts` — DELEG-06
- [ ] `src/agent/crew/crew-eval.test.ts` + `examples/agent-crew/{package.json,setup.mjs,index.mjs}` — DELEG-07
- [ ] `test-d/agent-crew.test-d.ts` (+ extend `index.test-d.ts`, `receipt-v12.test-d.ts`) — DELEG-08
- Framework install: none — vitest/tsd already wired.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| AGENTS.md + fsb-integration-gaps.md Row 60/83 text flips | DELEG-08 | Prose assertions — doc diff review | Diff the Multi-Agent Policy section, "What Not To Use" row (~line 127), and gap rows 60/83; confirm Row 83 backlinks commit `3794896` |
| Live Anthropic/OpenAI prompt-cache hit counters | DELEG-04 | Real providers gated to nightly/manual only (repo policy) | Run env-keyed opt-in script in `examples/agent-crew/` (skipped by default); assert `cache_read_input_tokens` > 0 on dispatches 2+; shared prefix must exceed 1,024 tokens |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
