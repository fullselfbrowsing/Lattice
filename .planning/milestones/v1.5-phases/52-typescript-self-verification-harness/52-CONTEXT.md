# Phase 52: TypeScript Self-Verification Harness - Context

**Gathered:** 2026-07-01
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous) — all proposed decisions accepted

<domain>
## Phase Boundary

Prove that the TypeScript reference implementation itself is correct against the committed
conformance vectors, before any Python client depends on them. Requirements: **TSCONF-01, TSCONF-02**.

Deliverables:
- A new private pnpm workspace package `conformance/verify-ts/` (vitest) that re-derives
  canonical bytes, PAE hex, signature, and verdict for every committed vector in
  `conformance/vectors/` and asserts byte-identity at each pipeline step.
- The harness fails the build if any vector diverges.
- `conformance/verify-ts/` added to `pnpm-workspace.yaml` alongside the existing
  `conformance/generate/` entry (already covered by the `conformance/*` glob from Phase 51).
- No modification to `scripts/check-tarball-leak.mjs` or `scripts/check-core-package-boundary.mjs`
  — both remain green (they operate on a fixed `packages/lattice*` allowlist and do not scan
  `conformance/`).

**Out of scope (later phases):** Python client (53–55); the aggregate CI `conformance` job
wiring (56, though this harness is one of the steps it will invoke).

</domain>

<decisions>
## Implementation Decisions

### Package Structure & Naming
- Package name: `@lattice-conformance/verify-ts` — matches sibling `@lattice-conformance/generate` naming convention.
- Test file layout: split by concern — `positive.test.ts`, `negative.test.ts`, `manifest.test.ts` — mirroring `conformance/generate`'s `positive.ts`/`negative.ts`/`manifest.ts` module split.
- Reference implementation is imported directly from `packages/lattice/src/receipts/*.ts` source (same relative-import pattern `conformance/generate` already established), not from the built/public package entrypoint — avoids requiring a build step before running the harness.

### Assertion Granularity & Failure Reporting
- Test structure: `describe.each(vectors)` with sequential step assertions per vector, for clear per-vector failure attribution.
- Negative-vector assertions check exact match on the vector's `expectedResult` `VerifyErrorKind` (strict), not merely that verification fails.
- Full step-by-step canonical-bytes/PAE/signature re-derivation applies only to positive vectors. Negative vectors assert final verdict/error-kind only — many negative constructions intentionally break one specific step, so step-by-step re-derivation is not meaningful for them.
- The harness self-checks `conformance/vectors/MANIFEST.sha256` as its first test, before running any vector assertions — defense-in-depth so a tampered vector file fails immediately rather than relying solely on Phase 56's CI wiring.

### Workspace & CI Integration
- `conformance/verify-ts` takes a `workspace:*` devDependency on `@lattice-conformance/generate` to import its `ConformanceVector` type directly — single source of truth for the vector shape, both packages are private/unpublished so no tarball-boundary concern.
- No new root-level convenience script this phase — `pnpm -r test` already picks up the new package automatically, same as `conformance/generate` today.
- Plan must include an explicit verification step that re-runs `pnpm check:tarball` and `pnpm check:core-boundary` and records the pass as evidence, since "remain green with no modification" is an explicit success criterion, not an assumption.

### Claude's Discretion
- Exact vector-loading mechanics (glob vs explicit manifest-driven file list), internal helper structure, and vitest config details are at the planner/executor's discretion within the constraints above.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 51 outputs (the vectors this phase verifies)
- `conformance/vectors/positive/*.json`, `conformance/vectors/negative/*.json` — the committed vectors.
- `conformance/vectors/MANIFEST.sha256` — integrity manifest to self-check first.
- `conformance/generate/src/types.ts` — `ConformanceVector` interface (import via workspace dep, do not fork).
- `conformance/generate/package.json`, `conformance/generate/tsconfig.json`, `conformance/generate/vitest.config.ts` — the sibling package's structure to mirror for `verify-ts`.

### Reference implementation (NORMATIVE — the harness re-derives against these)
- `packages/lattice/src/receipts/canonical.ts` — `canonicalizeReceiptBody`.
- `packages/lattice/src/receipts/envelope.ts` — `buildPae`, `encodeEnvelope`, `decodeEnvelope`, `PAYLOAD_TYPE`, `base64Encode`/`base64Decode`.
- `packages/lattice/src/receipts/sign.ts` — `verifyEd25519Signature`, key import helpers.
- `packages/lattice/src/receipts/verify.ts` — `verifyReceipt`, the 10-step decision tree mapping negative vectors to `VerifyErrorKind`.

### Requirements
- `.planning/REQUIREMENTS.md` — TSCONF-01, TSCONF-02 definitions.
- `.planning/ROADMAP.md` — Phase 52 goal + success criteria.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `conformance/generate/` is a proven template for private pnpm package structure (package.json shape, tsconfig extending `../../tsconfig.base.json` with `rootDir: "../.."` and an `include` covering both `src/**/*.ts` and `../../packages/lattice/src/**/*.ts`, vitest.config.ts).
- `conformance/vectors/` already contains 3 positive + 9 negative vectors + `MANIFEST.sha256`, all schema-validated at generation time.

### Established Patterns
- Private/unpublished workspace packages live outside `packages/` to keep tarball + core-boundary checks green (proven safe by Phase 51).
- `tsx` is available at the workspace root; vitest is the standard test runner via `catalog:` version pinning.

### Integration Points
- `conformance/verify-ts` is a new sibling directory to `conformance/generate`, already covered by the `conformance/*` glob in `pnpm-workspace.yaml` — no workspace glob change needed, only the new package directory.

</code_context>

<specifics>
## Specific Ideas

- The harness should read vectors directly off disk from `conformance/vectors/`, not embed copies.
- Failure output should make it obvious which vector and which pipeline step diverged (vector id + step name in the assertion message).

</specifics>

<deferred>
## Deferred Ideas

- The aggregate CI `conformance` job (manifest check → TS harness → Python harness → cross-mint parity) is wired in Phase 56; Phase 52 only produces the harness itself, runnable via `pnpm --filter @lattice-conformance/verify-ts test`.

None introduced as scope creep this session — discussion stayed within TSCONF-01..02.

</deferred>
