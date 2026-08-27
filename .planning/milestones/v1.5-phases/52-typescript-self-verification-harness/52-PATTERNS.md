# Phase 52: TypeScript Self-Verification Harness - Pattern Map

**Mapped:** 2026-07-01
**Files analyzed:** 6 (1 modified config verification only + 5 new files in `conformance/verify-ts/`)
**Analogs found:** 6 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `conformance/verify-ts/package.json` | config | file-I/O (package manifest) | `conformance/generate/package.json` | exact |
| `conformance/verify-ts/tsconfig.json` | config | file-I/O (compiler config) | `conformance/generate/tsconfig.json` | exact |
| `conformance/verify-ts/vitest.config.ts` | config | file-I/O (test-runner config) | `conformance/generate/vitest.config.ts` | exact |
| `conformance/verify-ts/src/manifest.test.ts` | test | file-I/O + batch (hash-verify all vector files) | `conformance/generate/src/manifest.ts` (self-verify loop, lines 86-108) | role-match (writer → reader of same format) |
| `conformance/verify-ts/src/positive.test.ts` | test | CRUD/transform (re-derive pipeline outputs, assert byte-identity) | `conformance/generate/src/positive.ts` (`runPipeline`, lines 132-158) + `packages/lattice/src/receipts/verify.test.ts` (envelope/KeySet construction, lines 63-91) | role-match (generator → verifier of same pipeline) |
| `conformance/verify-ts/src/negative.test.ts` | test | request-response (call `verifyReceipt`, assert exact error kind) | `conformance/generate/src/negative.ts` (vector construction recipes, full file) + `packages/lattice/src/receipts/verify.test.ts` (error-kind assertion style, lines 107-306) | role-match |
| `pnpm-workspace.yaml` | config | N/A (verification only — **no edit needed**) | — | N/A — `conformance/*` glob (line 3) already covers the new sibling directory; confirmed no change required |

No `load-vectors.ts` helper file is separately classified — CONTEXT.md explicitly leaves this to executor discretion (see `## Shared Patterns` below for the inline duplication vs. shared-helper tradeoff).

## Pattern Assignments

### `conformance/verify-ts/package.json` (config)

**Analog:** `conformance/generate/package.json` (full file, 20 lines)

