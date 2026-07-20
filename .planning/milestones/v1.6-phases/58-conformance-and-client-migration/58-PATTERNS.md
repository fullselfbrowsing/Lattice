# Phase 58: Conformance and Client Migration - Pattern Map

## Interoperability Spine

| Role | Target | Existing pattern to preserve |
|------|--------|------------------------------|
| Normative schema | `spec/schema/v1.4.json` | Full draft-2020-12 schemas with closed properties and exact version literal |
| Protocol prose | `spec/SPEC.md`, `spec/MIGRATION-v1.4.md` | Numbered normative algorithms, explicit error taxonomy, worked committed fixture |
| Deterministic generator | `conformance/generate/src/` | Explicit regen gate, RFC 8785 cross-checks, sorted writes, manifest last |
| Frozen evidence | `conformance/vectors/legacy/` | Existing JSON bytes and current relative-path manifest unchanged |
| Corrected evidence | `conformance/vectors/standard/` | Positive/negative split with one semantic axis per adversarial vector |
| TS consumer | `conformance/verify-ts/src/` | Direct public behavior checks with exact verdicts, not truthy failure checks |
| Python consumer | `clients/python/tests/` | Shared fixture loader, dataclass result narrowing, exact profile/error assertions |
| CLI bridge | `packages/lattice-cli/src/commands/{verify,repro}.ts` | Testable named handlers, conditional optional args, stable output/exit contracts |
| Replay policy | `packages/lattice/src/replay/materialize.ts` | Additive options bag and verify-first side-effect boundary |
| Package gate | `scripts/check-package-version-surfaces.mjs` | Temporary packed installs tested only through public package surfaces |

## Concrete Reuse

### Standalone generation

Reuse `canonicalize` and the existing RFC 8785 cross-check module, but replace production
receipt imports with local byte/base64/Ed25519 helpers. Keep the existing private key warning,
deterministic timestamps/IDs, schema validation before signing, and write-manifest-last order.
Accept an explicit output root so the same generation function supports committed regen and
temporary drift checks.

### Frozen plus aggregate manifests

Move the old root manifest alongside the legacy subtrees without editing it. Generalize the
manifest helper to recursively enumerate tracked JSON under both profiles, include the nested
legacy manifest in the root aggregate, sort POSIX relative paths, and compare manifest entries
to actual tracked files before checking hashes.

### Profile-aware harnesses

Follow the existing `describe.each` loaders but make profile selection explicit in fixture
paths and metadata. Standard PAE uses `Buffer.from(vector.canonicalBytesHex, "hex")`; legacy
tests reconstruct the historical text only inside test code. Successful results always assert
both `verificationProfile` and `deprecated`.

### Additive policy threading

Follow Phase 57's optional verifier options object. Add `legacyPolicy?: LegacyReceiptPolicy`
to `MaterializeReplayEnvelopeOptions`, pass `{ legacyPolicy: options.legacyPolicy }` only when
defined, and derive one `legacyPolicy` from each CLI's `standardOnly` boolean. Avoid separate
policy decisions at materialization and summary verification call sites.

### Packed public consumer

Follow the existing temporary-directory, `pnpm pack`, install, and subprocess patterns in
`scripts/check-package-version-surfaces.mjs`. The focused script should import only the packed
runtime's declared exports and invoke only the packed CLI binary; any source-relative import
would defeat `CONF16-06`.

## Test Placement

- `conformance/generate/src/*.test.ts`: schema, local PAE, deterministic output, and exact manifest coverage.
- `conformance/verify-ts/src/{legacy,standard,manifest,cross_mint_parity}.test.ts`: profile-separated TypeScript behavior.
- `clients/python/tests/test_conformance.py`: both corpus profiles and reciprocal TypeScript mint verification.
- `clients/python/tests/test_dsse_oracle.py`: upstream PAE and independent signature checks only.
- `packages/lattice/src/replay/materialize.test.ts`: policy threading and verify-before-loader ordering.
- `packages/lattice-cli/test/{verify,repro}.test.ts`: flags, output fields, error kinds, and exit codes.
- `scripts/check-protocol-package-consumer.mjs`: clean external runtime/CLI install and behavior.

## Boundaries

- Do not change Phase 57 signing, CID, version/profile, or default direct-verifier semantics.
- Do not regenerate or re-sign historical vectors.
- Do not use securesystemslib outside Python tests.
- Do not make the oracle authoritative for Lattice canonical base64, schema, key state, or kid policy.
- Do not broaden the packed smoke into Phase 62's Node/provider compatibility matrix.
