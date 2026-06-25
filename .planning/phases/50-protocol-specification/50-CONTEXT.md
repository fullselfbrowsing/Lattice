# Phase 50: Protocol Specification - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the **versioned, language-neutral normative specification** of the Lattice
capability-receipt protocol:

- `spec/SPEC.md` — normative spec sufficient to reproduce **every byte** of a receipt
  (RFC 8785 JCS canonical body → base64 payload → DSSE v1.0 PAE → Ed25519 signature →
  DSSE envelope → CID) and to verify / replay / mint **without reading TypeScript**.
- `spec/schema/v1.1.json`, `spec/schema/v1.2.json`, `spec/schema/v1.3.json` — machine-checkable
  JSON Schema files for each accepted receipt-body version.
- `spec/CHANGELOG.md` — per-version deltas across v1.1 → v1.2 → v1.3.

Resolves the two spec-precision blockers: the `outputHash` algorithm (SPEC-04) and the
vector field schema framing (SPEC-07). Requirements: **SPEC-01 … SPEC-07**.

**In scope:** authoring SPEC.md, the three JSON Schemas, and CHANGELOG.md; documenting
the existing protocol exactly as the reference implementation behaves.

**Out of scope (own later phases):** the conformance-vector generator (Phase 51), any
client code (Phases 53–55), the TS self-verification harness (Phase 52), and **any change
to the runtime / reference implementation** — the spec documents what *is*.
</domain>

<decisions>
## Implementation Decisions

### Spec normativity & structure
- **D-01:** SPEC.md uses a **hybrid normative style** — an RFC-2119 / BCP-14 (RFC 8174)
  keyword stanza; numbered MUST / SHOULD / MAY clauses; a dedicated normative **pipeline
  algorithm section** (assemble → redact → JCS canonicalize → base64 payload → build PAE →
  Ed25519 sign → encode envelope → derive CID) carrying a worked hex example; the three JSON
  Schema files **declared normative**; a normative `VerifyErrorKind` taxonomy + verification
  algorithm; **all examples and rationale tagged "(non-normative)"**. Mirrors how DSSE v1.0,
  in-toto attestation, Sigstore bundle, and C2PA specs are structured — each numbered clause
  traces 1:1 to a Phase 51 conformance vector.
- **D-02:** **The live TypeScript reference implementation is the normative tie-breaker.**
  Where `paper/main.tex` and the implementation diverge, the implementation wins; the paper
  is expository scaffolding only. State this explicitly in SPEC.md. **Concrete divergence:**
  the paper caps at v1.2 (paper line 433: "Three versions exist: v1, v1.1, v1.2") and never
  documents the v1.3 fields `parentReceiptCid` / `lineageMerkleRoot` — the spec MUST document v1.3.

### Worked examples & Phase 51 hand-off
- **D-03:** Worked byte-level examples (JCS canonical bytes, full PAE byte string, signature,
  CID) are **generated from the reference implementation**, never hand-authored — a single
  mis-transcribed nibble would mis-train every downstream client.
- **D-04:** SPEC.md embeds **one complete example receipt threaded inline through every
  pipeline step**; the exhaustive byte set lives in a referenced fixtures file (not inline).
  The threaded example MUST exercise **≥1 redaction and ≥1 JCS edge case** (non-ASCII escape
  and/or number serialization) or it under-specifies the behavior clients most often get wrong.
- **D-05:** That single threaded example becomes **"vector #0" of the Phase 51 conformance
  set** — the same flag-gated generator emits both the spec's worked example and the committed
  vectors, so spec and vectors share one source of truth and cannot drift.
  *Planner coordination:* decide whether the Phase 50 example-generator is a throwaway script
  or the pulled-forward Phase 51 generator (see Notes for downstream).

### JSON Schema dialect & strictness
- **D-06:** Schema files use **JSON Schema draft 2020-12** with **`additionalProperties: false`**,
  as **flat, standalone files per version** (no `$ref` composition between versions). Strongest
  unknown-field drift gate; behaves identically across ajv (requires the non-default
  `Ajv2020` class) and Python `jsonschema` `Draft202012Validator`. **Fallback** if ajv's
  non-default class is undesirable: draft-07 + `additionalProperties: false` (this schema uses
  no 2020-12-only keyword, so the fallback is lossless).
- **D-07:** Encode the I-JSON constraints JSON Schema cannot express natively:
  - safe integers (`promptTokens`, `completionTokens`, optional `stepIndex`):
    `{ "type": "integer", "minimum": 0, "maximum": 9007199254740991 }` (= 2^53−1)
  - `costUsd`: `{ "type": ["string", "null"], "pattern": "^-?(0|[1-9][0-9]*)(\\.[0-9]+)?$" }`
  - `sha256:` fields (`parentReceiptCid`, `lineageMerkleRoot`): `"^sha256:[0-9a-f]{64}$"`
- **D-08:** **Backstop in normative prose** what validators won't enforce: receipt-body
  integers MUST be encoded without fraction/exponent (`5`, not `5.0` / `5e0`); `costUsd` MUST
  NOT be a JSON number and MUST be a finite decimal string; hex is lowercase. Mirror these as
  non-normative `description` / `$comment` text in the schemas so they stay self-documenting.

