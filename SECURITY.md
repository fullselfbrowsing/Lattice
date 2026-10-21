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

Capability receipts carry an explicit `body.version` discriminator. The ordered version list lives in `packages/lattice/src/receipts/schema-version.ts` (`RECEIPT_VERSIONS`). New receipts are minted at `lattice-receipt/v1.4`; verifiers accept `v1.1` through `v1.4` and reject `v1` and unversioned bodies.

**Attack:** an attacker holding a valid signing key could mint a v1-shaped body and submit it to a newer verifier. The v1 receipt schema predates the step-marker integrity surface added in v1.1, so a successful downgrade would let an attacker bypass the v1.1 step-chain commitments. The receipt would verify cryptographically (the signature is valid against a known `kid`) while suppressing downstream invariant checks that depend on newer fields.

**Precedent:** Radicle disclosed the analogous attack in March 2026; their receipt protocol's `schemaVersion` field was optional, and an attacker could omit it to suppress downstream invariant checks. The Lattice defense pattern mirrors the Radicle mitigation: reject early, before any cryptographic work, when the version discriminator is absent or below the current floor.

**Defense:** `verifyReceipt` in `packages/lattice/src/receipts/verify.ts` short-circuits with the `schema-version-too-low` error kind whenever `body.version` is absent or its ordinal is below the floor. The floor is `v1.1` by default; a verifier that needs the guarantees of a newer schema (for example the `v1.3` lineage root) raises it with `VerifyOptions.minVersion`, which produces the same error kind. The check runs before signature validation so an attacker cannot use signature-validity timing to probe the version state. The error kind literal is exported from `packages/lattice/src/receipts/types.ts` as part of the `VerifyErrorKind` union, so downstream consumers can pattern-match the downgrade rejection specifically.

This writeup and the defense are auditably linked: searching for the literal string `schema-version-too-low` finds the documentation here, the union member in `types.ts`, the rejection branch in `verify.ts`, and the regression tests that exercise the downgrade branches and the `minVersion` floor.

### Receipt Freshness and Audience Binding (v1.4)

A valid signature proves integrity and attribution. It does not prove that a receipt is recent, was issued for you, or has not been shown before. Receipts minted at `v1.4` may carry three optional fields for that purpose: `audience` (the intended relying party), `nonce` (a caller-supplied single-use value), and `expiresAt` (an ISO 8601 instant). `ai.run` sets them from `intent.receipt: { audience, nonce, ttlMs }`; `createReceipt` accepts them directly.

`verifyReceipt(envelope, keySet, options)` enforces them through `expectedAudience`, `expectedNonce`, `now`, and `maxAgeMs`, failing with `audience-mismatch`, `nonce-mismatch`, or `receipt-expired`. A receipt that carries no audience or nonce cannot satisfy an expectation, so an absent field fails when the verifier asks for one. These three checks are **opt-in**. A receipt with no `audience`, no `nonce`, and no `expiresAt` still verifies, and `receiptVerifyAdvisories` (also printed by `lattice verify` as `WARN` lines) says so. `minVersion` is likewise opt-in above the `v1.1` floor: pass it to reject an older schema. `expiresAt` is honored by every verifier whenever it is present, including replay and eval. These checks run after signature verification so an unauthenticated envelope cannot be used to probe which audience or nonce a verifier expects. `expiresAt`, `issuedAt` (under `maxAgeMs`), and a string `now` must be calendar-valid RFC 3339 instants with an explicit `Z` or numeric offset, parsed field by field in `packages/lattice/src/receipts/timestamp.ts` rather than by `Date.parse`; any other shape, and any impossible date such as February 31 or hour 24 that `Date.parse` would roll forward, fails `receipt-expired` (or throws for `now`) rather than being read as the verifier's local time or shifted to a later instant, so a verdict never depends on the machine's timezone or its date library, and `createReceipt` refuses to issue a receipt with such a timestamp. No replay cache ships with the verifier; callers that must accept a receipt only once should record `receiptCid()` values they have already accepted.

### Receipt Chain Integrity

Crew receipts form a tree: a crew-root receipt with no parent and per-agent completion receipts whose `parentReceiptCid` is the root's CID. `verifyChain(envelopes, keySet, options)` in `packages/lattice/src/receipts/chain.ts` (also `lattice receipt verify-chain <dir>`) verifies every link, requires unique CIDs, one `runId`, exactly one root, and parent linkage reachable from the root, and compares against `expectedRunId`, `expectedCount`, and `expectedRootCid` when given.

**Tail truncation.** A chain with no size commitment still verifies if a leaf is dropped. `verifyChain` then sets `advisories` (and `lattice receipt verify-chain` prints `WARN`) telling the caller to pass `expectedCount`. That option, or an external anchor such as the per-agent receipt CID lists a `CrewResult` reports, is what catches the drop. Crew runs minted by this release do not depend on the caller: the crew-start receipt sets `chainClosure: "member-cids"` and a closing receipt lists every other member in `chainMemberCids`. Dropping a leaf, or dropping the closer, fails `verifyChain` with `count-mismatch`. Receipts minted before that field existed do not carry it, and `verifyChain` does not invent a count for them. `expectedRootCid` detects a replaced root, not a missing leaf. Dropping the root or an interior receipt is detected either way.

### Tripwire Evidence Redaction

The tripwire kernel returns the raw matched value in `result.error.evidence.observed` so callers can debug a violation. That copy is never signed. Before signing, `redactReceiptBody` in `packages/lattice/src/receipts/redact.ts` rewrites `tripwireEvidence.observed` for every invariant kind (a detector name, length, and shape mask for `no-pii`, where the mask covers letters, digits, and combining marks in any script; a value type from a closed set, and nothing else, for the others) and rebuilds `tripwireEvidence.message` from the invariant kind, the declared path, and the detector name, pushing a `redactions[]` manifest entry at the moment of each rewrite. `tripwireEvidence.path` is always the developer-declared path; the concrete location of a `no-pii` hit, which can contain model-produced object keys, exists only on the runtime error as `observed.foundAt`. The signed bytes therefore never contain the matched value, the location, or a schema library's issue text, and the manifest can only describe rewrites that happened. Receipts minted before `v1.4` still carry the raw matched substring and should be treated accordingly.

### Receipt Issuance Failures

When a configured signer fails, `ai.run` does not silently return an unsigned run. By default (`receipts.onSignerError: "flag"`) the result carries `receiptError: { kind: "signer-failed", message }` and a `step.transition` event with `receiptError` and `mintError` is emitted. With `"throw"`, `ai.run` emits `run.failed` and rejects with `ReceiptSigningError`. The receipt is minted before the session turn is appended, so a rejected run records nothing in a configured session store and a retry on the same session does not see it as prior context.

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
