# Phase 52: TypeScript Self-Verification Harness - Research

**Researched:** 2026-07-01
**Domain:** vitest fixture-driven conformance testing; Node.js SHA-256 manifest verification; Ed25519/DSSE/JCS re-derivation against an in-workspace reference implementation
**Confidence:** HIGH

## Summary

This phase adds one new private pnpm workspace package, `conformance/verify-ts/`, that
structurally mirrors the already-proven `conformance/generate/` package from Phase 51. There is
no new technology to evaluate and no new npm dependency to vet: `vitest@4.1.5`, `typescript@6.0.3`,
and `@types/node@24.12.2` are already catalog-pinned and in active use elsewhere in this exact
repo, and the workspace-relative-source-import pattern (`conformance/generate/src/*.ts` importing
`packages/lattice/src/receipts/*.ts` via relative `.js`-suffixed specifiers under
`moduleResolution: "Bundler"`) is not a hypothesis — it is **verified working today**:
`conformance/generate` typechecks with zero errors and its 28-test vitest suite passes
(confirmed by running both commands directly during this research session).

The harness's job is mechanical: for each of the 12 committed vectors
(`conformance/vectors/positive/*.json` × 3, `conformance/vectors/negative/*.json` × 9), load the
JSON off disk, reconstruct the pipeline inputs, call the same four reference-implementation
functions the Phase 51 generator called (`canonicalizeReceiptBody`, `buildPae`,
`verifyEd25519Signature` via `verifyReceipt`), and assert the re-derived bytes/hex/verdict match
the committed fields exactly. Because `verifyReceipt` is the single normative decision-tree
function and it is a **pure async function returning a typed `VerifyResult`** (never throws
across its boundary), there is no exception-handling complexity to design around — the harness
calls it and pattern-matches on `result.ok`.

The one piece of genuine design work is the **manifest self-check** (Node.js `crypto.createHash`
must independently re-derive the same SHA-256 hex the generator wrote) and **`describe.each`
structuring for clear per-vector failure attribution** — both are addressed below with verified
patterns already used elsewhere in this codebase (`writeManifest()`'s self-verify loop in
`conformance/generate/src/manifest.ts`, and `describe.each`/`it.each` already used in
`packages/lattice/src/agent/format-tools.test.ts` and `packages/lattice/test/prompt-scaffolds.test.ts`).

**Primary recommendation:** Mirror `conformance/generate/` file-for-file (package.json shape,
tsconfig.json, vitest.config.ts), split test files by concern
(`manifest.test.ts` / `positive.test.ts` / `negative.test.ts`) per the locked decision, use
`describe.each(vectors)` with named per-vector blocks and sequential `it()` steps inside each,
and reuse `createMemoryKeySet` from `packages/lattice/src/receipts/keyset.ts` to build the
verifier's `KeySet` per test.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Package Structure & Naming**
- Package name: `@lattice-conformance/verify-ts` — matches sibling `@lattice-conformance/generate` naming convention.
- Test file layout: split by concern — `positive.test.ts`, `negative.test.ts`, `manifest.test.ts` — mirroring `conformance/generate`'s `positive.ts`/`negative.ts`/`manifest.ts` module split.
- Reference implementation is imported directly from `packages/lattice/src/receipts/*.ts` source (same relative-import pattern `conformance/generate` already established), not from the built/public package entrypoint — avoids requiring a build step before running the harness.

**Assertion Granularity & Failure Reporting**
- Test structure: `describe.each(vectors)` with sequential step assertions per vector, for clear per-vector failure attribution.
- Negative-vector assertions check exact match on the vector's `expectedResult` `VerifyErrorKind` (strict), not merely that verification fails.
- Full step-by-step canonical-bytes/PAE/signature re-derivation applies only to positive vectors. Negative vectors assert final verdict/error-kind only — many negative constructions intentionally break one specific step, so step-by-step re-derivation is not meaningful for them.
- The harness self-checks `conformance/vectors/MANIFEST.sha256` as its first test, before running any vector assertions — defense-in-depth so a tampered vector file fails immediately rather than relying solely on Phase 56's CI wiring.

**Workspace & CI Integration**
- `conformance/verify-ts` takes a `workspace:*` devDependency on `@lattice-conformance/generate` to import its `ConformanceVector` type directly — single source of truth for the vector shape, both packages are private/unpublished so no tarball-boundary concern.
- No new root-level convenience script this phase — `pnpm -r test` already picks up the new package automatically, same as `conformance/generate` today.
- Plan must include an explicit verification step that re-runs `pnpm check:tarball` and `pnpm check:core-boundary` and records the pass as evidence, since "remain green with no modification" is an explicit success criterion, not an assumption.

### Claude's Discretion
- Exact vector-loading mechanics (glob vs explicit manifest-driven file list), internal helper structure, and vitest config details are at the planner/executor's discretion within the constraints above.

