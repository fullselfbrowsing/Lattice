---
phase: 57-protocol-semantics
verified: 2026-07-16T20:34:14Z
status: passed
score: 6/6 requirements verified
requirements: [SIGBR-01, SIGBR-02, SIGBR-03, SIGBR-04, SIGBR-05, SIGBR-06]
gaps: []
human_verification: []
---

# Phase 57 Verification

## Result

Passed. TypeScript and Python now issue only standard raw-byte DSSE receipts under the authenticated v1.4 profile, while historical base64-PAE evidence is isolated behind an explicit observable read policy.

## Requirement Evidence

| Requirement | Status | Evidence |
|-------------|--------|----------|
| SIGBR-01 | SATISFIED | `packages/lattice/src/receipts/envelope.ts` and `receipt.ts` build PAE over canonical `Uint8Array` payload bytes; Python `build_pae` and `mint` do the same. UTF-8 and binary framing tests pass in both languages. |
| SIGBR-02 | SATISFIED | TypeScript `createReceipt` forces `lattice-receipt/v1.4` plus signed `signatureProfile: "dsse-v1"`; Python `mint` accepts exactly the same matrix. Round-trip tests assert both fields. |
| SIGBR-03 | SATISFIED | `verifyReceipt(..., { legacyPolicy })` and Python `verify(..., legacy_policy=...)` expose `allow`/`reject`, return the actual standard or legacy verification profile, and mark only legacy success deprecated. Historical committed vectors remain readable by default. |
| SIGBR-04 | SATISFIED | Both verifiers validate the version/profile matrix before key or signature branching and return `signature-invalid` for a v1.4 legacy-PAE signature without entering the compatibility helper. Focused no-fallback tests pass. |
| SIGBR-05 | SATISFIED | TypeScript issuance has one standard `buildPae` path; Python mint rejects v1.1-v1.3, missing profile, and unsupported profile. Historical PAE helpers are private to verifier modules and absent from public exports. |
| SIGBR-06 | SATISFIED | Tests independently cover schema downgrade, profile mismatch, canonical transport/payload, key lookup and revocation, authenticated body/envelope `kid` mismatch, signature failure, policy rejection, and profile-independent payload CID behavior. |

## Goal Criteria

1. **Corrected issuance:** Verified in TypeScript and Python with standard raw-byte PAE, v1.4, and `dsse-v1`.
2. **No historical issuance:** Source audit finds no issuer option or exported compatibility PAE helper.
3. **Observable compatibility:** Allow/reject policy and profile/deprecation results are public in both languages.
4. **Independent security axes:** Corrected no-fallback and separate schema/profile/CID/key/policy verdicts have focused regression coverage.

## Automated Checks

| Command | Result |
|---------|--------|
| `pnpm --filter @full-self-browsing/lattice typecheck` | Pass |
| `pnpm --filter @full-self-browsing/lattice test` | Pass: 84 files, 1,109 tests |
| `pnpm --filter @full-self-browsing/lattice build` | Pass |
| `pnpm --filter @full-self-browsing/lattice test:types` | Pass: 104 files, 1,310 tests, no type errors |
| Focused receipt Vitest suite | Pass: 4 files, 87 tests |
| `.context/python-venv/bin/python -m pytest clients/python/tests -q` | Pass: 44 tests |
| Python bytecode compile | Pass |
| Legacy-helper export and forbidden-scope source audits | Pass |
| `git diff --check` | Pass |

## Code Review

Deep review status is `clean`. Two Python parity issues found during review were fixed in `ede1e1a`: canonical base64 pad-bit enforcement and typed handling of non-string/unhashable version values.

## Deferred Boundary

The existing v1.5 specification, schemas, vector generator, CLI, and CI intentionally remain historical during this phase. Phase 58 owns their coordinated standard-profile migration, independent oracle proof, and packed-consumer enforcement.

## Human Verification

None required.

## Gaps

None.
