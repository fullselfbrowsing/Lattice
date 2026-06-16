---
phase: 39-multi-agent-delegation-surface-full-row-60-close-row-83-upda
plan: 01
subsystem: receipts
tags: [receipts, cid, crypto-01, deleg-06, requirements]
requires:
  - phase: 38-receipt-v1-2-schema-modelclass-tag
    provides: v1.2 receipt schema with modelClass additive-optional precedent
provides:
  - "receiptCid(envelope): Promise<string> content-address helper (sha256:<hex> of DSSE canonical payload bytes)"
  - "CapabilityReceiptBody.parentReceiptCid?: string additive-optional chain field on v1.2 (no schema bump)"
  - "CreateReceiptInput.parentReceiptCid?: string mint input with conditional-spread body assembly"
  - "DELEG-01..08 authored in REQUIREMENTS.md with traceability rows (87/87 REQ-IDs)"
affects:
  - 39-05 (dispatcher chains per-agent receipts via receiptCid + parentReceiptCid)
  - 39-08 (public exports of receiptCid from src/index.ts)
  - milestone audit (87/87 REQ-ID count precondition satisfied)
tech-stack:
  added: []
  patterns:
    - "Buffer-free base64 decode: Uint8Array.from(atob(payload), c => c.charCodeAt(0))"
    - "conditional-spread additive-optional fields under exactOptionalPropertyTypes"
key-files:
  created:
    - packages/lattice/src/receipts/cid.ts
    - packages/lattice/src/receipts/cid.test.ts
  modified:
    - .planning/REQUIREMENTS.md
    - packages/lattice/src/receipts/types.ts
    - packages/lattice/src/receipts/receipt.ts
    - packages/lattice/src/receipts/receipt.test.ts
    - packages/lattice/src/receipts/verify.test.ts
    - packages/lattice/test-d/receipt-v12.test-d.ts
decisions:
  - "receiptCid is NOT yet exported from src/index.ts — public-surface export + publint/attw/tsd root coverage is 39-08's job (DELEG-08), keeping this Wave 1 plan conflict-free with parallel worktrees"
  - "Satisfied the literal grep -c 'Buffer' == 0 gate by dropping the `as ArrayBuffer` cast (locally-created Uint8Array is ArrayBuffer-backed in TS 6) and rephrasing comments; the fingerprint.ts fresh-copy idiom is preserved"
metrics:
  duration: ~8 minutes
  completed: 2026-06-10T16:20:00Z
  tasks: 3
  tests-after: 828 passed (61 files)
---

# Phase 39 Plan 01: Receipt-Chain Substrate + DELEG Requirements Summary

Content-addressed receiptCid helper (sha256 of DSSE payload bytes, key-free) plus additive-optional parentReceiptCid on the v1.2 receipt body with a proven CRYPTO-01 downgrade-defense non-regression matrix; DELEG-01..08 authored for the 87/87 milestone audit.

## Tasks Completed

| # | Task | Commits | Key Changes |
|---|------|---------|-------------|
| 1 | Author DELEG-01..08 in REQUIREMENTS.md | a99cffa | 8 unchecked DELEG REQ-IDs, counts 87/20-categories, planned-table removed, 8 traceability rows |
| 2 | receiptCid content-address helper (TDD) | 6469e1c (RED), 0966440 (GREEN) | cid.ts + cid.test.ts (5 behaviors) |
| 3 | parentReceiptCid + CRYPTO-01 matrix (TDD) | 321dd3d (RED), 064b324 (GREEN) | types.ts/receipt.ts field + 9 new tests + tsd assertions |

## What Was Built