### Deferred Ideas (OUT OF SCOPE)
- The aggregate CI `conformance` job (manifest check → TS harness → Python harness → cross-mint parity) is wired in Phase 56; Phase 52 only produces the harness itself, runnable via `pnpm --filter @lattice-conformance/verify-ts test`.
- None introduced as scope creep this session — discussion stayed within TSCONF-01..02.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TSCONF-01 | A TypeScript (vitest) conformance harness re-derives canonical bytes, PAE, signature, and verdict for every committed vector and asserts byte-identity at each pipeline step. | See `## Architecture Patterns` (Pattern 1: describe.each fixture loading, Pattern 2: 4-step positive re-derivation, Pattern 3: verdict-only negative assertion) and `## Code Examples` for the exact function calls (`canonicalizeReceiptBody`, `buildPae`, `verifyEd25519Signature`, `verifyReceipt`) and their verified signatures. |
| TSCONF-02 | The vector generator and TS harness live as private, unpublished pnpm workspace packages under `conformance/`, leaving the npm tarball-leak and core-package-boundary checks green with no modification. | See `## Environment Availability` and `## Common Pitfalls` (Pitfall 3) — confirmed via direct execution that `check-tarball-leak.mjs` iterates a hardcoded `PACKAGES` array (`packages/lattice`, `packages/lattice-cli` only) and `check-core-package-boundary.mjs` only scans `packages/lattice`; neither scans `conformance/`. Both scripts run green today (verified live in this session) and require zero modification to stay green after adding `conformance/verify-ts/`. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Vector loading (disk → in-memory objects) | Test harness (Node.js/vitest process) | — | Pure file I/O; no runtime/browser/API tier involved. This is a build-time/test-time-only package. |
| Manifest integrity self-check | Test harness (Node.js `crypto` module) | — | `createHash("sha256")` computation is local, synchronous, no network or external service. |
| Canonical bytes / PAE / signature re-derivation | Reference implementation (`packages/lattice/src/receipts/*.ts`), invoked from the test harness | — | The harness does not reimplement crypto or canonicalization logic — it calls the SAME functions the runtime/CLI packages call. There is no "harness-owned" crypto; TSCONF-01 explicitly requires re-deriving via the reference impl, not a parallel implementation. |
| Verdict computation (`verifyReceipt`) | Reference implementation (`packages/lattice/src/receipts/verify.ts`) | — | Pure function; the harness supplies a `ReceiptEnvelope` + `KeySet` and asserts on the returned `VerifyResult`. No harness-side decision logic duplicates the 10-step tree. |
| KeySet construction for tests | Test harness, using `createMemoryKeySet` from `packages/lattice/src/receipts/keyset.ts` | — | Reuses the exact in-memory KeySet factory the reference implementation's own test suite (`verify.test.ts`) uses — not a harness-specific reimplementation. |
| CI gate wiring (aggregate `conformance` job) | Out of scope for Phase 52 | Phase 56 | Explicitly deferred per CONTEXT.md; Phase 52 only produces `pnpm --filter @lattice-conformance/verify-ts test` as a standalone invocable command. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vitest | 4.1.5 `[VERIFIED: catalog: pin in pnpm-workspace.yaml, confirmed via npm view vitest@4.1.5]` | Test runner: `describe`, `it`, `describe.each`, `expect` | Already the workspace-standard test runner; `catalog:` pin ensures version parity with `conformance/generate` and all `packages/*`. |
| typescript | 6.0.3 `[VERIFIED: catalog: pin, npm view typescript@6.0.3]` | `tsc --noEmit` typecheck-only compilation | Already the workspace-standard; `conformance/generate/tsconfig.json` proves the exact `extends`/`moduleResolution`/`rootDir` shape this new package needs. |
| @types/node | 24.12.2 `[VERIFIED: catalog: pin]` | Node.js type definitions (`node:crypto`, `node:fs`, `node:path`) | Required for `crypto.createHash`, `fs.readFileSync`/`readdirSync`, and `path.join` type-safety in the manifest self-check and vector loader. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @lattice-conformance/generate | `workspace:*` `[VERIFIED: package.json name confirmed at conformance/generate/package.json:2]` | Import `ConformanceVector`, `ReceiptEnvelope`, `VERIFY_ERROR_KINDS` types from `src/types.ts` | Locked decision — single source of truth for the vector shape. Both packages private/unpublished; `workspace:*` is the correct protocol for an in-monorepo devDependency that is never published. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Node.js built-in `node:crypto` for manifest self-check | A third-party checksum library | None needed — `createHash("sha256")` is exactly what `conformance/generate/src/manifest.ts` already uses to WRITE the manifest; using the same built-in to VERIFY it is the only choice that guarantees byte-for-byte parity with zero extra dependency surface. |
| Importing reference impl from `packages/lattice/src/receipts/*.ts` (source) | Importing from the built `packages/lattice/dist/*` or the published `@full-self-browsing/lattice` entrypoint | Locked decision explicitly rejects this — importing dist/published would require a build step before `pnpm --filter @lattice-conformance/verify-ts test` could run, breaking the "no build step" property `conformance/generate` already established. |
| `describe.each(vectors)` | Manually writing one `describe()` block per vector file | `describe.each` is already an established pattern in this exact codebase (`format-tools.test.ts`, `prompt-scaffolds.test.ts`) and satisfies the locked "clear per-vector failure attribution" requirement — each expansion gets its own named describe block in vitest's reporter output. |

**Installation:**
No new npm install is required. `vitest`, `typescript`, `@types/node` are already installed at the
workspace root via `pnpm-workspace.yaml` `catalog:` and already present in
`conformance/generate/node_modules/`. The only new "install" step is:
```bash
# package.json devDependencies entry (workspace protocol, no registry fetch):
"@lattice-conformance/generate": "workspace:*"
```
Running `pnpm install` at the repo root after creating `conformance/verify-ts/package.json`
will symlink this correctly, exactly as it already does for the existing single workspace package.

**Version verification:** Verified live during this research session:
```bash
npm view vitest@4.1.5 version        # → 4.1.5 (exists, matches catalog pin)
npm view canonicalize@3.0.0 version  # → 3.0.0 (exists, matches catalog pin; transitively used by
                                      #   the reference implementation's canonical.ts, not a new
                                      #   direct dependency of verify-ts)
```
No package versions in this phase were sourced from training-data guesswork — every version
listed above was read directly from `pnpm-workspace.yaml`'s `catalog:` block or
`conformance/generate/package.json`, both already-committed files in this repo.

## Package Legitimacy Audit

This phase introduces **zero new external npm packages**. The only new dependency edge is
`@lattice-conformance/generate: "workspace:*"`, a private/unpublished sibling package inside this
same monorepo — not an npm registry package, so the slopcheck/registry-verification protocol does
not apply to it (there is nothing to look up on a registry; the "package" is a local workspace
symlink resolved by pnpm from `pnpm-workspace.yaml`).

All other tooling (`vitest`, `typescript`, `@types/node`) is already installed, already
catalog-pinned, and already verified legitimate by Phase 51's own Package Legitimacy Audit (these
are the exact same dependencies `conformance/generate/package.json` declares).

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| @lattice-conformance/generate | N/A (local workspace, `workspace:*`) | N/A | N/A | this repo, `conformance/generate/` | N/A — not a registry package | Approved (internal workspace reference, not an install) |
| vitest | npm | pre-existing, catalog-pinned | high (already vetted Phase 51) | github.com/vitest-dev/vitest | Not re-run — no new package | Approved (carried over from Phase 51 audit) |
| typescript | npm | pre-existing, catalog-pinned | high (already vetted Phase 51) | github.com/microsoft/TypeScript | Not re-run — no new package | Approved (carried over from Phase 51 audit) |

