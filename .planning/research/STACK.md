# Stack Research

**Domain:** Brownfield DSSE interoperability and execution-integrity bridge for Lattice v1.6
**Researched:** 2026-07-16
**Confidence:** HIGH for protocol, runtime, and test-stack recommendations; MEDIUM for the final provider-canary matrix because credentials and spend policy are deployment choices

## Executive Recommendation

Lattice already has the required production stack. Add no TypeScript or Python runtime dependencies for v1.6. Correct DSSE pre-auth encoding in the existing receipt implementation, make context selection authoritative at the adapter boundary, and centralize receipt policy, eval failure handling, and pricing in internal modules.

The only warranted new dependency is **`securesystemslib==1.4.0` as a Python test-only dependency**. It provides an implementation-independent DSSE envelope/PAE verifier for interoperability tests. Do not expose it through the Python client's runtime dependency set.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|---|---:|---|---|
| DSSE protocol | v1.0.2 | Receipt envelope signing and verification contract | The specification signs PAE over the decoded/raw serialized payload bytes. Envelope base64 is transport encoding, not signed text. |
| Existing Node WebCrypto + `@noble/ed25519` | Existing | TypeScript Ed25519 issuance/verification | Node 24 supports Ed25519 and Lattice already has the fallback/library surface it needs. |
| Existing `cryptography` + `rfc8785` | Existing | Python Ed25519 and canonical JSON | Both already implement the Python client's required primitives. No upgrade is needed for this milestone. |
| Existing Lattice runtime primitives | Existing | Context resolution, storage, sessions, receipts, and cost policy | The missing behavior is integration and authority, not a missing framework. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---|---:|---|---|
| `securesystemslib` | `1.4.0` exact, test-only | Independent DSSE PAE/signature oracle | Python interoperability and committed-vector tests only. |
| Vitest | Existing `4.1.5` | Unit, conformance, and opt-in provider canary tests | Keep all TypeScript tests on the repository's existing runner. |
| fast-check | Existing `4.7.0` | Context-selection, pricing, and replay invariants | Use for set equality/disjointness, budget monotonicity, and route/preflight cost parity. |
| AJV | Existing | Validate committed envelope/vector schemas | Reuse the conformance harness; do not add another schema validator. |

### Development Tools

| Tool | Purpose | Recommendation |
|---|---|---|
| Committed conformance vectors | Freeze standard and legacy receipt behavior | Include an upstream-derived DSSE vector, Lattice standard vectors, explicit legacy-bridge vectors, and negatives. Never regenerate goldens during normal tests. |
| GitHub Actions scheduled workflow | Real-provider canaries | Add a low-frequency `schedule` plus `workflow_dispatch` workflow. Do not run secret-backed canaries on pull requests. |
| Repository-owned comment scanner | Prevent planning/workflow comments in production code | Use the existing TypeScript compiler scanner for TS comment trivia and Python's stdlib `tokenize` for Python. Keep a narrow explicit allowlist. |

## Installation

No npm package should be added. Extend the existing Python test extra only:

```toml
[project.optional-dependencies]
test = [
  "pytest>=8",
  "securesystemslib==1.4.0",
]
```

An exact pin is appropriate because this package is an interoperability oracle: CI should not change protocol behavior because an indirect test dependency floated.

## Integration Points

### 1. Standards-Compliant DSSE Issuance

The current TypeScript and Python implementations build PAE from the base64 payload text. DSSE v1.0.2 requires:

```text
PAE(UTF8(payloadType), serializedPayloadBytes)
```

Change the shared semantic boundary accordingly:

- TypeScript `buildPae` should accept `Uint8Array`; Python should accept `bytes`.
- Measure byte lengths, including the UTF-8 byte length of `payloadType`.
- Canonicalize the receipt body once, sign those canonical bytes, then base64-encode the same bytes for the envelope.
- Emit standard base64. Verifiers must explicitly accept standard and URL-safe base64 as DSSE permits, while rejecting malformed encodings.
- Keep the Lattice receipt profile single-signature unless requirements explicitly expand it. A threshold-signature dependency is not needed.

Primary seams are `packages/lattice/src/receipts/envelope.ts`, `receipt.ts`, `verify.ts`, the Python `_core.py`, the protocol spec, and committed vectors.

### 2. Bounded Legacy Verification Bridge

Use a standards-first verifier with exactly one frozen compatibility path:

