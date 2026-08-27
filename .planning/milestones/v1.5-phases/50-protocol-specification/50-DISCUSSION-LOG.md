# Phase 50: Protocol Specification - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-25
**Phase:** 50-protocol-specification
**Mode:** advisor (research-backed comparison tables; calibration tier `standard`)
**Areas discussed:** Spec normativity & structure; Worked examples & Phase 51 hand-off; JSON Schema dialect & strictness; outputHash precision & conformance boundary

---

## Spec normativity & structure

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid | RFC-2119 normative core (keyword stanza + numbered MUST clauses + algorithm section + schemas-as-normative) with tagged non-normative examples; TS impl is the tie-breaker | ✓ |
| Full RFC ceremony | Numbered sections, standalone conformance section, full pseudocode — recommended only if 4+ independent clients are committed | |
| Narrative / tutorial | Prose walkthrough; rejected — unfalsifiable "should"/"is" prose can't anchor a conformance vector | |

**User's choice:** Hybrid (recommended).
**Notes:** Grounded in DSSE v1.0 / in-toto / Sigstore / C2PA precedent — every cited spec converges on the hybrid pattern. Decisive factor: each numbered clause must trace 1:1 to a Phase 51 conformance vector. The TS reference implementation is named the normative tie-breaker, which also resolves the paper-vs-code divergence (paper caps at v1.2; code is v1.3).

---

## Worked examples & Phase 51 hand-off

| Option | Description | Selected |
|--------|-------------|----------|
| Generate-from-impl, threaded inline + fixtures file | One complete example receipt threaded through every step inline; exhaustive bytes in a referenced fixtures file; example = "vector #0" of Phase 51 | ✓ |
| Generate-from-impl, inline only | Same correctness guarantee, no separate fixtures file | |
| Hand-author bytes in prose | Rejected — a single mis-transcribed nibble mis-trains every downstream client | |

**User's choice:** Generate-from-impl, threaded inline + fixtures file (recommended).
**Notes:** Mirrors RFC 8785 §3.2 + DSSE (inline threaded example) and COSE's `cose-wg/Examples` (external exhaustive set). Same flag-gated generator emits both the spec example and the Phase 51 vectors → one source of truth, no drift. Threaded example must exercise ≥1 redaction + ≥1 JCS edge case.

---

## JSON Schema dialect & strictness

| Option | Description | Selected |
|--------|-------------|----------|
| 2020-12 + additionalProperties:false (flat) | Strongest unknown-field gate; flat standalone files per version; identical across ajv (`Ajv2020`) + Python `jsonschema` | ✓ |
| 2020-12 + unevaluatedProperties:false | Composition-aware via shared base + `$ref` deltas; only pays off if composing | |
| draft-07 + additionalProperties:false | Zero ajv friction (default export); older dialect — documented fallback | |
| Permissive | Rejected — defeats the drift-gate purpose; typos pass silently | |

**User's choice:** Draft 2020-12 + additionalProperties:false, flat per-version files (recommended).
**Notes:** I-JSON constraints JSON Schema can't express natively are encoded via `maximum: 9007199254740991` (safe-int), a decimal-string `pattern` for `costUsd`, and `^sha256:[0-9a-f]{64}$` for CID fields — backstopped by normative prose for integer lexical form + decimal-string semantics. draft-07 retained as a lossless fallback (schema uses no 2020-12-only keyword).

---

## outputHash precision & conformance boundary

| Option | Description | Selected |
|--------|-------------|----------|
| (a)+(c) | Document full `fingerprintArtifactValue` dispatch + precise non-normative caveat, AND mark object-output outputHash implementation-defined / out of Phase 54 conformance scope | ✓ |
| (a) only | Document full dispatch + caveat, but keep object outputs IN conformance scope | |
| (b) Mandate JCS for object outputs | Rejected — diverges from the unchanged impl, breaks every object-output Phase 51 vector | |

**User's choice:** (a)+(c) (recommended).
**Notes:** The reference impl is normative and not changing in v1.5, so the spec documents `JSON.stringify` for the object branch exactly. Object-output reproduction across languages is empirically non-deterministic (Python `json.dumps` diverges on `1e-7`→`1e-07`, `100.0` vs `100`, ≥10²¹/<10⁻⁶ threshold, `-0.0` vs `0`), so object outputs are scoped out of v1.5 conformance and Phase 54 vectors assert only string/binary/null branches. Corrects the incomplete STATE.md wording `sha256(JSON.stringify(outputMap))`.

## Claude's Discretion

- Exact SPEC.md section numbering / headings, prose wording, visual layout of the threaded example, and CHANGELOG.md format — no user preference expressed.

## Deferred Ideas

- Go / Rust / Java-Kotlin / C# / Ruby clients (v1.6+); PyPI publishing (v1.6+); additional Unicode / lone-surrogate + multi-sig vectors (v1.6+); mandating JCS for object-output outputHash (future major, requires impl change). All pre-existing REQUIREMENTS.md Future items — none introduced as scope creep this session.
