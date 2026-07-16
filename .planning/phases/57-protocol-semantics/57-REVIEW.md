---
phase: 57-protocol-semantics
reviewed: 2026-07-16T20:33:09Z
depth: deep
files_reviewed: 23
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
resolved_findings: 2
status: clean
---

# Phase 57 Code Review

## Scope

Reviewed the TypeScript and Python receipt changes from `ba19245` through `ede1e1a`, including PAE framing, issuance, envelope decoding, version/profile typing, verifier decision order, public exports, CID behavior, replay, and focused regression tests.

## Findings

No outstanding findings.

## Resolved During Review

### Python accepted noncanonical base64 pad bits

Python used `base64.b64decode(..., validate=True)`, which rejects invalid syntax but accepts alternate pad-bit encodings that decode to the same bytes. TypeScript already required canonical standard base64. `_base64_decode` now round-trips decoded bytes through the canonical encoder and rejects mismatches; payload and signature regression tests prove the envelope fails before verification.

### Python could throw for an unhashable version value

`_is_receipt_body_shape` performed set membership before validating that `version` was a string. A JSON array or object could therefore raise `TypeError` across the non-throwing verification boundary. The shape check now validates the primitive type first and returns the typed `version-mismatch` result.

Both fixes are committed in `ede1e1a`.

## Review Notes

- Standard PAE uses UTF-8 byte length for payload type and raw canonical payload bytes in both languages.
- Every production issuer is corrected-only: TypeScript forces v1.4/dsse-v1 and Python rejects every other version/profile matrix.
- Historical PAE construction is verifier-private and consumes the exact validated transport text only after standard verification fails on an eligible pre-v1.4 body.
- Corrected receipts cannot enter historical verification; version/profile checks precede key lookup and cryptographic branching.
- Verification success reports the actual profile and deprecation state; receipt CID remains payload-byte identity and is not used as profile evidence.
- Public TypeScript declarations and Python exports expose the additive policy/profile contract without exposing a legacy signing helper.

## Verification During Review

- `pnpm --filter @full-self-browsing/lattice typecheck`
- `pnpm --filter @full-self-browsing/lattice test` (84 files, 1,109 tests)
- `pnpm --filter @full-self-browsing/lattice build`
- `pnpm --filter @full-self-browsing/lattice test:types` (104 files, 1,310 tests, no type errors)
- `.context/python-venv/bin/python -m pytest clients/python/tests -q` (44 tests)
- Python bytecode compilation and `git diff --check`

## Deferred Boundary

The v1.5 specification, schemas, vector generator, conformance harness, CLI, and CI still describe the historical profile by design. Their coordinated migration is Phase 58 scope, not an outstanding Phase 57 source finding.

## Residual Risk

Independent DSSE oracle evidence and cross-language standard vector reproduction are not yet present. Phase 58 owns those external conformance proofs.
