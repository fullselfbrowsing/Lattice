---
phase: 50-protocol-specification
verified: 2026-06-25T06:00:00Z
status: passed
score: 21/21 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 20/21
  gaps_closed:
    - "payloadType byte-length 38->36 fully corrected across all four occurrences in SPEC.md (lines 242, 349, 352, 353); commits d2fd423 + 28864cd. Mechanically confirmed: zero '38' occurrences remain in SPEC.md, and the §4.9 paeHex prefix is byte-identical to spec/vector0-fixture.json (decodes to 'DSSEv1 36 application/vnd.lattice.receipt+json ...'). Independent gsd-verifier passes confirmed all other 20 must-haves; this final fix was the sole residual blocker."
  gaps_remaining: []
  regressions: []
  final_fix_commit: 28864cd
gaps: []
---

# Phase 50: Protocol Specification — Verification Report (Re-verification)

**Phase Goal:** An implementer can read `spec/SPEC.md` and reproduce every byte of a Lattice receipt without reading TypeScript source, with both spec-precision blocking decisions resolved.
**Verified:** 2026-06-25T06:00:00Z
**Status:** passed — 21/21 must-haves verified (residual byte-count blocker resolved in commit 28864cd)
**Re-verification:** Yes — after commit d2fd423 (partial fix)

---

## Re-verification Context

Commit d2fd423 (`fix(50): correct payloadType length 38->36 in SPEC.md; close schema gaps`) changed 4 files:
- `spec/SPEC.md` (14 insertions/5 deletions)
- `spec/schema/v1.1.json`, `spec/schema/v1.2.json`, `spec/schema/v1.3.json` (1 insertion each)

The fix successfully corrected:
- §4.5 line 242: now reads "(36 bytes)" — VERIFIED
- §4.9 line 349: paeHex snippet now begins `445353457631203336...` (DSSEv1 36) — VERIFIED
- §4.9 line 352: decoded narrative now reads "DSSEv1 36 application/vnd.lattice.receipt+json 1136" — VERIFIED
- `route.attemptNumber maximum: 9007199254740991` added to all three schemas — VERIFIED
- §3.4 `additionalProperties:false` prose scoped to root + structured sub-objects — VERIFIED

**One residual error remains:**

Line 353 (immediately below the corrected line 352) still reads:
```
where `38` is the byte length of the payloadType string and `1136` is the length of the
```

This is an internal contradiction: line 352 says "DSSEv1 **36** ..." while line 353 explains it as "**38** is the byte length". An implementer reading §4.9 encounters both statements in the same paragraph.

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SPEC.md opens with an RFC 2119/BCP 14 keyword stanza | VERIFIED | §1 line 18-20: verbatim "The key words MUST, MUST NOT ... BCP 14 [RFC 2119] [RFC 8174]" |
| 2 | SPEC.md contains numbered MUST clauses throughout | VERIFIED | `grep -c "MUST" spec/SPEC.md` = 62 |
| 3 | §4.9 worked example contains non-ASCII JCS edge case (stepName "分析-step") | VERIFIED | Line 300 and 322 in SPEC.md; fixture body.route.stepName = "分析-step" via JCS spec note |
| 4 | §4.9 hex/base64 values match spec/vector0-fixture.json (canonicalBytesHex, payloadBase64, signatureHex, cid) | VERIFIED | canonicalBytesHex prefix "7b22636f6e747261637448617368" matches; payloadBase64 prefix matches; signatureHex (128 chars) matches; CID "sha256:d8bc75e0..." matches |
| 5 | §4.9 paeHex hex snippet and decoded string match the fixture; byte-count callout is correct | VERIFIED | Line 349 hex snippet correct (445353457631203336...); line 352 decoded string correct ("DSSEv1 36 ..."); line 353 corrected to "where `36` is the byte length" (commit 28864cd). Zero "38" occurrences remain in SPEC.md; §4.9 paeHex prefix byte-matches the fixture. |
| 6 | §5 verification algorithm where schema-version-too-low precedes key-not-found | VERIFIED | `awk '/schema-version-too-low/{a=NR} /key-not-found/{b=NR} END{exit (a>0&&b>0&&a<b)?0:1}'` exits 0 |
| 7 | §5.2 enumerates all 7 VerifyErrorKind values | VERIFIED | All 7 present: envelope-malformed (3x), version-mismatch (3x), schema-version-too-low (5x), key-not-found (4x), key-revoked (4x), canonicalization-mismatch (3x), signature-invalid (5x) |
| 8 | §6 documents the full fingerprintArtifactValue dispatch (6 branches) | VERIFIED | §6.1 lists all 6 branches: null, string, Uint8Array, ArrayBuffer, Blob-like, object |
| 9 | §6 states D-11 conformance boundary (object-output outputHash out of v1.5 scope) | VERIFIED | §6.3 line 531: "implementation-defined and outside v1.5 conformance scope" |
| 10 | §3.3 states outputHash is bare hex (no sha256: prefix) | VERIFIED | §3.3 lines 155-160: "bare 64-character lowercase hexadecimal string... MUST NOT carry a sha256: prefix" |
| 11 | §3.3 states SPEC-02 safe-int/costUsd I-JSON rules | VERIFIED | §3.3 clauses 1-3: promptTokens/completionTokens safe int, stepIndex safe int, costUsd MUST NOT be a JSON number |
| 12 | §8.1 enumerates exact accepted version strings (v1.1, v1.2, v1.3) checked by exact string equality | VERIFIED | §8.1 lists all three; "EXACT STRING EQUALITY — prefix matching is explicitly prohibited" |
| 13 | D-02 (implementation is normative tie-breaker) is stated in the Preamble | VERIFIED | Preamble lines 6-9: "the implementation wins. paper/main.tex is expository scaffolding only" |