**Full file to mirror, with two changes** (name + a new `workspace:*` devDependency; no `generate` script needed since this package only verifies, never writes):
```json
{
  "name": "@lattice-conformance/verify-ts",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@lattice-conformance/generate": "workspace:*",
    "@types/node": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  }
}
```
Notes:
- `"private": true` is REQUIRED (matches TSCONF-02's "private, unpublished" requirement).
- Do **not** add a `"build"` script — the sibling has none (Pitfall 3 in RESEARCH.md: CI's `pnpm -r build` silently no-ops for packages lacking this script; adding one risks an unexpected `dist/` output or CI runtime cost).
- Do **not** carry over `ajv`, `ajv-formats`, `canonicalize`, or `tsx` from the sibling's devDependencies — those are generator-only concerns (schema validation, JCS canonicalization library used directly by `positive.ts`/`negative.ts` for tamper construction, and the `tsx` runner for `main.ts`). The harness never runs a `main.ts`-style script and never validates against ajv schemas (validation already happened at Phase 51 generation time — RESEARCH.md `## Architecture Patterns`, Pitfall/Anti-Pattern section confirms this explicitly).
- `canonicalize` IS still needed transitively (imported inside `packages/lattice/src/receipts/canonical.ts`), but that is `packages/lattice`'s own dependency graph, already resolved by the existing `packages/lattice/package.json` — no direct devDependency entry required in `verify-ts/package.json`.

---

### `conformance/verify-ts/tsconfig.json` (config)

**Analog:** `conformance/generate/tsconfig.json` (full file, 12 lines)

**Base to mirror exactly:**
```json
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
**One addition required** per RESEARCH.md Code Examples / Assumption A2: the `include` array must also cover the sibling `conformance/generate/src/**/*.ts` so `tsc --noEmit` sees the `ConformanceVector`/`ReceiptEnvelope`/`VERIFY_ERROR_KINDS` types imported via the new `workspace:*` devDependency:
```json
"include": [
  "src/**/*.ts",
  "../../packages/lattice/src/**/*.ts",
  "../generate/src/**/*.ts"
]
```
Verify this by running `pnpm --filter @lattice-conformance/verify-ts typecheck` as a plan verification step — RESEARCH.md flags this as MEDIUM-risk-if-wrong-in-the-other-direction (i.e. it might turn out unnecessary), so confirm by execution, not assumption.

---

### `conformance/verify-ts/vitest.config.ts` (config)

**Analog:** `conformance/generate/vitest.config.ts` (full file, 9 lines) — verified to produce a passing 28-test run today.

**Exact shape to mirror, zero changes:**
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

---

### `conformance/verify-ts/src/manifest.test.ts` (test, file-I/O + batch)

**Analog:** `conformance/generate/src/manifest.ts` self-verify loop (lines 86-108, the WRITE-side proof of this exact algorithm) + `conformance/generate/src/main.test.ts` `describe("VEC-06 — MANIFEST.sha256 integrity", ...)` block (lines 426-527, the sibling's own manifest-check test — note that block shells out to `sha256sum --check`; the locked decision for THIS phase's harness explicitly prefers a pure `node:crypto` in-suite check per RESEARCH.md's "Don't Hand-Roll" table, so mirror the *algorithm* from `manifest.ts`, not the shell-out mechanism from `main.test.ts`).

**Exact MANIFEST.sha256 format confirmed on disk** (`conformance/vectors/MANIFEST.sha256`, 12 lines, one per committed vector file):
```
591e9755fccba4f71a56e842bf1a7ffd0ba570bae11c9c4456e6d94633152f9b  negative/neg-01-envelope-malformed.json
...
ecf564fc6bd8144d4a2881e1f0385b8485f22a7e106d1399d98047e925e564d7  positive/vec-02-v1.2.json
```
64 lowercase hex chars, exactly TWO ASCII spaces, path relative to `conformance/vectors/`.

**Self-verify algorithm to port** (from `conformance/generate/src/manifest.ts` lines 86-108, adapting WRITE-side re-check into a READ-side/assertion form):
```typescript
// Source: conformance/generate/src/manifest.ts lines 86-108 (writeManifest's
// own self-verify loop) — the harness performs the READ-SIDE of this same
// operation as its Step 0 test.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const VECTORS_DIR = join(__dirname, "..", "..", "vectors"); // conformance/verify-ts/src -> conformance/vectors
const MANIFEST_PATH = join(VECTORS_DIR, "MANIFEST.sha256");

describe("MANIFEST.sha256 self-check", () => {
  const manifestContent = readFileSync(MANIFEST_PATH, "utf8");
  const lines = manifestContent.trim().split("\n");

  it.each(
    lines.map((line) => {
      const separatorIdx = line.indexOf("  "); // exactly two spaces, sha256sum format
      return {
        expectedHex: line.slice(0, separatorIdx),
        relPath: line.slice(separatorIdx + 2),
      };
    }),
  )("$relPath matches its committed SHA-256", ({ expectedHex, relPath }) => {
    const bytes = readFileSync(join(VECTORS_DIR, relPath));
    const actualHex = createHash("sha256").update(bytes).digest("hex");
    expect(actualHex).toBe(expectedHex);
  });
});
```
This file naturally sorts first alphabetically in vitest's default `include` glob (`manifest.test.ts` < `negative.test.ts` < `positive.test.ts`), satisfying the locked decision's "runs as its first test" without any `sequence.sequencer` config — confirmed as the RESEARCH.md-recommended approach (Open Question 1).

---

### `conformance/verify-ts/src/positive.test.ts` (test, CRUD/transform — 4-step re-derivation)

**Analog A (pipeline call sequence):** `conformance/generate/src/positive.ts` `runPipeline()` (lines 132-158) — the EXACT 4 function calls to re-derive, in the EXACT order:
```typescript
// Source: conformance/generate/src/positive.ts lines 141-156 (runPipeline)
// Step 1: Canonicalize (RFC 8785 JCS)
const payloadBytes = canonicalizeReceiptBody(redactedBody);
const canonicalBytesHex = toHex(payloadBytes);

// Step 2: Base64-encode for DSSE envelope (standard RFC 4648 §4, NOT url-safe)
const payloadBase64 = base64Encode(payloadBytes);

// Step 3: PAE — Pre-Authentication Encoding per DSSE v1.0
const paeBytes = buildPae(PAYLOAD_TYPE, payloadBase64);
const paeHex = toHex(paeBytes);

// Step 4: Sign the PAE bytes
const sigBytes = await signer.sign(paeBytes);
const signatureHex = toHex(sigBytes);
```
The harness inverts this: instead of signing, it takes the COMMITTED `signatureHex` and re-derives/verifies each field against it (Steps 1-3 re-derive and compare; Step 4 calls `verifyEd25519Signature` + `verifyReceipt` rather than `signer.sign`).

**Analog B (`toHex` helper — copy verbatim, already defined twice in the sibling):**
```typescript
// Source: conformance/generate/src/positive.ts lines 83-85 (identical copy
// also in conformance/generate/src/negative.ts lines 74-76)
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
```

**Analog C (envelope + KeySet construction + `verifyReceipt` call + result narrowing):** `packages/lattice/src/receipts/verify.test.ts` lines 78-91 (happy-path test) — the codebase's OWN established pattern for calling the verifier under test:
```typescript
// Source: packages/lattice/src/receipts/verify.test.ts lines 78-91
describe("verify.ts — happy path", () => {
  it("returns ok=true with keyState='active' for a freshly-signed receipt", async () => {
    const { signer, publicKeyJwk } = await makeSigner("k1");
    const env = await createReceipt(minimalInput(), signer);
    const keySet = createMemoryKeySet([entryWith("k1", publicKeyJwk, "active")]);
    const result = await verifyReceipt(env, keySet);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.body.version).toBe("lattice-receipt/v1.3");
      expect(result.keyState).toBe("active");
      expect(result.body.kid).toBe("k1");
    }
  });
});
```
Note the narrowing idiom `if (result.ok) { ... }` before accessing `.body`/`.keyState` — `VerifyResult` is a discriminated union (`VerifyOk | VerifyFail`, `packages/lattice/src/receipts/types.ts` lines 133-144), TypeScript requires this narrow before the success-only fields are accessible.

**Imports block to use** (composed from confirmed exports across the 5 reference-implementation files + workspace-type import):
```typescript
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { canonicalizeReceiptBody } from "../../../packages/lattice/src/receipts/canonical.js";
import { PAYLOAD_TYPE, base64Encode, buildPae } from "../../../packages/lattice/src/receipts/envelope.js";
import { verifyEd25519Signature } from "../../../packages/lattice/src/receipts/sign.js";
import { createMemoryKeySet } from "../../../packages/lattice/src/receipts/keyset.js";
import { verifyReceipt } from "../../../packages/lattice/src/receipts/verify.js";
import type { CapabilityReceiptBody, ReceiptEnvelope } from "../../../packages/lattice/src/receipts/types.js";
import type { ConformanceVector } from "@lattice-conformance/generate/src/types.js";
```
Confirmed exact function signatures (all directly read this session, not inferred):
```typescript
// packages/lattice/src/receipts/canonical.ts:49
export function canonicalizeReceiptBody(body: CapabilityReceiptBody): Uint8Array

