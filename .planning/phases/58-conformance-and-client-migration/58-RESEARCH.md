# Phase 58: Conformance and Client Migration - Research

**Researched:** 2026-07-16
**Domain:** DSSE v1.4 specification, conformance corpora, cross-language clients, CLI policy, and release gates
**Confidence:** HIGH

## RESEARCH COMPLETE

Phase 58 should make the Phase 57 protocol correction independently reproducible. The
existing conformance surface is useful but intentionally historical: all committed
vectors use the legacy base64-text PAE, the generator and TypeScript harness now fail
typechecking against the corrected byte-oriented helper, the Python harness labels the
old corpus only implicitly, and the CLI neither reports nor enforces the verified
profile. These are migration failures, not reasons to change Phase 57 semantics.

The strongest implementation is an atomic split: preserve the current corpus byte-for-byte
under `vectors/legacy`, create a standalone deterministic `vectors/standard` corpus from
the normative schema, verify it with TypeScript, Python, and `securesystemslib==1.4.0`,
then expose the same bridge policy through CLI and packed-package checks.

## Standards and Oracle Findings

### DSSE v1.0

The standard signature input is:

`Sign(PAE(UTF8(PAYLOAD_TYPE), SERIALIZED_BODY))`

`PAE(type, body)` concatenates `DSSEv1`, ASCII spaces, decimal byte lengths,
the UTF-8 payload-type bytes, and the raw serialized body bytes. The envelope payload
remains base64 transport and is decoded before PAE construction. `keyid` is an
unauthenticated lookup hint, never a security assertion.

The upstream DSSE document permits standard and URL-safe base64. Lattice's profile is
deliberately narrower: canonical RFC 4648 standard base64 is required for both payload
and signatures. That product rule belongs in the Lattice specification and negative
vectors; an upstream oracle must not weaken it.

### `securesystemslib==1.4.0`

The exact release was installed in `.context/python-venv` and exercised against a
Python-minted Lattice v1.4 receipt. `Envelope.from_dict()` decoded the payload,
`Envelope.pae()` was byte-identical to `MintResult.pae_hex`, and `Envelope.verify()`
accepted the Ed25519 signature through `SSlibKey.from_crypto()`.

Important limits:

- `Envelope.pae()` uses `len(payload_type)` rather than the UTF-8 byte length. The
  Lattice payload type is fixed ASCII, so the result is exact for this protocol; retain
  a direct Lattice Unicode payload-type unit test rather than generalizing the oracle.
- `Envelope.from_dict()` is not Lattice's canonical-base64 policy oracle. Feed it only
  committed standard positives after Lattice harnesses have validated transport shape.
- `Envelope.verify()` matches signatures and keys by `keyid`; this is suitable for the
  committed test key but does not replace Lattice's signed `body.kid` cross-check or key
  state policy.
- The package supports the repository's Python baseline and can be pinned in the
  existing `[project.optional-dependencies].test` list. No runtime dependency is needed.

## Current Repository Findings

### Specification and schema

- `spec/SPEC.md` is still v1.3-oriented and describes PAE over the base64 payload text.
  Its signing algorithm, verification decision tree, examples, error kinds, and security
  considerations must be rewritten for v1.4 plus the bounded legacy branch.
- `spec/schema/v1.1.json` through `v1.3.json` are independent full schemas. `v1.4.json`
  should copy the v1.3 field surface, require `signatureProfile`, constrain it to
  `"dsse-v1"`, and constrain `version` to `"lattice-receipt/v1.4"`.
- `spec/vector0-fixture.json` and `spec/generate-vector0.ts` encode the historical
  algorithm. The normative worked fixture should become a standard v1.4 vector; the old
  example belongs in the migration guide as explicitly legacy evidence.
- `spec/CHANGELOG.md` needs a v1.4 entry that calls out the corrected PAE and observable
  compatibility bridge. A dedicated `spec/MIGRATION-v1.4.md` should contain exact
  library, CLI, corpus, and deprecation behavior.

### Vector generator and corpora

- The current generator imports production canonicalization, signing, receipt types,
  and PAE helpers. That makes the current conformance evidence circular and is already
  broken by Phase 57's `buildPae(..., Uint8Array)` contract.
- `pnpm --filter @lattice-conformance/generate typecheck` currently fails at the old
  string PAE calls and at historical-body union construction. The verifier package
  inherits those errors and has two more string PAE failures in `positive.test.ts`.
