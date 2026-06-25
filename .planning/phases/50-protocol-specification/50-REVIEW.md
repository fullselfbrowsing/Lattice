---
phase: 50-protocol-specification
reviewed: 2026-06-25T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - spec/generate-vector0.ts
  - spec/vector0-fixture.json
  - spec/SPEC.md
  - spec/schema/v1.1.json
  - spec/schema/v1.2.json
  - spec/schema/v1.3.json
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 50: Code Review Report

**Reviewed:** 2026-06-25T00:00:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Phase 50 delivers the normative protocol spec (SPEC.md), three JSON Schema files (v1.1–v1.3),
the conformance-vector generator (generate-vector0.ts), and the committed fixture
(vector0-fixture.json).

The generator is structurally sound: the pipeline order (redact → canonicalize → base64 →
PAE → sign → envelope → CID) matches the implementation, all assertions are reachable, the
private key is labeled extensively as EXAMPLE/TEST-ONLY, and the private key is NOT
written to the fixture (only the public component appears there). The fixture bytes are
internally consistent — canonicalBytesHex, payloadBase64, paeHex, signatureHex (128 hex
chars / 64 bytes), and cid all cross-validate.

The most important finding is a factual error in the spec prose that is contradicted
by the fixture it references: SPEC.md §4.5 and §4.9 both claim the `payloadType` string
is 38 bytes long, but the actual string `"application/vnd.lattice.receipt+json"` is 36
bytes. The fixture's paeHex encodes the correct value `36`. Any downstream implementer
reading only the spec prose (not the fixture) will build a broken PAE and produce an
unverifiable signature.

All three JSON Schema files are consistent with the spec's version-specific field rules
(no `modelClass` in v1.1, `modelClass` present in v1.2/v1.3, `parentReceiptCid` /
`lineageMerkleRoot` only in v1.3). The `additionalProperties: false` constraint is present
at root level on all three schemas. The downgrade-defense ordering (schema-version-too-low
before key-not-found) is correctly implemented in verify.ts and correctly specified in
§5.1/§5.3.

---

## Warnings

### WR-01: payloadType byte-length stated as 38 in two locations but is actually 36

**Files:**
- `spec/SPEC.md:238`
- `spec/SPEC.md:348-349`

**Issue:** SPEC.md §4.5 (line 238) describes the PAE construction and states:

> `payloadType` is the literal string `"application/vnd.lattice.receipt+json"` (38 bytes).

SPEC.md §4.9 (lines 348-349) transcribes the PAE worked example:

> The PAE prefix decodes to `"DSSEv1 38 application/vnd.lattice.receipt+json 1136 "`, where
> `38` is the byte length of the payloadType string

The actual byte length of `"application/vnd.lattice.receipt+json"` is **36** bytes, not 38.
The fixture `paeHex` field correctly encodes `"DSSEv1 36 ..."`. Comparing the first 80
characters of the spec's §4.9 worked-example hex (`...203338...`) with the fixture
(`...203336...`) confirms the discrepancy at offset 17: spec has `38` (hex `3338`), fixture
has `36` (hex `3336`).

Any downstream implementer who copies the PAE prefix from §4.9 or uses the "(38 bytes)"
annotation from §4.5 to hard-code the length field will produce a PAE that differs from
every correctly-implemented verifier. The fixture is the authoritative ground truth; the
two prose references are wrong.

**Fix:** Change both occurrences:
- §4.5 line 238: `"application/vnd.lattice.receipt+json"` **(36 bytes)**
- §4.9 line 348: `"DSSEv1 36 application/vnd.lattice.receipt+json 1136 "`
- §4.9 line 349: where `36` is the byte length of the payloadType string

The §4.9 hex worked-example prefix should also be corrected to start with `...3336...`
instead of `...3338...`.

---

### WR-02: `tripwireEvidence` and `noRouteReasons` items lack `additionalProperties: false` in all three schemas

**Files:**
- `spec/schema/v1.1.json:191-193`
- `spec/schema/v1.2.json:201-203`
- `spec/schema/v1.3.json:209-211`

**Issue:** SPEC.md §3.4 states: "All three files use JSON Schema draft 2020-12 with
`additionalProperties: false`." This claim is true only at the top-level receipt body
object. The nested `tripwireEvidence` and `noRouteReasons` item schemas are defined as
bare `{ "type": "object" }` with no `additionalProperties` constraint, making them open
to arbitrary extra fields under any conforming validator.

```json
// all three schemas — current:
"tripwireEvidence": { "type": "object" },
"noRouteReasons": { "type": "array", "items": { "type": "object" } }
```

A downstream implementer reading the spec claim that schemas use `additionalProperties: false`
will expect these nested objects to be closed, but a validator will silently accept extra
keys in them. The spec either needs to close these objects or explicitly document that they
are intentionally open (extension points).

The vector0 fixture body has a `tripwireEvidence` object with known fields (`invariantId`,
`kind`, `path`, `observed`, `message`). If the schema is meant to enforce those fields,
they are currently unvalidated.

**Fix (option A — close the objects, matching the spec claim):**
```json
"tripwireEvidence": {
  "type": "object",
  "additionalProperties": true,
  "$comment": "Intentionally open: field set varies by invariantId."
}
```
Or if you want strict closure, add `additionalProperties: false` with explicit property
definitions for the known fields (`invariantId`, `kind`, `path`, `observed`, `message`).

**Fix (option B — update the spec claim):** Amend §3.4 to say:
> "All three files use `additionalProperties: false` at the receipt-body root. The nested
> `tripwireEvidence` and `noRouteReasons` objects are intentionally open-schema
> (extension points)."