// packages/lattice/src/receipts/envelope.ts:31,35,39,57
export const PAYLOAD_TYPE = "application/vnd.lattice.receipt+json" as const;
export function base64Encode(bytes: Uint8Array): string
export function base64Decode(value: string): Uint8Array
export function buildPae(payloadType: string, payloadBase64: string): Uint8Array

// packages/lattice/src/receipts/sign.ts:68
export async function verifyEd25519Signature(
  publicKeyJwk: JsonWebKey,
  message: Uint8Array,
  signature: Uint8Array,
): Promise<boolean>

// packages/lattice/src/receipts/keyset.ts:18
export function createMemoryKeySet(entries: readonly KeyEntry[]): KeySet

// packages/lattice/src/receipts/verify.ts:85
export async function verifyReceipt(
  envelope: ReceiptEnvelope,
  keySet: KeySet,
): Promise<VerifyResult>
// VerifyResult = { ok: true; body: CapabilityReceiptBody; keyState: KeyState }
//              | { ok: false; error: { kind: VerifyErrorKind; message: string } }
// packages/lattice/src/receipts/types.ts lines 133-144. NEVER throws.
```

**Critical field-shape pitfall (hex vs. base64) — see also `## Shared Patterns` below:**
`ConformanceVector.signatureHex` is lowercase hex; `ReceiptEnvelope.signatures[].sig` is standard base64. Converting requires `Buffer.from(vector.signatureHex, "hex").toString("base64")`. This is NOT optional — a hex string fed directly into `sig` decodes to garbage bytes.