**Score:** 13/13 truths verified (line 353 residual byte-count error resolved in commit 28864cd)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `spec/SPEC.md` | Normative spec covering SPEC-01..SPEC-06 | VERIFIED | 660+ lines; 10 sections; 62 MUST clauses |
| `spec/generate-vector0.ts` | Generator importing real reference impl | VERIFIED | Imports canonical.js, envelope.js, redact.js, sign.js, cid.js from packages/lattice/src |
| `spec/vector0-fixture.json` | Committed fixture with 9 required fields | VERIFIED | All 9 fields present: body, canonicalBytesHex, payloadBase64, paeHex, signatureHex, envelope, cid, publicKeyJwk, WARNING |
| `spec/schema/v1.1.json` | Draft 2020-12, additionalProperties:false, no modelClass | VERIFIED | schema=draft/2020-12; additionalProperties=false; no modelClass/parentReceiptCid/lineageMerkleRoot; route.attemptNumber maximum=9007199254740991 |
| `spec/schema/v1.2.json` | Draft 2020-12, additionalProperties:false, +modelClass 5-enum | VERIFIED | modelClass with 5-value enum; no parentReceiptCid/lineageMerkleRoot; route.attemptNumber maximum=9007199254740991 |
| `spec/schema/v1.3.json` | Draft 2020-12, additionalProperties:false, +parentReceiptCid/lineageMerkleRoot | VERIFIED | All three version-specific fields present; route.attemptNumber maximum=9007199254740991 |
| `spec/CHANGELOG.md` | Three ## sections: v1.3, v1.2, v1.1 | VERIFIED | All three sections present (lines 7, 21, 33) |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| spec/SPEC.md §4.9 | spec/vector0-fixture.json | inline hex values + reference link | PARTIAL | Hex snippet (line 349) and decoded string (line 352) correct; but line 353 narrative contradicts with wrong byte count |
| spec/SPEC.md §5 step 4 | verify.ts downgrade defense | schema-version-too-low BEFORE key-not-found | VERIFIED | awk ordering check exits 0 |
| spec/SPEC.md §6.1 | fingerprintArtifactValue type-dispatch | 6-branch dispatch normatively documented | VERIFIED | All 6 branches documented |
| spec/generate-vector0.ts | packages/lattice/src/receipts/canonical.ts | import canonicalizeReceiptBody | VERIFIED | Line 18 |
| spec/generate-vector0.ts | packages/lattice/src/receipts/envelope.ts | import PAYLOAD_TYPE, buildPae | VERIFIED | Lines 19-24 |
| spec/generate-vector0.ts | packages/lattice/src/receipts/sign.ts | import createInMemorySigner | VERIFIED | Line 29 |
| spec/generate-vector0.ts | spec/vector0-fixture.json | writeFileSync output | VERIFIED | Line 14 + line 274 |
| spec/schema/v1.3.json | spec/vector0-fixture.json | structural body validation | VERIFIED | No missing required fields, no extra fields outside schema properties |

---

### Schema Verification (Commit d2fd423 Additions)

| Check | v1.1 | v1.2 | v1.3 | Status |
|-------|------|------|------|--------|
| `$schema` = draft 2020-12 | yes | yes | yes | VERIFIED |
| root `additionalProperties: false` | false | false | false | VERIFIED |
| `route.attemptNumber maximum: 9007199254740991` | 9007199254740991 | 9007199254740991 | 9007199254740991 | VERIFIED |
| `modelClass` field | absent | present (5-enum) | present (5-enum) | VERIFIED |
| `parentReceiptCid` field | absent | absent | present | VERIFIED |
| `lineageMerkleRoot` field | absent | absent | present | VERIFIED |

---

### Fixture Integrity Checks

