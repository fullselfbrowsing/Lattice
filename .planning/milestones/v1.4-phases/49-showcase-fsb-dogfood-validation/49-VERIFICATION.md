---
phase: 49-showcase-fsb-dogfood-validation
verified_at: 2026-06-16T04:16:14-05:00
status: passed
requirements_verified: [VAL-01, VAL-02, VAL-03, VAL-04]
automated:
  passed:
    - pnpm --filter @full-self-browsing/lattice test
    - pnpm --filter @full-self-browsing/lattice typecheck
    - pnpm --filter @full-self-browsing/lattice lint:packages
    - pnpm --filter @full-self-browsing/lattice-cli test
    - pnpm --filter @full-self-browsing/lattice-cli typecheck
    - pnpm --filter @full-self-browsing/lattice-cli lint:packages
    - pnpm check:package-version
    - pnpm check:tarball
    - node scripts/dogfood-fsb-candidate.mjs --fsb-dir /Users/lakshmanturlapati/Desktop/FSB/automation
    - pnpm example:v14-validation
  failed: []
human_verification: []
---

# Phase 49 Verification

## Result

Status: passed.

## Requirement Evidence

- **VAL-01:** `examples/v14-validation/index.mjs` runs offline with fake providers and verifies streaming, gateway, OTel observability, and streaming failure-mode behavior.
- **VAL-02:** `scripts/dogfood-fsb-candidate.mjs` installs the packed runtime candidate into an isolated temp consumer, links it into a temp FSB copy, verifies v1.4 exports/version/receipt compatibility, and runs FSB's compatible provider smoke.
- **VAL-03:** `scripts/check-tarball-leak.mjs` now audits packed tarballs for install lifecycle scripts and direct native/heavy dependency leakage in the core runtime.
- **VAL-04:** `49-MILESTONE-EVIDENCE.md` maps every v1.4 requirement to evidence, a phase summary, or an explicit scoped deferral note.

## Automated Evidence

```bash
pnpm --filter @full-self-browsing/lattice test
pnpm --filter @full-self-browsing/lattice typecheck
pnpm --filter @full-self-browsing/lattice lint:packages
pnpm --filter @full-self-browsing/lattice-cli test
pnpm --filter @full-self-browsing/lattice-cli typecheck
pnpm --filter @full-self-browsing/lattice-cli lint:packages
pnpm check:package-version
pnpm check:tarball
node scripts/dogfood-fsb-candidate.mjs --fsb-dir /Users/lakshmanturlapati/Desktop/FSB/automation
pnpm example:v14-validation
```

All passed.

## Notes

- Runtime tests passed: 77 files / 1026 tests.
- CLI tests passed: 17 files / 157 tests.
- FSB dogfood output showed the generated v1.4 candidate smoke passing and `tests/lattice-providers-smoke.test.js` reporting 47 PASS assertions.
- The FSB checkout had two pre-existing dirty generated files; the dogfood runner compared status before and after and left them unchanged.
- A chained CLI command was manually terminated after it produced no output for several minutes. The same CLI test, typecheck, and lint gates were rerun separately and passed.
- `tsdown`/ATTW continue to report the known non-failing warnings documented in earlier phases: deprecated `noExternal`, ineffective dynamic import from bundled runtime output, and the ignored esm-only CJS-to-ESM warning.

