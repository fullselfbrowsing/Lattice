---
phase: 58
slug: conformance-and-client-migration
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-16
---

# Phase 58 - Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5, pytest 8+, Node package-consumer smoke |
| **Config file** | `conformance/*/vitest.config.ts`, `clients/python/pyproject.toml`, package Vitest configs |
| **Quick run command** | `pnpm --filter @lattice-conformance/verify-ts test && .context/python-venv/bin/python -m pytest clients/python/tests/test_conformance.py -q` |
| **Full suite command** | `pnpm -r typecheck && pnpm -r test && pnpm -r build && pnpm -r test:types && .context/python-venv/bin/python -m pytest clients/python/tests -q && pnpm --filter @lattice-conformance/generate check:generated && node scripts/check-protocol-package-consumer.mjs` |
| **Estimated runtime** | Under 10 minutes |

## Sampling Rate

- After every corpus task: run generator/verify package typechecks and focused conformance tests.
- After every Python task: run the full Python client suite, including the independent oracle.
- After every CLI task: run focused materializer, verify, and repro tests.
- After each plan wave: run all workspace typechecks plus the affected complete package suites.
- Before phase verification: the full Phase 58 suite and clean packed-consumer smoke must pass.
- Max feedback latency for a task-level command: 180 seconds.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 58-01-01 | 01 | 1 | CONF16-01 | T-58-01 | v1.4 schema/spec define raw-byte PAE and bounded legacy policy | schema/docs | `pnpm --filter @lattice-conformance/generate test` | existing | pending |
| 58-01-02 | 01 | 1 | CONF16-02, CONF16-06 | T-58-02, T-58-04 | Legacy bytes remain frozen and manifests have exact recursive coverage | integration | `pnpm --filter @lattice-conformance/verify-ts test -- src/manifest.test.ts` | existing | pending |
| 58-01-03 | 01 | 1 | CONF16-01, CONF16-02, CONF16-06 | T-58-03 | Standalone generator deterministically reproduces only the standard corpus | generation | `pnpm --filter @lattice-conformance/generate typecheck && pnpm --filter @lattice-conformance/generate test && pnpm --filter @lattice-conformance/generate check:generated` | existing plus task-created | pending |
| 58-02-01 | 02 | 2 | CONF16-02, CONF16-03 | T-58-01, T-58-03 | TS distinguishes profiles and exact negative verdicts | integration | `pnpm --filter @lattice-conformance/verify-ts typecheck && pnpm --filter @lattice-conformance/verify-ts test` | existing | pending |
| 58-02-02 | 02 | 2 | CONF16-02, CONF16-03 | T-58-01, T-58-03 | Python mirrors TS corpus outcomes and both mint directions verify | integration | `.context/python-venv/bin/python -m pytest clients/python/tests -q` | existing | pending |
| 58-02-03 | 02 | 2 | CONF16-04 | T-58-03, T-58-06 | Exact test-only oracle matches PAE and independently verifies standard signatures | oracle | `.context/python-venv/bin/python -m pytest clients/python/tests/test_dsse_oracle.py -q` | task-created | pending |
| 58-03-01 | 03 | 2 | CONF16-05 | T-58-05 | Materializer applies caller's legacy policy before artifact access | unit | `pnpm --filter @full-self-browsing/lattice exec vitest run src/replay/materialize.test.ts` | existing | pending |
| 58-03-02 | 03 | 2 | CONF16-05 | T-58-05 | Verify and repro expose profile/deprecation and enforce `--standard-only` | unit | `pnpm --filter @full-self-browsing/lattice-cli exec vitest run test/verify.test.ts test/repro.test.ts` | existing | pending |
| 58-03-03 | 03 | 2 | CONF16-06 | T-58-07 | Packed runtime and CLI preserve standard and strict bridge behavior | package integration | `node scripts/check-protocol-package-consumer.mjs` | task-created | pending |
| 58-04-01 | 04 | 3 | CONF16-01..06 | T-58-01..T-58-07 | CI exposes and enforces every conformance drift class | workflow/source | `pnpm -r typecheck && pnpm -r test` | existing | pending |
| 58-04-02 | 04 | 3 | CONF16-01..06 | T-58-01..T-58-07 | Full source, type, build, Python, generation, oracle, and packed gates pass | full integration | `pnpm -r typecheck && pnpm -r test && pnpm -r build && pnpm -r test:types && .context/python-venv/bin/python -m pytest clients/python/tests -q && pnpm --filter @lattice-conformance/generate check:generated && node scripts/check-protocol-package-consumer.mjs` | existing plus task-created | pending |

## Wave 0 Requirements

Existing test frameworks cover the phase. Task 58-01-03 adds the non-mutating generated-artifact
check, Task 58-02-03 adds `test_dsse_oracle.py` and the exact test extra, and Task 58-03-03
adds the packed-consumer smoke before their corresponding gates run.

## Manual-Only Verifications

All phase behaviors have automated verification.

## Validation Sign-Off

- [x] All tasks have automated verification.
- [x] Sampling continuity has no three-task gap.
- [x] Wave 0 additions are owned by the tasks that first consume them.
- [x] Commands are non-watch and deterministic.
- [x] Task-level feedback latency target is under 180 seconds.
- [x] `nyquist_compliant: true` is set.

**Approval:** approved 2026-07-16
