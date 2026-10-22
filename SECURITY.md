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

### What a Receipt Covers

A receipt signs hashes, not content: SHA-256 hashes of the input artifact values (`inputHashes`) and of the outputs (`outputHash`), plus the contract hash and verdict, the requested and observed model, the selected route (`providerId`, `capabilityId`, `attemptNumber`), usage, redacted tripwire evidence, and the optional binding, chain, lineage, and step fields. It does not sign the task or prompt text, the policy, or the routing rationale and rejected candidates. A relying party that needs those must record them separately, for example as an input artifact. The hashes are unsalted, so a low-entropy value such as an SSN or a yes/no answer can be confirmed from a receipt by hashing candidate values.

### Receipt Freshness and Audience Binding (v1.4)

A valid signature proves integrity and attribution. It does not prove that a receipt is recent, was issued for you, or has not been shown before. Receipts minted at `v1.4` may carry three optional fields for that purpose: `audience` (the intended relying party), `nonce` (a caller-supplied single-use value), and `expiresAt` (an ISO 8601 instant). `ai.run` sets them from `intent.receipt: { audience, nonce, ttlMs }`; `createReceipt` accepts them directly.

`verifyReceipt(envelope, keySet, options)` enforces them through `expectedAudience`, `expectedNonce`, `now`, and `maxAgeMs`, failing with `audience-mismatch`, `nonce-mismatch`, or `receipt-expired`. A receipt that carries no audience or nonce cannot satisfy an expectation, so an absent field fails when the verifier asks for one. These three checks are **opt-in**. A receipt with no `audience`, no `nonce`, and no `expiresAt` still verifies. `minVersion` is likewise opt-in above the `v1.1` floor: pass it to reject an older schema. `receiptVerifyAdvisories(body, options)` reports what verification left unchecked as `{ code, severity, message }` objects. A `warn` (`audience-unchecked`, `nonce-unchecked`) means the receipt is bound to an audience or nonce but the verifier did not pass the expectation, so a replay to another relying party verifies the same way. An `info` (`audience-absent`, `nonce-absent`, `expiry-absent`, `version-below-current`) names an optional check the receipt does not use; `version-below-current` is judged against the effective floor, max(`minVersion`, `v1.1`). No message contains a nonce value. `lattice verify` prints each `warn` as a `WARN <code>: <message>` line and each `info` as an `INFO <code>: <message>` line on stderr; `--quiet` hides only the `INFO` lines. Advisories never change the verdict or the exit code, so a relying party should gate on the `warn` codes or pass the expectations. `expiresAt` is honored by every verifier whenever it is present, including replay and eval. These checks run after signature verification so an unauthenticated envelope cannot be used to probe which audience or nonce a verifier expects. `expiresAt`, `issuedAt` (under `maxAgeMs`), and a string `now` must be calendar-valid RFC 3339 instants with an explicit `Z` or numeric offset, parsed field by field in `packages/lattice/src/receipts/timestamp.ts` rather than by `Date.parse`; any other shape, and any impossible date such as February 31 or hour 24 that `Date.parse` would roll forward, fails `receipt-expired` (or throws for `now`) rather than being read as the verifier's local time or shifted to a later instant, so a verdict never depends on the machine's timezone or its date library, and `createReceipt` refuses to issue a receipt with such a timestamp. No replay cache ships with the verifier; callers that must accept a receipt only once should record `receiptCid()` values they have already accepted.

### Receipt Chain Integrity

Crew receipts form a tree. A crew run with a signer mints, in order, a crew-start root with no parent, a completion receipt for each child run that succeeded, the root agent's completion receipt, and a crew-close receipt. Every receipt after the root sets `parentReceiptCid` to the root's CID. When each of N agents runs once and every child run succeeds, that is N + 2 receipts; a child that never runs or whose run fails gets no completion receipt. The crew-start `outputHash` commits to the agent id tree (each agent's `id` and its children, nested as declared). It does not cover the agents' intents, tools, or policy. Each completion receipt hashes that agent's output (the root agent's carries a `null` output hash when the root agent failed), and the crew-close receipt signs `execution-failed` when the crew did not succeed. `verifyChain(envelopes, keySet, options)` in `packages/lattice/src/receipts/chain.ts` (also `lattice receipt verify-chain <dir>`) verifies every link, requires unique CIDs, one `runId`, exactly one root, and parent linkage reachable from the root, and compares against `expectedRunId`, `expectedCount`, and `expectedRootCid` when given.

**Tail truncation.** Dropping leaf receipts leaves a smaller tree that is still fully linked. Two commitments catch it: an out-of-band `expectedCount` (or an external anchor such as the per-agent receipt CID lists a `CrewResult` reports), or chain closure inside the receipts. A root receipt may set `chainClosure: "member-cids"`; one closing receipt then lists the CIDs of every other member, sorted and unique, in `chainMemberCids`. Crew runs set both. When closure is declared, `verifyChain` requires exactly one closing receipt whose list equals the other presented receipts, so a dropped leaf, a dropped closer, or an added receipt fails with `count-mismatch`. Only the root may declare closure: `createReceipt` throws a `TypeError` when `chainClosure` comes with `parentReceiptCid`, and `verifyChain` fails a declaration on any other receipt. A malformed `chainClosure` or `chainMemberCids` fails `verifyReceipt` with `version-mismatch`, which `verifyChain` reports as `link-invalid`. A chain with neither commitment still verifies, and `verifyChain` returns a `tail-truncation-unchecked` warning (a `WARN` line from `lattice receipt verify-chain`). `expectedRootCid` detects a replaced root, not a missing leaf. Dropping the root or an interior receipt is detected either way.

