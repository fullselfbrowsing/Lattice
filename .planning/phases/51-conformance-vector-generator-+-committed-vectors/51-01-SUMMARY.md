---
phase: 51-conformance-vector-generator-+-committed-vectors
plan: "01"
subsystem: conformance
tags: [conformance, vector-generator, typescript, pnpm-workspace, vitest]
dependency_graph:
  requires:
    - Phase 50 SPEC.md (protocol normative spec)
    - spec/generate-vector0.ts (Phase 50 fixed keypair pattern)
    - packages/lattice/src/receipts/types.ts (ReceiptEnvelope shape)
  provides:
    - conformance/generate/ private pnpm workspace package
    - ConformanceVector TypeScript interface (VEC-01 field set)
    - --regen-vectors flag gate no-op (VEC-02)
    - vitest scaffold with 5 tests covering VEC-02 + VEC-01 type shape
  affects:
    - pnpm-workspace.yaml (conformance/* glob added)
    - Plans 51-02 (positive vectors) and 51-03 (negative vectors + manifest)
tech_stack:
  added:
    - "@lattice-conformance/generate private pnpm workspace package"
    - "ajv ^8.20.0 (devDep — conformance/generate only)"
    - "ajv-formats ^3.0.1 (devDep — conformance/generate only)"
    - "canonicalize 3.0.0 (devDep — exact pin)"
  patterns:
    - "Private pnpm workspace package outside packages/ to keep tarball-leak + core-boundary checks green"
    - "Flag-gated generator entry point: no-op without --regen-vectors"
    - "ReceiptEnvelope redeclared locally to avoid tsc rootDir cross-boundary compilation issue"
key_files:
  created:
    - conformance/generate/package.json
    - conformance/generate/tsconfig.json
    - conformance/generate/src/types.ts
    - conformance/generate/src/main.ts
    - conformance/generate/vitest.config.ts
    - conformance/generate/src/main.test.ts
  modified:
    - pnpm-workspace.yaml
decisions:
  - "[ReceiptEnvelope local mirror] Inlined ReceiptEnvelope interface in types.ts rather than importing from packages/lattice across the tsc rootDir boundary. The shape is identical to types.ts upstream. Phase 52's harness can import from the reference impl directly since it is in the same workspace build graph."
  - "[canonicalize ESM-only] canonicalize v3.0.0 is ESM-only (no CJS exports). The plan's verify command used require('canonicalize') which fails for ESM. Verified via node --input-type=module import instead. No code change needed — tsx uses ESM resolution."
  - "[types: node added to tsconfig] Added types:[node] to conformance/generate/tsconfig.json to resolve node:* module imports (process, child_process, url, path) without referencing the DOM lib."
metrics:
  duration: "~7 minutes (Task 1 at 06:11 UTC-5, Task 2 at 06:18 UTC-5)"
  completed: "2026-06-25T06:18:23-05:00"
  tasks: 2
  files: 7
---

# Phase 51 Plan 01: Scaffold @lattice-conformance/generate private pnpm package — Summary

**One-liner:** Private pnpm workspace package scaffolded with ConformanceVector VEC-01 interface, --regen-vectors no-op flag gate, and 5-test vitest scaffold covering VEC-02 and type shape.

## What Was Built

### Task 1 (b0197b2) — pnpm workspace scaffold

Registered `conformance/*` glob in `pnpm-workspace.yaml` and created the private `@lattice-conformance/generate` package with:
- `package.json`: private, ESM, devDeps ajv/ajv-formats/canonicalize (exact 3.0.0)/tsx/vitest/typescript/@types/node
- `tsconfig.json`: extends tsconfig.base.json, moduleResolution Bundler, types:["node"]
- `pnpm install` run — node_modules present, all devDeps resolved

### Task 2 (3724188) — ConformanceVector type, flag gate, tests

**`conformance/generate/src/types.ts`:**
- `ConformanceVector` interface — complete VEC-01 field set: WARNING (required, T-51-01 mitigation), body, canonicalBytesHex, payloadBase64, paeHex, signatureHex, publicKeyJwk, kid, expectedResult; optional `verifyKeyState?: "active"|"retired"|"revoked"` (locked decision D-01 for NEG-05 key-revoked vector); optional `envelope?: ReceiptEnvelope` (for NEG-01 envelope-malformed vectors only)
- `VERIFY_ERROR_KINDS` readonly const array of all 7 VerifyErrorKind literals
- `ReceiptEnvelope` interface (local mirror of packages/lattice/src/receipts/types.ts)

**`conformance/generate/src/main.ts`:**
- No-op guard: `process.argv.includes("--regen-vectors")` absent → logs message + `process.exit(0)`
- Regen path: logs start message → calls `generate()` stub (throws "not yet implemented")
- Plans 51-02/03 fill in `generate()` body

**`conformance/generate/vitest.config.ts`:** node environment, src/**/*.test.ts includes

**`conformance/generate/src/main.test.ts`:** 5 tests:
1. VEC-02 subprocess test: spawns `tsx src/main.ts` (no --regen-vectors), asserts exit 0
2. VEC-01 type shape: positive vector (no optional fields)
3. VEC-01 type shape: negative vector with `verifyKeyState: "revoked"`
4. VEC-01 type shape: negative vector with `envelope` field (envelope-malformed)
5. VERIFY_ERROR_KINDS: exactly 7 entries, all VerifyErrorKind literals present

## Verification Results

All criteria from the plan's `<verification>` block passed:

1. `pnpm-workspace.yaml` contains `- "conformance/*"` — PASSED
2. `conformance/generate/package.json` has `"private": true`, ajv + ajv-formats + canonicalize in devDependencies — PASSED
3. `canonicalize` ESM import resolution in package context — PASSED (via `node --input-type=module`)
4. `ConformanceVector` exports `verifyKeyState?`, `envelope?: ReceiptEnvelope`, `VERIFY_ERROR_KINDS` — PASSED (typecheck + runtime)
5. `main.ts` exits 0 without `--regen-vectors` — PASSED (subprocess test)
6. `pnpm --filter @lattice-conformance/generate test` — PASSED (5/5 tests)
7. `pnpm --filter @lattice-conformance/generate typecheck` — PASSED (exit 0)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] rootDir cross-boundary import for ReceiptEnvelope**
- **Found during:** Task 2 — first typecheck run
- **Issue:** Plan directed importing ReceiptEnvelope from `"../../../packages/lattice/src/receipts/types.js"`. The tsc rootDir (inferred from `include: ["src/**/*.ts"]`) treats conformance/generate as the root; importing a file transitively under packages/lattice triggers TS6059 "File is not under rootDir". Setting rootDir explicitly to `../../..` would pull all of packages/lattice into the type-check graph and require adjusting include to exclude it.
- **Fix:** Redeclared ReceiptEnvelope as a local interface in types.ts, identical in shape to the upstream. Added a comment: "Source of truth: packages/lattice/src/receipts/types.ts ReceiptEnvelope."
- **Files modified:** conformance/generate/src/types.ts
- **Commit:** 3724188