**Packages removed due to slopcheck [SLOP] verdict:** none — no new registry packages introduced.
**Packages flagged as suspicious [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│  conformance/verify-ts/  (new, this phase)                              │
│                                                                           │
│  ┌──────────────┐   loads JSON    ┌─────────────────────────────────┐  │
│  │ vitest runner │ ─────────────► │ conformance/vectors/             │  │
│  │ (test files)  │                │   positive/*.json (3 files)      │  │
│  └──────┬───────┘                │   negative/*.json (9 files)      │  │
│         │                         │   MANIFEST.sha256                │  │
│         │ Step 0: manifest.test.ts│                                   │  │
│         │  - read MANIFEST.sha256 └─────────────────────────────────┘  │
│         │  - createHash("sha256") over each listed file                │
│         │  - compare hex; FAIL FAST if any mismatch                    │
│         ▼                                                                │
│  ┌──────────────────────┐   describe.each(vectors)                      │
│  │ positive.test.ts     │───────────────┐                               │
│  │ (3 positive vectors) │               │                               │
│  └───────────────────────┘              ▼                               │
│                              ┌─────────────────────────────┐            │
│                              │ per-vector describe block:   │            │
│                              │  it("canonicalizes")  ───┐   │            │
│                              │  it("encodes PAE")     ──┼──►│  calls reference
│                              │  it("signature valid") ──┤   │  implementation
│                              │  it("verdict === ok")  ──┘   │  functions ▼
│                              └─────────────────────────────┘            │
│  ┌──────────────────────┐   describe.each(vectors)                      │
│  │ negative.test.ts     │───────────────┐                               │
│  │ (9 negative vectors) │               │                               │
│  └───────────────────────┘              ▼                               │
│                              ┌─────────────────────────────┐            │
│                              │ per-vector describe block:   │            │
│                              │  it("verdict === expected    │            │
│                              │      VerifyErrorKind")  ─────┼──►(same)  │
│                              └─────────────────────────────┘            │
└─────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │ imports via relative .js path,
                                        │ moduleResolution: "Bundler",
                                        │ rootDir: "../.."  (SAME pattern
                                        │ conformance/generate already uses)
                                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  packages/lattice/src/receipts/   (existing, NORMATIVE, untouched)      │
│                                                                           │
│  canonical.ts  → canonicalizeReceiptBody(body): Uint8Array               │
│  envelope.ts   → buildPae(type, base64): Uint8Array                      │
│                → base64Encode/base64Decode, encodeEnvelope/decodeEnvelope │
│  sign.ts       → verifyEd25519Signature(jwk, msg, sig): Promise<boolean> │
│  keyset.ts     → createMemoryKeySet(entries): KeySet                     │
│  verify.ts     → verifyReceipt(envelope, keySet): Promise<VerifyResult>  │
│                   (10-step decision tree, first-match-wins,              │
│                    NEVER throws across this boundary)                    │
└─────────────────────────────────────────────────────────────────────────┘
```

Trace the primary use case (a positive vector): vitest loads `vec-00-v1.3.json` from disk →
`positive.test.ts`'s `describe.each` block re-derives canonical bytes via
`canonicalizeReceiptBody(vector.body)` and asserts hex-equality against `vector.canonicalBytesHex`
→ re-derives PAE via `buildPae(PAYLOAD_TYPE, vector.payloadBase64)` and asserts hex-equality
against `vector.paeHex` → verifies the committed `signatureHex` via
`verifyEd25519Signature(vector.publicKeyJwk, paeBytes, sigBytes)` and asserts `true` → builds an
envelope + `KeySet` and calls `verifyReceipt(...)`, asserting `result.ok === true`. Negative
vectors skip the first three steps and go straight to `verifyReceipt`, asserting
`result.error.kind === vector.expectedResult`.

### Recommended Project Structure
```
conformance/verify-ts/
├── package.json          # @lattice-conformance/verify-ts, private, workspace:* devDep on generate
├── tsconfig.json          # extends ../../tsconfig.base.json, rootDir: "../..", same include pattern
├── vitest.config.ts        # identical shape to conformance/generate's (environment: "node")
└── src/
    ├── manifest.test.ts   # Step 0: self-checks MANIFEST.sha256 — runs FIRST (see Pitfall 1)
    ├── positive.test.ts   # describe.each over 3 positive vectors, 4-step re-derivation
    ├── negative.test.ts   # describe.each over 9 negative vectors, verdict-only assertion
    └── load-vectors.ts    # (optional helper) shared disk-loading logic used by both test files
```

### Pattern 1: Manifest self-check as the FIRST test (fail fast, defense-in-depth)

**What:** Before any vector is loaded for pipeline re-derivation, independently recompute the
SHA-256 of every file listed in `conformance/vectors/MANIFEST.sha256` and assert it matches. This
is the locked decision's "defense-in-depth so a tampered vector file fails immediately."

**When to use:** As `manifest.test.ts`, vitest's default file-execution order will run it
alongside `positive.test.ts`/`negative.test.ts` (vitest does not guarantee cross-file ordering by
default, but within a single describe/it structure, ordering is deterministic). Because the
locked decision only requires it to run "as its first test" — not necessarily block subsequent
files — the safest implementation makes the manifest check a standalone assertion that does not
depend on any other test's state, so file execution order does not affect correctness (each file's
tests are independent). If strict cross-file ordering is desired, vitest supports
`sequence.sequencer` / naming files with a numeric prefix vitest's default alphabetical `include`
glob picks up (`manifest.test.ts` sorts before `negative.test.ts` and `positive.test.ts`
alphabetically already — no config change needed for the common case).

**Example — reusing the exact self-verify logic already proven in `conformance/generate/src/manifest.ts`:**
```typescript
// Source: adapted from conformance/generate/src/manifest.ts self-verify loop (lines 86-108),
// which is ALREADY proven to correctly parse the "hex  relative-path" format and recompute
// SHA-256 with node:crypto. This harness performs the READ-SIDE of the same operation.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const VECTORS_DIR = join(__dirname, "..", "..", "vectors"); // conformance/verify-ts/src -> conformance/vectors
const MANIFEST_PATH = join(VECTORS_DIR, "MANIFEST.sha256");

describe("MANIFEST.sha256 self-check", () => {
  const manifestContent = readFileSync(MANIFEST_PATH, "utf8");
  const lines = manifestContent.trim().split("\n");

  it.each(lines.map((line) => {
    const separatorIdx = line.indexOf("  "); // exactly two spaces, sha256sum format
    return {
      expectedHex: line.slice(0, separatorIdx),
      relPath: line.slice(separatorIdx + 2),
    };
  }))("$relPath matches its committed SHA-256", ({ expectedHex, relPath }) => {
    const bytes = readFileSync(join(VECTORS_DIR, relPath));
    const actualHex = createHash("sha256").update(bytes).digest("hex");
    expect(actualHex).toBe(expectedHex);
  });
});
```

### Pattern 2: `describe.each` fixture loading with 4-step re-derivation (positive vectors)

**What:** Load all positive vector JSON files from disk, then for each one run a
`describe(vectorId, () => { it(...) ... })` block with 4 sequential assertions matching TSCONF-01's
explicit list: canonical bytes, PAE hex, signature, verdict.

**When to use:** `positive.test.ts` — this is the primary TSCONF-01 satisfaction path.

**Example:**
```typescript
// Source: patterns confirmed working in conformance/generate/src/positive.ts (pipeline calls)
// and packages/lattice/src/agent/format-tools.test.ts (describe.each usage in THIS codebase).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { canonicalizeReceiptBody } from "../../../packages/lattice/src/receipts/canonical.js";
import { PAYLOAD_TYPE, base64Decode, buildPae } from "../../../packages/lattice/src/receipts/envelope.js";
import { verifyEd25519Signature } from "../../../packages/lattice/src/receipts/sign.js";
import { createMemoryKeySet } from "../../../packages/lattice/src/receipts/keyset.js";
import { verifyReceipt } from "../../../packages/lattice/src/receipts/verify.js";
import type { CapabilityReceiptBody, ReceiptEnvelope } from "../../../packages/lattice/src/receipts/types.js";
import type { ConformanceVector } from "@lattice-conformance/generate/src/types.js"; // workspace:*

const POSITIVE_DIR = join(__dirname, "..", "..", "vectors", "positive");

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const vectors: Array<{ id: string; vector: ConformanceVector }> =
  readdirSync(POSITIVE_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({
      id: f,
      vector: JSON.parse(readFileSync(join(POSITIVE_DIR, f), "utf8")) as ConformanceVector,
    }));

describe.each(vectors)("positive vector: $id", ({ vector }) => {
  it("Step 1 — canonicalizeReceiptBody(body) matches canonicalBytesHex", () => {
    const bytes = canonicalizeReceiptBody(vector.body as unknown as CapabilityReceiptBody);
    expect(toHex(bytes)).toBe(vector.canonicalBytesHex);
  });

  it("Step 2 — buildPae(PAYLOAD_TYPE, payloadBase64) matches paeHex", () => {
    const paeBytes = buildPae(PAYLOAD_TYPE, vector.payloadBase64);
    expect(toHex(paeBytes)).toBe(vector.paeHex);
  });

  it("Step 3 — verifyEd25519Signature(publicKeyJwk, pae, sig) === true", async () => {
    const paeBytes = buildPae(PAYLOAD_TYPE, vector.payloadBase64);
    const sigBytes = base64Decode(Buffer.from(vector.signatureHex, "hex").toString("base64")); // or hex->bytes directly
    const valid = await verifyEd25519Signature(vector.publicKeyJwk, paeBytes, sigBytes);
    expect(valid).toBe(true);
  });

  it("Step 4 — verifyReceipt(envelope, keySet) verdict === 'ok'", async () => {
    const envelope: ReceiptEnvelope = {
      payloadType: PAYLOAD_TYPE,
      payload: vector.payloadBase64,
      signatures: [{ keyid: vector.kid, sig: Buffer.from(vector.signatureHex, "hex").toString("base64") }],
    };
    const keySet = createMemoryKeySet([
      { kid: vector.kid, publicKeyJwk: vector.publicKeyJwk, state: vector.verifyKeyState ?? "active" },
    ]);
    const result = await verifyReceipt(envelope, keySet);
    expect(result.ok).toBe(true);
  });
});
```

### Pattern 3: Verdict-only assertion for negative vectors (no step-by-step re-derivation)

**What:** Per the locked decision, negative vectors assert ONLY the final `expectedResult`
`VerifyErrorKind` match — not step-by-step byte re-derivation, since many negative constructions
deliberately break exactly one step and re-deriving "correctly" at earlier steps would be
tautological (e.g. NEG-06's canonical bytes ARE valid — the tamper is in `payloadBase64`, not in
what canonicalization produces).

**When to use:** `negative.test.ts` — the 9 committed negative vectors.

**Example — handling the two vector shapes correctly (envelope-present vs. reconstructed):**
```typescript
// Source: field semantics confirmed from conformance/generate/src/types.ts JSDoc (lines 10-26)
// and cross-checked against actual committed vector JSON (neg-01, neg-05 read directly).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PAYLOAD_TYPE } from "../../../packages/lattice/src/receipts/envelope.js";
import { createMemoryKeySet } from "../../../packages/lattice/src/receipts/keyset.js";
import { verifyReceipt } from "../../../packages/lattice/src/receipts/verify.js";
import type { ReceiptEnvelope } from "../../../packages/lattice/src/receipts/types.js";
import type { ConformanceVector } from "@lattice-conformance/generate/src/types.js";

const NEGATIVE_DIR = join(__dirname, "..", "..", "vectors", "negative");

const vectors: Array<{ id: string; vector: ConformanceVector }> =
  readdirSync(NEGATIVE_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({
      id: f,
      vector: JSON.parse(readFileSync(join(NEGATIVE_DIR, f), "utf8")) as ConformanceVector,
    }));

describe.each(vectors)("negative vector: $id", ({ vector }) => {
  it(`verdict matches expectedResult "${"placeholder"}"`, async () => {
    // envelope field present (NEG-01 only) -> use it EXACTLY as-is (it IS the malformed input).
    // envelope field absent -> reconstruct from the vector's standard fields.
    const envelope: ReceiptEnvelope = vector.envelope ?? {
      payloadType: PAYLOAD_TYPE,
      payload: vector.payloadBase64,
      signatures: [{
        keyid: vector.kid, // NOT necessarily body.kid — see NEG-04/NEG-08 doc comments
        sig: Buffer.from(vector.signatureHex, "hex").toString("base64"),
      }],
    };
    const keySet = createMemoryKeySet(
      // NEG-04 (key-not-found): the KeySet must NOT contain vector.kid ("unknown-kid-12345")
      // -> register the key under a DIFFERENT kid, or register no entries at all.
      vector.expectedResult === "key-not-found"
        ? []
        : [{ kid: vector.kid, publicKeyJwk: vector.publicKeyJwk, state: vector.verifyKeyState ?? "active" }],
    );
    const result = await verifyReceipt(envelope, keySet);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe(vector.expectedResult);
    }
  });
});
```

### Anti-Patterns to Avoid
- **Reimplementing canonicalization/PAE/signature logic inside the harness:** TSCONF-01 requires
  re-deriving "against the reference implementation," not a parallel from-scratch implementation.
  Always import the actual functions from `packages/lattice/src/receipts/*.ts`.
- **Loose/partial-match assertions on negative vectors:** the locked decision requires an EXACT
  `VerifyErrorKind` string match (`toBe`, not `toBeDefined()` or `.ok === false` alone). A harness
  that only checks "verification failed" would pass even if the wrong decision-tree step fired.
- **Copying vector JSON into the test files (embedding):** the locked-decision-adjacent "Specific
  Ideas" note explicitly requires reading vectors directly off disk from `conformance/vectors/`,
  never embedding copies — this preserves the property that regenerating vectors (Phase 51's
  `--regen-vectors` flag) automatically updates what the harness checks against, with no
  synchronization step.
- **Building the envelope for NEG-01 from the vector's standard fields:** NEG-01 is the one case
  where the `envelope` field must be used VERBATIM (its `payloadType` is intentionally
  `"application/json"`, not `PAYLOAD_TYPE` — reconstructing "correctly" would silently defeat the
  vector). Always check `vector.envelope !== undefined` first.
- **Registering the vector's `kid` unconditionally for NEG-04:** NEG-04's entire point is that the
  KeySet has NO entry for `"unknown-kid-12345"`. If the harness blindly does
  `createMemoryKeySet([{ kid: vector.kid, ... }])` for every vector including NEG-04, the key WILL
  be found and the vector will fail to reproduce `key-not-found` (it would probably diverge at a
  different step or spuriously pass). See Pitfall 2 below.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SHA-256 manifest verification | A custom hash-comparison utility or a shell-out to `sha256sum --check` inside a test | `node:crypto` `createHash("sha256")` directly in TypeScript | `conformance/generate/src/manifest.ts` already implements and PROVES this exact self-verify pattern (lines 86-108) — reuse the logic, don't reinvent it. Shelling out to `sha256sum --check` (as `main.test.ts` does for its OWN integration test) works but couples the harness to a Linux/macOS-only binary; the pure-Node approach used by the WRITE side is the more portable choice for a per-file assertion loop and matches what the locked decision's "self-checks MANIFEST.sha256" implies (a TypeScript-native check, not a shell dependency). |
| In-memory `KeySet` construction for verification tests | A bespoke `Map`-based lookup object inline in each test | `createMemoryKeySet` from `packages/lattice/src/receipts/keyset.ts` | Already exported, already the exact factory `packages/lattice/src/receipts/verify.test.ts` uses for its own test suite. Building a parallel one in the harness risks subtle behavioral drift (e.g. duplicate-kid handling, empty-array semantics) documented in `keyset.ts`'s own JSDoc. |
| Hex ⟷ bytes conversion | A hex-parsing library dependency | `Buffer.from(hex, "hex")` / manual `toString(16).padStart(2, "0")` loop (same helper `conformance/generate` already defines twice, in `positive.ts` and `negative.ts`) | Node.js's `Buffer` API handles hex encoding/decoding natively with zero extra dependencies; this is a one-line operation, not worth a package. |
| Envelope reconstruction from vector fields | A shared "vector-to-envelope" npm package or complex builder abstraction | The ~10-line inline object literal shown in Pattern 2/3 above | The transformation is trivial (3 fields) and vector-shape-dependent (NEG-01's `envelope` override, NEG-04's kid substitution) — an abstraction would need as many special cases as the inline version, adding indirection without reducing complexity. |

**Key insight:** Every "hard part" of this phase (hashing, keyset lookup, hex conversion, envelope
construction) already has a proven, working implementation somewhere in this exact repository —
either in the reference implementation itself or in the Phase 51 sibling package. The work in
Phase 52 is composition and assertion, not invention.

## Common Pitfalls

### Pitfall 1: Confusing `signatureHex`/hex fields with base64 fields when constructing an envelope
**What goes wrong:** `ConformanceVector.signatureHex` is lowercase hex (128 chars = 64 bytes), but
`ReceiptEnvelope.signatures[].sig` (per `encodeEnvelope`/`ReceiptEnvelope` in `types.ts`) expects
**standard base64**, matching what `decodeEnvelope` will `base64Decode`. A harness that puts the
hex string directly into `sig` will produce an envelope whose `decodeEnvelope` step either throws
(invalid base64 characters, since hex uses only `0-9a-f` which IS valid base64 alphabet-wise but
decodes to garbage bytes) or produces a signature of the wrong byte length, causing
`verifyEd25519Signature` to fail for reasons unrelated to the vector's intended failure mode.
**Why it happens:** `ConformanceVector` stores signature as hex (for readability/diffability in
committed JSON) but the actual wire-format `ReceiptEnvelope.sig` field is base64. This asymmetry
is easy to miss.
**How to avoid:** Always convert: `Buffer.from(vector.signatureHex, "hex").toString("base64")`
when constructing a `sig` field for a `ReceiptEnvelope`. Similarly, `vector.payloadBase64` is
ALREADY base64 (no conversion needed) — do not accidentally re-encode it.
**Warning signs:** A positive vector test fails at the `verifyReceipt` step with
`"signature-invalid"` even though the standalone `verifyEd25519Signature` step passed — this is
the signature (symptom of base64/hex confusion at the envelope-construction boundary, since Step
3 in Pattern 2 above correctly hex-decodes for the direct `verifyEd25519Signature` call, but Step
4's envelope construction is a separate code path that must ALSO correctly convert).

### Pitfall 2: NEG-04 (`key-not-found`) requires the KeySet to NOT contain the vector's own `kid`
**What goes wrong:** If the harness's KeySet-construction helper unconditionally does
`createMemoryKeySet([{ kid: vector.kid, publicKeyJwk: vector.publicKeyJwk, state: "active" }])`
for every vector, NEG-04's `kid` field (`"unknown-kid-12345"`, per the generator's own comment in
`negative.ts` lines 289-310) WOULD be registered — defeating the entire point of the vector. The
lookup would succeed, and `verifyReceipt` would proceed past Step 5 into signature verification,
which would ALSO pass (the signature IS valid — it's the base positive body's signature), leading
`verifyReceipt` to return `ok: true` where the vector expects `"key-not-found"`.
**Why it happens:** `ConformanceVector.kid` doubles as "the kid the harness must PRESENT to
verifyReceipt's KeySet lookup" — for most vectors this equals `body.kid`, but for NEG-04
specifically it is deliberately a kid that must be ABSENT from the registered KeySet (documented
explicitly in `negative.ts`'s NEG-04 comment block and in `types.ts`'s `kid` field JSDoc).
**How to avoid:** Branch on `vector.expectedResult === "key-not-found"` when constructing the
KeySet (as shown in Pattern 3 above) — register zero entries, or register an entry under a
different kid, so the lookup for `vector.kid` genuinely returns `undefined`.
**Warning signs:** The NEG-04 test passes an `ok: true` result where `false` was expected, or
fails with the WRONG `VerifyErrorKind` (e.g. `signature-invalid` instead of `key-not-found`) —
this specific mismatch pattern is diagnostic of a KeySet that accidentally contains the
"forbidden" kid.

### Pitfall 3: Adding a `build` script to `conformance/verify-ts/package.json` when the sibling doesn't have one
**What goes wrong:** `conformance/generate/package.json` has NO `build` script (confirmed by
direct read during this research session — only `generate`, `test`, `typecheck`). CI's
`pnpm -r build` step (in `.github/workflows/ci.yml`, run BEFORE `pnpm -r typecheck` and
`pnpm -r test`) silently skips any workspace package lacking a `build` script — this is pnpm's
documented `-r`/`--filter` behavior, not an error. If `conformance/verify-ts/package.json` is
given a `build` script that, say, runs `tsc` with `noEmit: false`, it would either (a) start
emitting a `dist/` directory that then needs `.gitignore` handling, or (b) potentially interact
unexpectedly with `check-core-package-boundary.mjs`'s dist-scanning logic (though that script only
targets `packages/lattice/dist`, so this specific script would remain unaffected — but the
principle of "don't introduce what the reference package doesn't have" still applies for
consistency and to avoid surprising CI runtime cost).
**Why it happens:** Package.json templates from other parts of the monorepo (e.g.
`packages/lattice/package.json`, which DOES have `build: "pnpm stamp:version && tsdown"`) might be
copied by habit rather than mirroring the correct sibling (`conformance/generate`).
**How to avoid:** Mirror `conformance/generate/package.json`'s script set exactly: `generate` (N/A
for verify-ts — no equivalent needed), `test: "vitest run"`, `typecheck: "tsc --noEmit"`. No
`build` script.
**Warning signs:** `pnpm -r build` in CI takes noticeably longer or a `conformance/verify-ts/dist/`
directory appears in `git status` that wasn't expected.

### Pitfall 4: `it.each`/`describe.each` template-string interpolation with object rows
**What goes wrong:** vitest's `describe.each`/`it.each` supports `%s`/`%d`-style printf
placeholders OR `$variable`-style object-property interpolation in the title string, but NOT both
mixed carelessly, and the exact syntax differs from Jest in some edge cases across vitest major
versions. A title template like `` `vector: ${vector.id}` `` (JS template literal, evaluated
EAGERLY once for ALL rows before `describe.each` even runs) silently produces the SAME title for
every row if `vector` is captured from outer scope incorrectly, whereas the CORRECT form passes a
STRING template (with `$propertyName` placeholders) as the first argument to
`describe.each(array)(titleTemplate, callback)`, which vitest interpolates PER ROW.
**Why it happens:** JS template literals (`` `${x}` ``) and vitest's own `$x` placeholder syntax
look superficially similar but are evaluated at completely different times (immediately vs. per-
row by vitest internals).
**How to avoid:** Use the verified-working form already in this codebase:
`` describe.each(ALL_PROVIDERS)("formatToolsForProvider — %s", (providerName) => {...}) `` (from
`packages/lattice/src/agent/format-tools.test.ts:62`) for primitive-array rows, OR
`describe.each(vectors)("positive vector: $id", ({ id, vector }) => {...})` for object-array rows
(shown in Pattern 2/3 above) — both patterns pass a STRING (not a template literal) as the title
argument.
**Warning signs:** All `describe.each` blocks in the vitest reporter show the identical vector
name/id regardless of which vector actually failed — defeating the entire "clear per-vector
failure attribution" locked-decision requirement.

## Code Examples

Verified patterns from this repository's own source (all read directly during this research
session, not from training-data memory):

### Reference implementation function signatures (the four functions TSCONF-01 names)
```typescript
// Source: packages/lattice/src/receipts/canonical.ts (line 49)
export function canonicalizeReceiptBody(body: CapabilityReceiptBody): Uint8Array

// Source: packages/lattice/src/receipts/envelope.ts (lines 57, 81, 105)
export function buildPae(payloadType: string, payloadBase64: string): Uint8Array
export function encodeEnvelope(input: EncodeEnvelopeInput): ReceiptEnvelope
export function decodeEnvelope(envelope: ReceiptEnvelope): DecodedEnvelope

// Source: packages/lattice/src/receipts/sign.ts (line 68)
export async function verifyEd25519Signature(
  publicKeyJwk: JsonWebKey,
  message: Uint8Array,
  signature: Uint8Array,
): Promise<boolean>

// Source: packages/lattice/src/receipts/verify.ts (line 85)
export async function verifyReceipt(
  envelope: ReceiptEnvelope,
  keySet: KeySet,
): Promise<VerifyResult>
// VerifyResult = { ok: true; body; keyState } | { ok: false; error: { kind: VerifyErrorKind; message } }
// NEVER throws across this boundary — always returns a typed result (verify.ts line 69-70 comment).
```

### MANIFEST.sha256 line format (confirmed exact format, sha256sum-compatible)
```
591e9755fccba4f71a56e842bf1a7ffd0ba570bae11c9c4456e6d94633152f9b  negative/neg-01-envelope-malformed.json
```
- 64 lowercase hex characters (SHA-256 digest)
- EXACTLY two ASCII spaces as separator
- Path relative to `conformance/vectors/` (the manifest's own directory), forward-slash-separated
- Verified live: `cd conformance/vectors && sha256sum --check MANIFEST.sha256` exits 0 with all 12
  files reporting `OK` (macOS Darwin's `sha256sum` — confirmed present and GNU-coreutils-compatible
  on this dev machine; CI runs `ubuntu-latest` per `.github/workflows/ci.yml`, where GNU
  `sha256sum` is native).

### `ConformanceVector` field semantics that affect envelope reconstruction
```typescript
// Source: conformance/generate/src/types.ts (lines 10-26, verbatim JSDoc)
//
// `envelope` is set ONLY for envelope-level negative vectors (NEG-01 /
// `envelope-malformed`) where the harness cannot reconstruct the malformed
// input from the other fields alone. For all positive vectors and for
// body-level negatives ... this field is ABSENT — the harness reconstructs
// the envelope from the standard fields.
//
// `verifyKeyState` is set ONLY for vectors that require the verifier's KeySet
// to register the key in a non-default state. For NEG-05 (`key-revoked`) the
// generator sets this to `"revoked"`. The harness reads this field and
// registers the public key with the given state before calling verifyReceipt.
// Positive vectors and all other negatives omit this field (the key is
// registered as `"active"` by default).
```

### KeySet construction (verified exact factory to reuse)
```typescript
// Source: packages/lattice/src/receipts/keyset.ts (lines 18-28)
export function createMemoryKeySet(entries: readonly KeyEntry[]): KeySet {
  const byKid = new Map<string, KeyEntry>();
  for (const entry of entries) byKid.set(entry.kid, entry);
  return { lookup(kid: string): KeyEntry | undefined { return byKid.get(kid); } };
}
```

### `tsconfig.json` shape to mirror exactly
```json
// Source: conformance/generate/tsconfig.json (verified — this EXACT config typechecks
// cleanly today: `pnpm --filter @lattice-conformance/generate typecheck` → 0 errors, confirmed
// live during this research session)
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "moduleResolution": "Bundler",
    "outDir": "dist",
    "noEmit": true,
    "types": ["node"],
    "rootDir": "../.."
  },
  "include": ["src/**/*.ts", "../../packages/lattice/src/**/*.ts"]
}
```
For `conformance/verify-ts`, the `include` array should ALSO cover the sibling
`conformance/generate/src/types.ts` file it imports types from (via `workspace:*`), e.g. add
`"../generate/src/**/*.ts"` — otherwise `tsc --noEmit` may not see those types during isolated
per-package typecheck, even though vitest's own resolution (via `node_modules/@lattice-conformance/generate`
symlink) would still work at test-runtime. Verify this by running
`pnpm --filter @lattice-conformance/verify-ts typecheck` as the plan's own verification step (this
is exactly the kind of thing that must be confirmed by execution, not assumed from this research).

### `vitest.config.ts` shape to mirror exactly
```typescript
// Source: conformance/generate/vitest.config.ts (verified — produces a passing 28-test run today)
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| N/A — this phase introduces no technology change | The Phase 51 pattern (private unpublished pnpm workspace package under `conformance/`, source-relative imports, `catalog:`-pinned tooling) IS the current state of the art for this repo and this phase continues it unchanged. | Established in Phase 51 (2026-06-25). | Phase 52 has zero migration or deprecation concerns — it is a same-generation sibling package. |

