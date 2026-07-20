---
phase: 57
slug: protocol-semantics
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-16
updated: 2026-07-20
---

# Phase 57 - Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 and pytest 8+ |
| **Config file** | `packages/lattice/vitest.config.ts` and `clients/python/pyproject.toml` |
| **Quick run command** | `pnpm --filter @full-self-browsing/lattice exec vitest run src/receipts/envelope.test.ts src/receipts/receipt.test.ts src/receipts/verify.test.ts src/receipts/cid.test.ts` |
| **Full suite command** | `pnpm --filter @full-self-browsing/lattice typecheck && pnpm --filter @full-self-browsing/lattice test && .context/python-venv/bin/python -m pytest clients/python/tests` |
| **Estimated runtime** | Under 120 seconds |

## Sampling Rate

- After every TypeScript task commit: run the receipt-focused Vitest command.
- After every Python task commit: run `.context/python-venv/bin/python -m pytest clients/python/tests`.
- After every plan wave: run that language's complete suite and typecheck where applicable.
- Before phase verification: the full Phase 57 suite must be green.
- Max feedback latency: 120 seconds.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 57-01-01 | 01 | 1 | SIGBR-01, SIGBR-02, SIGBR-05 | T-57-01, T-57-04 | TypeScript issuer signs raw bytes and has no legacy selector | unit | `pnpm --filter @full-self-browsing/lattice exec vitest run src/receipts/envelope.test.ts src/receipts/receipt.test.ts` | existing | passed |
| 57-01-02 | 01 | 1 | SIGBR-03, SIGBR-04, SIGBR-06 | T-57-01, T-57-02, T-57-03 | Verifier reports profile and cannot downgrade v1.4 | unit | `pnpm --filter @full-self-browsing/lattice exec vitest run src/receipts/verify.test.ts src/receipts/cid.test.ts` | existing | passed |
| 57-01-03 | 01 | 1 | SIGBR-01..06 | T-57-01..T-57-04 | Public types and all TypeScript call sites remain compatible | integration/type | `pnpm --filter @full-self-browsing/lattice typecheck && pnpm --filter @full-self-browsing/lattice test` | existing | passed |
| 57-02-01 | 02 | 2 | SIGBR-01, SIGBR-02, SIGBR-05 | T-57-04 | Python mint/build_pae are corrected-only | unit | `.context/python-venv/bin/python -m pytest clients/python/tests/test_mint.py` | existing | passed |
| 57-02-02 | 02 | 2 | SIGBR-03, SIGBR-04, SIGBR-06 | T-57-01, T-57-02, T-57-03 | Python bridge mirrors TypeScript policy and diagnostics | unit | `.context/python-venv/bin/python -m pytest clients/python/tests` | existing | passed |
| 57-02-03 | 02 | 2 | SIGBR-01..06 | T-57-01..T-57-04 | Both language suites pass together | integration | `pnpm --filter @full-self-browsing/lattice typecheck && pnpm --filter @full-self-browsing/lattice test && .context/python-venv/bin/python -m pytest clients/python/tests` | existing | passed |

## Wave 0 Requirements

Existing Vitest, TypeScript, cryptography, RFC 8785, and pytest infrastructure covers all
phase requirements. No new fixture framework or runtime dependency is required.

## Manual-Only Verifications

All phase behaviors have automated verification.

## Validation Sign-Off

- [x] All tasks have automated verification.
- [x] Sampling continuity has no three-task gap.
- [x] Existing infrastructure covers all referenced tests.
- [x] Commands are non-watch and deterministic.
- [x] Feedback latency target is under 120 seconds.
- [x] `nyquist_compliant: true` is set.

**Approval:** approved 2026-07-16

## Execution Evidence

All six rows passed before `57-VERIFICATION.md` was issued on 2026-07-16. The
receipt-focused TypeScript suite passed 87 tests, the complete runtime passed 1,109
tests, the Python client passed 44 tests, and typecheck, build, type tests, source
audits, and diff checks were green.