- The 12 existing JSON vectors and root manifest describe legacy behavior. Move their
  bytes and the current manifest together to `vectors/legacy/{positive,negative}` and
  `vectors/legacy/MANIFEST.sha256`; because manifest paths remain relative, the manifest
  itself can also remain byte-identical.
- A new root `MANIFEST.sha256` should cover all standard and legacy JSON files plus the
  frozen legacy manifest. Manifest verification must compare the enumerated file set to
  the manifest set, not merely hash listed files; otherwise unlisted stale JSON survives.
- The corrected generator should be standalone within `conformance/generate`: use
  `canonicalize`, Node/Web crypto, local vector types, and v1.4 JSON schema. It should
  write only the standard corpus and aggregate manifest, never rewrite legacy files.
- Add an output-directory seam so CI regenerates standard artifacts into a temporary
  directory and byte-compares them with committed files. A check command must not mutate
  the checkout.

### Standard corpus design

Use explicit metadata on every standard vector, including `corpusProfile: "standard"`,
`expectedVerificationProfile`, `expectedDeprecated`, and exact expected result. Positive
coverage should include:

1. Unicode step/redaction fields and the primary worked example.
2. A minimal valid v1.4 body with optional fields absent.
3. Lineage and agent/step fields, including `parentReceiptCid` and `lineageMerkleRoot`.

Adversarial negatives should target one first-match axis each: malformed envelope or
base64, unknown/too-low version, missing or unknown `signatureProfile`, legacy PAE on a
v1.4 body, key missing/revoked, non-canonical payload, corrupted signature, and signed
body/envelope kid mismatch. Where a negative cannot have valid schema by design, mark the
intended schema outcome separately from the verifier result.

### TypeScript and Python harnesses

- TypeScript should load legacy and standard trees independently. Legacy positives must
  assert `lattice-legacy-base64-pae`, `deprecated: true`, default allow, and strict reject.
  Standard positives must assert raw-byte PAE, `dsse-v1`, `deprecated: false`, and strict
  success. Negative tests must assert the exact typed error kind.
- Python's `conftest.py` currently assumes flat `positive/negative` paths. Split fixtures
  by profile and mirror the same result assertions.
- The current cross-mint test only exercises Python mint to TypeScript verify and compares
  against a historical vector. Replace it with two directions. TypeScript can emit a
  minted JSON envelope from a small test helper or fixture command; Python verifies it,
  while Python `mint-json` output continues to feed TypeScript. Assert canonical bytes,
  PAE, signature, CID, profile, and deprecation fields.
- Put the independent oracle in a separate Python test module so CI can identify oracle
  failures distinctly. It should test the upstream hello-world PAE and every standard
  positive's PAE/signature.

### CLI and replay materializer

- `runVerify` calls the two-argument verifier and prints only kid/verdict. Add
  `standardOnly?: boolean`, map it to `legacyPolicy: "reject"`, and print profile plus
  deprecation on success.
- `runRepro` verifies twice: once implicitly inside `materializeReplayEnvelope`, then
  directly for the summary. Add `legacyPolicy?: LegacyReceiptPolicy` to
  `MaterializeReplayEnvelopeOptions` and use it in the internal call. Pass the same policy
  to both calls, then include profile/deprecation in the stable summary.
- `--standard-only` should be a boolean citty flag on both commands. Verify keeps typed
  verification failures at exit 1; replay prerequisite failures remain exit 2.
- Extend focused CLI and materializer tests rather than adding parser-only coverage.

### CI and packed consumers

- `.github/workflows/conformance.yml` already pins actions and installs Python test extras.
  Extend path filters for CLI, materializer, package scripts, `package.json`, and the lockfile.
- Separate named steps should run exact-coverage manifests, non-mutating regeneration,
  TypeScript conformance, Python conformance, the independent oracle, reciprocal cross-mint,
  and a clean packed-consumer smoke.
- A focused `scripts/check-protocol-package-consumer.mjs` is clearer than overloading the
  existing version-surface check. Pack both packages, install them in a temporary project,
  mint/verify a standard receipt through public runtime exports, invoke the packed CLI,
  and assert profile output plus strict rejection of a frozen legacy receipt.
- Keep this smoke on the Phase 58 Node 24 CI line. Phase 62 owns the broader Node-version
  and provider-wire matrix.

## Security Threat Model

