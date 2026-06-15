---
phase: 37
slug: tool-call-validation-layer-opt-in
status: verified
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-09
---

# Phase 37 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 + tsd |
| **Config file** | `packages/lattice/vitest.config.ts` |
| **Quick run command** | `pnpm --filter @full-self-browsing/lattice test tool-call-validation format-tools public-surface` |
| **Full suite command** | `pnpm --filter @full-self-browsing/lattice test tool-call-validation format-tools adapters openrouter xai lm-studio agent/runtime anthropic gemini parity public-surface && pnpm --filter @full-self-browsing/lattice typecheck && pnpm --filter @full-self-browsing/lattice exec tsd` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task's focused Vitest target from the plan `<verify>` block.
- **After every plan wave:** Run the full Phase 37 targeted suite plus type gates.
- **Before `$gsd-verify-work`:** Full Phase 37 targeted suite and type gates must be green.
- **Max feedback latency:** ~30 seconds for the targeted phase suite.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 37-01-01 | 01 | 1 | VALID-02 | T-37-02 | Public validation types and error class are additive and exported. | unit + type | `pnpm --filter @full-self-browsing/lattice test tool-call-validation public-surface && pnpm --filter @full-self-browsing/lattice exec tsd` | yes | green |
| 37-01-02 | 01 | 1 | VALID-02 / VALID-03 | T-37-01 / T-37-03 | Validator rejects unknown tools, invalid args, extra fields; drop/callback only return valid calls. | unit | `pnpm --filter @full-self-browsing/lattice test tool-call-validation` | yes | green |
| 37-01-03 | 01 | 1 | VALID-01 / VALID-02 | T-37-02 / T-37-04 | `ProviderRunResponse.toolCalls` is optional; parser reuse prevents grammar drift; root exports are present. | unit + public surface | `pnpm --filter @full-self-browsing/lattice test format-tools public-surface` | yes | green |
| 37-01-04 | 01 | 1 | VALID-03 | T-37-01 / T-37-04 | Core behavior, parser reuse, public surface, and package type imports are covered. | unit + type | `pnpm --filter @full-self-browsing/lattice test tool-call-validation format-tools public-surface && pnpm --filter @full-self-browsing/lattice exec tsd` | yes | green |
| 37-02-01 | 02 | 2 | VALID-01 / VALID-03 | T-37-08 | OpenAI-compatible validation preserves `rawOutputs` / `rawResponse` and omits `toolCalls` when absent. | adapter unit | `pnpm --filter @full-self-browsing/lattice test adapters` | yes | green |
| 37-02-02 | 02 | 2 | VALID-01 / VALID-03 | T-37-05 | OpenAI, OpenRouter, xAI, and LM Studio inherit validation exactly once. | adapter unit | `pnpm --filter @full-self-browsing/lattice test adapters openrouter xai lm-studio` | yes | green |
| 37-02-03 | 02 | 2 | VALID-03 | T-37-06 / T-37-07 | `runAgent` prefers `response.toolCalls`; dropped invalid calls are not executed. | runtime unit | `pnpm --filter @full-self-browsing/lattice test agent/runtime` | yes | green |
| 37-02-04 | 02 | 2 | VALID-01 / VALID-03 | T-37-05 / T-37-06 / T-37-07 | OpenAI-compatible family and runtime behavior are covered together. | adapter + runtime unit | `pnpm --filter @full-self-browsing/lattice test adapters openrouter xai lm-studio agent/runtime` | yes | green |
| 37-03-01 | 03 | 2 | VALID-01 / VALID-03 | T-37-09 / T-37-10 | Anthropic validates returned calls and preserves raw provider response data. | adapter unit | `pnpm --filter @full-self-browsing/lattice test anthropic` | yes | green |
| 37-03-02 | 03 | 2 | VALID-01 / VALID-03 | T-37-09 / T-37-10 | Gemini validates returned calls and preserves raw provider response data. | adapter unit | `pnpm --filter @full-self-browsing/lattice test gemini` | yes | green |
| 37-03-03 | 03 | 2 | VALID-01 / VALID-03 | T-37-09 / T-37-11 | All seven adapters share valid/drop/throw validation behavior. | parity unit | `pnpm --filter @full-self-browsing/lattice test anthropic gemini parity` | yes | green |
| 37-03-04 | 03 | 2 | VALID-03 | T-37-12 | Changeset documents returned-envelope validation without native provider tool API claims; final gates pass. | docs + regression | `pnpm --filter @full-self-browsing/lattice test tool-call-validation format-tools adapters openrouter xai lm-studio agent/runtime anthropic gemini parity public-surface && pnpm --filter @full-self-browsing/lattice typecheck && pnpm --filter @full-self-browsing/lattice exec tsd` | yes | green |

---

## Requirement Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| VALID-01 | covered | Adapter tests in `adapters.test.ts`, `openrouter.test.ts`, `xai.test.ts`, `lm-studio.test.ts`, `anthropic.test.ts`, `gemini.test.ts`, and all-seven `parity.test.ts`; runtime preference in `runtime.test.ts`. |
| VALID-02 | covered | `tool-call-validation.test.ts`, `format-tools.test.ts`, `public-surface.test.ts`, and `test-d/tool-call-validation.test-d.ts`. |
| VALID-03 | covered | Shared validator tests, adapter-family tests, direct adapter tests, runtime tests, all-seven parity, public-surface tests, `typecheck`, `tsd`, and `.changeset/v1.3.0-tool-call-validation.md`. |

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No Wave 0 files or framework setup were needed.

---

## Manual-Only Verifications

All Phase 37 behaviors have automated verification.

---

## Validation Audit 2026-06-09

| Metric | Count |
|--------|-------|
| Requirements audited | 3 |
| Task rows audited | 12 |
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Commands run during this audit:

- `pnpm --filter @full-self-browsing/lattice test tool-call-validation format-tools adapters openrouter xai lm-studio agent/runtime anthropic gemini parity public-surface` - passed, 11 files / 295 tests.
- `pnpm --filter @full-self-browsing/lattice typecheck` - passed.
- `pnpm --filter @full-self-browsing/lattice exec tsd` - passed.

Note: `pnpm --filter @full-self-browsing/lattice test:types` was started first but produced no progress output for ~105 seconds and was terminated with `SIGTERM`. Its underlying gates were rerun separately as `typecheck` and `tsd`, both passing.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s for targeted suite
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-06-09