**Vector loading (disk enumeration, positive dir):**
```typescript
const POSITIVE_DIR = join(__dirname, "..", "..", "vectors", "positive");

const vectors: Array<{ id: string; vector: ConformanceVector }> = readdirSync(POSITIVE_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({
    id: f,
    vector: JSON.parse(readFileSync(join(POSITIVE_DIR, f), "utf8")) as ConformanceVector,
  }));
```
Confirmed on disk today: `conformance/vectors/positive/` contains exactly 3 files (`vec-00-v1.3.json`, `vec-01-v1.1.json`, `vec-02-v1.2.json`), all `expectedResult: "ok"`.

**`describe.each` title form (object-array rows — use `$propertyName`, NOT a template literal):**
```typescript
describe.each(vectors)("positive vector: $id", ({ vector }) => {
  it("Step 1 — canonicalizeReceiptBody(body) matches canonicalBytesHex", () => { /* ... */ });
  it("Step 2 — buildPae(PAYLOAD_TYPE, payloadBase64) matches paeHex", () => { /* ... */ });
  it("Step 3 — verifyEd25519Signature(publicKeyJwk, pae, sig) === true", async () => { /* ... */ });
  it("Step 4 — verifyReceipt(envelope, keySet) verdict === 'ok'", async () => { /* ... */ });
});
```
Confirmed working object-array `describe.each` idiom (RESEARCH.md Pitfall 4) — `describe.each(vectors)("...$id", (row) => {...})` is a STRING title with `$field` interpolation, evaluated PER ROW by vitest, not a JS template literal evaluated once eagerly.

---

### `conformance/verify-ts/src/negative.test.ts` (test, request-response — verdict-only assertion)

**Analog A (vector construction semantics — READ THE FULL FILE before writing this test):** `conformance/generate/src/negative.ts` (521 lines) — every one of the 9 negative vectors' construction recipe is documented in-line with the EXACT decision-tree step it targets. The harness must reconstruct envelopes/KeySets that reproduce these recipes. Key extracted facts, vector-by-vector:

| Vector file (on disk) | `expectedResult` | Envelope construction | KeySet construction |
|---|---|---|---|
| `neg-01-envelope-malformed.json` | `envelope-malformed` | Use `vector.envelope` **VERBATIM** — it is the malformed input (`payloadType: "application/json"`, not `PAYLOAD_TYPE`) | N/A — Step 1 fails before keyset lookup |
| `neg-02-version-mismatch.json` | `version-mismatch` | Reconstruct from standard fields | Register `vector.kid` normally |
| `neg-03a-schema-version-too-low-v1.json` | `schema-version-too-low` | Reconstruct from standard fields | Register `vector.kid` normally |
| `neg-03b-schema-version-too-low-absent.json` | `schema-version-too-low` | Reconstruct from standard fields | Register `vector.kid` normally |
| `neg-04-key-not-found.json` | `key-not-found` | Reconstruct from standard fields, using `vector.kid === "unknown-kid-12345"` as `signatures[0].keyid` | **Do NOT register `vector.kid`** — register zero entries, or register under a different kid |
| `neg-05-key-revoked.json` | `key-revoked` | Reconstruct from standard fields | Register `vector.kid` with `state: vector.verifyKeyState` (`"revoked"`) |
| `neg-06-canonicalization-mismatch.json` | `canonicalization-mismatch` | Reconstruct from standard fields (`payloadBase64` is intentionally the TAMPERED bytes) | Register `vector.kid` normally |
| `neg-07-signature-invalid-bad-sig.json` | `signature-invalid` | Reconstruct from standard fields (`signatureHex` is intentionally corrupted) | Register `vector.kid` normally |
| `neg-08-signature-invalid-kid-mismatch.json` | `signature-invalid` | Reconstruct from standard fields (`vector.kid === "spec-example-key-v0"` is the ENVELOPE keyid; `vector.body.kid === "wrong-kid"` is a DIFFERENT value — this is intentional, the mismatch is what Step 9 catches) | Register `vector.kid` normally |

**Analog B (verdict-only assertion pattern, exact `VerifyErrorKind` match):** `packages/lattice/src/receipts/verify.test.ts` lines 107-306 (`describe("verify.ts — error kinds", ...)` block) — the reference implementation's OWN test suite already asserts exact error kinds this same way:
```typescript
// Representative excerpt style from verify.test.ts's error-kind tests
// (e.g. "returns key-not-found when the kid is absent from the keyset", lines 121-134)
const result = await verifyReceipt(env, keySet);
expect(result.ok).toBe(false);
if (!result.ok) {
  expect(result.error.kind).toBe("key-not-found"); // exact string, not .toBeDefined()
}
```