**2. [Rule 1 - Bug] types:["node"] missing from tsconfig.json**
- **Found during:** Task 2 — first typecheck run
- **Issue:** tsconfig.base.json includes `lib: ["ES2024", "DOM", "DOM.Iterable"]` but does not add @types/node to the `types` array. Without it, `node:process`, `node:child_process`, `node:url`, `node:path` imports fail with TS2591.
- **Fix:** Added `"types": ["node"]` to conformance/generate/tsconfig.json (same pattern used by packages/lattice/tsconfig.json).
- **Files modified:** conformance/generate/tsconfig.json
- **Commit:** 3724188

**3. [Rule 1 - Bug] Plan verify command used CJS require('canonicalize') for ESM-only package**
- **Found during:** Post-Task-2 verification
- **Issue:** The plan's `<verify>` block uses `node -e "require('canonicalize')"`. canonicalize v3.0.0 has `"type": "module"` and no CJS exports entry, so require() throws ERR_PACKAGE_PATH_NOT_EXPORTED.
- **Fix:** Verified via `node --input-type=module -e "import canonicalize from 'canonicalize'; ..."` — import resolution is confirmed working. No code change needed; tsx (used by main.ts) uses ESM resolution.
- **Files modified:** None (documentation-only deviation)

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced. The package is private, all devDeps only, no runtime distribution. T-51-01 (WARNING field required in type), T-51-02 (flag gate no-op) mitigations both applied and tested.

## Self-Check: PASSED

- conformance/generate/src/types.ts: FOUND
- conformance/generate/src/main.ts: FOUND
- conformance/generate/src/main.test.ts: FOUND
- conformance/generate/vitest.config.ts: FOUND
- b0197b2 (Task 1 commit): FOUND in git log
- 3724188 (Task 2 commit): FOUND in git log