- **`receiptCid(envelope)`** (`packages/lattice/src/receipts/cid.ts`): decodes `envelope.payload` via Buffer-free `atob`, digests with `crypto.subtle.digest("SHA-256", ...)` over a fresh copy (fingerprint.ts idiom), returns `` `sha256:${hex}` ``. Derivable from any envelope without KeySet/signer. 5 behavior tests including an independent re-derivation cross-check.
- **`parentReceiptCid?: string`** on `CapabilityReceiptBody` (beside `modelClass`) and `CreateReceiptInput`, assembled via the exact modelClass conditional-spread shape (`...(input.parentReceiptCid !== undefined ? { parentReceiptCid: input.parentReceiptCid } : {})`). No schema-version change — the literal union still ends at `"lattice-receipt/v1.2"`.
- **CRYPTO-01 non-regression matrix** in verify.test.ts: forged v1 body carrying `parentReceiptCid` → `schema-version-too-low` (pre-crypto short-circuit); absent-version body with the field → `schema-version-too-low`; forged `"lattice-receipt/v2"` with the field → `version-mismatch`; previously-signed v1.1 (no field) still verifies; post-signing tamper of the chain link → `canonicalization-mismatch`/`signature-invalid`.
- **Receipt-chain round-trip test** in receipt.test.ts: mints a crew-root receipt, derives its real CID via `receiptCid`, mints a child carrying it, serializes/deserializes/verifies byte-stably, and proves CID stability across the wire.
- **DELEG-01..08** authored in `.planning/REQUIREMENTS.md` using the RESEARCH.md draft wording, with the counts table updated to 87 REQ-IDs / 20 categories, the "Planned but not yet authored" table deleted, 8 traceability rows (all `pending`), and the dated footnote.

## Verification Results

- `pnpm --filter @full-self-browsing/lattice test -- src/receipts` — 828/828 tests, 61 files green
- `pnpm --filter @full-self-browsing/lattice typecheck` — clean
- `pnpm --filter @full-self-browsing/lattice test:types` — vitest typecheck + tsd, no errors (after `pnpm build` to produce `dist/index.d.ts`)
- `grep -c 'Buffer' packages/lattice/src/receipts/cid.ts` — 0
- REQUIREMENTS.md grep gates — 8 DELEG entries, DELEG category row present, planned-table gone, 8 traceability rows

## TDD Gate Compliance

- Task 2: RED 6469e1c (`test(39-01)`) → GREEN 0966440 (`feat(39-01)`). RED failed with module-not-found for cid.js.
- Task 3: RED 321dd3d (`test(39-01)`) → GREEN 064b324 (`feat(39-01)`). RED failed on the two mint-inclusion tests. The verify downgrade-matrix tests passed at RED as expected: the CRYPTO-01 gate is version-based and field-independent — that field-independence IS the non-regression property under test, so the pre-implementation pass is the correct baseline, not an accidental pass.
- No REFACTOR commits needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] node_modules missing in fresh worktree**
- **Found during:** Task 2 (first test run: `vitest: command not found`)
- **Fix:** `pnpm install --frozen-lockfile` — lockfile-pinned install of existing workspace deps only; zero new packages (consistent with D-18 / threat row T-39-SC)
- **Files modified:** none (node_modules only)

**2. [Rule 1 - Bug] cid.ts initially failed the literal `grep -c 'Buffer' == 0` gate**
- **Found during:** Task 2 acceptance check
- **Issue:** comments mentioning "Node Buffer"/"ArrayBuffer" and the `copy.buffer as ArrayBuffer` cast matched the literal grep even though no Node Buffer API was used
- **Fix:** dropped the now-unneeded cast (locally-created `Uint8Array` is `ArrayBuffer`-backed under TS 6) and rephrased comments; the fresh-copy idiom and behavior are unchanged
- **Commit:** 0966440 (folded into GREEN)

**3. Built `dist/` to enable tsd**
- **Found during:** Task 3 verification — `tsd` requires `dist/index.d.ts`
- **Fix:** ran `pnpm build` (gitignored output, no commit impact)

## Known Stubs

None — no placeholder values, empty-data wiring, or TODO markers introduced.

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary surface beyond the plan's `<threat_model>`. All three `mitigate` dispositions implemented: T-39-01 (downgrade matrix), T-39-02 (signed-body field + tamper test), T-39-03 (hash-only identifier with doc-comment prohibition on free-form content).

## Commits

| Hash | Type | Description |
|------|------|-------------|
| a99cffa | docs | author DELEG-01..08 requirements with traceability |
| 6469e1c | test | failing tests for receiptCid content-address helper |
| 0966440 | feat | implement receiptCid content-address helper |
| 321dd3d | test | failing tests for parentReceiptCid + CRYPTO-01 downgrade matrix |
| 064b324 | feat | add parentReceiptCid to v1.2 receipt body and CreateReceiptInput |

## Self-Check: PASSED