1. Decode the envelope payload and verify standard DSSE PAE over raw bytes.
2. Only after standard verification fails, and only when policy permits, retry the historical Lattice PAE over the canonical standard-base64 representation of those decoded bytes.
3. Surface the successful mode as structured data such as `dsse-v1.0.2` or `legacy-base64-pae`; do not hide it in logs or overload key state.
4. Never issue new legacy signatures. Strict audit/CLI modes reject legacy unless the caller explicitly enables the bridge.

Do not trust DSSE `keyid` as authentication; the DSSE spec defines it as an unauthenticated hint. Continue enforcing Lattice's signed body key identifier and keyset lifecycle policy separately. Do not select legacy mode solely from a receipt body version.

### 3. Independent DSSE Interoperability

Use `securesystemslib.dsse.Envelope` to parse a committed standard envelope, reproduce PAE, and verify its Ed25519 signature. This oracle should cover DSSE framing and cryptography only; Lattice-specific key-state and receipt-policy checks remain in Lattice tests.

The conformance set should prove both directions:

- A Lattice-issued standard envelope verifies with `securesystemslib`.
- An independently produced DSSE envelope verifies with TypeScript and Python Lattice clients.
- A historical envelope verifies only when the compatibility policy is enabled and reports legacy mode.
- Malformed base64, payload mutation, signature mutation, and key-ID substitution fail deterministically.

### 4. Execution-Authoritative Context and Storage

`ContextPack` currently records selection, but provider packaging still receives the full artifact set; summaries and session history are advisory metadata. Add one internal resolved-execution structure rather than a new context library:

- Resolve selected pack items to concrete `ArtifactInput` values before adapter packaging.
- Send exactly included artifacts plus materialized summary artifacts. Omitted and archived artifacts must be disjoint from the provider request.
- Rehydrate session-turn references through the configured `ArtifactStore`; treat unavailable required context as a typed failure or explicit degradation, never as a reason to send all input.
- Persist ingested, transformed, summary, and output artifacts through the configured store when storage is enabled.
- Make session summaries first-class stored artifacts and feed them back into later context resolution.
- Derive the execution plan and adapter request from the same resolved object so they cannot drift.

Reuse the current `ArtifactStore`, session store, context packer, summarizer, and adapter contracts. Extend their result shapes minimally where references alone cannot provide executable bytes.

### 5. Strict Receipt and Eval Modes

Add policy, not infrastructure:

- Normalize receipt issuance to an explicit `optional` or `required` mode. Preserve optional behavior by default; in required mode, fail before provider work when no signer exists and return a typed issuance failure when signing fails.
- Route normal runs, agent checkpoints, replay, and crew completion through the same issuance-policy helper.
- Add strict eval-input handling. Fixture load, materialization, verification, and replay-input failures must increment a distinct `loadFailed` count and cause a nonzero CLI exit in strict mode.
- Keep permissive diagnostic mode available, but never let a CI audit report success solely because `regressed === 0` while inputs failed to load.

The existing config normalization, result unions, eval session, and `citty` CLI flags are sufficient. Do not add a DI container or another CLI parser.

### 6. Unified Cost Estimation

Create one pure internal pricing kernel that:

- Normalizes the supported `ProviderPricingHint` shapes.
- Computes input, output, and total cost from token counts.
- Preserves the distinction between unavailable price, zero price, and estimated zero usage.
- Feeds router estimates, contract preflight, normalized provider usage, execution plans, and receipt data.

Property-test route/preflight equality and boundary behavior with the existing fast-check dependency. Keep JavaScript numbers for the existing policy API; adding decimal arithmetic would create a new public semantic without solving the present duplication.

### 7. Provider Canaries

Exercise Lattice adapters directly with no provider SDK additions:

- Run on `schedule` and `workflow_dispatch` with `permissions: contents: read` and SHA-pinned actions.
- Use dedicated low-spend API keys, minimum output budgets, per-test timeouts, and one canary per distinct wire family for which credentials are maintained.
- Fail a scheduled job when its required secret is absent; local suites may conditionally skip.
- Assert validated nonempty output, provider/model identity, normalized usage, receipt issuance/verification, and context omission behavior. Do not assert model prose.
- Retry at most once for transport errors, 429s, and 5xx responses; never retry schema, receipt, or semantic assertions.
- Record request IDs and aggregate usage, but do not log secrets or full sensitive envelopes.

### 8. Durable Comment Hygiene

