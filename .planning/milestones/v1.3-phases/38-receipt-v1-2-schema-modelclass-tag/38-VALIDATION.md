---
phase: 38
slug: receipt-v1-2-schema-modelclass-tag
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-09
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 + tsd |
| **Config file** | `packages/lattice/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @full-self-browsing/lattice test receipts/receipt receipts/verify receipts/canonical runtime/create-ai contract/checkpoint public-surface` |
| **Full suite command** | `pnpm --filter @full-self-browsing/lattice test receipts/receipt receipts/verify receipts/canonical contract/checkpoint runtime/create-ai agent/integration runtime/survivability public-surface && pnpm --filter @full-self-browsing/lattice build && pnpm --filter @full-self-browsing/lattice typecheck && pnpm --filter @full-self-browsing/lattice exec tsd` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task's focused Vitest target from the plan `<verify>` block.
- **After every plan wave:** Run the full Phase 38 targeted suite plus type gates.
- **Before `$gsd-verify-work`:** Full Phase 38 targeted suite and type gates must be green.
- **Max feedback latency:** ~30 seconds for the targeted phase suite.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 38-01-01 | 01 | 1 | RECEIPT12-01 | T-38-01 | Receipt body and mint input expose optional `TrainingClass` modelClass while `createReceipt` owns version. | unit + type | `pnpm --filter @full-self-browsing/lattice test receipts/receipt && pnpm --filter @full-self-browsing/lattice typecheck` | yes | pending |
| 38-01-02 | 01 | 1 | RECEIPT12-01 / RECEIPT12-04 | T-38-01 / T-38-04 | Fresh receipts mint v1.2 and preserve modelClass through redaction/JCS/DSSE. | unit | `pnpm --filter @full-self-browsing/lattice test receipts/receipt receipts/canonical` | yes | pending |
| 38-01-03 | 01 | 1 | RECEIPT12-02 / RECEIPT12-04 | T-38-02 / T-38-03 | Verifier accepts v1.1/v1.2 and rejects absent/v1/forged downgrade before crypto lookup. | unit | `pnpm --filter @full-self-browsing/lattice test receipts/verify` | yes | pending |
| 38-02-01 | 02 | 2 | RECEIPT12-03 | T-38-05 / T-38-06 | Runtime uses strict registry lookup only and never fuzzy classifies receipt models. | unit + grep | `rg -n 'getCapabilityProfile|findCapabilityProfile|resolveReceiptModelClass' packages/lattice/src/runtime/create-ai.ts && pnpm --filter @full-self-browsing/lattice test runtime/create-ai` | yes | pending |
| 38-02-02 | 02 | 2 | RECEIPT12-03 / RECEIPT12-04 | T-38-05 | Known runtime terminal receipts include modelClass; fake/unknown/no-route receipts omit it. | runtime unit | `pnpm --filter @full-self-browsing/lattice test runtime/create-ai` | yes | pending |
| 38-02-03 | 02 | 2 | RECEIPT12-03 / RECEIPT12-04 | T-38-07 | Checkpoint and agent iteration receipts verify as v1.2 but omit modelClass by default. | integration unit | `pnpm --filter @full-self-browsing/lattice test contract/checkpoint agent/integration runtime/survivability` | yes | pending |
| 38-03-01 | 03 | 3 | RECEIPT12-01 / RECEIPT12-04 | T-38-08 | `TrainingClass` and `CapabilityReceiptBody["modelClass"]` are coherent through package public surfaces. | public + type | `pnpm --filter @full-self-browsing/lattice test public-surface && pnpm --filter @full-self-browsing/lattice exec tsd` | yes | pending |
| 38-03-02 | 03 | 3 | RECEIPT12-04 | T-38-09 | Changeset documents v1.2 minting, v1.1 verification compatibility, and runtime-only modelClass population. | docs + final gates | `test -f .changeset/v1.3.0-receipt-v12-model-class.md && pnpm --filter @full-self-browsing/lattice build && pnpm --filter @full-self-browsing/lattice typecheck` | yes | pending |
| 38-03-03 | 03 | 3 | RECEIPT12-01 / RECEIPT12-02 / RECEIPT12-03 / RECEIPT12-04 | T-38-01..T-38-09 | Full targeted suite, build, typecheck, and tsd pass before marking requirements complete. | regression | `pnpm --filter @full-self-browsing/lattice test receipts/receipt receipts/verify receipts/canonical contract/checkpoint runtime/create-ai agent/integration runtime/survivability public-surface && pnpm --filter @full-self-browsing/lattice build && pnpm --filter @full-self-browsing/lattice typecheck && pnpm --filter @full-self-browsing/lattice exec tsd` | yes | pending |

---

## Requirement Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| RECEIPT12-01 | covered | Plan 38-01 updates receipt types/minting; Plan 38-03 verifies public type surface. |
| RECEIPT12-02 | covered | Plan 38-01 updates verifier shape gate and downgrade tests. |
| RECEIPT12-03 | covered | Plan 38-02 updates runtime issuance and include/omit tests. |
| RECEIPT12-04 | covered | All three plans include regression tests; Plan 38-03 closes release docs and final gates. |

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No Wave 0 files or framework setup are needed.

---

## Manual-Only Verifications

All Phase 38 behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s for targeted suite
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending execution