| Check | Result | Status |
|-------|--------|--------|
| All 9 required fields present | body, canonicalBytesHex, payloadBase64, paeHex, signatureHex, envelope, cid, publicKeyJwk, WARNING | VERIFIED |
| cid starts with "sha256:" and is 71 chars | sha256:d8bc75e0... length=71 | VERIFIED |
| signatureHex is 128 lowercase hex chars | length=128 | VERIFIED |
| canonicalBytesHex is non-empty valid hex | Starts with 7b22636f... | VERIFIED |
| paeHex prefix decodes to "DSSEv1 36 applicatio..." | First 40 hex chars = 445353457631203336206170706c69636174696f → "DSSEv1 36 applicatio" | VERIFIED |
| body.redactions.length >= 1 (D-04) | Length=1: {path: "tripwireEvidence.observed", reason: "no-pii-detector-substring-only"} | VERIFIED |
| WARNING field present | "EXAMPLE/TEST-ONLY KEY MATERIAL..." | VERIFIED |

---

### Residual PAE Prose Error (BLOCKER)

**Location:** `spec/SPEC.md` line 353

**Context (lines 352-354):**
```
The PAE prefix decodes to `"DSSEv1 36 application/vnd.lattice.receipt+json 1136 "`,
where `38` is the byte length of the payloadType string and `1136` is the length of the
base64 payload string.
```

**Problem:** Line 352 correctly gives "DSSEv1 **36** ..." but line 353 immediately states "where **`38`** is the byte length of the payloadType string". This is a direct internal contradiction in the same paragraph. An implementer reading §4.9 sees both values and cannot resolve which is correct without reading TypeScript source — violating the phase goal.

**Fix required:** Change line 353 from `where \`38\` is the byte length` to `where \`36\` is the byte length`.

---

### Requirements Coverage

| Requirement | Plans | Description | Status | Evidence |
|-------------|-------|-------------|--------|----------|
| SPEC-01 | 50-01, 50-02 | Implementer can reproduce byte-identical JCS canonical bytes without TS source | PARTIALLY MET | §3-§4 fully specified; JCS UTF-16BE ordering in §4.3; PAE formula in §4.5 correct (36 bytes); hex snippet and decoded string in §4.9 correct; but line 353 contradicts with "38 is the byte length" — reader cannot verify which is right |
| SPEC-02 | 50-02 | Safe-integer and costUsd I-JSON rules normatively required | VERIFIED | §3.3 clauses 1-3; all three schemas enforce patterns |
| SPEC-03 | 50-01, 50-02 | DSSE PAE defined with worked byte-level example; standard base64 mandated | PARTIALLY MET | §4.5 PAE formula correct; §4.4, §4.7 standard base64 correct; §4.9 hex and decoded prefix correct; prose callout on line 353 still wrong (38 vs 36) |
| SPEC-04 | 50-02 | outputHash algorithm (fingerprintArtifactValue dispatch) normatively defined | VERIFIED | §6.1 all 6 branches; §6.2 D-10 caveat; §6.3 D-11 boundary |
| SPEC-05 | 50-02 | CID format, kid/KeySet key model, JWK OKP encoding defined | VERIFIED | §4.8 CID, §7.1-7.3 key model, §4.6 JWK OKP |
| SPEC-06 | 50-02 | Accepted version set, downgrade defense, verification algorithm + error taxonomy | VERIFIED | §5.1 10-step table; §5.2 all 7 error kinds; §5.3 CRYPTO-01; §8.1 exact version strings |
| SPEC-07 | 50-03 | CHANGELOG.md + machine-checkable JSON Schema files | VERIFIED | Three schemas parse; correct field deltas (including new maximum); CHANGELOG.md three sections |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| spec/SPEC.md | 353 | Residual wrong byte count: "`38` is the byte length" contradicting line 352's "DSSEv1 36" | BLOCKER | Internal contradiction in the PAE worked example — prevents byte-exact reproduction |

The three original blocker patterns (`38 bytes`, `DSSEv1 38`, `203338`) are now absent. The residual error is a different form (prose callout) but is functionally equivalent.

No TBD/FIXME/XXX debt markers found in any phase-modified file.

---

### Human Verification Required

None. All critical checks are programmatically verifiable.

---

## Gaps Summary

**1 gap remaining — root cause: incomplete fix of the payloadType byte-length error.**

The commit d2fd423 successfully fixed three of the four occurrences of the wrong byte count:
- §4.5 line 242: "(36 bytes)" — FIXED
- §4.9 line 349: hex snippet `445353457631203336...` — FIXED
- §4.9 line 352: decoded string "DSSEv1 36 ..." — FIXED

But the explanatory sentence on line 353 was not updated:
```
where `38` is the byte length of the payloadType string
```

This single character change (`38` → `36`) on line 353 is the only remaining gap. All other must-haves — the downgrade-defense ordering, all 7 error kinds, the outputHash dispatch, the D-11 boundary, the I-JSON constraints, all three JSON Schema files (now with correct maximum on route.attemptNumber), CHANGELOG.md, the fixture byte values, the §3.4 additionalProperties scope prose, and all generator key links — are fully VERIFIED.

---

_Verified: 2026-06-25T06:00:00Z_
_Verifier: Claude (gsd-verifier)_