**Complete negative-vector test structure to write** (composing Analog A's table + Analog B's assertion style):
```typescript
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PAYLOAD_TYPE } from "../../../packages/lattice/src/receipts/envelope.js";
import { createMemoryKeySet } from "../../../packages/lattice/src/receipts/keyset.js";
import { verifyReceipt } from "../../../packages/lattice/src/receipts/verify.js";
import type { ReceiptEnvelope } from "../../../packages/lattice/src/receipts/types.js";
import type { ConformanceVector } from "@lattice-conformance/generate/src/types.js";

const NEGATIVE_DIR = join(__dirname, "..", "..", "vectors", "negative");

const vectors: Array<{ id: string; vector: ConformanceVector }> = readdirSync(NEGATIVE_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({
    id: f,
    vector: JSON.parse(readFileSync(join(NEGATIVE_DIR, f), "utf8")) as ConformanceVector,
  }));

describe.each(vectors)("negative vector: $id", ({ vector }) => {
  it(`verdict matches expectedResult "${vector.expectedResult}"`, async () => {
    // NEG-01 only: envelope field present -> use VERBATIM (it IS the malformed input).
    const envelope: ReceiptEnvelope = vector.envelope ?? {
      payloadType: PAYLOAD_TYPE,
      payload: vector.payloadBase64,
      signatures: [{
        keyid: vector.kid, // NOT necessarily body.kid — see NEG-08
        sig: Buffer.from(vector.signatureHex, "hex").toString("base64"),
      }],
    };
    const keySet = createMemoryKeySet(
      // NEG-04: KeySet must NOT contain vector.kid ("unknown-kid-12345").
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
This composed example is EXACTLY the two-mutation-point (envelope-verbatim-for-NEG-01 + keyset-exclusion-for-NEG-04) construction the table above requires — both branches are driven entirely by `vector.envelope !== undefined` and `vector.expectedResult === "key-not-found"`, so no per-vector-id special-casing is needed.

Confirmed on disk today: `conformance/vectors/negative/` contains exactly 9 files matching the table above (`neg-01` through `neg-08`, with `neg-03` split into `neg-03a`/`neg-03b`).

---

## Shared Patterns

### Reference-implementation function calls (the actual crypto/canonicalization re-derivation)
**Source:** `packages/lattice/src/receipts/canonical.ts`, `envelope.ts`, `sign.ts`, `verify.ts`, `keyset.ts` (all five files, function signatures confirmed above)
**Apply to:** `positive.test.ts` AND `negative.test.ts` — both files import from this exact same set of 5 modules via the same relative path prefix `../../../packages/lattice/src/receipts/*.js`. **Never reimplement any of these functions inside the harness** — TSCONF-01 explicitly requires re-deriving AGAINST the reference implementation, not a parallel implementation.

### `toHex(bytes: Uint8Array): string` helper
**Source:** `conformance/generate/src/positive.ts` lines 83-85 (identical copy at `negative.ts` lines 74-76 — this codebase already tolerates this exact 3-line duplication rather than extracting a shared utility module)
```typescript
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
```
**Apply to:** `positive.test.ts` only (`negative.test.ts` does not need hex↔bytes conversion for its own assertions — it only converts `signatureHex` → base64 for envelope construction, which uses `Buffer.from(...).toString("base64")` directly, not `toHex`).

### hex → base64 signature conversion (envelope construction boundary)
**Source:** Derived from field-shape confirmed in `conformance/generate/src/types.ts` (`ConformanceVector.signatureHex` JSDoc, lines 101-105) vs. `packages/lattice/src/receipts/types.ts` `ReceiptEnvelope`/`ReceiptSignature.sig` (base64, confirmed via `envelope.ts`'s `base64Encode`/`base64Decode` round-trip, lines 35-41)
```typescript
Buffer.from(vector.signatureHex, "hex").toString("base64")
```
**Apply to:** Both `positive.test.ts` (Step 4 envelope construction) and `negative.test.ts` (all 8 non-NEG-01 envelope reconstructions — NEG-01 is exempt because it uses `vector.envelope` verbatim, which is already base64). This is the single highest-risk pitfall identified in RESEARCH.md (Pitfall 1) — a positive vector failing at `verifyReceipt` with `signature-invalid` despite Step 3's standalone `verifyEd25519Signature` passing is the diagnostic symptom of skipping this conversion at the envelope-construction boundary specifically (Step 3 correctly hex-decodes via a different code path).

### `describe.each` fixture loading + title interpolation
**Source:** `packages/lattice/src/agent/format-tools.test.ts` line 62 (primitive-array form) — confirmed live in this exact codebase, not a new pattern:
```typescript
describe.each(ALL_PROVIDERS)("formatToolsForProvider — %s", (providerName) => { ... });
```
And the object-array form (used by this phase, shown in full above):
```typescript
describe.each(vectors)("positive vector: $id", ({ vector }) => { ... });
```
**Apply to:** Both `positive.test.ts` and `negative.test.ts` for the per-vector `describe` blocks (satisfies the locked "clear per-vector failure attribution" requirement — each row gets its own named block in vitest's reporter output). **Apply to `manifest.test.ts` too**, but using `it.each` (not `describe.each`, since there's no nested per-vector `it()` structure needed — one flat assertion per manifest line is sufficient).

### Vector disk-loading (readdirSync + JSON.parse)
**Source:** No single existing helper module in the codebase does exactly this (the sibling GENERATES rather than LOADS, so it has no precedent loader). Both `positive.test.ts` and `negative.test.ts` need near-identical 6-line loading logic differing only in the source directory (`positive/` vs `negative/`).
**Apply to:** CONTEXT.md explicitly leaves this at "planner/executor's discretion" — either duplicate the loader inline in both test files (simplest, matches this codebase's existing tolerance for the `toHex` duplication precedent above), or extract a shared `conformance/verify-ts/src/load-vectors.ts` exporting `loadVectors(dir: string): Array<{id: string; vector: ConformanceVector}>`. RESEARCH.md's own recommendation (Open Question 2) leans toward duplication being "arguably clearer for a 12-vector, 2-file test suite," consistent with the `toHex` precedent — but either choice is valid.

### `VerifyResult` discriminated-union narrowing
**Source:** `packages/lattice/src/receipts/types.ts` lines 133-144 (`VerifyOk | VerifyFail` shape) + `packages/lattice/src/receipts/verify.test.ts` lines 84-90, 111-120 (usage precedent throughout the reference test suite)
```typescript
const result = await verifyReceipt(envelope, keySet);
expect(result.ok).toBe(true);   // or false, per positive/negative
if (result.ok) {
  // result.body, result.keyState now accessible (TypeScript narrows the union)
} else {
  // result.error.kind, result.error.message now accessible
}
```
**Apply to:** `positive.test.ts` Step 4 (narrow to `result.ok === true` branch) and `negative.test.ts`'s single assertion (narrow to `result.ok === false` branch before reading `.error.kind`). `verifyReceipt` NEVER throws across this boundary (confirmed via `verify.ts` lines 69-70 comment and the entire decision-tree structure returning `fail(...)` rather than throwing) — no try/catch is needed around the call itself.

### Workspace package structure (package.json / tsconfig.json / vitest.config.ts triad)
**Source:** `conformance/generate/{package.json,tsconfig.json,vitest.config.ts}` (all three files, full contents shown in per-file sections above)
**Apply to:** All three new config files in `conformance/verify-ts/` — mirror file-for-file with only the minimal deltas documented per-file above (package name, one new devDependency, one extra tsconfig `include` glob entry). No `pnpm-workspace.yaml` edit — the `conformance/*` glob (line 3) already covers the new directory, confirmed via direct read this session.

## No Analog Found

None. Every file in this phase's scope has a direct, exact-match or role-match analog already in the codebase — this is explicitly a "mirror an existing proven pattern" phase (RESEARCH.md `## State of the Art`), not a greenfield-pattern phase.

## Metadata

**Analog search scope:** `conformance/generate/` (primary sibling package, all 9 source files + 3 config files read in full or via targeted grep+read), `packages/lattice/src/receipts/` (6 of 20 files read: `canonical.ts`, `envelope.ts`, `sign.ts`, `verify.ts`, `keyset.ts` in full; `verify.test.ts` and `types.ts` via targeted grep+read of relevant line ranges), `packages/lattice/src/agent/format-tools.test.ts` (targeted read of `describe.each` usage, lines 1-70), `pnpm-workspace.yaml` (full file, 19 lines).
**Files scanned:** 6 config/full-source files read in full, 3 files read via targeted offset/limit or grep-then-read (no re-reads of any range).
**Pattern extraction date:** 2026-07-01
