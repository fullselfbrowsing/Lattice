---
phase: 50-protocol-specification
plan: 01
subsystem: spec
tags: [vector, fixture, ed25519, jcs, receipt, conformance]
dependency_graph:
  requires: []
  provides:
    - spec/generate-vector0.ts
    - spec/vector0-fixture.json
  affects:
    - .planning/phases/51-conformance-vectors (vector #0 fixture consumed here)
    - spec/SPEC.md (Phase 50 Plan 02/03 embeds fixture bytes inline in §4.9)
tech_stack:
  added:
    - tsx ^4.22.4 (workspace root devDependency — run via pnpm exec tsx)
  patterns:
    - "Throwaway generator script pattern: imports real receipts pipeline, writes committed JSON fixture"
    - "Fixed committed keypair: EXAMPLE/TEST-ONLY Ed25519 JWK embedded as constant"
    - "Pipeline ordering: redact → canonicalize → base64 → PAE → sign → encode → CID"
key_files:
  created:
    - spec/generate-vector0.ts
    - spec/vector0-fixture.json
  modified:
    - package.json (added tsx ^4.22.4 to devDependencies)
    - pnpm-lock.yaml (updated for tsx)
decisions:
  - "Fixed keypair committed as EXAMPLE/TEST-ONLY constant in spec/generate-vector0.ts — never call generateEd25519KeyPairJwk() at runtime (D-03)"
  - "tripwireEvidence with kind 'no-pii' included in body to trigger redact.ts default policy and satisfy D-04 ≥1 redaction"
  - "tsx added to workspace root devDependencies (pnpm exec tsx) since spec/ has no package.json"
  - "outputHash: null chosen to avoid object-serialization ambiguity in spec example"
  - "tsx must be invoked with --no-cache on first run; subsequent runs use cached transform"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-25"
  tasks: 2
  files: 4
requirements_satisfied:
  - SPEC-01
  - SPEC-03
  - SPEC-04
  - SPEC-05
  - SPEC-07
---

# Phase 50 Plan 01: Vector #0 Generator and Fixture Summary

Committed `spec/generate-vector0.ts` (throwaway generator) and `spec/vector0-fixture.json` (canonical worked-example bytes) — concrete byte values for SPEC.md §4.9 and conformance vector #0 generated from the real reference implementation, never hand-authored (D-03).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write spec/generate-vector0.ts | 4080624 | spec/generate-vector0.ts, package.json, pnpm-lock.yaml |
| 2 | Run generator; commit spec/vector0-fixture.json | 9e5c775 | spec/vector0-fixture.json |

## What Was Built

### `spec/generate-vector0.ts` (298 lines)

A throwaway ESM TypeScript script that:

1. Embeds a **committed Ed25519 keypair** labeled `EXAMPLE/TEST-ONLY KEY MATERIAL — DO NOT USE IN PRODUCTION`
2. Assembles a **fixed body** with `stepName: "分析-step"` (non-ASCII JCS edge case, D-04) and `tripwireEvidence: { kind: "no-pii", ... }` to guarantee ≥1 redaction
3. Executes the exact **pipeline ordering** per `receipt.ts`: redact → canonicalize → base64 → PAE → sign → encode → CID
4. **Captures intermediate bytes**: `canonicalBytesHex`, `paeHex`, `signatureHex`
5. **Asserts** structural correctness before writing (hex format, sig length 128, cid format 71 chars, redactions ≥1)
6. Writes `spec/vector0-fixture.json`

### `spec/vector0-fixture.json`

Contains all 9 required fields:
- `WARNING`: "EXAMPLE/TEST-ONLY KEY MATERIAL — DO NOT USE IN PRODUCTION..."
- `body`: full redacted receipt body with `stepName: "分析-step"`, `redactions: [{ path: "tripwireEvidence.observed", reason: "no-pii-detector-substring-only" }]`
- `canonicalBytesHex`: 1700 hex chars (850 bytes of JCS canonical JSON)
- `payloadBase64`: standard base64 (RFC 4648 §4, NOT base64url)
- `paeHex`: DSSE v1.0 PAE bytes
- `signatureHex`: 128 hex chars (64-byte Ed25519 signature)
- `envelope`: `{ payloadType: "application/vnd.lattice.receipt+json", payload: ..., signatures: [...] }`
- `cid`: `sha256:d8bc75e07072455cd8d234d86e2b7d7444ef5233ad71e62586ac7a358ae0cf63` (71 chars)
- `publicKeyJwk`: OKP Ed25519 public key (JWK format, RFC 8037)

## Verification Results

| Check | Result |
|-------|--------|
| `pnpm exec tsx spec/generate-vector0.ts` | Exit 0 |
| `cid.startsWith("sha256:") && cid.length === 71` | PASS |
| `signatureHex.length === 128` | PASS |
| `/^[0-9a-f]+$/.test(canonicalBytesHex)` | PASS |
| `body.stepName === "分析-step"` | PASS |
| `body.redactions.length >= 1` | PASS (1 redaction) |
| `grep "EXAMPLE/TEST-ONLY" spec/generate-vector0.ts` | 3 occurrences |
| `pnpm --filter @full-self-browsing/lattice test` | 1059/1059 PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] tsx initial cache miss required `--no-cache` on first run**
- **Found during:** Task 1 verify step
- **Issue:** First `pnpm exec tsx spec/generate-vector0.ts` failed with `ERR_MODULE_NOT_FOUND: Cannot find package 'canonicalize'` due to tsx's ESM resolution cache not recognizing pnpm symlinks on initial cold run
- **Fix:** Added `--no-cache` flag on first run. Subsequent runs (without `--no-cache`) succeeded because tsx's transform cache populated correctly. The plan's `pnpm exec tsx spec/generate-vector0.ts` command works without flags on all runs after the first.
- **Files modified:** None (runtime flag only)
- **Impact:** Zero — the fixture produced is identical whether `--no-cache` is used or not

**2. [Rule 2 - Missing] TripwireEvidence required full interface fields**
- **Found during:** Task 1 implementation
- **Issue:** `TripwireEvidence` interface in `contract/tripwire.ts` requires `invariantId`, `kind`, `path`, `observed`, and `message` — not just `kind` and `observed` as implied by the plan's action description
- **Fix:** Added all required fields: `invariantId: "spec-tripwire-example"`, `path: "tripwireEvidence.observed"`, `message: "no-pii detector triggered (spec example only)"`
- **Files modified:** spec/generate-vector0.ts
- **Commit:** 4080624

## Known Stubs

None. The fixture is fully wired with real computed bytes from the reference implementation.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes were introduced. The committed private key material is explicitly labeled EXAMPLE/TEST-ONLY per threat T-50-01 mitigation. No new threat surface beyond what was declared in the plan's threat model.

## Self-Check: PASSED

- `spec/generate-vector0.ts` exists: FOUND
- `spec/vector0-fixture.json` exists: FOUND
- Commit 4080624 exists: FOUND (`feat(50-01): write spec/generate-vector0.ts`)
- Commit 9e5c775 exists: FOUND (`feat(50-01): run generator; commit spec/vector0-fixture.json`)
