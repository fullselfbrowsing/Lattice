---
phase: 50-protocol-specification
plan: "03"
subsystem: spec
tags: [json-schema, changelog, receipt-protocol, i-json, drift-gate]
dependency_graph:
  requires: [50-01, 50-02]
  provides: [spec/schema/v1.1.json, spec/schema/v1.2.json, spec/schema/v1.3.json, spec/CHANGELOG.md]
  affects: [Phase 51 conformance vector generator, Phase 52 TS harness, Phase 53-55 Python client]
tech_stack:
  added: []
  patterns: [JSON Schema draft 2020-12, additionalProperties:false drift gate, I-JSON safe-integer encoding, $comment backstop prose]
key_files:
  created:
    - spec/schema/v1.1.json
    - spec/schema/v1.2.json
    - spec/schema/v1.3.json
    - spec/CHANGELOG.md
  modified: []
decisions:
  - "Flat standalone schema files (no $ref composition between versions) per D-06 — each file is a complete independent document"
  - "outputHash uses bare hex pattern ^[0-9a-f]{64}$ (not sha256: prefix) per T-50-09 and fingerprint.ts behavior"
  - "Optional fields present in all versions (stepName, stepIndex, etc.) are listed in properties of all three files to satisfy additionalProperties:false without rejecting valid receipts"
  - "noRouteReasons and tripwireEvidence left unconstrained (items: {type: object}) per RESEARCH.md recommendation — full item schemas arrive in Phase 51 when conformance vectors exercise them"
requirements-completed: [SPEC-07]
metrics:
  duration: "3 minutes"
  completed_date: "2026-06-25"
  tasks: 2
  files: 4
---

# Phase 50 Plan 03: JSON Schema Files + CHANGELOG Summary

JSON Schema draft 2020-12 files for receipt body v1.1/v1.2/v1.3 plus CHANGELOG.md, implementing the drift/forgery gate (T-50-08) via `additionalProperties: false` and I-JSON constraints (D-06/D-07/D-08).

## What Was Built

**spec/schema/v1.1.json** — Base receipt schema. 14 required fields, 8 optional common fields (stepName, stepIndex, parentStepName, previousStepName, sessionId, timestamp, noRouteReasons, tripwireEvidence). No modelClass, parentReceiptCid, or lineageMerkleRoot. `version` enum: `["lattice-receipt/v1.1"]`.

**spec/schema/v1.2.json** — Adds optional `modelClass` with 5-value `TrainingClass` enum: frontier_rlhf, mid_tier_rlhf, open_weight_instruct, open_weight_base, local_quantized. `version` enum: `["lattice-receipt/v1.2"]`.

**spec/schema/v1.3.json** — Adds optional `parentReceiptCid` and `lineageMerkleRoot` (both pattern `^sha256:[0-9a-f]{64}$`). Contains all v1.2 + v1.3 additions. `version` enum: `["lattice-receipt/v1.3"]`.

**All three files share:**
- `$schema`: `https://json-schema.org/draft/2020-12/schema`
- `additionalProperties: false` on every object (root + model + route + usage + redactions[].items)
- I-JSON constraints: promptTokens/completionTokens/stepIndex as `{type:integer, minimum:0, maximum:9007199254740991}`; costUsd as `oneOf[string-pattern, null]` with decimal pattern `^-?(0|[1-9][0-9]*)(\.[0-9]+)?$`
- outputHash as `oneOf[{type:string, minLength:64, maxLength:64, pattern:^[0-9a-f]{64}$}, null]` — bare hex, no sha256: prefix (T-50-09)
- contractHash as `oneOf[{type:string, pattern:^sha256:[0-9a-f]{64}$}, null]`
- D-08 `$comment` backstop on integer fields, costUsd, and outputHash

**spec/CHANGELOG.md** — Human-readable per-version delta in descending order (v1.3 → v1.2 → v1.1). Cites introducing phases, lists added fields with patterns/constraints, states signing/verification is unchanged for additive versions. Footer downgrade-defense note for lattice-receipt/v1.

## Verification Results

All 8 phase gate checks passed:
1. All three schema files parse as valid JSON
2. `additionalProperties: false` present in all three (15 occurrences total across nested objects)
3. `modelClass` NOT in v1.1 properties: `false`
4. `parentReceiptCid` IS in v1.3 properties: `true`
5. CHANGELOG version count: 3 (≥3 required)
6. `frontier_rlhf` appears in v1.2 and v1.3
7. `frontier_rlhf` NOT in v1.1 (correct — modelClass absent)
8. Structural validation of vector0-fixture.json body against v1.3: all required fields present, no unknown properties

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1: Three JSON Schema files | 984e181 | feat(50-03): author JSON Schema draft 2020-12 for receipt body v1.1, v1.2, v1.3 |
| Task 2: CHANGELOG.md | 995ed07 | docs(50-03): author spec/CHANGELOG.md with per-version receipt schema deltas |

## Deviations from Plan

None — plan executed exactly as written. All acceptance criteria met. Phase guidance not to use ajv (not installed) followed exactly; structural Node.js checks used instead.

## Known Stubs

None. All schema fields are fully specified and correct. No placeholder values or TODO markers.

## Threat Flags

None. No new network endpoints, auth paths, or trust boundary changes introduced. Files are documentation/schema artifacts only.

## Self-Check: PASSED

- spec/schema/v1.1.json: FOUND
- spec/schema/v1.2.json: FOUND
- spec/schema/v1.3.json: FOUND
- spec/CHANGELOG.md: FOUND
- Commit 984e181: FOUND
- Commit 995ed07: FOUND
