# Security Policy

Lattice ships cryptographic primitives (RFC 8785 canonicalization, Ed25519-signed capability receipts, KeySet rotation). We take security reports seriously and prefer private coordinated disclosure.

## Reporting a Vulnerability

Please report suspected vulnerabilities privately to `lakshmantvnm@gmail.com`. Do not open a public GitHub issue for security reports.

We follow a 90-day private disclosure window before any public CVE coordination. The clock starts when the report is acknowledged. If you need a longer embargo (for example, because a downstream consumer is mid-remediation), say so in your report and we will agree on the extension in writing.

Our response SLA:

- **Acknowledgement:** within 5 business days of receipt.
- **Remediation ETA:** within 14 business days of acknowledgement, after triage.
- **Coordinated public disclosure:** at or before the 90-day mark, jointly with the reporter where possible.

We will credit reporters in the published advisory unless they ask to remain anonymous.

## Scope

**In scope:**

- `@full-self-browsing/lattice` (runtime SDK published to npm).
- `@full-self-browsing/lattice-cli` (CLI published to npm; bin name remains `lattice`).
- The publish pipeline itself. Release supply-chain trust is enforced via npm OIDC Trusted Publisher with provenance attestations, so there is no long-lived `NPM_TOKEN` to steal. Compromise of the publishing pipeline (the OIDC trust tuple, the release workflow, or any SHA-pinned third-party action it uses) is in scope.
- The receipt verification path, the KeySet rotation surface, the redaction manifest, and the replay envelope materialization path.

**Out of scope:**

- The canary consumer repository (`fullselfbrowsing/lattice-canary`) lives under its own security policy. Report canary-specific issues there.
- Bugs in user-supplied provider adapters (custom `ProviderAdapter` implementations users write against the Lattice interfaces). Report those to the adapter's own maintainer.
- Bugs in third-party transitive dependencies. Report those upstream. We will fast-track a dependency bump once the upstream advisory is public.
- Theoretical attacks against Ed25519 or SHA-256 at the primitive level. We track NIST and IETF guidance and will migrate when the cryptographic community does.

## Threat Model

Lattice's security model rests on three load-bearing assumptions, each documented below with the code surface that enforces it.

### Ed25519 Signing Key Entropy

Capability receipts are signed with Ed25519 keys generated via `crypto.subtle.generateKey("Ed25519", ...)` in `packages/lattice/src/receipts/sign.ts` (the `generateEd25519KeyPairJwk` export).

**Assumption:** the host runtime supplies a cryptographically-secure pseudo-random number generator via WebCrypto. On Node 24 this is `crypto.subtle` backed by the OpenSSL CSPRNG; on browsers this is the platform WebCrypto implementation.

Lattice does not fall back to weaker PRNGs. On a runtime that lacks `crypto.subtle.generateKey` with the Ed25519 algorithm, key generation throws and the runtime declines to mint receipts. There is no `Math.random()` shim, no synchronous fallback, no environment-variable override.

Users plugging custom signers (KMS adapters, OS keyring integrations, HSM-backed signers) are responsible for the entropy posture of their key-material source. The `ReceiptSigner` interface accepts already-generated key material; Lattice does not validate the upstream entropy chain.

### Signing Key Rotation

The rotation surface is `KeyEntry.state` defined in `packages/lattice/src/receipts/types.ts`, with three states: `active`, `retired`, `revoked`.

Lifecycle:

- **Active.** New keys join the KeySet as `active`. Verification accepts signatures against active keys.
- **Retired.** Superseded keys transition to `retired`. They continue to verify historical receipts so previously-issued receipts do not silently fail, but new receipts should not be minted against retired keys.
- **Revoked.** Compromised keys transition to `revoked`. All receipts under that `kid` are rejected by `verifyReceipt` with the `key-revoked` error kind, regardless of when they were signed.

**Recommended rotation cadence:** annually, OR within 30 days of any suspected key compromise, whichever is sooner. Rotate immediately if a signer host is suspected of compromise; do not wait for the annual cycle.

The in-process reference KeySet implementation is `createMemoryKeySet` in `packages/lattice/src/receipts/keyset.ts`. Users wiring KMS-backed key sets implement the same `KeySet` interface (single `lookup(kid)` method returning a `KeyEntry`) and are responsible for the persistence and state-transition policy of their backing store.

### Receipt Downgrade Defense (CRYPTO-01)

Capability receipts carry an explicit `body.version` discriminator with two accepted literals: `"lattice-receipt/v1"` and `"lattice-receipt/v1.1"`.

**Attack:** an attacker holding a valid signing key could mint a v1-shaped body and submit it to a v1.1 verifier. The v1 receipt schema predates the step-marker integrity surface added in v1.2, so a successful downgrade would let an attacker bypass the v1.1 step-chain commitments. The receipt would verify cryptographically (the signature is valid against a known `kid`) while suppressing downstream invariant checks that depend on v1.1 fields.

**Precedent:** Radicle disclosed the analogous attack in March 2026; their receipt protocol's `schemaVersion` field was optional, and an attacker could omit it to suppress downstream invariant checks. The Lattice defense pattern mirrors the Radicle mitigation: reject early, before any cryptographic work, when the version discriminator is absent or below the current floor.

**Defense:** `verifyReceipt` in `packages/lattice/src/receipts/verify.ts` short-circuits with the `schema-version-too-low` error kind whenever `body.version` is absent or equals `"lattice-receipt/v1"`. The check runs before signature validation so an attacker cannot use signature-validity timing to probe the version state. The error kind literal is exported from `packages/lattice/src/receipts/types.ts` as part of the `VerifyErrorKind` union, so downstream consumers can pattern-match the downgrade rejection specifically.

This writeup and the defense are auditably linked: searching for the literal string `schema-version-too-low` finds the documentation here, the union member in `types.ts`, the rejection branch in `verify.ts`, and the regression test that exercises both downgrade branches.

## Supply Chain

- All third-party GitHub Actions used in `.github/workflows/` are pinned by 40-character commit SHA, not by tag or major version. This mitigation follows the TanStack 2026 OIDC compromise (a maintainer-token theft that pushed malicious code through a tag-pinned action). Renovate or Dependabot is responsible for SHA bumps; humans review each bump.
- The publish pipeline uses npm OIDC Trusted Publisher with provenance attestations rather than a long-lived `NPM_TOKEN`. The trust tuple binds the npm scope to a specific GitHub repository, workflow file, and environment, so a stolen developer credential cannot publish.
- The `npm-publish` GitHub Environment requires manual reviewer approval for the first three publishes after the OIDC binding lands. After that window we re-evaluate the approval gate based on operational signal.

## Provenance Verification

Once the first OIDC-signed publish lands in Phase 28, the npm registry will surface provenance attestations on the tarball. Anyone can verify with stock tooling:

```bash
npm view @full-self-browsing/lattice --json | jq .dist
```

Inspect `.dist.attestations.provenance` for the signed claim that links the tarball to the GitHub workflow run that produced it. See `README.md` for the user-facing copy-pastable example and the expected output shape.

## License

This security policy is licensed MIT alongside the rest of the repository. See `LICENSE` for the full text.
