# Migrating to Lattice Receipt v1.4

Receipt v1.4 corrects Lattice signing to standard DSSE v1.0 while retaining a bounded,
observable verification bridge for receipts emitted by earlier Lattice releases. All new
issuance is `lattice-receipt/v1.4` with the signed field
`"signatureProfile":"dsse-v1"`. There is no legacy signing option.

The normative algorithm and result ordering are in [SPEC.md](./SPEC.md); the closed body
shape is [schema/v1.4.json](./schema/v1.4.json).

This guide covers the receipt protocol transition. For the broader SDK 1.5 to 1.6
upgrade, including Node support, runtime state, audit policy, agent evidence, and release
validation, see [Migrating to Lattice SDK v1.6](../docs/MIGRATION-v1.6.md).

## PAE Change

Earlier Lattice releases signed PAE containing the envelope's base64 payload text. v1.4
signs standard DSSE PAE containing the decoded canonical payload bytes.

For the illustrative two bytes `{}` (not a receipt body), standard base64 transport is
`e30=`. The final PAE field differs as follows:

```text
before, historical only:
DSSEv1 36 application/vnd.lattice.receipt+json 4 e30=

after, standard DSSE v1.0:
DSSEv1 36 application/vnd.lattice.receipt+json 2 {}
```

The v1.4 construction is a byte concatenation. The `{}` above represents bytes `7b7d`, not
a textual interpolation step. Lengths are decimal byte lengths. Envelope `payload` and
`sig` remain canonical RFC 4648 standard base64; base64url and non-canonical padding are
rejected.

## Issuance

Minter behavior is intentionally one-way:

| Operation | Version | Signed profile | PAE payload |
|-----------|---------|----------------|-------------|
| New issuance | `lattice-receipt/v1.4` | `dsse-v1` | RFC 8785 canonical body bytes |
| Historical issuance | Not supported | Not supported | Not supported |

Do not re-sign a historical body as v1.1-v1.3. Upgrade the body to v1.4, add the required
profile, canonicalize it, and mint a new receipt with its own identity.

## Verification Policy

The direct TypeScript and Python library entrypoints default to `allow` during the v1.6
bridge. This preserves read access while making compatibility acceptance visible. Strict
consumers select `reject`. Strictness disables only the deprecated fallback; it does not
reject historical version numbers whose standard DSSE signature verifies.

### TypeScript

`VerifyReceiptOptions` exposes the policy:

```ts
const compatible = await verifyReceipt(envelope, keySet);
const strict = await verifyReceipt(envelope, keySet, {
  legacyPolicy: "reject",
});
```

Omitting `legacyPolicy` is equivalent to `"allow"`.

### Python

The Python spelling is `legacy_policy`:

```python
compatible = verify(envelope, keyset)
strict = verify(envelope, keyset, legacy_policy="reject")
```

Omitting `legacy_policy` is equivalent to `"allow"`.

### CLI

Both commands preserve the compatible default and offer strict operation:

```sh
lattice verify receipt.json --standard-only
lattice repro receipt.json --standard-only
```

`--standard-only` maps to legacy policy `reject`. In `verify`, a receipt that requires the
historical path fails with `legacy-profile-rejected`. In `repro`, the same verdict is
reported as the replay prerequisite failure
`FAIL kind=verify-failed reason=legacy-profile-rejected: ...`; neither command reports it
as a generic load failure. Successful `verify` and `repro` output includes
`profile=<value>` and `deprecated=<true|false>`.

### CLI Exit and Output Contract

The exit classes remain stable for automation:

| Command and outcome | Exit | Output contract |
|---------------------|------|-----------------|
| `verify`, receipt verifies | 0 | One stdout line: `OK kid=<kid> verdict=<contractVerdict> profile=<verificationProfile> deprecated=<true\|false>` |
| `verify`, typed protocol failure (including strict legacy rejection) | 1 | One stderr line: `FAIL kind=<VerifyErrorKind> reason=<message>` |
| `verify`, receipt or keyset cannot be loaded | 2 | One stderr line with `kind=receipt-load-failed` or `kind=keyset-load-failed` |
| `repro`, replayed output hash matches | 0 | Stable summary ending in `profile=...`, `deprecated=...`, and `verdict=match` |
| `repro`, replayed output hash differs | 1 | Stable summary ending in `verdict=drift` plus expected and actual output hashes |
| `repro`, load, verification, artifact, replay, or output-hash prerequisite fails | 2 | One or more stderr lines beginning with `FAIL kind=<prerequisite-kind> reason=...` |

Strict legacy rejection therefore has command-specific exit classes: exit 1 from `verify`
and exit 2 from `repro`. It never reaches artifact loading or replay.

## Result Contract

Compatibility acceptance is not a boolean-only success. Callers must inspect the profile
and deprecation fields:

| Path that verified | TypeScript | Python | Deprecated |
|--------------------|------------|--------|------------|
| Standard DSSE | `verificationProfile: "dsse-v1"` | `verification_profile="dsse-v1"` | `false` |
| Historical base64-text PAE | `verificationProfile: "lattice-legacy-base64-pae"` | `verification_profile="lattice-legacy-base64-pae"` | `true` |

The historical profile is read-only and deprecated. Telemetry and audit records should
retain both fields so operators can measure remaining compatibility use.

## Decision Table

The verifier always attempts standard DSSE first and applies the first matching row:

| Receipt and signature | Policy `allow` | Policy `reject` |
|-----------------------|----------------|-----------------|
| v1.1-v1.3, standard DSSE signature | Success: `dsse-v1`, `deprecated=false` | Same success |
| v1.1-v1.3, historical base64-text signature | Success: `lattice-legacy-base64-pae`, `deprecated=true` | `legacy-profile-rejected` |
| v1.1-v1.3, neither signature verifies | `signature-invalid` | `legacy-profile-rejected` after standard failure |
| v1.4 with exact `dsse-v1`, valid standard signature | Success: `dsse-v1`, `deprecated=false` | Same success |
| v1.4 with exact `dsse-v1`, invalid standard signature | `signature-invalid`; no fallback | Same failure |
| v1.4 missing or changing `signatureProfile` | `signature-profile-mismatch` | Same failure |
| v1.1-v1.3 declaring any `signatureProfile` | `signature-profile-mismatch` | Same failure |

Key lookup, key state, canonical payload comparison, and the signed-body `kid` cross-check
remain independent checks. Envelope `keyid` is only an unauthenticated lookup hint until
the signature and signed `body.kid` both verify. Receipt CID remains
`sha256:<lowercase-hex>` of the decoded canonical payload bytes under either verification
profile.

## Conformance Corpora

The v1.4 layout separates historical evidence from current conformance:

```text
conformance/vectors/
  MANIFEST.sha256              aggregate exact-coverage manifest
  legacy/
    MANIFEST.sha256            immutable historical integrity anchor
    positive/*.json
    negative/*.json
  standard/
    positive/*.json            current v1.4 conformance
    negative/*.json            current adversarial conformance
```

Files under `vectors/legacy` are immutable historical evidence. Their JSON bytes and nested
manifest are preserved from the former flat corpus; profile labels are deliberately not
injected into them. They test the bounded bridge and must not be treated as examples for new
issuance. Files under `vectors/standard` are the current corrected corpus and carry explicit
profile expectations. The root manifest is the aggregate inventory once both corpora are
present.

## Migration Checklist

1. Mint only v1.4 bodies with signed `signatureProfile: "dsse-v1"`.
2. Treat envelope base64 as transport and build PAE over decoded canonical payload bytes.
3. Inspect `verificationProfile` and `deprecated` on every successful verification.
4. Enable `legacyPolicy: "reject"`, `legacy_policy="reject"`, or `--standard-only` where
   historical receipts are not required.
5. Use `vectors/standard` for implementation conformance and retain `vectors/legacy` only
   for compatibility regression coverage.