### outputHash precision & conformance boundary (SPEC-04)
- **D-09:** Define `outputHash` as the **full `fingerprintArtifactValue` type-dispatch**
  (normative), reproduced exactly from `packages/lattice/src/storage/fingerprint.ts`:
  - `string` → UTF-8 encode → SHA-256
  - `Uint8Array` / `ArrayBuffer` / `Blob` → raw bytes → SHA-256
  - otherwise → `JSON.stringify(value)` → UTF-8 encode → SHA-256
  - no outputs → `outputHash = null`; result is lowercase hex.
  - **Correction to STATE.md:** the recorded "resolved" wording `sha256(JSON.stringify(outputMap))`
    is **only the object branch and is incomplete** — the spec documents the full dispatch above.
- **D-10:** Add a **precise non-normative caveat** that object-output `outputHash` reproduction
  requires byte-identical JSON: key **insertion order** (not sorted, not JCS), ECMAScript
  `Number.prototype.toString` formatting (incl. the ≥10²¹/<10⁻⁶ exponent thresholds, the
  `1e-7`→`1e-07` divergence, integral-float `100` vs `100.0`, and `-0` vs `-0.0` — all
  empirically confirmed against Python `json.dumps`), and ECMAScript string escaping. Note that
  this is the **one place `outputHash` deliberately leaves the JCS + safe-int + costUsd-string
  path** that SPEC-02 pins for the receipt body.
- **D-11:** Draw the **conformance boundary**: object-output `outputHash` is
  **implementation-defined / out of scope for v1.5 conformance**. Phase 54 Python-replay
  positive + mismatch vectors assert only the **string / binary / null** branches (the
  deterministically reproducible ones). **Do NOT** switch object outputs to JCS — that would
  diverge from the unchanged reference impl and break the Phase 51 golden vectors.

### Claude's Discretion
- Exact section numbering / heading scheme of SPEC.md, prose wording, the visual layout of the
  threaded example, and the CHANGELOG.md format (per-version delta sections). No user preference
  expressed — standard, clean conventions are fine.

### Notes for downstream
- **STATE.md fix:** the `outputHash` decision in `.planning/STATE.md` should be corrected from
  `sha256(JSON.stringify(outputMap))` to the full `fingerprintArtifactValue` dispatch (D-09).
- **Phase 50 ↔ 51 generator coupling:** D-05 ties the spec's worked example to the Phase 51
  vector generator. The planner should decide up front whether Phase 50 stands up the real
  (flag-gated) generator early or uses a throwaway that Phase 51 replaces — to avoid two
  divergent copies of the canonical bytes.
- The verification algorithm + error ordering is fully specified by `verify.ts` (10-step
  decision tree, first-match-wins); the spec's verification section should mirror it exactly,
  including the downgrade check short-circuiting **before any crypto**.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Reference implementation — NORMATIVE (the spec documents these exactly; impl wins on any divergence)
- `packages/lattice/src/receipts/types.ts` — `CapabilityReceiptBody` (all fields + version-specific
  optionals), `ReceiptEnvelope` (DSSE shape, `payloadType`), `KeySet` / `KeyEntry` / `KeyState`,
  `VerifyErrorKind` (the **7** kinds), `VerifyResult`.
- `packages/lattice/src/receipts/canonical.ts` — RFC 8785 JCS canonicalization (`canonicalize@3.0.0`),
  `usageToCanonical`, `stringifyCostUsd` (I-JSON costUsd-as-string; NaN/Infinity → null).
- `packages/lattice/src/receipts/envelope.ts` — `PAYLOAD_TYPE` (`application/vnd.lattice.receipt+json`),
  standard base64 helpers (NOT base64url), `buildPae` (DSSE v1.0 PAE: `DSSEv1 <len> <type> <len> <payloadB64>`),
  `encodeEnvelope` / `decodeEnvelope`.
- `packages/lattice/src/receipts/cid.ts` — `receiptCid` = `sha256:<lowercase-hex>` over the **decoded
  DSSE payload bytes**.
- `packages/lattice/src/receipts/verify.ts` — `verifyReceipt` 10-step decision tree (envelope →
  JSON parse → body shape/version → downgrade defense **before crypto** → keyset lookup/state →
  re-canonicalize byte-compare → Ed25519 over PAE → kid cross-check). The normative verification
  algorithm + error ordering.
- `packages/lattice/src/receipts/sign.ts` — Ed25519 signing internals (Node WebCrypto;
  `@noble/ed25519` parity oracle).
- `packages/lattice/src/receipts/receipt.ts` — `createReceipt` ordering invariant
  (redact → canonicalize → PAE → sign → encode); forces `version = "lattice-receipt/v1.3"`; `kid`
  taken from signer.
- `packages/lattice/src/receipts/redact.ts` — redaction manifest shape +
  `DEFAULT_REDACTION_POLICY_ID = "lattice.default.v1"`.
- `packages/lattice/src/storage/fingerprint.ts` — **`fingerprintArtifactValue` / `valueToBytes`:
  the normative `outputHash` dispatch (SPEC-04).**