---

### WR-03: `attemptNumber` schema comment claims I-JSON safe integer but enforces no upper bound

**Files:**
- `spec/schema/v1.1.json:70-74`
- `spec/schema/v1.2.json:70-74`
- `spec/schema/v1.3.json:70-74`

**Issue:** The `route.attemptNumber` schema in all three versions carries the comment:

```json
"$comment": "I-JSON safe integer (2^53-1). MUST be encoded as bare integer ..."
```

However, unlike `promptTokens`, `completionTokens`, and `stepIndex` which all have
`"maximum": 9007199254740991`, `attemptNumber` has no `maximum` constraint. The comment
promises safe-integer enforcement but the schema silently accepts integers above 2^53−1.
SPEC.md §4.3 groups `attemptNumber` with the other safe-integer fields, so the omission
of `maximum` is inconsistent.

A validator will accept `attemptNumber: 9007199254740992` (2^53) while the spec and comment
say it must not exceed 2^53−1.

**Fix:** Add `"maximum": 9007199254740991` to `attemptNumber` in all three schemas,
matching the pattern used by `promptTokens`, `completionTokens`, and `stepIndex`:

```json
"attemptNumber": {
  "type": "integer",
  "minimum": 1,
  "maximum": 9007199254740991,
  "$comment": "I-JSON safe integer (2^53-1). MUST be encoded as bare integer without fraction or exponent (5 not 5.0 or 5e0)."
}
```

---

## Info

### IN-01: verify.ts step count is 9 but SPEC.md §5.1 describes 10 steps

**Files:**
- `spec/SPEC.md:403-414` (decision tree table)
- `packages/lattice/src/receipts/verify.ts:134-145` (Step 5)

**Issue:** The SPEC.md §5.1 decision tree has 10 numbered rows (steps 1–10). The
`verify.ts` source code has step comments numbered 1–9. The discrepancy arises because
the spec splits key-not-found (step 5) and key-revoked (step 6) into separate rows, while
the code treats them as a single "Step 5: keyset lookup" block (lines 134–145) that
handles both outcomes. The functional behavior is identical — ordering is preserved — but
a reader cross-referencing "Step 6" in the spec with the code will not find a "Step 6"
comment.

**Fix:** Either renumber verify.ts comments to match the 10-step spec table (splitting
Step 5 into two commented blocks), or add a note to §5.1 that steps 5 and 6 are
implemented as a single code block in the reference implementation.

---

### IN-02: SPEC.md §5.3 verify.ts line reference is slightly off

**File:** `spec/SPEC.md:458-459`

**Issue:** §5.3 states: "This invariant is enforced in the reference implementation at
`verify.ts` lines 119–132 (the version chokepoint fires before lines 135–165 which perform
keyset lookup, re-canonicalization, and signature verification)."

The Step 4 version-chokepoint comment starts at line 119 and the return statement is at
line 132. The spec is accurate for that range. However, the companion claim "lines 135–165"
is slightly imprecise: the keyset lookup code comment is at line 134 (not 135), and the
scope of "keyset lookup, re-canonicalization, and signature verification" actually runs
through line 165 with the signature check, and continues with the kid cross-check at
lines 170–176. The line range understates what follows step 4.

**Fix:** Update to "lines 134–176" or simply say "lines following 132" to avoid stale
line references as the file evolves.

---

### IN-03: `outputHash` has redundant `minLength`/`maxLength` alongside the pattern constraint

**Files:**
- `spec/schema/v1.1.json:136-140`
- `spec/schema/v1.2.json:136-140`
- `spec/schema/v1.3.json:136-140`

**Issue:** The `outputHash` non-null branch specifies all three of `minLength: 64`,
`maxLength: 64`, and `pattern: "^[0-9a-f]{64}$"`. The pattern already constrains the
string to exactly 64 characters; the `minLength`/`maxLength` add no information and create
a divergence from `inputHashes` items, which use only the pattern (no length constraints).

This is not a bug — JSON Schema evaluates all three keywords conjunctively — but it signals
inconsistent schema style and may confuse maintainers adding future hash fields.

**Fix:** Remove `minLength` and `maxLength` from `outputHash` to match the style used by
`inputHashes` items, or conversely add them to `inputHashes` items for consistency.

---

### IN-04: SPEC.md §5.1 Step 3 condition lists `undefined` alongside string literals

**File:** `spec/SPEC.md:407`

**Issue:** Step 3's condition reads:

> `version` is a non-empty string that is not one of: `undefined`, `"lattice-receipt/v1"`,
> `"lattice-receipt/v1.1"`, `"lattice-receipt/v1.2"`, `"lattice-receipt/v1.3"`

The leading qualifier "non-empty string" combined with "`undefined`" in the allowed list is
logically inconsistent — `undefined` is not a string at all, so it cannot be "a non-empty
string" and the qualifier makes listing it confusing. The correct reading (explained in the
"Step 3 detail" paragraph immediately below the table) is: the shape check accepts any of
{`version: undefined`, `"lattice-receipt/v1"`, `"lattice-receipt/v1.1"`, `"lattice-receipt/v1.2"`,
`"lattice-receipt/v1.3"`}; only an unrecognized non-undefined literal triggers step 3 failure.
The condition in the table cell does not express this cleanly.

**Fix:** Reword the table cell condition to:

> The `version` field is a non-empty string AND is not one of the five accepted version
> strings (`"lattice-receipt/v1"` through `"lattice-receipt/v1.3"`); OR a required field is
> missing or has the wrong primitive type.

---

_Reviewed: 2026-06-25T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