| Ref | Threat | Severity | Required mitigation |
|-----|--------|----------|---------------------|
| T-58-01 | Corrected signature failure silently falls back to legacy PAE | High | v1.4 negative vector and TS/Python/CLI strict assertions must end at `signature-invalid` |
| T-58-02 | Historical evidence is silently re-signed during corpus migration | High | byte-identical move plus unchanged nested legacy manifest; generator never writes legacy tree |
| T-58-03 | Generator and verifier share the same broken implementation | High | standalone generator plus independent securesystemslib oracle and reciprocal languages |
| T-58-04 | Manifest validates listed files but ignores extra stale vectors | Medium | exact set equality between recursive vector enumeration and manifest entries |
| T-58-05 | CLI strict flag affects display but materializer still accepts legacy | High | thread one policy through preverify and materializer; test loader is never touched on strict rejection |
| T-58-06 | Oracle weakens Lattice transport or key policy | High | oracle only PAE/signature of standard positives; Lattice harness owns base64, schema, key state, and kid checks |
| T-58-07 | Workspace tests pass while published exports or CLI args are broken | High | clean temporary packed runtime and CLI consumer gate |

No threat requires a production dependency, network access at runtime, or a new public
capability beyond the additive materializer policy option and CLI flag.

## Validation Architecture

Existing Vitest, pytest, package build, and tarball infrastructure is sufficient. Wave 0
adds test files and the exact Python test dependency as part of implementation; no new
test framework is required.

Fast corpus feedback:

`pnpm --filter @lattice-conformance/generate typecheck && pnpm --filter @lattice-conformance/verify-ts typecheck && pnpm --filter @lattice-conformance/verify-ts test`

Python and oracle feedback:

`.context/python-venv/bin/python -m pytest clients/python/tests/test_conformance.py clients/python/tests/test_dsse_oracle.py -q`

CLI feedback:

`pnpm --filter @full-self-browsing/lattice exec vitest run src/replay/materialize.test.ts && pnpm --filter @full-self-browsing/lattice-cli exec vitest run test/verify.test.ts test/repro.test.ts`

Final phase gate:

`pnpm -r typecheck && pnpm -r test && pnpm -r build && pnpm -r test:types && .context/python-venv/bin/python -m pytest clients/python/tests -q && pnpm --filter @lattice-conformance/generate check:generated && node scripts/check-protocol-package-consumer.mjs`

The conformance workflow definition must expose each drift class as its own named step so
CI failures identify whether the corpus, generator, language clients, oracle, or package
consumer boundary failed.

## Planning Implications

Use six plans after applying the plan-checker's scope threshold:

1. Establish the normative v1.4 specification/schema and byte-frozen legacy layout.
2. Build the standalone standard generator and deterministic semantic corpus.
3. Enforce exact manifests, non-mutating regeneration, and normative fixture binding.
4. Migrate TypeScript and Python harnesses, reciprocal mint verification, and the exact
   test-only securesystemslib oracle.
5. Thread standard-only policy through replay materialization and both CLI commands, then
   add focused packed runtime/CLI consumer coverage.
6. Wire every gate into conformance CI, run the complete validation matrix, and reconcile
   documentation and generated artifacts as one release surface.

Plans 2 and 3 form a sequential generator/integrity boundary after Plan 1. Plans 4 and 5
depend on Plan 3 and may share a wave. Plan 6 depends on both. This keeps every plan below
GSD's warning threshold while stabilizing the vector/schema contract before consumers
migrate and retaining one explicit closure gate.

## Sources

- `.planning/phases/58-conformance-and-client-migration/58-CONTEXT.md`
- `.planning/phases/57-protocol-semantics/57-VERIFICATION.md`
- `.planning/research/SUMMARY.md`
- `.planning/research/ARCHITECTURE.md`
- `.planning/research/PITFALLS.md`
- DSSE v1.0 protocol: https://github.com/secure-systems-lab/dsse/blob/v1.0.0/protocol.md
- securesystemslib v1.4.0 DSSE source: https://github.com/secure-systems-lab/securesystemslib/blob/v1.4.0/securesystemslib/dsse.py
- securesystemslib v1.4.0 key source: https://github.com/secure-systems-lab/securesystemslib/blob/v1.4.0/securesystemslib/signer/_key.py
- securesystemslib 1.4.0 release metadata: https://pypi.org/project/securesystemslib/1.4.0/
