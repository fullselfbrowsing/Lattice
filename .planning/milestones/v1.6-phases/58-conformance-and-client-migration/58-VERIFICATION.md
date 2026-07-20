---
phase: 58-conformance-and-client-migration
verified: 2026-07-20T14:41:28Z
status: passed
score: 5/5 success criteria verified
requirements: [CONF16-01, CONF16-02, CONF16-03, CONF16-04, CONF16-05, CONF16-06]
gaps: []
human_verification: []
decision_coverage:
  honored: 14
  total: 14
  not_honored: []
---

# Phase 58 Verification

## Result

Passed. The normative protocol, labeled immutable and generated corpora,
TypeScript and Python consumers, independent DSSE oracle, CLI bridge, named CI
gates, and clean packed consumer form one reproducible v1.4 conformance surface.
No Phase 58 goal gap or human-only verification remains.

## Goal Achievement

| # | Roadmap Success Criterion | Status | Actual Evidence |
|---|---------------------------|--------|-----------------|
| 1 | The specification, schemas, examples, and migration guide reproduce standard verification and the bounded legacy bridge without production source. | VERIFIED | `spec/SPEC.md`, `spec/schema/v1.4.json`, `spec/vector0-fixture.json`, and `spec/MIGRATION-v1.4.md` define canonical bytes, raw-byte DSSE PAE, profile/version policy, error ordering, key/CID rules, and legacy allow/reject behavior. The standalone generator imports no production receipt implementation and reproduces the committed corpus exactly. |
| 2 | Consumers distinguish immutable legacy vectors from separately labeled standard positive and adversarial negative vectors. | VERIFIED | `conformance/vectors/legacy` retains its frozen 12-file manifest; `conformance/vectors/standard/{positive,negative}` carries explicit profile, deprecation, and expected-result metadata. The aggregate manifest enforces exact recursive membership, while temporary regeneration leaves committed evidence untouched. |
| 3 | TypeScript and Python reciprocally mint and verify standard-profile receipts. | VERIFIED | `cross_mint_parity.test.ts` drives the Python `mint-json` and `verify-json` entrypoints and asserts canonical bytes, PAE, signature, CID, body, profile, and deprecation in both directions. The enabled virtualenv-backed gate passed 2/2 tests. |
| 4 | CI checks the independent oracle and rejects every specified conformance and packed-package drift class. | VERIFIED | `.github/workflows/conformance.yml` has ordered gates for frozen legacy hashes, exact aggregate coverage, generator/type/non-mutation checks, TypeScript, Python, `securesystemslib==1.4.0`, reciprocal minting, build, and packed consumer behavior. Workflow safety, generator, oracle, and packed checks pass. |
| 5 | CLI verify and replay report the verified profile and can enforce standard-only operation. | VERIFIED | `verify.ts`, `repro.ts`, and replay materialization derive one legacy policy, reject historical evidence before artifact access in strict mode, and report verifier-owned `profile` and `deprecated` fields. The focused materializer and CLI suites pass 9 and 34 tests. |

**Score:** 5/5 success criteria verified.

## Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| CONF16-01 | SATISFIED | Normative spec, v1.4 schema, worked fixture, migration guide, and standalone generator provide a source-independent implementation contract. |
| CONF16-02 | SATISFIED | Frozen legacy, standard positive, and one-axis adversarial corpora have explicit taxonomy and exact nested plus aggregate integrity checks. |
| CONF16-03 | SATISFIED | TypeScript and Python consume both corpora and reciprocally mint and verify exact standard bytes, profiles, CIDs, and verdicts. |
| CONF16-04 | SATISFIED | The exact test-only `securesystemslib==1.4.0` oracle independently matches PAE and verifies Ed25519 signatures without entering runtime dependencies. |
| CONF16-05 | SATISFIED | Verify and repro expose actual profile/deprecation metadata and thread `--standard-only` through the verify-first materialization boundary. |
| CONF16-06 | SATISFIED | Named local and CI gates reject stale or extra artifacts, generation drift, language mismatch, oracle failure, and packed runtime/CLI incompatibility. |

**Coverage:** 6/6 requirements satisfied.

## Artifact And Wiring Verification

- All 21 artifacts declared across six plan frontmatters exist and are substantive.
  Nineteen file artifacts passed the GSD checker; the two standard corpus directory
  artifacts were verified as non-empty because that checker accepts file paths only.
- All 18 declared key links pass after correcting the completed Plan 58-03 record
  to the shipped `vec-00-v1.4-unicode-redaction.json` filename. The normative
  fixture is byte-identical to that vector.
- Phase completeness passes with six plans and six summaries. Every requirement is
  claimed in summary frontmatter, and all 14 task commits plus six plan-close
  commits referenced by the summaries exist.
- Schema drift discovery reports no ORM-backed schema drift. The protocol JSON
  schema is intentional, normative, parsed by validation, and exercised by the
  generator and language consumers.

## Behavioral Verification

| Command | Result |
|---------|--------|
| Generator typecheck and tests | Pass: 2 files, 28 tests |
| `pnpm --filter @lattice-conformance/generate check:generated` | Pass: committed corpus exactly matches clean temporary generation |
| TypeScript conformance typecheck and default suite | Pass: 41 tests; 2 reciprocal tests intentionally skipped in the default run |
| Enabled reciprocal TypeScript/Python mint gate | Pass: 2 tests |
| `.context/python-venv/bin/python -m pytest clients/python/tests -q` | Pass: 59 tests |
| Focused `securesystemslib==1.4.0` oracle | Pass: 8 tests |
| Replay materializer and CLI verify/repro suites | Pass: 9 and 34 tests |
| `pnpm check:packed-consumer` | Pass: clean runtime and CLI tarball bridge behavior |
| Current workspace typecheck, test, type-test, build, boundary, and workflow gates | Pass through the v1.6 release-candidate matrix |
| `git diff --check` | Pass |

## Test Quality Audit

- Standard negatives isolate transport, version, profile, PAE, key, canonicalization,
  signature, and signed-key axes with exact typed outcomes rather than generic failure.
- Aggregate coverage rejects missing, extra, duplicate, changed, escaping, and
  symlinked entries; regeneration occurs in a temporary directory and compares bytes.
- Reciprocal tests use public machine-readable drivers and assert exact cryptographic
  artifacts, preventing shared-fixture or boolean-only interoperability claims.
- The upstream oracle owns only DSSE PAE/signature evidence; Lattice tests retain
  authority over canonical base64, schema, key state, signed key, CID, and bridge policy.
- Packed verification installs only runtime and CLI tarballs and exercises public
  exports and the installed binary outside workspace resolution.

## Decision Coverage

All 14 trackable `58-CONTEXT.md` decisions are honored by shipped artifacts.

## Human Verification

None required. Every protocol, corpus, language, CLI, CI, oracle, and package
consumer behavior has deterministic automated evidence.

## Gaps

None. Phase goal achieved and its previously missing verification record is closed.

## Deferred Boundary

Changing the direct-library default to strict historical rejection or removing the
legacy verifier requires a later measured deprecation milestone. Broader Node and
provider-wire canaries were delivered by Phase 62.

---
*Verified: 2026-07-20T14:41:28Z*
*Verifier: Codex (inline goal-backward verification; subagent dispatch disabled)*