**Deprecated/outdated:** None applicable — no prior implementation of this harness exists to
deprecate; this is greenfield within an already-current pattern.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | vitest's `describe.each`/`it.each` cross-file execution ordering is not strictly guaranteed by default, but alphabetical `include` glob ordering (`manifest.test.ts` < `negative.test.ts` < `positive.test.ts`) will run the manifest check first in practice on this vitest version/config. | Architecture Patterns, Pattern 1 | LOW risk — even if ordering is NOT alphabetical in a given vitest run, the manifest self-check is a hermetic assertion (does not depend on any other test's side effects) so a later-executing manifest check still catches tampering; the ONLY consequence of wrong ordering is that a pipeline-assertion test might report a confusing failure in the SAME run as a manifest failure, rather than the manifest failure alone being reported. Does not affect correctness, only failure-message clarity. If strict ordering is required by the plan, `vitest.config.ts`'s `test.sequence.sequencer` option or splitting into a `pretest` npm script (`"pretest": "vitest run src/manifest.test.ts"`) would guarantee it — left as an executor discretion point per CONTEXT.md's "vitest config details are at the planner/executor's discretion." |
| A2 | `tsconfig.json`'s `include` array needs an explicit entry for `../generate/src/**/*.ts` for `tsc --noEmit` to successfully typecheck the `workspace:*` import of `ConformanceVector` from `@lattice-conformance/generate`. | Code Examples, "tsconfig.json shape to mirror exactly" | MEDIUM risk if wrong in the OTHER direction (i.e., if it turns out NOT needed because `moduleResolution: "Bundler"` resolves `@lattice-conformance/generate` via its `node_modules` symlink and TypeScript pulls in the referenced `.ts` file's types transitively without an explicit `include` entry) — the actual behavior must be confirmed by running `tsc --noEmit` in the new package during plan execution, exactly as this research recommends. If the assumption is wrong, the ONLY effect is a possibly-unnecessary but harmless extra `include` glob entry — not a build break either way. |

