---
phase: 55
slug: python-mint
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-06
---

# Phase 55 - Validation Strategy

> Reconstructed validation contract for the completed Python mint phase.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest via `clients/python/pyproject.toml` |
| **Config file** | `clients/python/pyproject.toml` |
| **Quick run command** | `.context/python-venv/bin/python -m pytest clients/python/tests/test_mint.py -q` |
| **Full suite command** | `.context/python-venv/bin/python -m pytest clients/python/tests -q` |
| **Estimated runtime** | ~2 seconds |

---

## Sampling Rate

- **After every task commit:** Run the quick mint test command.
- **After every plan wave:** Run the full Python pytest suite.
- **Before `$gsd-verify-work`:** Full Python pytest suite must be green.
- **Max feedback latency:** 2 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 55-01-01 | 01 | 1 | PYM-01 | - | Python mint emits byte-identical canonical bytes, payload, PAE, and signature for vector #0 | pytest | `.context/python-venv/bin/python -m pytest clients/python/tests/test_mint.py -q` | yes | green |
| 55-01-02 | 01 | 1 | PYM-02 | - | Unsafe floats and non-I-JSON numeric fields are rejected at mint time | pytest | `.context/python-venv/bin/python -m pytest clients/python/tests/test_mint.py -q` | yes | green |
| 55-01-03 | 01 | 1 | PYM-03 | - | Minted envelopes verify in-language and expose CLI parity output | pytest | `.context/python-venv/bin/python -m pytest clients/python/tests/test_mint.py -q` | yes | green |

*Status: green = automated verification passed.*

---

## Wave 0 Requirements

- [x] `clients/python/tests/test_mint.py` covers mint byte parity, numeric rejection, and mint-to-verify self-check.
- [x] `python -m lattice_receipt mint-json` exists for Phase 56 cross-language parity.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing references.
- [x] No watch-mode flags.
- [x] Feedback latency < 2s.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved 2026-07-06