Use the local comment-hygiene scanner for the one-time audit, then check in a deterministic repository script for CI. Scan comments rather than raw file text, and flag durable workflow leaks such as `GSD`, `.planning`, `PLAN.md`, `CONTEXT.md`, numbered phase/plan/wave references, and internal decision IDs.

Do not make CI depend on a developer-local skill path. Do not scan authored planning documents or legitimate protocol terminology, and require an explicit allowlist entry for unavoidable generated or external text.

## Alternatives Considered

| Alternative | Why Not Recommended |
|---|---|
| `@sigstore/core` | It has a correct DSSE helper, but the current release's Node engine floor does not cover every Node 24 version allowed by Lattice. Adding a JS package for one small framing primitive is unnecessary. |
| Full Sigstore client/bundle packages | Fulcio, Rekor, bundles, and transparency-log trust are outside Lattice's bare-key receipt bridge. |
| `cosign` or a Go DSSE job | Adds another toolchain and tests more than the required envelope interoperability. The Python oracle already provides independent coverage. |
| Provider-specific SDKs | Existing adapters intentionally use direct fetch and normalized contracts. SDKs would enlarge the dependency and error surface only for canaries. |
| Decimal libraries | Current costs are policy estimates, not a settlement ledger. One shared formula fixes the inconsistency. |
| New storage, memory, or agent frameworks | The existing stores, sessions, context packer, and host contracts contain the required seams. |
| ESLint comment-vocabulary plugin | Comment hygiene needs project-specific comment-token checks across TS and Python, not another lint runtime. |

## What NOT to Use

- Do not keep two issuance algorithms or expose a `mintLegacy` switch.
- Do not verify only the base64 spelling received on the wire; transport spelling is not the DSSE payload.
- Do not silently accept a legacy signature in strict verification.
- Do not let adapter code independently reselect artifacts after context resolution.
- Do not use provider-reported cost for policy preflight or local estimates for final billed usage; both should share pricing logic while retaining their provenance.
- Do not run paid secret-backed canaries on fork or pull-request events.
- Do not use a raw repository-wide regex as the comment-hygiene gate; it will flag strings, docs, fixtures, and protocol words.

## Stack Patterns by Variant

**Default application runtime:** Standard DSSE issuance; standards-first verification with the documented bridge policy; optional receipts; configured storage behavior; no canary dependencies.

**Strict audit/CI:** Required receipts; legacy verification disabled unless explicitly testing migration; strict eval inputs; committed independent vectors; nonzero exit on any unreadable evidence.

**Compatibility migration:** Standard issuance only; bounded legacy fallback enabled; successful legacy verification returned as structured mode and counted so deprecation can be measured.

**Provider canary workflow:** Dedicated test entry point and secrets; no participation in ordinary unit tests, package publication, or consumer installs.

## Version Compatibility

| Component | Compatibility Note |
|---|---|
| DSSE v1.0.2 | Use raw serialized payload bytes in PAE and accept standard or URL-safe envelope base64. |
| Node `>=24` | Existing WebCrypto/Ed25519 and byte primitives are sufficient; no Node floor change is required. |
| TypeScript `6.0.3` | Existing strict configuration is sufficient for typed policy/result additions. |
| Python `>=3.11` | Compatible with existing client dependencies and `securesystemslib 1.4.0`. |
| `securesystemslib==1.4.0` | Test-only exact pin; use its DSSE envelope API as an oracle, not as Lattice's production policy engine. |

## Sources

### Protocol and Cryptography

- [DSSE protocol v1.0.2](https://github.com/secure-systems-lab/dsse/blob/v1.0.2/protocol.md)
- [DSSE envelope format v1.0.2](https://github.com/secure-systems-lab/dsse/blob/v1.0.2/envelope.md)
- [DSSE reference signing implementation](https://github.com/secure-systems-lab/dsse/blob/v1.0.2/implementation/signing_spec.py)
- [securesystemslib DSSE implementation v1.4.0](https://github.com/secure-systems-lab/securesystemslib/blob/v1.4.0/securesystemslib/dsse.py)
- [securesystemslib package releases](https://pypi.org/project/securesystemslib/)
- [Node 24 WebCrypto](https://nodejs.org/docs/latest-v24.x/api/webcrypto.html)

### Testing and CI

- [Vitest Test API: conditional tests and retries](https://vitest.dev/api/test)
- [fast-check model-based testing](https://fast-check.dev/docs/advanced/model-based-testing/)
- [GitHub Actions scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule)
- [GitHub Actions secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
- [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use)

---

*Stack research for Lattice v1.6 Bridge*
