# Phase 49 Validation Strategy

## Gates

- `pnpm --filter @full-self-browsing/lattice build`
- `node examples/v14-validation/index.mjs`
- `pnpm --filter @full-self-browsing/lattice-cli test -- showcase-e2e` or focused v1.4 showcase test if added under CLI tests
- `node scripts/check-package-version-surfaces.mjs`
- `node scripts/check-tarball-leak.mjs`
- `node scripts/dogfood-fsb-candidate.mjs --fsb-dir /Users/lakshmanturlapati/Desktop/FSB/automation`
- `pnpm --filter @full-self-browsing/lattice test`
- `pnpm --filter @full-self-browsing/lattice typecheck`
- `pnpm --filter @full-self-browsing/lattice lint:packages`
- `pnpm --filter @full-self-browsing/lattice-cli test`
- `pnpm --filter @full-self-browsing/lattice-cli typecheck`
- `pnpm --filter @full-self-browsing/lattice-cli lint:packages`

## Evidence Expectations

| Requirement | Evidence |
|-------------|----------|
| VAL-01 | v1.4 offline showcase stdout, test coverage, and scenario assertions for streaming, gateway, observability, and failure behavior. |
| VAL-02 | FSB candidate dogfood output showing tarball install, v1.4 export checks, version stamping, and receipt verification compatibility. |
| VAL-03 | Tarball audit output proving no core install scripts or unwanted native/heavy dependencies. |
| VAL-04 | Phase 49 milestone evidence matrix mapping all v1.4 requirements to phase summaries and test/package evidence. |

## Human Verification

No manual browser or hosted-provider verification is required. FSB dogfood is local/offline but depends on the FSB checkout being present at the configured path.