- `packages/lattice/src/runtime/create-ai.ts` lines ~1238–1241 — production `outputHash` call site
  (`fingerprintArtifactValue(input.outputs)`); confirms object outputs pass a raw object.

### Expository — NON-normative (context only; the implementation overrides on divergence)
- `paper/main.tex` — §"The capability receipt" (line 365), §"Schema versioning and downgrade
  defense" (431), §"Verification" (442, incl. the 7-error table), §"Signing internals" (527),
  §"Offline verifiable replay" (471). **NOTE:** caps at v1.2 — does not document v1.3 fields.

### Planning + research context
- `.planning/REQUIREMENTS.md` — SPEC-01 … SPEC-07 definitions + the downstream
  VEC → TSCONF → PYV → PYR → PYM → PARITY chain.
- `.planning/ROADMAP.md` — Phase 50 goal + 5 success criteria; Phases 51–56 hard dependency chain.
- `.planning/research/PITFALLS.md` — float / Unicode / PAE cross-language divergence pitfalls the
  spec must encode as normative clauses.
- `.planning/research/ARCHITECTURE.md` — the `spec/` + `conformance/` + `clients/python/` layout and
  the "vectors-from-impl / impl-is-normative" authority model.
- `.planning/research/STACK.md`, `.planning/research/SUMMARY.md` — v1.5 stack + research synthesis.

### External standards the spec cites as normative references
- **RFC 8785** (JSON Canonicalization Scheme / JCS) · **RFC 8174 + RFC 2119** (requirement keywords)
  · **RFC 4648 §4** (standard base64 for `payload`/`sig`; base64url only for JWK `d`/`x`)
  · **RFC 7493** (I-JSON; 2^53−1 safe-integer bound) · **RFC 8037** (OKP / Ed25519 JWK encoding)
  · **DSSE v1.0** protocol (PAE) — https://github.com/secure-systems-lab/dsse/blob/v1.0.0/protocol.md
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- The entire `packages/lattice/src/receipts/` module **is** the reference implementation the spec
  documents — the spec is a faithful description of this code, not a new design.
- Fixed constants the spec must pin verbatim: `PAYLOAD_TYPE = "application/vnd.lattice.receipt+json"`,
  `DEFAULT_REDACTION_POLICY_ID = "lattice.default.v1"`, minted `version = "lattice-receipt/v1.3"`,
  the **7** `VerifyErrorKind` values, accepted version set `{v1.1, v1.2, v1.3}` (reject `v1` / absent).
- The existing test suites (`*.test.ts` in `receipts/`, esp. `canonical.test.ts`, `verify.test.ts`,
  `cid.test.ts`) encode edge cases the spec's clauses + worked example should align with.

### Established Patterns
- **Redact → canonicalize → PAE → sign → encode** ordering is structurally enforced
  (canonicalize is only ever called on redaction output) — the spec states this as a normative invariant.
- **Downgrade defense short-circuits before any cryptographic work** (`verify.ts` step 4) — spec MUST
  preserve this ordering in the verification algorithm.
- Verify **re-canonicalizes the parsed body and byte-compares** it to the signed payload bytes before
  checking the signature.

### Integration Points
- `spec/` is a **new top-level directory** (does not exist yet); `conformance/` and `clients/python/`
  arrive in later phases. `clients/python/` (not `packages/`) keeps tarball-leak / core-boundary checks
  unmodified — relevant to Phase 52+, not this phase.
- Phase 50 produces docs + schemas only; no workspace package, no build wiring required here.
</code_context>

<specifics>
## Specific Ideas

- The threaded **"vector #0"** example (D-04/D-05) must include at least one redaction entry and at
  least one JCS edge case (non-ASCII escape and/or number serialization) so it exercises the
  behaviors clients most often get wrong.
- `outputHash` cross-language divergences to call out in the caveat (D-10), empirically reproduced
  TS `JSON.stringify` vs Python `json.dumps`: `1e-7` → `1e-07`, `100.0` vs `100`, the ≥10²¹/<10⁻⁶
  exponent threshold, and `-0.0` vs `0`.
</specifics>

<deferred>
## Deferred Ideas

These came up as context but belong to later milestones (already tracked in REQUIREMENTS.md Future —
listed here so the planner does not pull them into Phase 50):

- **Go / Rust / Java-Kotlin / C# / Ruby clients** (GO-01, GO-02, LANG-01…04) — v1.6+. Python proves
  the spec end-to-end first.
- **PyPI publishing** of the Python client with trusted publishing + provenance (PUB-01) — v1.6+.
- **Additional vector breadth** — Unicode / lone-surrogate edge cases (VEC-F1), multi-signature
  envelopes (VEC-F2) — v1.6+.
- **Mandating JCS for object-output `outputHash`** (Area 4 option b) — explicitly **rejected for
  v1.5** because it would require changing the reference implementation; only viable in a future
  major where the impl is allowed to change.

None — discussion stayed within phase scope (no scope creep introduced during the session).
</deferred>

---

*Phase: 50-protocol-specification*
*Context gathered: 2026-06-25*