**Note on overall assumption density:** This research is unusually low in `[ASSUMED]` claims
because nearly every fact was independently confirmed by executing commands (`pnpm typecheck`,
`pnpm test`, `sha256sum --check`, `npm view`, direct file reads) rather than relying on training
data — this is a "mirror an existing proven pattern" phase, not a "adopt a new library" phase, so
the verification bar was achievable in full.

## Open Questions (RESOLVED)

1. **Should the manifest self-check be a `pretest` npm script or an in-suite `describe` block?**
   - What we know: The locked decision says "self-checks MANIFEST.sha256 as its first test" — both
     interpretations satisfy this literally (a `pretest` script IS the first thing to run before
     `test`; an in-suite `manifest.test.ts` alphabetically sorts first in the default `include`
     glob).
   - What's unclear: Whether "first test" means "first vitest test case in the reporter output" or
     "first command in the execution pipeline" — the locked decision text doesn't disambiguate.
   - Recommendation: Use the in-suite `manifest.test.ts` approach (Pattern 1) — it keeps everything
     inside `pnpm --filter @lattice-conformance/verify-ts test` (a single command, matching the
     "Deferred Ideas" note that CI wiring beyond this single command is Phase 56's job) and produces
     a normal vitest failure report rather than a separate script's non-vitest error output. This is
     explicitly within the CONTEXT.md-granted "vitest config details are at the planner/executor's
     discretion" scope.

2. **How should `positive.test.ts` and `negative.test.ts` share the vector-loading helper without
   creating an awkward third dependency edge?**
   - What we know: `conformance/generate` splits `positive.ts`/`negative.ts`/`manifest.ts` as
     separate modules, each self-contained (no shared loader module between them — they don't need
     one since they GENERATE rather than LOAD).
   - What's unclear: Whether `conformance/verify-ts` should introduce a `load-vectors.ts` helper
     (shown as "optional" in the Recommended Project Structure above) or simply duplicate the
     ~6-line `readdirSync`/`JSON.parse` loading logic in both `positive.test.ts` and
     `negative.test.ts`.
   - Recommendation: Given CONTEXT.md's explicit "internal helper structure ... at the
     planner/executor's discretion," and given the loading logic genuinely differs by one line
     (positive dir vs. negative dir), duplication is acceptable and arguably clearer for a
     12-vector, 2-file test suite — but a small shared `load-vectors.ts` exporting
     `loadVectors(dir: string): Array<{id, vector}>` is equally valid and reduces one line of
     duplication. Either choice satisfies TSCONF-01/02; this is a stylistic decision left to the
     plan.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Test execution, `node:crypto`/`node:fs` built-ins | Yes | `>=24` per root `package.json` `engines` field, confirmed via existing successful `pnpm --filter @lattice-conformance/generate test` run this session | — |
| pnpm | Workspace package management, `workspace:*` resolution | Yes | `10.33.1` per root `package.json` `packageManager` field | — |
| vitest | Test runner | Yes | `4.1.5`, catalog-pinned, confirmed installed in `conformance/generate/node_modules/vitest` | — |
| typescript | `tsc --noEmit` typecheck | Yes | `6.0.3`, catalog-pinned | — |
| `sha256sum` (GNU coreutils) | ONLY if the plan chooses a shell-out approach for manifest verification instead of `node:crypto` (Pattern 1 uses `node:crypto`, so this is not required) | Yes on this dev machine (macOS Darwin) AND on CI (`ubuntu-latest`) | — | N/A — Pattern 1's `node:crypto` approach has zero external-binary dependency, making this row moot for the recommended implementation. |

No missing dependencies. This phase requires zero new tool installation.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.5 (identical to every other workspace package, catalog-pinned) |
| Config file | `conformance/verify-ts/vitest.config.ts` (new — mirrors `conformance/generate/vitest.config.ts` exactly) |
| Quick run command | `pnpm --filter @lattice-conformance/verify-ts test` |
| Full suite command | `pnpm -r test` (runs every workspace package's test script, including this new one, automatically — confirmed this is how `conformance/generate` is already picked up with zero root-script changes) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TSCONF-01 | Re-derive canonical bytes, PAE, signature, verdict for each positive vector; assert byte-identity at each step | unit (vitest) | `pnpm --filter @lattice-conformance/verify-ts test -- positive.test.ts` | ❌ Wave 0 — `conformance/verify-ts/src/positive.test.ts` does not exist yet |
| TSCONF-01 | Assert exact `VerifyErrorKind` verdict match for each negative vector | unit (vitest) | `pnpm --filter @lattice-conformance/verify-ts test -- negative.test.ts` | ❌ Wave 0 — `conformance/verify-ts/src/negative.test.ts` does not exist yet |
| TSCONF-01 | Self-check `MANIFEST.sha256` before vector assertions; harness fails build on any divergence | unit (vitest) | `pnpm --filter @lattice-conformance/verify-ts test -- manifest.test.ts` | ❌ Wave 0 — `conformance/verify-ts/src/manifest.test.ts` does not exist yet |
| TSCONF-02 | `conformance/verify-ts` is a private, unpublished pnpm workspace package | smoke (manual/shell) | `pnpm -r list --depth -1 \| grep verify-ts` should show `(PRIVATE)` | ❌ Wave 0 — package.json with `"private": true` does not exist yet |
| TSCONF-02 | `check-tarball-leak.mjs` and `check-core-package-boundary.mjs` remain green with no modification | smoke (shell) | `pnpm check:tarball && pnpm check:core-boundary` | ✅ Both scripts exist today and pass (confirmed live this session: `check:tarball` → OK, 2 tarballs; `check:core-boundary` → OK) — no new test file needed, this is a re-run-and-confirm step |

### Sampling Rate
- **Per task commit:** `pnpm --filter @lattice-conformance/verify-ts test` (fast — the 28-test
  `conformance/generate` sibling suite completed in 1.16s during this session; this new suite,
  covering 12 vectors × up to 4 assertions each, will be comparably fast since it performs the
  same lightweight crypto operations)
- **Per wave merge:** `pnpm -r build && pnpm -r typecheck && pnpm -r test` (full workspace, matches
  CI's own step order in `.github/workflows/ci.yml`)
- **Phase gate:** `pnpm check:tarball && pnpm check:core-boundary` green (the TSCONF-02 evidence
  the locked decision explicitly requires the plan to capture), plus full `pnpm -r test` green,
  before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `conformance/verify-ts/package.json` — new package manifest
- [ ] `conformance/verify-ts/tsconfig.json` — new, extends root base config
- [ ] `conformance/verify-ts/vitest.config.ts` — new, mirrors sibling
- [ ] `conformance/verify-ts/src/manifest.test.ts` — covers TSCONF-01 (manifest self-check clause)
- [ ] `conformance/verify-ts/src/positive.test.ts` — covers TSCONF-01 (4-step re-derivation)
- [ ] `conformance/verify-ts/src/negative.test.ts` — covers TSCONF-01 (verdict-only assertion)
- [ ] `pnpm-workspace.yaml` — NO change needed (glob `conformance/*` already covers the new dir;
      confirmed live via `pnpm -r list --depth -1` before the package existed showing only
      `@lattice-conformance/generate`, and the glob pattern already matching sibling dirs)
- Framework install: none — `vitest`/`typescript`/`@types/node` already present at workspace root
  via `catalog:`; only `pnpm install` (to materialize the new package's `node_modules` symlinks
  after `package.json` is created) is needed, no new registry fetch.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | This phase has no authentication surface — it is a local test harness with no network/user-identity concerns. |
| V3 Session Management | No | No sessions involved. |
| V4 Access Control | No | No access-control surface — the harness runs locally, reads local files. |
| V5 Input Validation | Yes | The harness's "input" is the committed vector JSON files themselves. Validation here means: byte-identity assertion (does NOT re-run ajv schema validation — that already happened at generation time in Phase 51's `positive.ts`/`negative.ts`) plus the MANIFEST.sha256 integrity self-check, which IS the input-validation control for this phase (detects tampering of the committed fixtures before they're trusted as "expected" values). |
| V6 Cryptography | Yes | Ed25519 signature verification (`verifyEd25519Signature`, WebCrypto `crypto.subtle`) and SHA-256 hashing (`node:crypto` `createHash`) — both delegate to platform-native cryptographic primitives (WebCrypto / OpenSSL via Node's `crypto` module), never hand-rolled. The harness does not implement any cryptographic algorithm itself; it only INVOKES the reference implementation's existing, already-audited crypto calls and Node's own built-in SHA-256. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Silent vector-file tampering causing the harness to validate against corrupted "expected" values | Tampering | The manifest self-check (Pattern 1) is exactly this mitigation — SHA-256 over each committed vector file, compared against a value locked at Phase 51 generation time. This is the core security property TSCONF-01's "self-checks MANIFEST.sha256 ... defense-in-depth" clause targets. |
| A future negative-vector test accidentally passing (false negative on the harness itself) because the KeySet or envelope was constructed too permissively (e.g. Pitfall 2's NEG-04 KeySet mistake) | Tampering / Spoofing (the test itself becomes an unreliable oracle) | Exact `VerifyErrorKind` string match (not just `ok === false`) per the locked decision — this is a test-correctness control, not a runtime-security control, but its FAILURE MODE is a false sense of security (a broken decision-tree step in `verify.ts` could ship unnoticed if the harness only checked "did it fail," not "did it fail for the RIGHT reason"). |
| Using the hex `signatureHex` field directly as a base64 `sig` field (Pitfall 1) causing a test to report `signature-invalid` for the WRONG underlying reason, masking a real regression in `verifyEd25519Signature` | Tampering (of test semantics, not of production data) | Explicit hex→base64 conversion at the envelope-construction boundary, as shown in Pattern 2/3; the plan's verification step should include running the FULL positive suite and confirming ALL 4 steps pass (not just the final verdict) to catch this class of encoding mistake early. |

Note: this phase's security surface is unusually narrow because it is a TEST HARNESS, not a
production code path — its "security" job is entirely about correctly proving the ALREADY-SECURE
reference implementation (`packages/lattice/src/receipts/*.ts`, which carries its own security
history documented in that module's comments referencing `SECURITY.md` Phase 26 threat model and
CRYPTO-01 downgrade-defense) behaves as specified against the committed fixtures, and about not
undermining that proof through weak or misconfigured test assertions.

## Sources

### Primary (HIGH confidence — all read directly from this repository during this research session)
- `conformance/generate/package.json`, `tsconfig.json`, `vitest.config.ts` — sibling package structure to mirror
- `conformance/generate/src/types.ts`, `main.ts`, `manifest.ts`, `positive.ts`, `negative.ts`, `main.test.ts` — full Phase 51 pipeline and test patterns
- `packages/lattice/src/receipts/canonical.ts`, `envelope.ts`, `sign.ts`, `verify.ts`, `keyset.ts`, `types.ts` — the NORMATIVE reference implementation TSCONF-01 requires re-deriving against
- `packages/lattice/src/receipts/verify.test.ts` — existing test-suite pattern for constructing envelopes/KeySets in this codebase
- `packages/lattice/src/agent/format-tools.test.ts`, `packages/lattice/test/prompt-scaffolds.test.ts` — confirmed `describe.each`/`it.each` already in active use in this exact codebase (not a new pattern)
- `pnpm-workspace.yaml`, root `package.json`, `tsconfig.base.json` — workspace configuration, catalog pins, scripts
- `scripts/check-tarball-leak.mjs`, `scripts/check-core-package-boundary.mjs` — confirmed hardcoded allowlists that do not scan `conformance/`
- `.github/workflows/ci.yml` — confirmed step order (`build` → `typecheck` → `test` → `test:types` → `lint:packages` → tarball/boundary/version/rename/workflow-safety audits)
- `conformance/vectors/positive/vec-00-v1.3.json`, `conformance/vectors/negative/neg-01-envelope-malformed.json`, `neg-05-key-revoked.json`, `MANIFEST.sha256` — exact committed vector shapes
- `.planning/phases/52-typescript-self-verification-harness/52-CONTEXT.md` — locked decisions
- `.planning/REQUIREMENTS.md`, `.planning/STATE.md` — TSCONF-01/02 definitions and phase dependency chain

### Secondary (MEDIUM confidence)
- None — this research required no external documentation lookups; every fact needed was already
  present and verifiable in-repo.

### Tertiary (LOW confidence)
- None.

### Live command verification performed this session
- `npm view vitest@4.1.5 version` → `4.1.5` (registry confirms exact catalog pin exists)
- `npm view canonicalize@3.0.0 version` → `3.0.0` (registry confirms exact catalog pin exists)
- `pnpm --filter @lattice-conformance/generate typecheck` → exits cleanly, 0 errors
- `pnpm --filter @lattice-conformance/generate test` → `2 test files, 28 tests, all passed, 1.16s`
- `pnpm -r build` → workspace builds cleanly (confirms baseline before this phase's changes)
- `pnpm check:tarball` → `OK — inspected 2 tarballs`
- `pnpm check:core-boundary` → `OK - core runtime boundary clean`
- `cd conformance/vectors && sha256sum --check MANIFEST.sha256` → all 12 files report `OK`
- `pnpm -r list --depth -1 | grep conformance` → confirms `@lattice-conformance/generate` already
  auto-discovered via the `conformance/*` glob, proving no `pnpm-workspace.yaml` edit is needed for
  the new sibling package

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages introduced; every dependency version confirmed live against the npm registry and/or already-installed `node_modules`.
- Architecture: HIGH — the exact pattern this phase must implement (`conformance/generate/`) was read in full and independently confirmed to typecheck and test cleanly by direct execution, not by inference.
- Pitfalls: HIGH — all four documented pitfalls were derived from precise field-semantics documented in-repo (`types.ts` JSDoc, `negative.ts` inline comments) cross-referenced against the actual reference-implementation type signatures (`ReceiptEnvelope.sig` is base64; `ConformanceVector.signatureHex` is hex), not speculative "common vitest mistakes."

**Research date:** 2026-07-01
**Valid until:** This research is tied to the current state of `packages/lattice/src/receipts/*` and `conformance/generate/*`, both of which are stable, already-shipped Phase 51/earlier code. Valid until either of those source trees changes materially (no fixed expiry — recommend re-verification only if Phase 51 or the receipts module is touched again before Phase 52 executes).
