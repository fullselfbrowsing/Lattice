# Technology Stack — v1.1 Capability Receipts

**Project:** Lattice
**Research dimension:** Stack additions for Capability Contracts, signed Ed25519 receipts, `lattice` CLI (`repro`, `eval`), and CI regression gates
**Researched:** 2026-05-11
**Confidence:** HIGH

This document only enumerates stack changes for the v1.1 Capability Receipts milestone. The v1.0 baseline (pnpm 10.33 workspace, Node 24, TypeScript 6 strict + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`, ESM-only `lattice` package, `tsdown` build, `vitest` tests, `@standard-schema/spec`, Zod 4 catalog dependency, `mime`) is taken as given.

---

## Recommended Stack

### Core Additions

| Concern | Recommendation | Version (May 2026) | Rationale |
|---|---|---|---|
| Ed25519 signing/verification | **Node 24 WebCrypto** (`globalThis.crypto.subtle`) as the runtime path, with a tiny adapter so callers can inject an alternate signer | Built-in (Node `>=24.0.0`, Ed25519 marked stable since v23.5 / v22.13) | Zero new dependency, no audit surface added, ESM-native, isomorphic with browser SubtleCrypto, supports `generateKey`, `sign`, `verify`, `importKey`, `exportKey` in `raw`/`pkcs8`/`spki`/`jwk` formats. Matches Lattice's "one umbrella package with modular internals" constraint and the Node 24 floor already declared in `packages/lattice/package.json`. |
| Ed25519 fallback / structural test fixtures | **`@noble/ed25519`** as an *optional* devDependency for tests and as a documented escape hatch for environments without WebCrypto Ed25519 (older bundlers, edge runtimes that lag) | `3.1.0` (audited Mar–Apr 2026) | ESM-only, ~3.9 KB gzipped, zero runtime dependencies, audited (paulmillr noble suite). Used **only** in tests for cross-implementation signature parity vectors; not exported from the public package. |
| JSON canonicalization (signed payload bytes) | **`canonicalize`** (RFC 8785 / JCS) | `3.0.0` (released 2026-04-07) | Tiny (single file), TypeScript types included, zero deps, 100% RFC 8785 test-vector compliant. JCS is the right substrate because (a) Lattice already emits stable execution-plan JSON, replay envelopes, and metadata JSON — every adjacent artifact is JSON-shaped, (b) JCS is deterministic for any I-JSON value Lattice already produces, (c) it's debuggable in plain text (essential for `lattice repro` and CI diff failure output), (d) it composes naturally with `crypto.subtle.digest('SHA-256', ...)` which Lattice already uses for fingerprints. CBOR (RFC 8949 §4.2 deterministic encoding) would force a binary wire format and a new dependency without a real win for receipts that humans must read in CI logs. |
| CLI argument / subcommand parser | **`citty`** (unjs) | `0.2.2` (released 2026-04-01, ESM-only) | Declarative `defineCommand` API (`repro` and `eval` map cleanly to subcommands), lazy subcommand loading (keeps `lattice repro` cold-start cheap), `Resolvable<T>` for dynamic command trees, native `node:util.parseArgs` under the hood (no custom parser to audit), TypeScript-first with strict typed args, ~34 KB unpacked / 3 KB gzip, ESM-only — matches Lattice's `"type": "module"` and `sideEffects: false` constraints. Commander 13 was the runner-up but its option-coercion model (everything is a string unless you write a coercer) is awkward under `exactOptionalPropertyTypes` and it ships CJS dual builds that confuse the `attw --profile esm-only` lint already in `packages/lattice` scripts. |
| Invariant DSL | **Standard Schema-shaped invariants** with a thin declarative builder layer | Reuses existing `@standard-schema/spec@1.1.0` (already in catalog) | Standard Schema is already the contract for outputs (`packages/lattice/src/outputs/validate.ts`) and tools (`packages/lattice/src/tools/tools.ts`). Reusing the same shape for `inv.semantic(schema)` and `inv.policy(...)` keeps one validator interface across outputs, tools, and contracts — one `~standard.validate` entry point, one Zod-or-anything escape hatch, one TypeScript inference path. A small builder façade (`inv.mustCite()`, `inv.maxToxicity(x)`, `inv.matches(schema)`) compiles **down** to Standard Schema validators, so the DSL stays ergonomic without introducing a parallel validation engine. |
| Receipt envelope shape | **DSSE-inspired envelope** (`payloadType`, `payload`, `signatures[]`) with PAE-style pre-auth encoding | No new dependency; ~80 LOC implementation against WebCrypto + `canonicalize` | DSSE (in-toto / sigstore) is the industry-standard "boring" envelope for signed JSON attestations. Adopting its shape costs nothing, makes Lattice receipts inspectable by existing tooling, and gives a documented answer to "what does the signed payload bytes look like?" — namely `PAE("DSSEv1", "application/vnd.lattice.receipt+json", canonicalize(receipt))`. We **do not** add the `@sigstore/*` dependencies — they pull in Fulcio/Rekor/OCI machinery Lattice does not need. |
| CLI bin wiring | **`tsdown` shebang auto-bin** | Already `0.21.9` in catalog | tsdown automatically writes `package.json#bin` for any entry chunk that contains `#!/usr/bin/env node`. No new build tool. One new entry in `tsdown.config.ts` (`src/cli/index.ts`) and a `"bin": { "lattice": "./dist/cli.js" }` field that tsdown maintains. |
| CI regression assertions | **Reuse `vitest@4.1.5`** (already in catalog) with a thin `defineLatticeEval()` helper that wraps `expect()` and emits a structured JSON report | Already in catalog | `lattice eval` should not become a new test runner. Instead it loads receipts + fixtures, drives `ai.run` in replay or live mode, and asserts cost-per-task / quality-floor / invariant gates. Surfacing this via vitest means CI integrations (GitHub Actions matrix, JUnit reporters, Vitest's built-in `--reporter=junit`) work for free. For non-vitest consumers, `lattice eval` exits non-zero with a stable JSON report on stdout — that is the contract. |

### Supporting Libraries (already in workspace, listed for completeness)

| Library | Role in v1.1 |
|---|---|
| `@standard-schema/spec@1.1.0` (catalog) | Backing validators for invariants |
| `zod@4.3.6` (catalog, dev) | Authoring path for invariant schemas in tests and docs; not required at runtime |
| `mime@4.1.0` (catalog) | Unchanged; receipts reuse existing artifact mime annotations |
| `vitest@4.1.5` (catalog) | Backbone of `lattice eval`'s assertion + reporter surface |
| `tsdown@0.21.9` (catalog) | Builds new `bin/lattice` entry chunk; auto-injects bin field |
| `publint@0.3.18` + `@arethetypeswrong/cli@0.18.2` | Existing lint pipeline must continue to pass after the `bin` entry is added |

### Development Tools

| Tool | Purpose | Notes |
|---|---|---|
| `node --test` snapshot of WebCrypto Ed25519 keypair | Generate fixed test keys for receipt unit tests | Avoid embedding a real production private key; generate per-test or load from `fixtures/keys/*.jwk` |
| `vitest --typecheck` (already wired) | Enforce strict typing on the new `Contract`, `Receipt`, `Invariant` types | Existing `test:types` script extends to new modules |
| `attw --pack . --profile esm-only` (already wired) | Verify the new `bin` and any new subpath exports remain ESM-only and properly typed | Already in `lint:packages` |

---

## Installation

No new runtime dependencies are added to `packages/lattice/package.json`. The only catalog/devDependency change required:

```bash
# Workspace root: extend the pnpm catalog
# pnpm-workspace.yaml additions
#   "@noble/ed25519": 3.1.0          # devDependency for cross-impl parity tests only
#   citty: 0.2.2                     # runtime dep of lattice package (CLI)
#   canonicalize: 3.0.0              # runtime dep of lattice package (receipts)

pnpm -F lattice add citty@catalog: canonicalize@catalog:
pnpm -F lattice add -D @noble/ed25519@catalog:
```

Resulting `packages/lattice/package.json` deltas:

```jsonc
{
  "dependencies": {
    "@standard-schema/spec": "catalog:",
    "canonicalize": "catalog:",
    "citty": "catalog:",
    "mime": "catalog:"
  },
  "devDependencies": {
    "@noble/ed25519": "catalog:",
    "@types/node": "catalog:",
    "zod": "catalog:"
  },
  "bin": {
    "lattice": "./dist/cli.js"
  },
  "exports": {
    ".":          { "types": "./dist/index.d.ts",    "import": "./dist/index.js" },
    "./receipts": { "types": "./dist/receipts.d.ts", "import": "./dist/receipts.js" },
    "./cli":      { "types": "./dist/cli.d.ts",      "import": "./dist/cli.js" }
  }
}
```

The `./receipts` subpath export is recommended so consumers can verify receipts without dragging in the CLI's `citty` graph, preserving tree-shakability for downstream apps that only need verification (e.g., a webhook endpoint that validates inbound receipts).

---

## Alternatives Considered

| Recommended | Alternative | Why Not (for v1.1) |
|---|---|---|
| Node 24 WebCrypto Ed25519 | `@noble/ed25519@3.1.0` as the primary signer | Adds a dependency where Node 24 already ships a stable, standardized, free implementation. Pulling in `@noble/ed25519` for runtime would also force a `noble-hashes` peer for the sync path, growing the dependency closure for zero functional gain. We still ship it as a dev-only parity oracle. |
| Node 24 WebCrypto Ed25519 | `@noble/curves@2.x` (omnibus EC bundle) | Larger attack surface and ~10× the code of `@noble/ed25519` without needing any of the extra primitives (ristretto255, x25519, ed25519ph, hash-to-curve). The noble project itself recommends `@noble/ed25519` when only basic Ed25519 is required. |
| `canonicalize@3.0.0` | `@truestamp/canonify` | Comparable RFC 8785 conformance and passes the same test vectors, but `canonicalize` has the longer track record (Erdtman, the JCS RFC's reference author, maintains it), smaller surface, and is already the de-facto JCS package in the JS ecosystem. |
| `canonicalize@3.0.0` | `json-canonicalize` | Solid alternative; we pick `canonicalize` for provenance (RFC author) and zero-dep posture. Either would work; the choice is reversible. |
| `canonicalize@3.0.0` (JCS / JSON) | CBOR deterministic encoding (RFC 8949 §4.2, e.g., `cbor-x`) | Binary, opaque in CI logs, harder to diff in failure output, forces consumers to add a CBOR decoder to verify receipts, and provides no measurable size win at receipt scales (a typical Lattice receipt is a few KB of JSON metadata, dominated by hashes and string IDs that CBOR cannot compress further than gzip already does). The use case for deterministic CBOR is constrained-device telemetry, not developer-facing audit artifacts. |
| `citty@0.2.2` | `commander@13.x` | Commander is mature but ships dual CJS/ESM, has weaker TS inference under `exactOptionalPropertyTypes`, and lacks declarative subcommand lazy loading. Its option coercion (every option arrives as `string \| undefined` unless you write a custom parser) fights `noUncheckedIndexedAccess`. |
| `citty@0.2.2` | `cac` | Lighter than commander but smaller community, fewer recent releases, and no native lazy-subcommand story. Citty's unjs maintenance cadence and ESM-only stance fit better. |
| `citty@0.2.2` | `oclif` / `stricli` | Both are framework-grade — plugin systems, command discovery, scaffolding. Vast overkill for two subcommands and would dwarf the `lattice` package on install size. |
| `citty@0.2.2` | Hand-rolled `node:util.parseArgs` | Tempting (zero deps, native), and we will **use it underneath** because citty already wraps it. Writing a subcommand router by hand for `repro` and `eval` plus help generation plus arg type coercion is ~150 LOC of code we don't want to own. Citty is ~3 KB gzip — cheaper than the bug surface of a custom parser. |
| Standard Schema-shaped invariants | A bespoke fluent DSL (e.g., `inv.mustCite().withSeverity('hard')`) backed by its own evaluator | Forking validation logic from Standard Schema would create two parallel validation engines inside Lattice and break the "outputs, tools, and contracts all speak the same validator" property. The Standard Schema-shaped approach **wraps** a fluent builder over Standard Schema, getting the best of both: builder ergonomics at authoring time, one validator surface at runtime. |
| DSSE-shaped envelope | JWS (RFC 7515) / JWT | JWS is fine for JOSE shops but ties payload encoding to base64url and brings JWA/JWK ambiguity. DSSE was explicitly designed to replace JWS for software-supply-chain attestations and has cleaner semantics for "sign this canonical JSON payload of media type X." No JOSE library needed. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|---|---|---|
| Heavy crypto frameworks (`node-forge`, `jose`, full PKI stacks) | Lattice only needs Ed25519 sign/verify + SHA-256. Pulling in JOSE-style frameworks adds RSA, ECDSA P-256/384/521, AES-KW, PBKDF2 surface area and audit weight that v1.1 does not require. | Node 24 WebCrypto (`crypto.subtle`) directly. |
| `sodium-native` / `libsodium-wrappers` | Native bindings, install-time toolchain dependency, mismatched browser story, and overlaps WebCrypto entirely. | Node 24 WebCrypto. |
| `commander` v12 or earlier | CJS/ESM dual builds, weaker TS types, no lazy subcommands. | `citty@0.2.2`. |
| `yargs` | Heavy (~200 KB), CJS-leaning, parser-heavy, more configurability than two subcommands need. | `citty@0.2.2`. |
| `oclif` | Plugin/scaffolding framework — wrong tier for `lattice repro` + `lattice eval`. | `citty@0.2.2`. |
| `cbor-x` / any CBOR codec for receipts | Opaque payloads defeat the "every Lattice run must be inspectable" constraint from `PROJECT.md`. | `canonicalize` JSON (RFC 8785). |
| `protobufjs` for receipts | Adds schema-compilation toolchain, hides field meanings in numeric tags, no humans-can-read property. | Same — stay JSON. |
| Re-exporting `@noble/ed25519` from the public package | Users would inherit a runtime dep we don't need; also forks the signature implementation between Node and browser. | Keep `@noble/ed25519` as devDep only. Receipts produced and verified via WebCrypto end-to-end. |
| A second validation engine for invariants | Forks contracts from outputs/tools and doubles the maintenance surface. | Standard Schema-shaped invariants, with Zod 4 as the convenient authoring path. |
| `@sigstore/sign`, `@sigstore/verify`, `cosign` integration | v1.1 needs **local** signed receipts, not a public transparency log. Sigstore brings Fulcio/Rekor/OCI dependencies and a network trust model that is out of scope. | DSSE-shaped envelope with locally-managed Ed25519 keys; sigstore integration can be a v1.2 add-on without changing the envelope. |
| Custom canonicalization (sorting keys ourselves) | Easy to get subtly wrong (Unicode code-point ordering, number serialization edge cases per ECMAScript spec) — and any bug invalidates every signed receipt. | `canonicalize@3.0.0` with RFC 8785 conformance. |

---

## Stack Patterns by Variant

**If a downstream consumer needs to verify receipts in a browser / edge runtime:**
- Import only `lattice/receipts` (verify-only entry).
- Use the same WebCrypto path — every modern browser and most edge runtimes (Cloudflare Workers, Deno Deploy, Vercel Edge) now ship WebCrypto Ed25519.
- Because `lattice/receipts` carries only `canonicalize` as a real runtime dep, the verifier closure is single-digit KB.

**If a Lattice deployment is locked to Node <23.5 (no stable WebCrypto Ed25519):**
- Out of scope for v1.1 (package.json sets `engines.node >=24`), but the WebCrypto-shaped adapter makes it trivial to wire `@noble/ed25519` as the implementation — one factory function swap, no contract change.

**If a Lattice user wants to author invariants without Zod:**
- They pass any Standard Schema-compatible validator (Valibot, ArkType, or a hand-written `~standard.validate`). The `inv.matches(schema)` builder accepts the spec, not the library.

**If a CI job already runs vitest:**
- `lattice eval --reporter=vitest` returns vitest-compatible JSON; CI can route it to existing PR comment bots.

**If a CI job does not run vitest:**
- `lattice eval --reporter=json` emits a stable JSON shape `{ runs, regressions, costDelta, qualityDelta, exitCode }`. Non-zero exit on regression.

---

## Version Compatibility

| Package | Compatible With | Notes |
|---|---|---|
| `citty@0.2.2` | Node `>=18.10` (uses `node:util.parseArgs`). Node 24 is fully supported. | ESM-only — matches our `"type": "module"`. |
| `canonicalize@3.0.0` | Any modern JS runtime; no Node version floor required by the package itself. | Pairs cleanly with `crypto.subtle.digest('SHA-256', ...)`. |
| `@noble/ed25519@3.1.0` | Node `>=20.19`, all modern browsers. | DevDep only in our use; the Node 24 floor in our package is comfortably above the package's floor. |
| Node 24 WebCrypto Ed25519 | Stable since v23.5 / v22.13; available in all v24.x. | Algorithm name is the literal string `"Ed25519"`; `subtle.sign`, `subtle.verify`, `subtle.generateKey`, `subtle.importKey`, `subtle.exportKey` all supported. |
| `tsdown@0.21.9` (catalog) | Auto-detects `#!/usr/bin/env node` shebang and writes `bin` field. | No new tooling needed for the CLI build. |
| `vitest@4.1.5` (catalog) | Vitest 4 ships built-in visual-regression hooks and stable snapshot semantics in CI (`process.env.CI` → snapshots fail rather than write). | We rely only on the long-stable `expect()`, `describe()`, snapshot, and JSON reporter surfaces — nothing v4-specific is required, so a future downgrade is safe. |

---

## Build & Wiring Notes

### CLI entry

```ts
// packages/lattice/src/cli/index.ts
#!/usr/bin/env node
import { defineCommand, runMain } from "citty";

const main = defineCommand({
  meta: { name: "lattice", version: LATTICE_VERSION, description: "Lattice CLI" },
  subCommands: {
    repro: () => import("./repro.js").then((m) => m.default),
    eval:  () => import("./eval.js").then((m) => m.default),
  },
});

runMain(main);
```

- The shebang triggers tsdown's auto-`bin` field on build.
- `subCommands` use citty's `Resolvable<T>` dynamic import to keep `lattice repro` from loading the eval runner (and vice versa) — relevant because `lattice eval` will transitively load vitest.

### Receipt envelope

```ts
// packages/lattice/src/receipts/envelope.ts
import canonicalize from "canonicalize";

const PAE = (type: string, body: string): Uint8Array => {
  const enc = new TextEncoder();
  const parts = ["DSSEv1", `${type.length}`, type, `${body.length}`, body];
  return enc.encode(parts.join(" "));
};

export const signReceipt = async (
  receipt: ReceiptPayload,
  privateKey: CryptoKey,
): Promise<DsseEnvelope> => {
  const payload = canonicalize(receipt);           // RFC 8785
  if (payload === undefined) throw new Error("...");
  const sig = await crypto.subtle.sign(
    "Ed25519",
    privateKey,
    PAE("application/vnd.lattice.receipt+json", payload),
  );
  return {
    payloadType: "application/vnd.lattice.receipt+json",
    payload: btoa(payload),
    signatures: [{ keyid, sig: bufToB64(sig) }],
  };
};
```

- All bytes are derived deterministically: same receipt → same canonical payload → same signed bytes.
- Verification reverses the steps using `crypto.subtle.verify("Ed25519", ...)`.
- No `Buffer` usage — `TextEncoder` + `btoa` keep the path isomorphic between Node 24 and browsers.

### Invariant DSL

```ts
// packages/lattice/src/contracts/invariants.ts
import type { StandardSchemaV1 } from "@standard-schema/spec";

export interface Invariant<T = unknown> {
  readonly kind: "semantic" | "policy" | "schema";
  readonly id: string;
  readonly severity: "hard" | "soft";
  readonly check: (value: T) => InvariantResult | Promise<InvariantResult>;
}

export const inv = {
  matches: <T>(schema: StandardSchemaV1<unknown, T>, opts?: InvOpts) =>
    schemaInvariant(schema, opts),
  mustCite: (opts?: InvOpts) => semanticInvariant(/* ...precanned ... */),
  maxToxicity: (threshold: number, opts?: InvOpts) => policyInvariant(/* ... */),
};
```

- The fluent surface (`inv.mustCite()`) compiles down to `Invariant`s whose `check` ultimately delegates to a Standard Schema `~standard.validate`.
- Tripwire mid-stream evaluation calls `check(partial)` on streamed chunks; a `hard` failure aborts the run via the existing typed run-event mechanism.

---

## Sources

- [Node.js v24 WebCrypto API documentation — Ed25519 marked stable since v23.5 / v22.13, full sign/verify/import/export/generateKey support](https://nodejs.org/docs/latest-v24.x/api/webcrypto.html) — HIGH confidence (official Node docs).
- [paulmillr/noble-ed25519 — README and 3.1.0 release notes (Apr 2026), self-audit Mar 2026](https://github.com/paulmillr/noble-ed25519) — HIGH confidence.
- [@noble/ed25519 on npm](https://www.npmjs.com/package/@noble/ed25519) — HIGH confidence (release metadata).
- [paulmillr/noble-curves — recommends @noble/ed25519 when only Ed25519 is needed](https://github.com/paulmillr/noble-curves) — HIGH confidence.
- [RFC 8785 — JSON Canonicalization Scheme (JCS)](https://www.rfc-editor.org/rfc/rfc8785) — HIGH confidence (IETF standard).
- [erdtman/canonicalize — RFC 8785 reference implementation, v3.0.0 released 2026-04-07, TypeScript types included, zero deps](https://github.com/erdtman/canonicalize) — HIGH confidence.
- [unjs/citty — v0.2.2 (2026-04-01), ESM-only, native node:util.parseArgs, declarative subcommands](https://github.com/unjs/citty/releases) — HIGH confidence.
- [citty on npm](https://www.npmjs.com/package/citty) — HIGH confidence (release metadata).
- [tsdown — auto-generates `bin` field for entry chunks containing a shebang](https://tsdown.dev/reference/cli) — HIGH confidence (official docs); confirmed against tsdown 0.21.x release notes.
- [in-toto/attestation — DSSE envelope spec v1](https://github.com/in-toto/attestation/blob/main/spec/v1/envelope.md) — HIGH confidence.
- [secure-systems-lab/dsse — Dead Simple Signing Envelope v1.0.0 protocol, PAE definition](https://github.com/secure-systems-lab/dsse/blob/v1.0.0/protocol.md) — HIGH confidence.
- [Vitest 4 — snapshots fail (do not write) under `process.env.CI`, structured JSON reporter](https://vitest.dev/guide/snapshot) — HIGH confidence (official docs).
- Local: `packages/lattice/src/outputs/validate.ts`, `packages/lattice/src/tools/tools.ts` — confirms `@standard-schema/spec` is the existing validator contract that invariants should reuse.
- Local: `pnpm-workspace.yaml` — confirms catalog versions used as the integration baseline.

---
*Stack research for: Lattice v1.1 Capability Receipts (signed receipts, contracts, CLI, CI gate)*
*Researched: 2026-05-11*