**Verifier versions.** The closure fields were added to `lattice-receipt/v1.4` without a schema-version bump, so 1.6.x verifiers keep accepting crew receipts that carry them. Those verifiers ignore the fields and do not enforce closure: a dropped crew leaf still verifies there. Closure is enforced only by verifiers from 1.7.0 on. A relying party that must detect truncation should verify with 1.7.0 or later and pass `requireClosure: true` (`--require-closure`), which fails any chain that declares no closure, including chains minted before closure existed.

**Selective disclosure.** `partial: true` (`--partial`) verifies a disclosed subset of a closed chain. The closing receipt must be present and must list every presented receipt, and the subset must still form one tree under the root. Listed members that were not presented are reported as a `closure-partial` warning, because they were not checked. `--quiet` does not hide it.

### PII Tripwire Scope

`inv.noPII` is a narrow regex screen for email addresses and US SSN, phone, and payment card formats in `packages/lattice/src/contract/pii-detectors.ts`. It is not a data-loss-prevention system. It decides the run's verdict only; the signed receipt never contains the matched value (see below). These misses are deliberate:

- an SSN, phone, or card number right after an identifier label such as `order`, `invoice`, `sku`, or `ref`, unless it is a phone with a `+1` or `1` trunk prefix (email addresses are never label-checked, so they are flagged after a label);
- a spaced or undashed SSN, or a plain 10-digit phone number, whose nearest word is not an SSN or phone cue (a `+1` followed by a space, dot, or dash, or a `1-`, counts as a phone cue);
- unseparated `+14155551234`;
- card numbers that start with 0 or 1, including UATP cards;
- a value under a telling key (`{ ssn: "123456789" }`), because detectors read strings, not keys;
- names, postal addresses, IP addresses, dates of birth, and non-US formats.

The card detector checks every 13-19 digit run, and about one random run in ten passes Luhn, so a text that lists k long numeric ids is flagged with probability near 1 - 0.9^k. The exact rules are in `README.md` under Contracts.

### Tripwire Evidence Redaction

The tripwire kernel returns the raw matched value in `result.error.evidence.observed` so callers can debug a violation. That copy is never signed. Before signing, `redactReceiptBody` in `packages/lattice/src/receipts/redact.ts` rewrites `tripwireEvidence.observed` for every invariant kind (a detector name, length, and shape mask for `no-pii`, where the mask covers letters, digits, and combining marks in any script; a value type from a closed set, and nothing else, for the others) and rebuilds `tripwireEvidence.message` from the invariant kind, the evidence path, and the detector name, pushing a `redactions[]` manifest entry at the moment of each rewrite. `tripwireEvidence.path` is always developer-owned: the declared path, or for a `must-cite` check with no declared path, the key name of the reported list (`citations` or `evidence`). Locations built from the output's own keys, which a model controls, stay on the runtime error: `observed.foundAt` for a `no-pii` hit, and the error message for a nested must-cite list or a competing citation marker. The signed bytes therefore never contain the matched value, the location, or a schema library's issue text, and the manifest can only describe rewrites that happened. Receipts minted before `v1.4` still carry the raw matched substring and should be treated accordingly.

### Receipt Issuance Failures

When a configured signer fails, `ai.run` does not silently return an unsigned run. By default (`receipts.onSignerError: "flag"`) the result carries `receiptError: { kind: "signer-failed", message }` and a `step.transition` event with `receiptError` and `mintError` is emitted. With `"throw"`, `ai.run` emits `run.failed` and rejects with `ReceiptSigningError`. The receipt is minted before the session turn is appended, so a rejected run records nothing in a configured session store and a retry on the same session does not see it as prior context.

`runAgentCrew` applies the same setting to every receipt it mints after crew-start: each child agent's completion receipt, the root agent's completion receipt, and the crew-close receipt. Every failed mint emits a `step.transition` event with `mintError`. Under `"flag"` the crew returns its result with `CrewResult.receiptError`, whose message names every failed mint in mint order. A missing completion receipt leaves a chain that still verifies, because crew-close lists only the receipts that were minted, so check `receiptError` before treating `receipts` as the whole crew. A missing crew-close receipt makes the chain fail `verifyChain`, because the crew-start receipt declares closure. Under `"throw"` the crew rejects with `ReceiptSigningError` at the failed mint, and a failed child mint ends the crew before the root agent's next turn. A failure minting the crew-start receipt always rejects with `ReceiptSigningError`, since no agent has run. Per-iteration checkpoint receipts stay best-effort and are reported only on the tracer.

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
